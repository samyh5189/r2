-- Riders can cancel any booking whose payment is not confirmed yet (status 'held'), including while
-- a bank-transfer slip is still waiting for review. The slip is withdrawn (marked rejected with a
-- reason staff can see) so it leaves the review queue, and the rider is not sent a "slip rejected" message.

create or replace function public.cancel_my_booking(b uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; had_slip boolean;
begin
  select * into bk from public.bookings where id = b and rider_id = auth.uid() for update;
  if bk.id is null then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status <> 'held' then
    raise exception 'this booking is already paid; contact the office to cancel it' using errcode = '55000';
  end if;
  perform set_config('app.slip_withdrawn', 'on', true);
  update public.transfer_slips
     set status = 'rejected',
         reject_reason = 'Withdrawn: the rider cancelled before the payment was confirmed. Refund anything already received.',
         reviewed_at = now()
   where booking_id = b and status = 'pending';
  had_slip := found;
  perform set_config('app.slip_withdrawn', '', true);
  perform set_config('app.event_note',
    case when had_slip then 'cancelled by rider while the transfer slip was being checked; refund anything received'
         else 'cancelled by rider' end, true);
  update public.bookings set status = 'cancelled', held_until = null where id = b;
end $$;
revoke execute on function public.cancel_my_booking(uuid) from public, anon;
grant execute on function public.cancel_my_booking(uuid) to authenticated;

-- Same as before, but no "slip rejected" WhatsApp when the rider withdrew it by cancelling.
create or replace function public.wa_on_slip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b record;
begin
  select * into b from public.wa_booking(new.booking_id);
  if tg_op = 'INSERT' then
    perform public.wa_notify_staff(b.branch, 'rm_staff_slip', array[b.ref, b.rider_name], 'slip' || new.id, new.booking_id);
  elsif new.status = 'rejected' and old.status = 'pending'
        and coalesce(current_setting('app.slip_withdrawn', true), '') <> 'on' then
    perform public.wa_enqueue(new.rider_id, 'rm_slip_rejected', array[b.ref, coalesce(new.reject_reason, 'please check the amount and reference')], 'slipr' || new.id, new.booking_id);
  end if;
  return new;
end $$;

-- No helmet comes with the bike in Kulhudhuffushi (not required there); riders ask for one as an extra.
update public.extras set label = 'Helmet' where code = 'helmet' and label = 'Extra helmet';
