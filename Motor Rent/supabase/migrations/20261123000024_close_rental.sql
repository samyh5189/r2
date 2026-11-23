-- Staff finish a rental after the return inspection: returned (or damage review) -> closed.
-- Before this there was no way to move a returned booking on, so rentals stayed "returned" forever.
create or replace function public.close_booking(b uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings;
begin
  select * into bk from public.bookings where id = b for update;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status not in ('returned', 'damage_claim') then
    raise exception 'only a returned rental can be closed (this one is %)', bk.status using errcode = '55000';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is not null then
    perform set_config('app.event_note', left(trim(p_note), 300), true);
  end if;
  update public.bookings set status = 'closed' where id = b;
end $$;
revoke execute on function public.close_booking(uuid, text) from public, anon;
grant execute on function public.close_booking(uuid, text) to authenticated;
