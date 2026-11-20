-- 15-minute turnaround between rentals of the same vehicle (cleaning, fuel check, handover paperwork).
-- `blocked` = the rental period plus 15 minutes after the return time. Two bookings may not overlap on
-- `blocked`, which leaves at least 15 minutes between one return and the next pickup.
alter table public.bookings add column blocked tstzrange;

create or replace function public.set_booking_blocked() returns trigger
language plpgsql as $$
begin
  new.blocked := tstzrange(lower(new.period), upper(new.period) + interval '15 minutes', '[)');
  return new;
end $$;
create trigger bookings_blocked before insert or update of period on public.bookings
  for each row execute function public.set_booking_blocked();
revoke execute on function public.set_booking_blocked() from public, anon, authenticated;

update public.bookings set blocked = tstzrange(lower(period), upper(period) + interval '15 minutes', '[)');
alter table public.bookings alter column blocked set not null;

-- bookings_no_overlap (no shared minutes) stays for every booking. The turnaround rule applies to bookings
-- made from now on; two already-paid back-to-back rentals predate it (`turnaround = false`).
alter table public.bookings add column turnaround boolean not null default true;
update public.bookings set turnaround = false;
alter table public.bookings add constraint bookings_turnaround
  exclude using gist (vehicle_id with =, blocked with &&)
  where (turnaround and status in ('held', 'confirmed', 'active', 'overdue'));

create or replace function public.vehicle_is_available(v uuid, p tstzrange) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vehicles where id = v and status = 'active')
     and not exists (select 1 from public.bookings b where b.vehicle_id = v
                     and b.blocked && tstzrange(lower(p), upper(p) + interval '15 minutes', '[)')
                     and b.status in ('held', 'confirmed', 'active', 'overdue'))
     and not exists (select 1 from public.maintenance m where m.vehicle_id = v and m.period && p)
$$;
