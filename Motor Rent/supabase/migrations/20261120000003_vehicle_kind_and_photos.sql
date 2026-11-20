-- Vehicle type (scooter / motorbike / car) and manager-managed listing photos.
--
-- Photos live in the public `vehicle-photos` bucket under `<vehicle_id>/<file>`.
-- Managers/owners upload there directly (storage RLS), then call update_vehicle_listing()
-- to publish the ordered list. Riders can never write either.

create type public.vehicle_kind as enum ('scooter', 'motorbike', 'car');

alter table public.vehicles add column kind public.vehicle_kind not null default 'scooter';
update public.vehicles set kind = 'motorbike' where engine_cc >= 150;

-- Every change to a vehicle (including photos) lands in the immutable audit log.
create trigger audit_vehicles after insert or update or delete on public.vehicles
  for each row execute function public.audit_row();

create policy "vehicle-photos: managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-photos' and public.my_role() in ('manager', 'owner'));

create or replace function public.update_vehicle_listing(v uuid, p_kind public.vehicle_kind, p_photos text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  photo text;
  folder text := '/storage/v1/object/public/vehicle-photos/' || v::text || '/';
begin
  if coalesce(public.my_role() in ('manager', 'owner'), false) is not true then
    raise exception 'only managers can edit listings' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vehicles where id = v) then
    raise exception 'vehicle not found' using errcode = 'P0002';
  end if;
  if coalesce(array_length(p_photos, 1), 0) > 8 then
    raise exception 'at most 8 photos per vehicle' using errcode = '22023';
  end if;
  foreach photo in array coalesce(p_photos, '{}') loop
    -- Only images stored in this vehicle's own folder of our bucket; no external hotlinks.
    if photo !~ '^https://[a-z0-9.-]+/' or position(folder in photo) = 0 or photo ~ '\.\.' then
      raise exception 'photo must be uploaded to this vehicle''s folder: %', photo using errcode = '22023';
    end if;
  end loop;

  update public.vehicles set kind = p_kind, photos = coalesce(p_photos, '{}') where id = v;
end;
$$;

revoke execute on function public.update_vehicle_listing(uuid, public.vehicle_kind, text[]) from public, anon;
grant execute on function public.update_vehicle_listing(uuid, public.vehicle_kind, text[]) to authenticated;
