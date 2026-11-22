-- Body colour of each vehicle, so riders can pick a colour when a model comes in several.
-- A fixed list keeps names consistent (the apps map each one to a swatch colour).
alter table public.vehicles add column colour text
  check (colour is null or colour in ('black', 'white', 'grey', 'silver', 'red', 'blue', 'green', 'yellow', 'orange', 'brown'));

-- Managers/owners set or clear a vehicle's colour (null = not recorded).
create or replace function public.set_vehicle_colour(v uuid, p_colour text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_manager();
  update public.vehicles set colour = nullif(lower(trim(coalesce(p_colour, ''))), '') where id = v;
  if not found then raise exception 'vehicle not found' using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.set_vehicle_colour(uuid, text) from public, anon;
grant execute on function public.set_vehicle_colour(uuid, text) to authenticated;
