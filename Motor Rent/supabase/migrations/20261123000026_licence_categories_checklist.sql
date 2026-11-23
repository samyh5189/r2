-- Licence categories (one licence, several categories): staff record which ones the rider holds
-- when approving their ID check. A = motorcycles and scooters, B = cars.
-- Plus a handover checklist (used for cars: spare tyre, jack, interior, warning lights...).

alter table public.profiles add column if not exists licence_categories text[] not null default '{}'
  check (licence_categories <@ array['A', 'B']::text[]);
alter table public.kyc_submissions add column if not exists licence_categories text[];
-- Riders verified before categories existed were checked for bikes.
update public.profiles set licence_categories = '{A}' where kyc_status = 'approved' and licence_categories = '{}';

-- Riders can't set their own categories.
create or replace function public.guard_profile_update() returns trigger language plpgsql as $$
begin
  if auth.uid() = old.id and not public.is_staff() then
    if new.role is distinct from old.role
       or new.kyc_status is distinct from old.kyc_status
       or new.branch_id is distinct from old.branch_id
       or new.licence_expires_on is distinct from old.licence_expires_on
       or new.licence_categories is distinct from old.licence_categories
       or (old.kyc_status = 'approved' and new.date_of_birth is distinct from old.date_of_birth) then
      raise exception 'not allowed to change role, KYC, date of birth or licence fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Which licence category a vehicle needs.
create or replace function public.licence_category_for(k public.vehicle_kind) returns text
language sql immutable as $$ select case k when 'car' then 'B' else 'A' end $$;

drop function if exists public.review_kyc(uuid, boolean, date, date, text);
create function public.review_kyc(p_submission uuid, p_approve boolean, p_licence_expires_on date, p_date_of_birth date, p_note text,
  p_categories text[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.kyc_submissions; cats text[];
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select * into s from public.kyc_submissions where id = p_submission for update;
  if s.id is null then raise exception 'submission not found' using errcode = 'P0002'; end if;
  if s.status <> 'pending' then raise exception 'already reviewed' using errcode = '55000'; end if;

  if p_approve then
    if coalesce(p_licence_expires_on, s.licence_expires_on) <= current_date then
      raise exception 'licence is expired' using errcode = '22023';
    end if;
    if coalesce(p_date_of_birth, s.date_of_birth) > current_date - interval '18 years' then
      raise exception 'rider is under 18' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct c order by c), '{}') into cats from unnest(coalesce(p_categories, '{}')) c where c in ('A', 'B');
    if cardinality(cats) = 0 then raise exception 'tick the licence categories the rider holds' using errcode = '22023'; end if;
    update public.kyc_submissions set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
      licence_expires_on = coalesce(p_licence_expires_on, licence_expires_on), date_of_birth = coalesce(p_date_of_birth, date_of_birth),
      licence_categories = cats
    where id = s.id;
    update public.profiles set kyc_status = 'approved', full_name = s.full_name,
      date_of_birth = coalesce(p_date_of_birth, s.date_of_birth),
      licence_expires_on = coalesce(p_licence_expires_on, s.licence_expires_on),
      licence_categories = cats
    where id = s.profile_id;
  else
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'tell the rider what to fix' using errcode = '22023'; end if;
    update public.kyc_submissions set status = 'rejected', note = left(trim(p_note), 300), reviewed_by = auth.uid(), reviewed_at = now()
    where id = s.id;
    update public.profiles set kyc_status = 'rejected' where id = s.profile_id and kyc_status <> 'approved';
  end if;
  update public.kyc_documents set reviewed_by = auth.uid(), reviewed_at = now() where submission_id = s.id;
end $$;
revoke execute on function public.review_kyc(uuid, boolean, date, date, text, text[]) from public, anon;
grant execute on function public.review_kyc(uuid, boolean, date, date, text, text[]) to authenticated;

-- Staff can correct a verified rider's categories later (e.g. they add a car category).
create or replace function public.set_licence_categories(p_rider uuid, p_categories text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare cats text[];
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct c order by c), '{}') into cats from unnest(coalesce(p_categories, '{}')) c where c in ('A', 'B');
  update public.profiles set licence_categories = cats where id = p_rider and kyc_status = 'approved';
  if not found then raise exception 'rider is not verified yet' using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.set_licence_categories(uuid, text[]) from public, anon;
grant execute on function public.set_licence_categories(uuid, text[]) to authenticated;

-- Enforce: a verified rider can only book what their licence covers, and nobody drives off without it.
create or replace function public.assert_licence_covers() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k public.vehicle_kind; p public.profiles; need text;
begin
  select kind into k from public.vehicles where id = new.vehicle_id;
  select * into p from public.profiles where id = new.rider_id;
  need := public.licence_category_for(k);
  if tg_op = 'INSERT' then
    -- Unverified riders may book; the check happens when they're verified and at pickup.
    if p.kyc_status = 'approved' and not (need = any(p.licence_categories)) then
      raise exception 'Your verified licence doesn''t cover %s. Ask us to add the category if your licence has it.',
        case k when 'car' then 'car' else 'motorbike' end using errcode = '42501';
    end if;
  elsif new.status = 'active' and old.status is distinct from 'active' and old.status = 'confirmed' then
    if not (need = any(p.licence_categories)) then
      raise exception 'rider''s licence is not approved for category % (needed for this vehicle)', need using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_licence on public.bookings;
create trigger bookings_licence before insert or update of status on public.bookings
  for each row execute function public.assert_licence_covers();

-- Handover checklist, saved with the inspection (e.g. car: spare tyre, jack, interior clean).
alter table public.inspections add column if not exists checklist jsonb;
create or replace function public.save_inspection_checklist(b uuid, p_phase public.inspection_phase, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'object' then raise exception 'checklist must be an object' using errcode = '22023'; end if;
  update public.inspections i set checklist = p_items
    from public.bookings bk
   where i.booking_id = b and i.phase = p_phase and bk.id = b and public.can_see_branch(bk.branch_id)
     and i.created_at > now() - interval '2 hours';
  if not found then raise exception 'inspection not found' using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.save_inspection_checklist(uuid, public.inspection_phase, jsonb) from public, anon;
grant execute on function public.save_inspection_checklist(uuid, public.inspection_phase, jsonb) to authenticated;
