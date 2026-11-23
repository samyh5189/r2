-- Riders without an account pay by bank transfer and upload the slip too (through the guest-booking function,
-- which checks the reference and mobile number). Staff review it like any other slip.
alter table public.transfer_slips alter column rider_id drop not null;

create or replace function public.submit_guest_slip(p_booking uuid, p_path text, p_ocr jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.bookings; sid uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if b.status <> 'held' or b.held_until < now() then
    raise exception 'this booking is no longer waiting for payment' using errcode = '55000';
  end if;
  if p_path !~ ('^guest/' || p_booking::text || '/[0-9]+\.(jpg|png|webp)$')
     or not exists (select 1 from storage.objects where bucket_id = 'payment-slips' and name = p_path) then
    raise exception 'slip file not found; upload it again' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.transfer_slips where booking_id = p_booking and status = 'pending') then
    raise exception 'a slip for this booking is already waiting for review' using errcode = '55000';
  end if;
  if pg_column_size(p_ocr) > 20000 then p_ocr := null; end if;
  insert into public.transfer_slips (booking_id, rider_id, path, ocr) values (p_booking, b.rider_id, p_path, p_ocr) returning id into sid;
  -- Keep the vehicle held while staff check the transfer: up to 24 h, but no later than 1 h after pickup.
  update public.bookings set held_until = greatest(held_until, least(now() + interval '24 hours', lower(period) + interval '1 hour'))
   where id = p_booking;
  return sid;
end $$;
revoke execute on function public.submit_guest_slip(uuid, text, jsonb) from public, anon, authenticated;
