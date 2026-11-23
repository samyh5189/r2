-- One unpaid booking at a time per rider: pay (or cancel) it before booking again. Paid, confirmed bookings
-- don't count. A rider without an account is recognised by mobile number, also against an account with that number.
create or replace function public.assert_one_unpaid_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
declare ph text;
begin
  if new.status <> 'held' then return new; end if;
  select phone into ph from public.profiles where id = new.rider_id;
  ph := coalesce(ph, new.guest_phone);
  if exists (
    select 1 from public.bookings b
     where b.status = 'held' and b.id <> new.id
       and ((new.rider_id is not null and b.rider_id = new.rider_id)
            or (ph is not null and b.guest_phone = ph)
            or (ph is not null and b.rider_id in (select id from public.profiles where phone = ph)))
  ) then
    raise exception 'You already have a booking waiting for payment. Pay or cancel it first, then book again.'
      using errcode = 'P0001', hint = 'ONE_UNPAID';
  end if;
  return new;
end $$;
drop trigger if exists bookings_one_unpaid on public.bookings;
create trigger bookings_one_unpaid before insert on public.bookings
  for each row execute function public.assert_one_unpaid_booking();
revoke execute on function public.assert_one_unpaid_booking() from public, anon, authenticated;
