-- Rental operations: refunds on cancellation, damage claims, extensions, counter deposits,
-- counter address/hours, and riders seeing their own handover photos.

-- ── Lifecycle: an overdue rental can go back on the road when staff approve an extension. ──
create or replace function public.booking_transition_allowed(f public.booking_status, t public.booking_status)
returns boolean language sql immutable as $$
  select case f
    when 'held'         then t in ('confirmed', 'expired', 'cancelled')
    when 'confirmed'    then t in ('active', 'cancelled')
    when 'active'       then t in ('overdue', 'returned')
    when 'overdue'      then t in ('active', 'returned')
    when 'returned'     then t in ('damage_claim', 'closed')
    when 'damage_claim' then t in ('closed')
    else false
  end
$$;

-- ── Refunds: cancelling a paid booking records the refund owed (policy, or the amount staff choose). ──
drop function if exists public.cancel_booking(uuid, text);
create function public.cancel_booking(b uuid, p_reason text, p_refund integer default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; refund integer := 0;
begin
  select * into bk from public.bookings where id = b for update;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status not in ('held', 'confirmed') then
    raise exception 'a % booking cannot be cancelled', bk.status using errcode = '55000';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'give a reason' using errcode = '22023'; end if;
  if bk.status = 'confirmed' then
    -- Policy (rental terms): full refund 24 h or more before pickup, half until pickup, nothing after (no-show).
    refund := coalesce(p_refund, case
      when now() <= lower(bk.period) - interval '24 hours' then bk.total
      when now() < lower(bk.period) then bk.total / 2
      else 0 end);
    if refund < 0 or refund > bk.total then raise exception 'refund must be between 0 and the booking total' using errcode = '22023'; end if;
  end if;
  update public.transfer_slips set status = 'rejected', reject_reason = 'Booking cancelled: ' || left(trim(p_reason), 200),
    reviewed_by = auth.uid(), reviewed_at = now()
   where booking_id = b and status = 'pending';
  perform set_config('app.event_note', left(trim(p_reason), 300), true);
  update public.bookings set status = 'cancelled', held_until = null where id = b;
  if refund > 0 then
    insert into public.payments (booking_id, kind, provider, idempotency_key, amount, currency, status, recorded_by)
    values (b, 'refund', 'manual', b::text || ':refund', refund, bk.currency, 'pending', auth.uid())
    on conflict (idempotency_key) do nothing;
  end if;
  return refund;
end $$;
revoke execute on function public.cancel_booking(uuid, text, integer) from public, anon;
grant execute on function public.cancel_booking(uuid, text, integer) to authenticated;

-- Settling money by hand now also covers refunds paid back and deposits taken.
create or replace function public.mark_payment_collected(p_id uuid, p_method text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() not in ('manager', 'owner') then raise exception 'managers and owners only' using errcode = '42501'; end if;
  if p_method not in ('cash', 'bank', 'card') then raise exception 'method must be cash, bank or card' using errcode = '22023'; end if;
  update public.payments set status = 'succeeded', provider = p_method, recorded_by = auth.uid(), updated_at = now()
   where id = p_id and status = 'pending' and provider <> 'stripe' and kind in ('charge', 'refund');
  if not found then raise exception 'payment not found or already settled' using errcode = 'P0002'; end if;
end $$;

-- ── Damage claims ──
create or replace function public.open_damage_claim(b uuid, p_items jsonb, p_amount integer) returns void
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; photos text[];
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select * into bk from public.bookings where id = b for update;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status <> 'returned' then raise exception 'raise a claim after the return inspection' using errcode = '55000'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'list the damage' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'enter the amount' using errcode = '22023'; end if;
  select coalesce(photo_paths, '{}') into photos from public.inspections where booking_id = b and phase = 'return';
  insert into public.damage_claims (booking_id, items, amount, evidence_paths, status, created_by)
  values (b, p_items, p_amount, coalesce(photos, '{}'), 'open', auth.uid());
  perform set_config('app.event_note', 'Damage: ' || left((select string_agg(x->>'what', ', ') from jsonb_array_elements(p_items) x), 250), true);
  update public.bookings set status = 'damage_claim' where id = b;
end $$;

-- Staff settle (charge the agreed amount) or waive the claim.
create or replace function public.resolve_damage_claim(b uuid, p_outcome text, p_amount integer default null) returns void
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; c public.damage_claims;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select * into bk from public.bookings where id = b;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  select * into c from public.damage_claims where booking_id = b for update;
  if c.id is null or c.status not in ('open', 'disputed') then raise exception 'no open claim on this booking' using errcode = 'P0002'; end if;
  if p_outcome = 'waived' then
    update public.damage_claims set status = 'waived' where id = c.id;
  elsif p_outcome = 'settled' then
    if coalesce(p_amount, c.amount) <= 0 then raise exception 'enter the amount' using errcode = '22023'; end if;
    update public.damage_claims set status = 'settled', amount = coalesce(p_amount, c.amount) where id = c.id;
    insert into public.payments (booking_id, kind, provider, idempotency_key, amount, currency, status, recorded_by)
    values (b, 'charge', 'manual', b::text || ':damage', coalesce(p_amount, c.amount), bk.currency, 'pending', auth.uid())
    on conflict (idempotency_key) do nothing;
  else
    raise exception 'outcome must be settled or waived' using errcode = '22023';
  end if;
end $$;

-- The rider can dispute an open claim with their side of the story.
create or replace function public.dispute_damage_claim(b uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'tell us what happened' using errcode = '22023'; end if;
  update public.damage_claims c set status = 'disputed', rider_note = left(trim(p_note), 1000)
    from public.bookings bk
   where c.booking_id = b and bk.id = b and bk.rider_id = auth.uid() and c.status = 'open';
  if not found then raise exception 'no open claim to dispute' using errcode = 'P0002'; end if;
end $$;

-- A rental can't be closed while a claim is unresolved.
create or replace function public.close_booking(b uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings;
begin
  select * into bk from public.bookings where id = b for update;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status not in ('returned', 'damage_claim') then
    raise exception 'only a returned rental can be closed (this one is %)', bk.status using errcode = '55000';
  end if;
  if exists (select 1 from public.damage_claims where booking_id = b and status in ('open', 'disputed')) then
    raise exception 'settle or waive the damage claim first' using errcode = '55000';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is not null then
    perform set_config('app.event_note', left(trim(p_note), 300), true);
  end if;
  update public.bookings set status = 'closed' where id = b;
end $$;

-- ── Extensions: the rider asks for more time; staff approve with the price, or decline. ──
create table if not exists public.booking_extensions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  new_end timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  amount integer check (amount >= 0),
  reason text,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists booking_extensions_one_pending on public.booking_extensions (booking_id) where status = 'pending';
create index if not exists booking_extensions_booking_idx on public.booking_extensions (booking_id);
create index if not exists booking_extensions_decided_by_idx on public.booking_extensions (decided_by);
alter table public.booking_extensions enable row level security;
create policy "extensions: rider or branch staff read" on public.booking_extensions for select using (
  exists (select 1 from public.bookings b where b.id = booking_id and (b.rider_id = auth.uid() or public.can_see_branch(b.branch_id))));
revoke insert, update, delete, truncate on public.booking_extensions from anon, authenticated;

create or replace function public.request_extension(b uuid, p_new_end timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; x uuid;
begin
  select * into bk from public.bookings where id = b and rider_id = auth.uid();
  if bk.id is null then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status not in ('confirmed', 'active', 'overdue') then raise exception 'this rental can no longer be extended' using errcode = '55000'; end if;
  if p_new_end <= upper(bk.period) or p_new_end <= now() then raise exception 'pick a later return time' using errcode = '22023'; end if;
  if p_new_end > upper(bk.period) + interval '14 days' then raise exception 'extend by up to 14 days at a time' using errcode = '22023'; end if;
  -- Free for the extra time? (Ignore this rental itself, which of course holds the bike until now.)
  if exists (select 1 from public.bookings o where o.vehicle_id = bk.vehicle_id and o.id <> bk.id
               and o.status in ('held', 'confirmed', 'active', 'overdue')
               and o.blocked && tstzrange(upper(bk.period), p_new_end + interval '15 minutes', '[)'))
     or exists (select 1 from public.maintenance m where m.vehicle_id = bk.vehicle_id and m.period && tstzrange(upper(bk.period), p_new_end, '[)')) then
    raise exception 'the bike is booked by someone else then; pick an earlier time' using errcode = '23P01';
  end if;
  insert into public.booking_extensions (booking_id, new_end) values (b, p_new_end) returning id into x;
  return x;
exception when unique_violation then
  raise exception 'you already have a request waiting for the office' using errcode = '23505';
end $$;

create or replace function public.withdraw_extension(x uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.booking_extensions e set status = 'withdrawn', decided_at = now()
    from public.bookings b where e.id = x and b.id = e.booking_id and b.rider_id = auth.uid() and e.status = 'pending';
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.decide_extension(x uuid, p_approve boolean, p_amount integer default null, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.booking_extensions; bk public.bookings;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select * into e from public.booking_extensions where id = x for update;
  if e.id is null or e.status <> 'pending' then raise exception 'request not found or already decided' using errcode = 'P0002'; end if;
  select * into bk from public.bookings where id = e.booking_id for update;
  if not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if not p_approve then
    update public.booking_extensions set status = 'declined', reason = nullif(left(trim(coalesce(p_reason, '')), 300), ''),
      decided_by = auth.uid(), decided_at = now() where id = x;
    return;
  end if;
  if bk.status not in ('confirmed', 'active', 'overdue') then raise exception 'this rental can no longer be extended' using errcode = '55000'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'enter the price for the extra time' using errcode = '22023'; end if;
  -- The overlap constraints reject the change if the bike is booked in the new time.
  update public.bookings set period = tstzrange(lower(period), e.new_end, '[)'), total = total + p_amount where id = bk.id;
  if bk.status = 'overdue' and e.new_end > now() then
    perform set_config('app.event_note', 'Extended to ' || to_char(e.new_end at time zone 'Indian/Maldives', 'DD Mon HH24:MI'), true);
    update public.bookings set status = 'active' where id = bk.id;
  end if;
  update public.booking_extensions set status = 'approved', amount = p_amount, decided_by = auth.uid(), decided_at = now() where id = x;
  if p_amount > 0 then
    insert into public.payments (booking_id, kind, provider, idempotency_key, amount, currency, status, recorded_by)
    values (bk.id, 'charge', 'manual', bk.id::text || ':ext:' || x::text, p_amount, bk.currency, 'pending', auth.uid());
  end if;
exception when exclusion_violation then
  raise exception 'the bike is booked by someone else in that time' using errcode = '23P01';
end $$;

-- ── Deposits taken at the counter (cash, bank or card), returned when the rental closes. ──
create or replace function public.record_deposit(b uuid, p_method text) returns void
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_method not in ('cash', 'bank', 'card') then raise exception 'method must be cash, bank or card' using errcode = '22023'; end if;
  select * into bk from public.bookings where id = b;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.deposit <= 0 then raise exception 'this booking has no deposit' using errcode = '22023'; end if;
  insert into public.payments (booking_id, kind, provider, idempotency_key, amount, currency, status, recorded_by)
  values (b, 'deposit_hold', p_method, b::text || ':deposit', bk.deposit, bk.currency, 'succeeded', auth.uid())
  on conflict (idempotency_key) do nothing;
  if not found then raise exception 'the deposit is already recorded' using errcode = '23505'; end if;
end $$;

-- Return the deposit, keeping p_keep (towards damage or late fees).
create or replace function public.return_deposit(b uuid, p_keep integer default 0) returns void
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; held public.payments; ch public.payments; left_over integer;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select * into bk from public.bookings where id = b;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status not in ('returned', 'damage_claim', 'closed', 'cancelled') then raise exception 'return the deposit after the bike is back' using errcode = '55000'; end if;
  select * into held from public.payments where idempotency_key = b::text || ':deposit' and status = 'succeeded';
  if held.id is null then raise exception 'no deposit was taken' using errcode = 'P0002'; end if;
  if p_keep < 0 or p_keep > held.amount then raise exception 'keep between 0 and the deposit' using errcode = '22023'; end if;
  if exists (select 1 from public.payments where idempotency_key in (b::text || ':deposit-back', b::text || ':deposit-kept')) then
    raise exception 'the deposit was already settled' using errcode = '23505';
  end if;
  if held.amount - p_keep > 0 then
    insert into public.payments (booking_id, kind, provider, idempotency_key, amount, currency, status, recorded_by)
    values (b, 'deposit_release', held.provider, b::text || ':deposit-back', held.amount - p_keep, held.currency, 'succeeded', auth.uid());
  end if;
  if p_keep > 0 then
    insert into public.payments (booking_id, kind, provider, idempotency_key, amount, currency, status, recorded_by)
    values (b, 'deposit_capture', held.provider, b::text || ':deposit-kept', p_keep, held.currency, 'succeeded', auth.uid());
    -- What was kept pays the booking's unpaid fees (oldest first) that it fully covers; the capture is the income record.
    left_over := p_keep;
    for ch in select * from public.payments where booking_id = b and kind = 'charge' and status = 'pending' and provider <> 'stripe' order by created_at loop
      exit when ch.amount > left_over;
      update public.payments set status = 'cancelled', raw = coalesce(raw, '{}'::jsonb) || '{"paid_from":"deposit"}', recorded_by = auth.uid() where id = ch.id;
      left_over := left_over - ch.amount;
    end loop;
  end if;
end $$;

-- ── Counter address, map position and opening hours (managers). ──
create or replace function public.update_branch(p_id uuid, p_address text, p_lat double precision, p_lng double precision, p_open text, p_close text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_manager();
  if length(trim(coalesce(p_address, ''))) < 5 then raise exception 'enter the address' using errcode = '22023'; end if;
  if p_lat is not null and (p_lat not between 6.60 and 6.65 or p_lng not between 73.05 and 73.09) then
    raise exception 'that location is not on Kulhudhuffushi' using errcode = '22023';
  end if;
  if p_open !~ '^([01]\d|2[0-3]):[0-5]\d$' or p_close !~ '^([01]\d|2[0-4]):[0-5]\d$' or p_close <= p_open then
    raise exception 'opening hours must be HH:MM, closing after opening' using errcode = '22023';
  end if;
  update public.branches set address = trim(p_address), lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
    opening_hours = jsonb_build_object('open', p_open, 'close', p_close) where id = p_id;
  if not found then raise exception 'branch not found' using errcode = 'P0002'; end if;
end $$;

-- ── Riders can view the handover photos of their own rentals (and the evidence for any claim). ──
create policy "inspections: rider reads own" on storage.objects for select to authenticated using (
  bucket_id = 'inspections' and exists (
    select 1 from public.bookings b where b.id::text = (storage.foldername(name))[1] and b.rider_id = auth.uid()));

do $$ declare f text; begin
  foreach f in array array[
    'open_damage_claim(uuid, jsonb, integer)', 'resolve_damage_claim(uuid, text, integer)', 'dispute_damage_claim(uuid, text)',
    'request_extension(uuid, timestamptz)', 'withdraw_extension(uuid)', 'decide_extension(uuid, boolean, integer, text)',
    'record_deposit(uuid, text)', 'return_deposit(uuid, integer)',
    'update_branch(uuid, text, double precision, double precision, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
