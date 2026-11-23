-- Book without an account; a mobile number on every ID check; pickup or delivery; licence check at the counter;
-- staff confirm payment taken by phone or at the counter; past guest rentals join the account whose ID check
-- is approved with the same mobile number.

-- ───────────────────────────── phone numbers ─────────────────────────────
-- Maldives numbers become +960XXXXXXX; other numbers must be written with their country code.
create or replace function public.norm_phone(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when d ~ '^(00960|\+960|960)?[3-9][0-9]{6}$' then '+960' || right(d, 7)
    when d ~ '^\+[1-9][0-9]{7,14}$' then d
    when d ~ '^00[1-9][0-9]{7,14}$' then '+' || substr(d, 3)
  end
  from (select regexp_replace(coalesce(p, ''), '[\s().-]', '', 'g') d) x
$$;

alter table public.kyc_submissions add column if not exists phone text;

drop function if exists public.submit_kyc(text, date, text, text, text, date, jsonb);
create function public.submit_kyc(p_full_name text, p_date_of_birth date, p_id_type text, p_id_number text,
  p_licence_number text, p_licence_expires_on date, p_docs jsonb, p_phone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  d jsonb;
  types text[] := '{}';
  p public.profiles;
  ph text := public.norm_phone(p_phone);
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if ph is null then raise exception 'enter your mobile number (7 digits, or with the country code if it isn''t Maldivian)' using errcode = '22023'; end if;
  select * into p from public.profiles where id = uid;
  if p.kyc_status = 'approved' and p.licence_expires_on > current_date then
    raise exception 'you are already verified' using errcode = '55000';
  end if;
  if exists (select 1 from public.kyc_submissions where profile_id = uid and status = 'pending') then
    raise exception 'your documents are already being reviewed' using errcode = '55000';
  end if;
  if p_date_of_birth > current_date - interval '18 years' then
    raise exception 'riders must be at least 18 years old' using errcode = '22023';
  end if;
  if p_date_of_birth < date '1900-01-01' then raise exception 'check your date of birth' using errcode = '22023'; end if;
  if p_licence_expires_on <= current_date then
    raise exception 'your driving licence has expired' using errcode = '22023';
  end if;
  if jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) > 6 then
    raise exception 'invalid documents' using errcode = '22023';
  end if;

  for d in select * from jsonb_array_elements(p_docs) loop
    if (d ->> 'doc_type') not in ('licence_front', 'licence_back', 'passport', 'national_id', 'selfie') then
      raise exception 'unknown document type' using errcode = '22023';
    end if;
    if (d ->> 'path') !~ ('^' || uid::text || '/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+\.(jpg|jpeg|png|heic|pdf)$')
       or not exists (select 1 from storage.objects where bucket_id = 'kyc' and name = d ->> 'path') then
      raise exception 'document % was not uploaded', d ->> 'doc_type' using errcode = '22023';
    end if;
    types := types || (d ->> 'doc_type');
  end loop;
  if not ('licence_front' = any (types)) or not ('selfie' = any (types)) or not (p_id_type = any (types)) then
    raise exception 'licence (front), % and a selfie are required', replace(p_id_type, '_', ' ') using errcode = '22023';
  end if;

  insert into public.kyc_submissions (profile_id, full_name, date_of_birth, id_type, id_number, licence_number, licence_expires_on, phone)
  values (uid, trim(p_full_name), p_date_of_birth, p_id_type, trim(p_id_number), upper(trim(p_licence_number)), p_licence_expires_on, ph)
  returning id into sid;
  insert into public.kyc_documents (profile_id, submission_id, doc_type, file_path, expires_on)
  select uid, sid, x ->> 'doc_type', x ->> 'path', case when x ->> 'doc_type' like 'licence%' then p_licence_expires_on end
  from jsonb_array_elements(p_docs) x;
  update public.profiles set phone = ph where id = uid;
  return sid;
end $$;
revoke all on function public.submit_kyc(text, date, text, text, text, date, jsonb, text) from public, anon;
grant execute on function public.submit_kyc(text, date, text, text, text, date, jsonb, text) to authenticated;

-- ───────────────────────────── guest bookings ─────────────────────────────
alter table public.bookings alter column rider_id drop not null;
alter table public.quotes alter column rider_id drop not null;
alter table public.bookings
  add column if not exists guest_name text,
  add column if not exists guest_phone text,
  add column if not exists handover text not null default 'counter',
  add column if not exists delivery_address text,
  add column if not exists counter_licence_categories text[],
  add column if not exists counter_licence_expires_on date,
  add column if not exists counter_checked_by uuid references public.profiles (id),
  add column if not exists counter_checked_at timestamptz;
alter table public.bookings
  add constraint bookings_who check (rider_id is not null or (length(trim(guest_name)) >= 2 and guest_phone is not null)),
  add constraint bookings_handover check (handover in ('counter', 'delivery')),
  add constraint bookings_delivery_address check (handover = 'counter' or length(trim(coalesce(delivery_address, ''))) >= 5),
  add constraint bookings_counter_categories check (counter_licence_categories is null or counter_licence_categories <@ array['A', 'B']);
create index if not exists bookings_guest_phone on public.bookings (guest_phone) where guest_phone is not null;

-- Request counts for the sign-in-free endpoints (service role only).
create table if not exists public.guest_requests (
  id bigint generated always as identity primary key,
  kind text not null,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists guest_requests_recent on public.guest_requests (kind, key, at desc);
alter table public.guest_requests enable row level security;

-- WhatsApp: a guest has no profile, so staff alerts name them with their number (rider messages are skipped).
create or replace function public.wa_booking(b uuid)
returns table (rider uuid, branch uuid, ref text, vehicle text, pickup text, ret text, branch_name text, rider_name text)
language sql stable security definer set search_path = '' as $$
  select bk.rider_id, bk.branch_id, bk.reference, v.make || ' ' || v.model || ' (' || v.plate || ')',
         public.wa_when(lower(bk.period)), public.wa_when(upper(bk.period)), br.name,
         coalesce(p.full_name, bk.guest_name || ' (no account, ' || bk.guest_phone || ')', 'A rider')
         || case when bk.handover = 'delivery' then ', delivery to ' || bk.delivery_address else '' end
    from public.bookings bk join public.vehicles v on v.id = bk.vehicle_id
    join public.branches br on br.id = bk.branch_id left join public.profiles p on p.id = bk.rider_id
   where bk.id = b
$$;

-- ───────────────────────────── licence at pickup ─────────────────────────────
-- A verified account with the category, or staff checked the licence at the counter for this rental.
create or replace function public.assert_licence_covers()
returns trigger language plpgsql security definer set search_path = '' as $$
declare k public.vehicle_kind; p public.profiles; need text;
begin
  select kind into k from public.vehicles where id = new.vehicle_id;
  select * into p from public.profiles where id = new.rider_id;
  need := public.licence_category_for(k);
  if tg_op = 'INSERT' then
    -- Unverified riders and guests may book; the licence is checked at verification or at the counter.
    if p.kyc_status = 'approved' and not (need = any(p.licence_categories)) then
      raise exception 'Your verified licence doesn''t cover %s. Ask us to add the category if your licence has it.',
        case k when 'car' then 'car' else 'motorbike' end using errcode = '42501';
    end if;
  elsif new.status = 'active' and old.status = 'confirmed' then
    if not (coalesce(p.kyc_status = 'approved' and need = any(p.licence_categories), false)
            or coalesce(need = any(new.counter_licence_categories) and new.counter_licence_expires_on >= upper(new.period)::date, false)) then
      raise exception 'check the rider''s licence (category %) at the counter first', need using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create or replace function public.record_counter_check(b uuid, p_categories text[], p_licence_expires_on date)
returns void language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; cats text[];
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select * into bk from public.bookings where id = b for update;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status not in ('held', 'confirmed') then raise exception 'only before pickup' using errcode = '55000'; end if;
  select coalesce(array_agg(distinct c order by c), '{}') into cats from unnest(coalesce(p_categories, '{}')) c where c in ('A', 'B');
  if cardinality(cats) = 0 then raise exception 'tick the categories on the licence' using errcode = '22023'; end if;
  if p_licence_expires_on is null or p_licence_expires_on < upper(bk.period)::date then
    raise exception 'the licence must be valid until the rental ends' using errcode = '22023';
  end if;
  update public.bookings set counter_licence_categories = cats, counter_licence_expires_on = p_licence_expires_on,
    counter_checked_by = auth.uid(), counter_checked_at = now() where id = b;
end $$;

-- ───────────────────────────── payment taken by staff ─────────────────────────────
create or replace function public.confirm_booking_paid(b uuid, p_method text, p_amount integer, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare bk public.bookings;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_method not in ('cash', 'bank', 'card') then raise exception 'method must be cash, bank or card' using errcode = '22023'; end if;
  select * into bk from public.bookings where id = b for update;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status <> 'held' then raise exception 'booking is %; only an unpaid booking can be confirmed', bk.status using errcode = '55000'; end if;
  if p_amount is null or p_amount < bk.total then
    raise exception 'amount (%) is less than the booking total (%)', coalesce(p_amount, 0), bk.total using errcode = '22023';
  end if;
  insert into public.payments (booking_id, kind, provider, provider_ref, idempotency_key, amount, currency, status, recorded_by, raw)
  values (b, 'charge', p_method,
          nullif(left(trim(coalesce(p_note, '')), 120), ''), b || ':paid', p_amount, bk.currency, 'succeeded', auth.uid(),
          jsonb_build_object('note', nullif(left(trim(coalesce(p_note, '')), 300), '')));
  perform set_config('app.event_note', 'paid by ' || p_method, true);
  update public.bookings set status = 'confirmed', held_until = null where id = b;
end $$;

-- More time to reach a rider and take payment (never past an hour after pickup time).
create or replace function public.extend_hold(b uuid, p_hours integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; t timestamptz;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_hours not between 1 and 48 then raise exception 'between 1 and 48 hours' using errcode = '22023'; end if;
  select * into bk from public.bookings where id = b for update;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status <> 'held' then raise exception 'only unpaid bookings are held' using errcode = '55000'; end if;
  t := least(greatest(coalesce(bk.held_until, now()), now()) + make_interval(hours => p_hours), lower(bk.period) + interval '1 hour');
  update public.bookings set held_until = t where id = b;
  return t;
end $$;

-- ───────────────────────────── joining past rentals ─────────────────────────────
-- Staff can attach a guest booking to a rider account by hand (e.g. they booked with another number).
create or replace function public.link_guest_booking(b uuid, p_rider uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  update public.bookings set rider_id = p_rider
   where id = b and rider_id is null and public.can_see_branch(branch_id)
     and exists (select 1 from public.profiles where id = p_rider and role = 'rider');
  if not found then raise exception 'booking not found or already linked' using errcode = 'P0002'; end if;
end $$;

-- Approving an ID check joins the rider's earlier no-account rentals made with the same mobile number.
drop function if exists public.review_kyc(uuid, boolean, date, date, text, text[]);
create function public.review_kyc(p_submission uuid, p_approve boolean, p_licence_expires_on date, p_date_of_birth date,
  p_note text, p_categories text[] default null, p_link_guest boolean default true)
returns integer language plpgsql security definer set search_path = '' as $$
declare s public.kyc_submissions; cats text[]; n integer := 0;
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
      licence_categories = cats, phone = coalesce(s.phone, phone)
    where id = s.profile_id;
    if p_link_guest and s.phone is not null then
      update public.bookings set rider_id = s.profile_id where rider_id is null and guest_phone = s.phone;
      get diagnostics n = row_count;
    end if;
  else
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'tell the rider what to fix' using errcode = '22023'; end if;
    update public.kyc_submissions set status = 'rejected', note = left(trim(p_note), 300), reviewed_by = auth.uid(), reviewed_at = now()
    where id = s.id;
    update public.profiles set kyc_status = 'rejected' where id = s.profile_id and kyc_status <> 'approved';
  end if;
  update public.kyc_documents set reviewed_by = auth.uid(), reviewed_at = now() where submission_id = s.id;
  return n;
end $$;

revoke all on function public.record_counter_check(uuid, text[], date) from public, anon;
revoke all on function public.confirm_booking_paid(uuid, text, integer, text) from public, anon;
revoke all on function public.extend_hold(uuid, integer) from public, anon;
revoke all on function public.link_guest_booking(uuid, uuid) from public, anon;
revoke all on function public.review_kyc(uuid, boolean, date, date, text, text[], boolean) from public, anon;
grant execute on function public.record_counter_check(uuid, text[], date) to authenticated;
grant execute on function public.confirm_booking_paid(uuid, text, integer, text) to authenticated;
grant execute on function public.extend_hold(uuid, integer) to authenticated;
grant execute on function public.link_guest_booking(uuid, uuid) to authenticated;
grant execute on function public.review_kyc(uuid, boolean, date, date, text, text[], boolean) to authenticated;
