-- Identity verification (KYC) submissions + review, booking cancellation, support contacts,
-- and hardening found in the system audit.

-- ───────────────────────────── KYC ─────────────────────────────
create table public.kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null check (length(full_name) between 2 and 100),
  date_of_birth date not null,
  id_type text not null check (id_type in ('national_id', 'passport')),
  id_number text not null check (length(id_number) between 3 and 40),
  licence_number text not null check (length(licence_number) between 3 and 40),
  licence_expires_on date not null,
  status public.kyc_status not null default 'pending',
  note text,                      -- reason shown to the rider on rejection
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index kyc_submissions_profile_idx on public.kyc_submissions (profile_id, created_at desc);
create unique index kyc_submissions_one_pending on public.kyc_submissions (profile_id) where status = 'pending';
create trigger audit_kyc_submissions after insert or update on public.kyc_submissions for each row execute function public.audit_row();
alter table public.kyc_submissions enable row level security;
create policy "kyc submissions: read own or staff" on public.kyc_submissions for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
grant select on public.kyc_submissions to authenticated;

alter table public.kyc_documents add column submission_id uuid references public.kyc_submissions (id) on delete cascade;
-- Documents are only created through submit_kyc (which checks the files exist in the rider's own folder).
drop policy if exists "kyc: rider submits own" on public.kyc_documents;

create or replace function public.submit_kyc(
  p_full_name text, p_date_of_birth date, p_id_type text, p_id_number text,
  p_licence_number text, p_licence_expires_on date, p_docs jsonb   -- [{"doc_type": "...", "path": "<uid>/..."}]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  d jsonb;
  types text[] := '{}';
  p public.profiles;
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
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

  insert into public.kyc_submissions (profile_id, full_name, date_of_birth, id_type, id_number, licence_number, licence_expires_on)
  values (uid, trim(p_full_name), p_date_of_birth, p_id_type, trim(p_id_number), upper(trim(p_licence_number)), p_licence_expires_on)
  returning id into sid;
  insert into public.kyc_documents (profile_id, submission_id, doc_type, file_path, expires_on)
  select uid, sid, x ->> 'doc_type', x ->> 'path', case when x ->> 'doc_type' like 'licence%' then p_licence_expires_on end
  from jsonb_array_elements(p_docs) x;
  return sid;
end $$;

create or replace function public.review_kyc(p_submission uuid, p_approve boolean, p_licence_expires_on date, p_date_of_birth date, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare s public.kyc_submissions;
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
    update public.kyc_submissions set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
      licence_expires_on = coalesce(p_licence_expires_on, licence_expires_on), date_of_birth = coalesce(p_date_of_birth, date_of_birth)
    where id = s.id;
    update public.profiles set kyc_status = 'approved', full_name = s.full_name,
      date_of_birth = coalesce(p_date_of_birth, s.date_of_birth),
      licence_expires_on = coalesce(p_licence_expires_on, s.licence_expires_on)
    where id = s.profile_id;
  else
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'tell the rider what to fix' using errcode = '22023'; end if;
    update public.kyc_submissions set status = 'rejected', note = left(trim(p_note), 300), reviewed_by = auth.uid(), reviewed_at = now()
    where id = s.id;
    update public.profiles set kyc_status = 'rejected' where id = s.profile_id and kyc_status <> 'approved';
  end if;
  update public.kyc_documents set reviewed_by = auth.uid(), reviewed_at = now() where submission_id = s.id;
end $$;

-- Riders may no longer change their date of birth once verified (it gates the minimum-age check).
create or replace function public.guard_profile_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() = old.id and not public.is_staff() then
    if new.role is distinct from old.role
       or new.kyc_status is distinct from old.kyc_status
       or new.branch_id is distinct from old.branch_id
       or new.licence_expires_on is distinct from old.licence_expires_on
       or (old.kyc_status = 'approved' and new.date_of_birth is distinct from old.date_of_birth) then
      raise exception 'not allowed to change role, KYC, date of birth or licence fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ───────────────────────────── cancellation ─────────────────────────────
create or replace function public.cancel_my_booking(b uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings;
begin
  select * into bk from public.bookings where id = b and rider_id = auth.uid() for update;
  if bk.id is null then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status <> 'held' then
    raise exception 'only unpaid reservations can be cancelled here; contact the office for paid bookings' using errcode = '55000';
  end if;
  if exists (select 1 from public.transfer_slips where booking_id = b and status = 'pending') then
    raise exception 'your payment slip is being checked; contact the office to cancel' using errcode = '55000';
  end if;
  perform set_config('app.event_note', 'cancelled by rider', true);
  update public.bookings set status = 'cancelled', held_until = null where id = b;
end $$;

create or replace function public.cancel_booking(b uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings;
begin
  select * into bk from public.bookings where id = b for update;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status not in ('held', 'confirmed') then
    raise exception 'a % booking cannot be cancelled', bk.status using errcode = '55000';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'give a reason' using errcode = '22023'; end if;
  update public.transfer_slips set status = 'rejected', reject_reason = 'Booking cancelled: ' || left(trim(p_reason), 200),
    reviewed_by = auth.uid(), reviewed_at = now()
   where booking_id = b and status = 'pending';
  perform set_config('app.event_note', left(trim(p_reason), 300), true);
  update public.bookings set status = 'cancelled', held_until = null where id = b;
end $$;

-- The lifecycle trigger records an optional note set for this transaction (app.event_note), so a
-- reason can be attached without editing the append-only event log afterwards.
create or replace function public.enforce_booking_transition() returns trigger
language plpgsql as $$
declare note text := nullif(current_setting('app.event_note', true), '');
begin
  if tg_op = 'INSERT' then
    if new.status <> 'held' then
      raise exception 'bookings must start as held' using errcode = '22023';
    end if;
    insert into public.booking_events (booking_id, from_status, to_status, actor, note)
    values (new.id, null, new.status, auth.uid(), note);
  elsif new.status is distinct from old.status then
    if not public.booking_transition_allowed(old.status, new.status) then
      raise exception 'illegal booking transition % -> %', old.status, new.status using errcode = '22023';
    end if;
    insert into public.booking_events (booking_id, from_status, to_status, actor, note)
    values (new.id, old.status, new.status, auth.uid(), note);
  end if;
  perform set_config('app.event_note', '', true);
  return new;
end $$;

-- ───────────────────────────── support contacts ─────────────────────────────
alter table public.site_settings
  add column support_phone text check (support_phone is null or support_phone ~ '^\+?[0-9 ]{6,20}$'),
  add column support_email text check (support_email is null or support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

create or replace function public.update_support_contacts(p_phone text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_manager();
  update public.site_settings set support_phone = nullif(trim(p_phone), ''), support_email = nullif(lower(trim(p_email)), ''),
    updated_at = now(), updated_by = auth.uid() where id;
end $$;

-- ───────────────────────────── grants / hygiene ─────────────────────────────
-- Trigger functions are never meant to be called directly.
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.submit_kyc(text, date, text, text, text, date, jsonb) from public, anon;
revoke execute on function public.review_kyc(uuid, boolean, date, date, text) from public, anon;
revoke execute on function public.cancel_my_booking(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
revoke execute on function public.update_support_contacts(text, text) from public, anon;
grant execute on function public.submit_kyc(text, date, text, text, text, date, jsonb) to authenticated;
grant execute on function public.review_kyc(uuid, boolean, date, date, text) to authenticated;
grant execute on function public.cancel_my_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.update_support_contacts(text, text) to authenticated;
