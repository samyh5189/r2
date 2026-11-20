-- Run with: supabase test db   (requires Docker + `supabase start`)
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- fixtures
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'rider1@test.local'),
                                          ('22222222-2222-2222-2222-222222222222', 'rider2@test.local');

create temp table t_ctx as select
  '00000000-0000-0000-0000-0000000000c1'::uuid as vehicle,
  '00000000-0000-0000-0000-0000000000b1'::uuid as branch;

insert into public.bookings (id, rider_id, vehicle_id, branch_id, period, price_snapshot, total, deposit, currency, terms_version, held_until)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        (select vehicle from t_ctx), (select branch from t_ctx),
        '[2027-01-01 08:00+05, 2027-01-01 18:00+05)', '{}', 30000, 100000, 'MVR', 'v1', now() + interval '15 minutes');

select throws_ok(
  $$ insert into public.bookings (rider_id, vehicle_id, branch_id, period, price_snapshot, total, deposit, currency, terms_version)
     values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1',
             '[2027-01-01 17:00+05, 2027-01-01 20:00+05)', '{}', 15000, 100000, 'MVR', 'v1') $$,
  '23P01', null, 'overlapping live booking on the same bike is rejected');

select lives_ok(
  $$ insert into public.bookings (rider_id, vehicle_id, branch_id, period, price_snapshot, total, deposit, currency, terms_version)
     values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1',
             '[2027-01-01 18:00+05, 2027-01-01 20:00+05)', '{}', 10000, 100000, 'MVR', 'v1') $$,
  'back-to-back booking (end == start) is allowed');

select throws_ok(
  $$ insert into public.bookings (rider_id, vehicle_id, branch_id, period, price_snapshot, total, deposit, currency, terms_version, status)
     values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1',
             '[2027-02-01 08:00+05, 2027-02-01 10:00+05)', '{}', 10000, 100000, 'MVR', 'v1', 'confirmed') $$,
  '22023', null, 'bookings must start as held');

select throws_ok(
  $$ update public.bookings set status = 'returned' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '22023', null, 'cannot skip from held to returned');

select lives_ok(
  $$ update public.bookings set status = 'confirmed' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'held -> confirmed is allowed');

select is(
  (select count(*)::int from public.booking_events where booking_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  2, 'every status change is logged');

select throws_ok(
  $$ insert into public.maintenance (vehicle_id, period, reason)
     values ('00000000-0000-0000-0000-0000000000c1', '[2027-01-01 12:00+05, 2027-01-01 14:00+05)', 'oil') $$,
  '23P01', null, 'maintenance cannot overlap a live booking');

update public.bookings set status = 'cancelled' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select lives_ok(
  $$ insert into public.bookings (rider_id, vehicle_id, branch_id, period, price_snapshot, total, deposit, currency, terms_version)
     values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1',
             '[2027-01-01 08:00+05, 2027-01-01 12:00+05)', '{}', 20000, 100000, 'MVR', 'v1') $$,
  'a cancelled booking frees the slot');

select throws_ok(
  $$ delete from public.booking_events $$, '42501', null, 'booking history is append-only');

select * from finish();
rollback;
