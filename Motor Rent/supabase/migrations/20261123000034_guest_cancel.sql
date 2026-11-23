-- Riders who booked without an account can cancel while payment isn't confirmed, from Find my booking.
-- Called only by the guest-booking function after it has matched the reference and mobile number.
create or replace function public.cancel_guest_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; had_slip boolean;
begin
  select * into bk from public.bookings where id = p_booking and rider_id is null for update;
  if bk.id is null then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status <> 'held' then
    raise exception 'this booking is no longer waiting for payment; call us to cancel it' using errcode = '55000';
  end if;
  perform set_config('app.slip_withdrawn', 'on', true);
  update public.transfer_slips
     set status = 'rejected',
         reject_reason = 'Withdrawn: the rider cancelled before the payment was confirmed. Refund anything already received.',
         reviewed_at = now()
   where booking_id = p_booking and status = 'pending';
  had_slip := found;
  perform set_config('app.slip_withdrawn', '', true);
  perform set_config('app.event_note',
    case when had_slip then 'cancelled by rider (no account) while the transfer slip was being checked; refund anything received'
         else 'cancelled by rider (no account)' end, true);
  update public.bookings set status = 'cancelled', held_until = null where id = p_booking;
end $$;
revoke execute on function public.cancel_guest_booking(uuid) from public, anon, authenticated;
