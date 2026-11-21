-- Accounting report, collecting unpaid charges, rider admin edits, and riders seeing their own blocklist entry.

-- ───────────── finance report (managers + owners) ─────────────
-- Amounts are in minor units (laari / cents). "Collected" = money actually received in the period.
create or replace function public.finance_report(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if public.my_role() not in ('manager', 'owner') then raise exception 'managers and owners only' using errcode = '42501'; end if;
  with pay as (
    select p.*, b.reference, b.vehicle_id, b.rider_id,
           case when p.kind = 'refund' then -p.amount else p.amount end as signed
      from public.payments p join public.bookings b on b.id = p.booking_id
     where p.status = 'succeeded' and p.kind in ('charge', 'cash', 'bank_transfer', 'deposit_capture', 'refund')
       and p.updated_at >= p_from and p.updated_at < p_to
  ), bk as (
    select * from public.bookings where created_at >= p_from and created_at < p_to
  ), days as (
    select d::date as day from generate_series((p_from at time zone 'Indian/Maldives')::date,
                                               ((p_to - interval '1 second') at time zone 'Indian/Maldives')::date, interval '1 day') d
  )
  select jsonb_build_object(
    'collected', (select coalesce(jsonb_object_agg(currency, s), '{}') from (select currency, sum(signed) s from pay group by currency) x),
    'refunds', (select coalesce(sum(amount), 0) from pay where kind = 'refund'),
    'booked', (select coalesce(jsonb_object_agg(currency, s), '{}') from (
        select currency, sum(total) s from bk where status not in ('cancelled', 'expired') group by currency) x),
    'bookings', (select count(*) from bk),
    'bookings_by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status::text, count(*) n from bk group by 1) x),
    'cancel_rate', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status in ('cancelled', 'expired')) / count(*)) end from bk),
    'avg_booking', (select coalesce(round(avg(total)), 0) from bk where status not in ('cancelled', 'expired')),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'amount', coalesce(x.s, 0)) order by d.day), '[]')
                from days d left join (select (updated_at at time zone 'Indian/Maldives')::date as day, sum(signed) as s from pay group by 1) x on x.day = d.day),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', m, 'amount', s) order by s desc), '[]') from (
        select case when kind = 'refund' then 'refund' when provider = 'stripe' then 'card'
                    when kind = 'bank_transfer' or provider = 'bank' then 'bank transfer' when kind = 'cash' or provider = 'cash' then 'cash'
                    else coalesce(provider, kind::text) end m, sum(signed) s from pay group by 1) x),
    'by_vehicle', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'plate', v.plate, 'model', v.make || ' ' || v.model,
                      'amount', coalesce(x.s, 0), 'hours', coalesce(h.hours, 0)) order by coalesce(x.s, 0) desc), '[]')
        from public.vehicles v
        left join (select vehicle_id, sum(signed) s from pay group by 1) x on x.vehicle_id = v.id
        left join (select vehicle_id, round(sum(extract(epoch from (least(upper(period), p_to) - greatest(lower(period), p_from))) / 3600)) hours
                     from public.bookings where status in ('confirmed', 'active', 'overdue', 'returned', 'closed', 'damage_claim')
                      and period && tstzrange(p_from, p_to) group by 1) h on h.vehicle_id = v.id
        where v.status <> 'retired' or x.s is not null),
    'period_hours', round(extract(epoch from (p_to - p_from)) / 3600),
    'top_riders', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'name', coalesce(pr.full_name, 'Rider'), 'amount', x.s, 'rentals', x.n) order by x.s desc), '[]')
        from (select rider_id, sum(signed) s, count(distinct booking_id) n from pay group by 1 order by 2 desc limit 5) x
        join public.profiles pr on pr.id = x.rider_id),
    -- Money owed right now (not limited to the period).
    'unpaid_charges', (select coalesce(sum(amount), 0) from public.payments where status = 'pending' and kind = 'charge' and provider <> 'stripe'),
    'awaiting_payment', (select coalesce(sum(total), 0) from public.bookings where status = 'held'),
    'blocklist_owed', (select coalesce(sum(amount_owed), 0) from public.rider_blocks where active),
    'deposits_held', (select coalesce(sum(case kind when 'deposit_hold' then amount else -amount end), 0) from public.payments
                       where status = 'succeeded' and kind in ('deposit_hold', 'deposit_capture', 'deposit_release'))
  ) into r;
  return r;
end $$;
revoke execute on function public.finance_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.finance_report(timestamptz, timestamptz) to authenticated;

-- Staff record that an unpaid charge (e.g. a late fee) was collected at the counter.
create or replace function public.mark_payment_collected(p_id uuid, p_method text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() not in ('manager', 'owner') then raise exception 'managers and owners only' using errcode = '42501'; end if;
  if p_method not in ('cash', 'bank', 'card') then raise exception 'method must be cash, bank or card' using errcode = '22023'; end if;
  update public.payments set status = 'succeeded', provider = p_method, recorded_by = auth.uid(), updated_at = now()
   where id = p_id and status = 'pending' and provider <> 'stripe';
  if not found then raise exception 'payment not found or already settled' using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.mark_payment_collected(uuid, text) from public, anon;
grant execute on function public.mark_payment_collected(uuid, text) to authenticated;

-- ───────────── rider admin edits (managers + owners; audited by audit_profiles) ─────────────
create or replace function public.admin_update_rider(p_id uuid, p_full_name text, p_phone text, p_whatsapp text,
  p_date_of_birth date, p_licence_expires_on date) returns void
language plpgsql security definer set search_path = '' as $$
declare cur public.profiles;
begin
  if public.my_role() not in ('manager', 'owner') then raise exception 'managers and owners only' using errcode = '42501'; end if;
  select * into cur from public.profiles where id = p_id;
  if cur.id is null or cur.role <> 'rider' then raise exception 'rider not found' using errcode = 'P0002'; end if;
  if nullif(btrim(p_whatsapp), '') is not null and btrim(p_whatsapp) !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'WhatsApp number must look like +9607771234' using errcode = '22023';
  end if;
  update public.profiles set
    full_name = nullif(btrim(p_full_name), ''),
    phone = nullif(btrim(p_phone), ''),
    whatsapp = nullif(btrim(p_whatsapp), ''),
    whatsapp_verified = case when nullif(btrim(p_whatsapp), '') is distinct from cur.whatsapp then false else cur.whatsapp_verified end,
    date_of_birth = p_date_of_birth,
    licence_expires_on = p_licence_expires_on
  where id = p_id;
end $$;
revoke execute on function public.admin_update_rider(uuid, text, text, text, date, date) from public, anon;
grant execute on function public.admin_update_rider(uuid, text, text, text, date, date) to authenticated;

-- ───────────── riders see their own blocklist entry (never anyone else's) ─────────────
create policy "blocks: rider reads own" on public.rider_blocks for select to authenticated
  using (profile_id = auth.uid() and active);
