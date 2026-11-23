-- Booking details and updates on Viber through the EasyRide chatbot.
-- Viber only lets a bot message people who have opened a chat with it, so the rider opens the bot from a link
-- that carries the booking's private Viber code, taps "Send my booking details", and is then subscribed.

alter table public.bookings add column if not exists viber_token uuid not null default gen_random_uuid();
create unique index if not exists bookings_viber_token on public.bookings (viber_token);

alter table public.site_settings
  add column if not exists viber_uri text,          -- the bot's public URI, for viber://pa?chatURI=…
  add column if not exists viber_ready boolean not null default false;

create table if not exists public.viber_subscribers (
  viber_id text primary key,
  name text,
  subscribed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.viber_links (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  viber_id text not null references public.viber_subscribers (viber_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (booking_id, viber_id)
);
create table if not exists public.viber_outbox (
  id bigint generated always as identity primary key,
  viber_id text not null references public.viber_subscribers (viber_id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'expired')),
  attempts smallint not null default 0,
  error text,
  dedupe text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists viber_outbox_queued on public.viber_outbox (created_at) where status = 'queued';
-- Service role only.
alter table public.viber_subscribers enable row level security;
alter table public.viber_links enable row level security;
alter table public.viber_outbox enable row level security;

-- Everything about a booking, as one message.
create or replace function public.vb_booking_text(b uuid) returns text
language sql stable security definer set search_path = '' as $$
  select concat_ws(E'\n',
    'EasyRide booking ' || bk.reference,
    v.make || ' ' || v.model || ' (' || v.plate || ')',
    'Pickup: ' || public.wa_when(lower(bk.period)),
    'Return by: ' || public.wa_when(upper(bk.period)),
    case when bk.handover = 'delivery' then 'Delivery to: ' || bk.delivery_address else 'Collect at: ' || br.name || coalesce(', ' || br.address, '') end,
    'Total: ' || bk.currency || ' ' || to_char(bk.total / 100.0, 'FM999,999,990.00')
      || case when bk.deposit > 0 then ' (+ ' || to_char(bk.deposit / 100.0, 'FM999,999,990.00') || ' refundable deposit at pickup)' else '' end,
    'Status: ' || case bk.status
      when 'held' then 'awaiting payment, we''ll contact you to confirm'
      when 'confirmed' then 'confirmed and paid'
      when 'active' then 'on the road'
      when 'overdue' then 'overdue, please return it'
      when 'returned' then 'returned'
      when 'damage_claim' then 'damage review'
      when 'closed' then 'completed'
      when 'expired' then 'expired (not paid in time)'
      when 'cancelled' then 'cancelled'
      else bk.status::text end,
    'Bring your driving licence and ID card or passport.',
    (select 'Questions? Call ' || support_phone from public.site_settings where support_phone is not null limit 1))
  from public.bookings bk join public.vehicles v on v.id = bk.vehicle_id join public.branches br on br.id = bk.branch_id
  where bk.id = b
$$;

-- Queue a message for everyone following this booking on Viber.
create or replace function public.vb_enqueue(b uuid, p_body text, p_dedupe text) returns void
language sql security definer set search_path = '' as $$
  insert into public.viber_outbox (viber_id, booking_id, body, dedupe)
  select l.viber_id, b, p_body, p_dedupe || ':' || l.viber_id
    from public.viber_links l join public.viber_subscribers s on s.viber_id = l.viber_id and s.subscribed
   where l.booking_id = b
  on conflict (dedupe) do nothing
$$;

create or replace function public.vb_on_booking_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare x record; msg text;
begin
  select * into x from public.wa_booking(new.booking_id);
  if x.ref is null or not exists (select 1 from public.viber_links where booking_id = new.booking_id) then return new; end if;
  msg := case new.to_status
    when 'confirmed' then 'Booking ' || x.ref || ' is confirmed. ' || x.vehicle || ', pickup ' || x.pickup || '.'
    when 'active' then 'Enjoy the ride! Please return ' || x.vehicle || ' by ' || x.ret || ' (booking ' || x.ref || ').'
    when 'overdue' then 'Booking ' || x.ref || ': ' || x.vehicle || ' was due back at ' || x.ret || '. Please return it or call us; late fees apply.'
    when 'returned' then 'Thanks for riding with EasyRide! ' || x.vehicle || ' is returned (booking ' || x.ref || ').'
    when 'cancelled' then 'Booking ' || x.ref || ' was cancelled' || coalesce(': ' || nullif(new.note, ''), '.')
    when 'expired' then 'Booking ' || x.ref || ' expired because it wasn''t paid in time. Book again any time.'
  end;
  if msg is not null then perform public.vb_enqueue(new.booking_id, msg, 'ev' || new.id); end if;
  return new;
end $$;
drop trigger if exists vb_booking_events on public.booking_events;
create trigger vb_booking_events after insert on public.booking_events
  for each row execute function public.vb_on_booking_event();

-- Booking changes that aren't a status change (times moved by an extension) re-send the details.
create or replace function public.vb_on_booking_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.period is distinct from old.period and new.status = old.status then
    perform public.vb_enqueue(new.id, 'Your booking changed:' || E'\n' || public.vb_booking_text(new.id), 'chg' || new.id || ':' || md5(new.period::text));
  end if;
  return new;
end $$;
drop trigger if exists vb_booking_update on public.bookings;
create trigger vb_booking_update after update of period on public.bookings
  for each row execute function public.vb_on_booking_update();

create or replace function public.vb_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare r record; x record;
begin
  for r in select id from public.bookings where status = 'confirmed'
            and lower(period) between now() + interval '50 minutes' and now() + interval '65 minutes'
            and exists (select 1 from public.viber_links l where l.booking_id = bookings.id) loop
    select * into x from public.wa_booking(r.id);
    perform public.vb_enqueue(r.id, 'Reminder: pickup of ' || x.vehicle || ' at ' || x.pickup || ' (booking ' || x.ref || '). Bring your driving licence and ID.', 'pick1h' || r.id);
  end loop;
  for r in select id from public.bookings where status = 'active'
            and upper(period) between now() + interval '50 minutes' and now() + interval '65 minutes'
            and exists (select 1 from public.viber_links l where l.booking_id = bookings.id) loop
    select * into x from public.wa_booking(r.id);
    perform public.vb_enqueue(r.id, 'Reminder: please return ' || x.vehicle || ' by ' || x.ret || ' (booking ' || x.ref || ').', 'ret1h' || r.id);
  end loop;
end $$;

-- Wake the sender when there is something to send and the bot is connected (same cron secret as WhatsApp).
create or replace function public.vb_kick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.site_settings where viber_ready) then return; end if;
  if not exists (select 1 from public.viber_outbox where status = 'queued') then return; end if;
  perform net.http_post(
    url := 'https://xknvywpfnsnsvzuicuff.supabase.co/functions/v1/viber-bot',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_cron_secret')),
    body := '{"action":"send"}'::jsonb);
end $$;

revoke execute on function public.vb_booking_text(uuid), public.vb_enqueue(uuid, text, text), public.vb_on_booking_event(),
  public.vb_on_booking_update(), public.vb_reminders(), public.vb_kick() from public, anon, authenticated;

select cron.schedule('viber-reminders', '*/5 * * * *', 'select public.vb_reminders()');
select cron.schedule('viber-send', '* * * * *', 'select public.vb_kick()');
