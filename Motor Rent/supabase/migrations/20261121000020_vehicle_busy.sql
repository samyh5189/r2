-- Busy windows per vehicle (bookings + 15-minute turnaround, and maintenance) so the booking flow can say
-- "free again from …". Times only: no references, riders or statuses.
create or replace function public.vehicle_busy(p_from timestamptz, p_to timestamptz)
returns table (vehicle_id uuid, busy_from timestamptz, busy_to timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.vehicle_id, lower(b.blocked) - interval '15 minutes', upper(b.blocked)
    from public.bookings b
   where b.status in ('held', 'confirmed', 'active', 'overdue')
     and b.blocked && tstzrange(p_from, p_to) and p_to - p_from <= interval '120 days'
  union all
  select m.vehicle_id, lower(m.period), upper(m.period)
    from public.maintenance m
   where m.period && tstzrange(p_from, p_to) and p_to - p_from <= interval '120 days'
$$;
revoke execute on function public.vehicle_busy(timestamptz, timestamptz) from public;
grant execute on function public.vehicle_busy(timestamptz, timestamptz) to anon, authenticated;
