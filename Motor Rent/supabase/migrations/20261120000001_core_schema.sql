-- Motor Rent — core schema
-- Rules enforced here (not in app code):
--   * a vehicle can never be double-booked (exclusion constraint)
--   * bookings never overlap maintenance windows (locked triggers)
--   * booking status only moves along legal transitions, every move logged
--   * inspections and audit log are immutable
--   * clients can only READ their own data; all writes go through Edge Functions (service role)

create extension if not exists btree_gist;

-- ───────────────────────────── enums ─────────────────────────────
create type public.app_role as enum ('rider', 'staff', 'manager', 'owner');
create type public.kyc_status as enum ('pending', 'approved', 'rejected');
create type public.vehicle_status as enum ('active', 'maintenance', 'retired');
create type public.booking_status as enum (
  'held', 'confirmed', 'active', 'overdue', 'returned', 'damage_claim', 'closed', 'expired', 'cancelled'
);
create type public.payment_kind as enum ('charge', 'deposit_hold', 'deposit_capture', 'deposit_release', 'refund', 'cash', 'bank_transfer');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'cancelled');
create type public.inspection_phase as enum ('pickup', 'return');
create type public.claim_status as enum ('open', 'disputed', 'settled', 'waived');

-- ───────────────────────────── helpers ─────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────────── branches ─────────────────────────────
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  timezone text not null default 'Indian/Maldives',
  opening_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── profiles ─────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'rider',
  full_name text,
  phone text unique,
  date_of_birth date,
  branch_id uuid references public.branches (id), -- staff home branch
  kyc_status public.kyc_status not null default 'pending',
  licence_expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (new.id, new.phone, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helpers used by RLS (security definer avoids recursive RLS on profiles).
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('staff', 'manager', 'owner') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.can_see_branch(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.role in ('manager', 'owner') or (p.role = 'staff' and p.branch_id = b)
    from public.profiles p where p.id = auth.uid()
  ), false)
$$;

-- Riders must not escalate their own role or approve their own KYC.
create or replace function public.guard_profile_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() = old.id and not public.is_staff() then
    if new.role is distinct from old.role
       or new.kyc_status is distinct from old.kyc_status
       or new.branch_id is distinct from old.branch_id
       or new.licence_expires_on is distinct from old.licence_expires_on then
      raise exception 'not allowed to change role, KYC or licence fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ───────────────────────────── KYC documents ─────────────────────────────
create table public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  doc_type text not null check (doc_type in ('licence_front', 'licence_back', 'passport', 'national_id', 'selfie')),
  file_path text not null, -- path in the private `kyc` bucket
  expires_on date,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── pricing & fleet ─────────────────────────────
create table public.price_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'MVR' check (currency in ('MVR', 'USD')),
  hourly integer not null check (hourly >= 0),
  daily integer not null check (daily >= 0),
  weekly integer not null check (weekly >= 0),
  deposit integer not null check (deposit >= 0),
  multiplier numeric(4, 2) not null default 1.00 check (multiplier > 0),
  late_fee_per_hour integer not null check (late_fee_per_hour >= 0),
  late_grace_minutes integer not null default 15 check (late_grace_minutes >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.extras (
  code text primary key,
  label text not null,
  per_day integer not null check (per_day >= 0),
  max_quantity integer not null default 2 check (max_quantity > 0),
  active boolean not null default true
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  price_plan_id uuid not null references public.price_plans (id),
  plate text not null unique,
  make text not null,
  model text not null,
  engine_cc integer check (engine_cc > 0),
  year integer,
  status public.vehicle_status not null default 'active',
  odometer_km integer not null default 0 check (odometer_km >= 0),
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vehicles_branch_idx on public.vehicles (branch_id);
create trigger vehicles_touch before update on public.vehicles
  for each row execute function public.touch_updated_at();

-- ───────────────────────────── quotes ─────────────────────────────
-- Server-computed price, valid for 10 minutes. Bookings are created FROM a quote,
-- so the client never sends a price.
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.profiles (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id),
  period tstzrange not null check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  extras jsonb not null default '[]'::jsonb,
  lines jsonb not null,
  total integer not null check (total >= 0),
  deposit integer not null check (deposit >= 0),
  currency text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── bookings ─────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  rider_id uuid not null references public.profiles (id),
  vehicle_id uuid not null references public.vehicles (id),
  branch_id uuid not null references public.branches (id),
  quote_id uuid unique references public.quotes (id),
  period tstzrange not null check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  status public.booking_status not null default 'held',
  price_snapshot jsonb not null,
  total integer not null check (total >= 0),
  deposit integer not null check (deposit >= 0),
  currency text not null,
  terms_version text not null,
  held_until timestamptz,
  picked_up_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- THE double-booking guard: two live bookings on one vehicle can never overlap.
  constraint bookings_no_overlap exclude using gist (vehicle_id with =, period with &&)
    where (status in ('held', 'confirmed', 'active', 'overdue'))
);
create index bookings_rider_idx on public.bookings (rider_id, created_at desc);
create index bookings_branch_period_idx on public.bookings using gist (branch_id, period);
create index bookings_held_idx on public.bookings (held_until) where status = 'held';
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

-- ───────────────────────────── maintenance ─────────────────────────────
create table public.maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id),
  period tstzrange not null check (not isempty(period)),
  reason text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint maintenance_no_overlap exclude using gist (vehicle_id with =, period with &&)
);

-- Cross-table guard: bookings vs maintenance. Both sides take the same per-vehicle
-- advisory lock, so concurrent inserts are serialized and the check cannot race.
create or replace function public.lock_vehicle(v uuid) returns void
language sql as $$ select pg_advisory_xact_lock(hashtextextended(v::text, 0)) $$;

create or replace function public.assert_booking_not_in_maintenance() returns trigger
language plpgsql as $$
begin
  if new.status in ('held', 'confirmed', 'active', 'overdue') then
    perform public.lock_vehicle(new.vehicle_id);
    if exists (select 1 from public.maintenance m
               where m.vehicle_id = new.vehicle_id and m.period && new.period) then
      raise exception 'vehicle is in maintenance during this period' using errcode = '23P01';
    end if;
  end if;
  return new;
end $$;
create trigger bookings_maintenance_guard before insert or update of period, vehicle_id, status on public.bookings
  for each row execute function public.assert_booking_not_in_maintenance();

create or replace function public.assert_maintenance_not_booked() returns trigger
language plpgsql as $$
begin
  perform public.lock_vehicle(new.vehicle_id);
  if exists (select 1 from public.bookings b
             where b.vehicle_id = new.vehicle_id and b.period && new.period
               and b.status in ('held', 'confirmed', 'active', 'overdue')) then
    raise exception 'vehicle has live bookings during this period' using errcode = '23P01';
  end if;
  return new;
end $$;
create trigger maintenance_booking_guard before insert or update on public.maintenance
  for each row execute function public.assert_maintenance_not_booked();

-- ───────────────────────────── lifecycle ─────────────────────────────
-- Keep in sync with packages/shared/src/booking-status.ts
create or replace function public.booking_transition_allowed(f public.booking_status, t public.booking_status)
returns boolean language sql immutable as $$
  select case f
    when 'held'         then t in ('confirmed', 'expired', 'cancelled')
    when 'confirmed'    then t in ('active', 'cancelled')
    when 'active'       then t in ('overdue', 'returned')
    when 'overdue'      then t in ('returned')
    when 'returned'     then t in ('damage_claim', 'closed')
    when 'damage_claim' then t in ('closed')
    else false
  end
$$;

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  actor uuid, -- null = system (cron / webhook)
  note text,
  at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events (booking_id, at);

create or replace function public.enforce_booking_transition() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'held' then
      raise exception 'bookings must start as held' using errcode = '22023';
    end if;
    insert into public.booking_events (booking_id, from_status, to_status, actor)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    if not public.booking_transition_allowed(old.status, new.status) then
      raise exception 'illegal booking transition % -> %', old.status, new.status using errcode = '22023';
    end if;
    insert into public.booking_events (booking_id, from_status, to_status, actor)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger bookings_lifecycle after insert or update of status on public.bookings
  for each row execute function public.enforce_booking_transition();

-- ───────────────────────────── inspections ─────────────────────────────
create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  phase public.inspection_phase not null,
  photo_paths text[] not null check (cardinality(photo_paths) >= 6),
  fuel_level smallint not null check (fuel_level between 0 and 8), -- eighths of a tank
  odometer_km integer not null check (odometer_km >= 0),
  rider_signature_path text not null,
  staff_signature_path text not null,
  notes text,
  staff_id uuid not null references public.profiles (id),
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  unique (booking_id, phase)
);

-- ───────────────────────────── payments ─────────────────────────────
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  kind public.payment_kind not null,
  provider text not null default 'stripe',
  provider_ref text unique,              -- e.g. Stripe PaymentIntent id; unique = no double recording
  idempotency_key text not null unique,  -- booking id + step; unique = no double charge
  amount integer not null check (amount >= 0),
  currency text not null,
  status public.payment_status not null default 'pending',
  receipt_path text,                     -- required for cash / bank transfer
  recorded_by uuid references public.profiles (id),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_payment_needs_receipt check (kind not in ('cash', 'bank_transfer') or receipt_path is not null)
);
create index payments_booking_idx on public.payments (booking_id);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ───────────────────────────── damage claims ─────────────────────────────
create table public.damage_claims (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id),
  items jsonb not null default '[]'::jsonb, -- [{part, description, amount}]
  amount integer not null check (amount >= 0),
  evidence_paths text[] not null default '{}',
  status public.claim_status not null default 'open',
  rider_note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger damage_claims_touch before update on public.damage_claims
  for each row execute function public.touch_updated_at();

-- ───────────────────────────── audit log ─────────────────────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create or replace function public.reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.reject_mutation();
create trigger inspections_immutable before update or delete on public.inspections
  for each row execute function public.reject_mutation();
create trigger booking_events_immutable before update or delete on public.booking_events
  for each row execute function public.reject_mutation();

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, action, entity, entity_id, before, after)
  values (
    auth.uid(), lower(tg_op), tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.audit_row();
create trigger audit_damage_claims after insert or update or delete on public.damage_claims
  for each row execute function public.audit_row();
create trigger audit_price_plans after insert or update or delete on public.price_plans
  for each row execute function public.audit_row();
create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_row();

-- ───────────────────────────── scheduled jobs (called by pg_cron) ─────────────────────────────
-- Release bikes whose checkout was abandoned.
create or replace function public.expire_held_bookings() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.bookings set status = 'expired'
  where status = 'held' and held_until < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Flag rentals past their end + grace.
create or replace function public.mark_overdue_bookings() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.bookings b set status = 'overdue'
  from public.vehicles v join public.price_plans pp on pp.id = v.price_plan_id
  where b.vehicle_id = v.id and b.status = 'active'
    and upper(b.period) + make_interval(mins => pp.late_grace_minutes) < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Availability check for the rider app (read-only, no PII).
create or replace function public.vehicle_is_available(v uuid, p tstzrange) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vehicles where id = v and status = 'active')
     and not exists (select 1 from public.bookings b where b.vehicle_id = v and b.period && p
                     and b.status in ('held', 'confirmed', 'active', 'overdue'))
     and not exists (select 1 from public.maintenance m where m.vehicle_id = v and m.period && p)
$$;

-- ───────────────────────────── Row Level Security ─────────────────────────────
-- Default: clients READ only. Every write goes through Edge Functions with the service role,
-- which validate input, compute prices and call payment providers.
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.kyc_documents enable row level security;
alter table public.price_plans enable row level security;
alter table public.extras enable row level security;
alter table public.vehicles enable row level security;
alter table public.quotes enable row level security;
alter table public.bookings enable row level security;
alter table public.maintenance enable row level security;
alter table public.booking_events enable row level security;
alter table public.inspections enable row level security;
alter table public.payments enable row level security;
alter table public.damage_claims enable row level security;
alter table public.audit_log enable row level security;

-- Public catalogue
create policy "catalogue: anyone reads branches" on public.branches for select using (true);
create policy "catalogue: anyone reads active plans" on public.price_plans for select using (active or public.is_staff());
create policy "catalogue: anyone reads active extras" on public.extras for select using (active or public.is_staff());
create policy "catalogue: anyone reads non-retired vehicles" on public.vehicles for select
  using (status <> 'retired' or public.is_staff());

-- Profiles: own row; staff see all. Riders may edit name / DOB only (trigger guards the rest).
create policy "profiles: read own or staff" on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy "profiles: update own basic fields" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- KYC: rider reads own; staff read all; rider may submit (insert) own documents.
create policy "kyc: read own or staff" on public.kyc_documents for select
  using (profile_id = auth.uid() or public.is_staff());
create policy "kyc: rider submits own" on public.kyc_documents for insert
  with check (profile_id = auth.uid() and reviewed_by is null and reviewed_at is null);

-- Rider-owned rows
create policy "quotes: read own" on public.quotes for select using (rider_id = auth.uid());
create policy "bookings: rider reads own, staff reads branch" on public.bookings for select
  using (rider_id = auth.uid() or public.can_see_branch(branch_id));
create policy "events: via booking" on public.booking_events for select
  using (exists (select 1 from public.bookings b where b.id = booking_id
                 and (b.rider_id = auth.uid() or public.can_see_branch(b.branch_id))));
create policy "inspections: via booking" on public.inspections for select
  using (exists (select 1 from public.bookings b where b.id = booking_id
                 and (b.rider_id = auth.uid() or public.can_see_branch(b.branch_id))));
create policy "payments: via booking" on public.payments for select
  using (exists (select 1 from public.bookings b where b.id = booking_id
                 and (b.rider_id = auth.uid() or public.can_see_branch(b.branch_id))));
create policy "claims: via booking" on public.damage_claims for select
  using (exists (select 1 from public.bookings b where b.id = booking_id
                 and (b.rider_id = auth.uid() or public.can_see_branch(b.branch_id))));

-- Staff-only
create policy "maintenance: staff reads" on public.maintenance for select using (public.is_staff());
create policy "audit: owner/manager reads" on public.audit_log for select
  using (public.my_role() in ('manager', 'owner'));

-- Lock down function execution that should only run server-side.
revoke execute on function public.expire_held_bookings() from public, anon, authenticated;
revoke execute on function public.mark_overdue_bookings() from public, anon, authenticated;
