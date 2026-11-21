-- Vehicles free for a pickup/return window (including the 15-minute turnaround), for the step-by-step booking flow.
-- Returns ids only, so no one learns anything about other riders' bookings.
create or replace function public.available_vehicles(p_start timestamptz, p_end timestamptz) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select v.id from public.vehicles v
   where v.status = 'active' and p_end > p_start and p_end - p_start <= interval '31 days'
     and public.vehicle_is_available(v.id, tstzrange(p_start, p_end, '[)'))
$$;
revoke execute on function public.available_vehicles(timestamptz, timestamptz) from public;
grant execute on function public.available_vehicles(timestamptz, timestamptz) to anon, authenticated;
