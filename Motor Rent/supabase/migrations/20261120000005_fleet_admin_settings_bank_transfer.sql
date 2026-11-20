-- Fleet management, site settings (hero photo), bank accounts and bank-transfer slips.
--
-- All writes go through SECURITY DEFINER functions that check the caller's role, so the
-- clients never get raw insert/update rights on vehicles, plans, settings or payments.

-- ───────────────────────────── helpers ─────────────────────────────
create or replace function public.require_manager() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.my_role() in ('manager', 'owner'), false) is not true then
    raise exception 'only managers and owners can do this' using errcode = '42501';
  end if;
end $$;
revoke execute on function public.require_manager() from public, anon;
grant execute on function public.require_manager() to authenticated;

-- ───────────────────────────── vehicles ─────────────────────────────
create or replace function public.save_vehicle(
  p_id uuid,                -- null = create
  p_kind public.vehicle_kind,
  p_plate text,
  p_make text,
  p_model text,
  p_engine_cc integer,
  p_year integer,
  p_branch uuid,
  p_plan uuid,
  p_status public.vehicle_status,
  p_odometer integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_plate text := upper(regexp_replace(trim(coalesce(p_plate, '')), '\s+', '-', 'g'));
  vid uuid;
begin
  perform public.require_manager();
  if v_plate !~ '^[A-Z0-9][A-Z0-9-]{1,14}$' then
    raise exception 'plate must be 2–15 letters, digits or dashes' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_make, ''))) not between 1 and 40 or length(trim(coalesce(p_model, ''))) not between 1 and 40 then
    raise exception 'make and model are required (max 40 characters)' using errcode = '22023';
  end if;
  if p_engine_cc is not null and p_engine_cc not between 49 and 8000 then
    raise exception 'engine size must be between 49 and 8000 cc' using errcode = '22023';
  end if;
  if p_year is not null and p_year not between 1980 and extract(year from now())::int + 1 then
    raise exception 'year looks wrong' using errcode = '22023';
  end if;
  if coalesce(p_odometer, 0) < 0 then
    raise exception 'odometer cannot be negative' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'branch not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.price_plans where id = p_plan) then
    raise exception 'price plan not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.vehicles where vehicles.plate = v_plate and id is distinct from p_id) then
    raise exception 'another vehicle already has plate %', v_plate using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.vehicles (kind, plate, make, model, engine_cc, year, branch_id, price_plan_id, status, odometer_km)
    values (p_kind, v_plate, trim(p_make), trim(p_model), p_engine_cc, p_year, p_branch, p_plan,
            coalesce(p_status, 'active'), coalesce(p_odometer, 0))
    returning id into vid;
  else
    if p_status = 'retired' and exists (
      select 1 from public.bookings where vehicle_id = p_id and status in ('held', 'confirmed', 'active', 'overdue')
    ) then
      raise exception 'this vehicle has upcoming or active bookings; finish or cancel them first' using errcode = '55000';
    end if;
    update public.vehicles set
      kind = p_kind, plate = v_plate, make = trim(p_make), model = trim(p_model),
      engine_cc = p_engine_cc, year = p_year, branch_id = p_branch, price_plan_id = p_plan,
      status = coalesce(p_status, status), odometer_km = coalesce(p_odometer, odometer_km)
    where id = p_id
    returning id into vid;
    if vid is null then raise exception 'vehicle not found' using errcode = 'P0002'; end if;
  end if;
  return vid;
end $$;

-- Deletes a vehicle that has never been booked. A vehicle with booking history is retired
-- instead (bookings and payments are permanent records). Returns 'deleted' or 'retired'.
create or replace function public.delete_vehicle(v uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_manager();
  perform public.lock_vehicle(v);
  if not exists (select 1 from public.vehicles where id = v) then
    raise exception 'vehicle not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.bookings where vehicle_id = v and status in ('held', 'confirmed', 'active', 'overdue')) then
    raise exception 'this vehicle has upcoming or active bookings; finish or cancel them first' using errcode = '55000';
  end if;
  if exists (select 1 from public.bookings where vehicle_id = v) then
    update public.vehicles set status = 'retired' where id = v;
    return 'retired';
  end if;
  delete from public.quotes where vehicle_id = v;
  delete from public.maintenance where vehicle_id = v;
  delete from public.vehicles where id = v;
  return 'deleted';
end $$;

-- ───────────────────────────── price plans ─────────────────────────────
create or replace function public.save_price_plan(
  p_id uuid, p_name text, p_currency text,
  p_hourly integer, p_daily integer, p_weekly integer, p_deposit integer,
  p_late_fee_per_hour integer, p_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  perform public.require_manager();
  if length(trim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'plan name is required' using errcode = '22023';
  end if;
  if p_currency not in ('MVR', 'USD') then raise exception 'currency must be MVR or USD' using errcode = '22023'; end if;
  if least(p_hourly, p_daily, p_weekly, p_deposit, p_late_fee_per_hour) < 0
     or greatest(p_hourly, p_daily, p_weekly, p_deposit, p_late_fee_per_hour) > 100000000 then
    raise exception 'prices must be between 0 and 1,000,000' using errcode = '22023';
  end if;
  if p_hourly = 0 or p_daily = 0 then raise exception 'hourly and daily prices must be above zero' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.price_plans (name, currency, hourly, daily, weekly, deposit, late_fee_per_hour, active)
    values (trim(p_name), p_currency, p_hourly, p_daily, p_weekly, p_deposit, p_late_fee_per_hour, coalesce(p_active, true))
    returning id into pid;
  else
    if p_active = false and exists (select 1 from public.vehicles where price_plan_id = p_id and status <> 'retired') then
      raise exception 'vehicles still use this plan; move them to another plan first' using errcode = '55000';
    end if;
    update public.price_plans set name = trim(p_name), currency = p_currency, hourly = p_hourly, daily = p_daily,
      weekly = p_weekly, deposit = p_deposit, late_fee_per_hour = p_late_fee_per_hour, active = coalesce(p_active, active)
    where id = p_id returning id into pid;
    if pid is null then raise exception 'plan not found' using errcode = 'P0002'; end if;
  end if;
  return pid;
end $$;

-- ───────────────────────────── site settings ─────────────────────────────
create table public.site_settings (
  id boolean primary key default true check (id),
  hero_image_url text,
  hero_credit text,
  bank_transfer_note text not null default 'Use your booking reference as the transfer remark.',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
insert into public.site_settings (id) values (true) on conflict do nothing;
alter table public.site_settings enable row level security;
create policy "site settings: anyone reads" on public.site_settings for select using (true);
create trigger audit_site_settings after update on public.site_settings for each row execute function public.audit_row();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('site-assets', 'site-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "site-assets: managers upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and public.my_role() in ('manager', 'owner'));
create policy "site-assets: managers list" on storage.objects for select to authenticated
  using (bucket_id = 'site-assets' and public.my_role() in ('manager', 'owner'));
create policy "site-assets: managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-assets' and public.my_role() in ('manager', 'owner'));

create or replace function public.update_site_settings(p_hero_image_url text, p_hero_credit text, p_bank_transfer_note text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_manager();
  if p_hero_image_url is not null and (
       p_hero_image_url !~ '^https://[a-z0-9.-]+/storage/v1/object/public/site-assets/hero/[A-Za-z0-9._-]+$') then
    raise exception 'hero image must be uploaded through the console' using errcode = '22023';
  end if;
  update public.site_settings set
    hero_image_url = p_hero_image_url,
    hero_credit = nullif(left(trim(coalesce(p_hero_credit, '')), 120), ''),
    bank_transfer_note = left(coalesce(nullif(trim(p_bank_transfer_note), ''), 'Use your booking reference as the transfer remark.'), 300),
    updated_at = now(), updated_by = auth.uid()
  where id;
end $$;

-- ───────────────────────────── bank accounts ─────────────────────────────
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null check (length(bank_name) between 1 and 60),
  account_name text not null check (length(account_name) between 1 and 80),
  account_number text not null check (account_number ~ '^[A-Za-z0-9 -]{4,34}$'),
  currency text not null default 'MVR' check (currency in ('MVR', 'USD')),
  swift text check (swift is null or swift ~ '^[A-Z0-9]{8,11}$'),
  note text check (note is null or length(note) <= 200),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger bank_accounts_touch before update on public.bank_accounts for each row execute function public.touch_updated_at();
create trigger audit_bank_accounts after insert or update or delete on public.bank_accounts for each row execute function public.audit_row();
alter table public.bank_accounts enable row level security;
create policy "bank accounts: anyone reads active, staff read all" on public.bank_accounts for select
  using (active or public.is_staff());
create policy "bank accounts: managers insert" on public.bank_accounts for insert to authenticated
  with check (public.my_role() in ('manager', 'owner'));
create policy "bank accounts: managers update" on public.bank_accounts for update to authenticated
  using (public.my_role() in ('manager', 'owner')) with check (public.my_role() in ('manager', 'owner'));
create policy "bank accounts: managers delete" on public.bank_accounts for delete to authenticated
  using (public.my_role() in ('manager', 'owner'));
grant select on public.bank_accounts to anon, authenticated;
grant insert, update, delete on public.bank_accounts to authenticated;

-- ───────────────────────────── transfer slips ─────────────────────────────
-- Rider uploads a bank-transfer slip for a held booking. OCR runs in the browser (rider for instant
-- feedback, staff again on review); OCR is advisory — a staff member approves or rejects every slip.
create type public.slip_status as enum ('pending', 'approved', 'rejected');

create table public.transfer_slips (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  rider_id uuid not null references public.profiles (id),
  path text not null unique,
  ocr jsonb,                       -- rider-side OCR result (untrusted hint)
  review_ocr jsonb,                -- staff-side OCR result at review time
  status public.slip_status not null default 'pending',
  amount integer check (amount >= 0),  -- amount staff confirmed on approval
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index transfer_slips_booking_idx on public.transfer_slips (booking_id, created_at desc);
create index transfer_slips_pending_idx on public.transfer_slips (created_at) where status = 'pending';
create unique index transfer_slips_one_pending on public.transfer_slips (booking_id) where status = 'pending';
create trigger audit_transfer_slips after insert or update on public.transfer_slips for each row execute function public.audit_row();
alter table public.transfer_slips enable row level security;
create policy "slips: rider reads own, staff reads branch" on public.transfer_slips for select to authenticated
  using (rider_id = auth.uid() or exists (
    select 1 from public.bookings b where b.id = booking_id and public.can_see_branch(b.branch_id)));
grant select on public.transfer_slips to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('payment-slips', 'payment-slips', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "payment-slips: rider uploads to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-slips' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "payment-slips: rider reads own, staff read all" on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

create or replace function public.submit_transfer_slip(p_booking uuid, p_path text, p_ocr jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  sid uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.rider_id is distinct from auth.uid() then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if b.status <> 'held' or b.held_until < now() then
    raise exception 'this booking is no longer waiting for payment' using errcode = '55000';
  end if;
  if p_path !~ ('^' || auth.uid()::text || '/' || p_booking::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then
    raise exception 'slip must be uploaded to your booking folder' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'payment-slips' and name = p_path) then
    raise exception 'slip file not found; upload it again' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.transfer_slips where booking_id = p_booking and status = 'pending') then
    raise exception 'a slip for this booking is already waiting for review' using errcode = '55000';
  end if;
  if pg_column_size(p_ocr) > 20000 then p_ocr := null; end if;

  insert into public.transfer_slips (booking_id, rider_id, path, ocr) values (p_booking, auth.uid(), p_path, p_ocr)
  returning id into sid;

  -- Keep the vehicle held while staff check the transfer: up to 24 h, but no later than 1 h after pickup.
  update public.bookings
    set held_until = greatest(held_until, least(now() + interval '24 hours', lower(period) + interval '1 hour'))
  where id = p_booking;
  return sid;
end $$;

create or replace function public.review_transfer_slip(p_slip uuid, p_approve boolean, p_amount integer, p_reason text, p_review_ocr jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.transfer_slips;
  b public.bookings;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select * into s from public.transfer_slips where id = p_slip for update;
  if s.id is null then raise exception 'slip not found' using errcode = 'P0002'; end if;
  select * into b from public.bookings where id = s.booking_id for update;
  if not public.can_see_branch(b.branch_id) then raise exception 'slip not found' using errcode = 'P0002'; end if;
  if s.status <> 'pending' then raise exception 'this slip was already reviewed' using errcode = '55000'; end if;
  if pg_column_size(p_review_ocr) > 20000 then p_review_ocr := null; end if;

  if not p_approve then
    if length(trim(coalesce(p_reason, ''))) = 0 then
      raise exception 'give the rider a reason' using errcode = '22023';
    end if;
    update public.transfer_slips set status = 'rejected', reject_reason = left(trim(p_reason), 300),
      review_ocr = p_review_ocr, reviewed_by = auth.uid(), reviewed_at = now() where id = p_slip;
    -- Give the rider time to send a correct slip.
    if b.status = 'held' then
      update public.bookings set held_until = greatest(held_until, least(now() + interval '2 hours', lower(period) + interval '1 hour'))
      where id = b.id;
    end if;
    return 'rejected';
  end if;

  if b.status <> 'held' then
    raise exception 'booking is % — it can no longer be confirmed; refund the rider instead', b.status using errcode = '55000';
  end if;
  if p_amount is null or p_amount < b.total then
    raise exception 'confirmed amount (%) is less than the booking total (%)', coalesce(p_amount, 0), b.total using errcode = '22023';
  end if;

  update public.transfer_slips set status = 'approved', amount = p_amount, review_ocr = p_review_ocr,
    reviewed_by = auth.uid(), reviewed_at = now() where id = p_slip;
  insert into public.payments (booking_id, kind, provider, provider_ref, idempotency_key, amount, currency, status, receipt_path, recorded_by, raw)
  values (b.id, 'bank_transfer', 'bank', 'slip:' || s.id, b.id || ':bank:' || s.id, p_amount, b.currency, 'succeeded',
          'payment-slips/' || s.path, auth.uid(), jsonb_build_object('slip_id', s.id, 'review_ocr', p_review_ocr));
  update public.bookings set status = 'confirmed', held_until = null where id = b.id;
  return 'approved';
end $$;

-- ───────────────────────────── grants ─────────────────────────────
revoke execute on function public.save_vehicle(uuid, public.vehicle_kind, text, text, text, integer, integer, uuid, uuid, public.vehicle_status, integer) from public, anon;
revoke execute on function public.delete_vehicle(uuid) from public, anon;
revoke execute on function public.save_price_plan(uuid, text, text, integer, integer, integer, integer, integer, boolean) from public, anon;
revoke execute on function public.update_site_settings(text, text, text) from public, anon;
revoke execute on function public.submit_transfer_slip(uuid, text, jsonb) from public, anon;
revoke execute on function public.review_transfer_slip(uuid, boolean, integer, text, jsonb) from public, anon;
grant execute on function public.save_vehicle(uuid, public.vehicle_kind, text, text, text, integer, integer, uuid, uuid, public.vehicle_status, integer) to authenticated;
grant execute on function public.delete_vehicle(uuid) to authenticated;
grant execute on function public.save_price_plan(uuid, text, text, integer, integer, integer, integer, integer, boolean) to authenticated;
grant execute on function public.update_site_settings(text, text, text) to authenticated;
grant execute on function public.submit_transfer_slip(uuid, text, jsonb) to authenticated;
grant execute on function public.review_transfer_slip(uuid, boolean, integer, text, jsonb) to authenticated;
grant select on public.site_settings to anon, authenticated;
