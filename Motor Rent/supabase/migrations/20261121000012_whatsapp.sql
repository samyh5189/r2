-- WhatsApp as the communication channel for our own notification + login-code system.
-- Messages are built here and queued in whatsapp_outbox. The whatsapp-send function delivers them through
-- WhatsApp's official Cloud API once the owner saves credentials; until then staff can send each one by hand
-- from the admin outbox (opens WhatsApp with the text ready).

create extension if not exists pg_net with schema extensions;

-- ───────────────────────────── numbers ─────────────────────────────
alter table public.profiles
  add column whatsapp text check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{6,14}$'),
  add column whatsapp_verified boolean not null default false,
  add column whatsapp_alerts boolean not null default true;   -- staff: receive office alerts

-- Changing the number drops verification; only the server (OTP function) can mark a number verified.
create or replace function public.guard_whatsapp() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    if new.whatsapp is distinct from old.whatsapp then new.whatsapp_verified := false;
    elsif new.whatsapp_verified and not old.whatsapp_verified then
      raise exception 'numbers are verified with a WhatsApp code' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_whatsapp_guard before update on public.profiles
  for each row execute function public.guard_whatsapp();
revoke execute on function public.guard_whatsapp() from public, anon, authenticated;

-- ───────────────────────────── config (owner) ─────────────────────────────
alter table public.site_settings add column whatsapp_ready boolean not null default false;

create or replace function public.set_whatsapp_config(p_phone_number_id text, p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare v jsonb := jsonb_build_object('phone_number_id', btrim(p_phone_number_id), 'token', btrim(p_token));
begin
  if public.my_role() is distinct from 'owner' then raise exception 'owner only' using errcode = '42501'; end if;
  if coalesce(btrim(p_phone_number_id), '') !~ '^[0-9]{6,30}$' or length(coalesce(btrim(p_token), '')) < 20 then
    raise exception 'enter the phone number ID (digits) and the access token' using errcode = '22023';
  end if;
  if exists (select 1 from vault.secrets where name = 'whatsapp_config') then
    perform vault.update_secret((select id from vault.secrets where name = 'whatsapp_config'), v::text);
  else
    perform vault.create_secret(v::text, 'whatsapp_config');
  end if;
  update public.site_settings set whatsapp_ready = true;
end $$;

create or replace function public.clear_whatsapp_config() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'owner' then raise exception 'owner only' using errcode = '42501'; end if;
  delete from vault.secrets where name = 'whatsapp_config';
  update public.site_settings set whatsapp_ready = false;
end $$;

-- Service role only (edge functions).
create or replace function public.whatsapp_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'whatsapp_config'
$$;
revoke execute on function public.whatsapp_config() from public, anon, authenticated;
revoke execute on function public.set_whatsapp_config(text, text), public.clear_whatsapp_config() from public, anon;
grant execute on function public.set_whatsapp_config(text, text), public.clear_whatsapp_config() to authenticated;

-- ───────────────────────────── outbox ─────────────────────────────
create type public.wa_status as enum ('queued', 'sent', 'failed', 'manual', 'expired');

create table public.whatsapp_outbox (
  id bigint generated always as identity primary key,
  to_phone text not null,
  to_profile uuid references public.profiles (id) on delete set null,
  to_name text,
  audience text not null check (audience in ('rider', 'staff')),
  to_verified boolean not null default false,   -- only verified numbers get automatic messages
  body text not null,
  booking_id uuid references public.bookings (id) on delete set null,
  dedupe text unique,
  status public.wa_status not null default 'queued',
  attempts smallint not null default 0,
  error text,
  provider_id text,
  sent_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index whatsapp_outbox_queued_idx on public.whatsapp_outbox (created_at) where status = 'queued';
alter table public.whatsapp_outbox enable row level security;
create policy "outbox: staff read" on public.whatsapp_outbox for select to authenticated using (public.is_staff());
grant select on public.whatsapp_outbox to authenticated;

-- Staff mark a message they sent from their own WhatsApp.
create or replace function public.mark_whatsapp_sent(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  update public.whatsapp_outbox set status = 'manual', sent_at = now(), sent_by = auth.uid()
   where id = p_id and status in ('queued', 'failed', 'expired');
end $$;

create or replace function public.wa_when(t timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(t at time zone 'Indian/Maldives', 'Dy DD Mon, HH24:MI')
$$;

create or replace function public.wa_enqueue(p_profile uuid, p_audience text, p_body text, p_dedupe text, p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = p_profile;
  if p.id is null or p.whatsapp is null then return; end if;
  if p_audience = 'staff' and not p.whatsapp_alerts then return; end if;
  insert into public.whatsapp_outbox (to_phone, to_profile, to_name, audience, to_verified, body, booking_id, dedupe)
  values (p.whatsapp, p.id, p.full_name, p_audience, p.whatsapp_verified, left(p_body, 900), p_booking,
          case when p_dedupe is null then null else p_dedupe || ':' || p.id end)
  on conflict (dedupe) do nothing;
end $$;

-- Everyone at the office who should hear about a branch: its staff, plus managers and owners.
create or replace function public.wa_notify_staff(p_branch uuid, p_body text, p_dedupe text, p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  for s in select id from public.profiles
            where whatsapp is not null and whatsapp_alerts
              and (role in ('manager', 'owner') or (role = 'staff' and branch_id = p_branch))
  loop
    perform public.wa_enqueue(s.id, 'staff', p_body, p_dedupe, p_booking);
  end loop;
end $$;

-- Booking facts for message text.
create or replace function public.wa_booking(b uuid) returns table (rider uuid, branch uuid, ref text, vehicle text, pickup text, ret text, branch_name text, rider_name text)
language sql stable security definer set search_path = '' as $$
  select bk.rider_id, bk.branch_id, bk.reference, v.make || ' ' || v.model || ' (' || v.plate || ')',
         public.wa_when(lower(bk.period)), public.wa_when(upper(bk.period)), br.name, coalesce(p.full_name, 'A rider')
    from public.bookings bk join public.vehicles v on v.id = bk.vehicle_id
    join public.branches br on br.id = bk.branch_id join public.profiles p on p.id = bk.rider_id
   where bk.id = b
$$;

-- ───────────────────────────── triggers ─────────────────────────────
create or replace function public.wa_on_booking_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b record; k text := 'ev' || new.id;
begin
  select * into b from public.wa_booking(new.booking_id);
  if b.ref is null then return new; end if;
  case new.to_status
    when 'held' then
      perform public.wa_enqueue(b.rider, 'rider', format('Booking %s reserved: %s, pickup %s at %s. Pay by bank transfer and upload the slip in the app to confirm it.', b.ref, b.vehicle, b.pickup, b.branch_name), k, new.booking_id);
      perform public.wa_notify_staff(b.branch, format('New reservation %s by %s: %s, %s to %s. Waiting for payment.', b.ref, b.rider_name, b.vehicle, b.pickup, b.ret), k, new.booking_id);
    when 'confirmed' then
      perform public.wa_enqueue(b.rider, 'rider', format('Payment received. Booking %s is confirmed: %s, pickup %s at %s. Bring your driving licence.', b.ref, b.vehicle, b.pickup, b.branch_name), k, new.booking_id);
    when 'active' then
      perform public.wa_enqueue(b.rider, 'rider', format('Enjoy the ride! %s is yours until %s (booking %s). Ride safe and wear your helmet.', b.vehicle, b.ret, b.ref), k, new.booking_id);
    when 'overdue' then
      perform public.wa_enqueue(b.rider, 'rider', format('Booking %s was due back at %s. Please return %s now or call us. Late fees apply per started hour.', b.ref, b.ret, b.vehicle), k, new.booking_id);
      perform public.wa_notify_staff(b.branch, format('OVERDUE: %s (%s) was due back at %s. Rider: %s.', b.ref, b.vehicle, b.ret, b.rider_name), k, new.booking_id);
    when 'returned' then
      perform public.wa_enqueue(b.rider, 'rider', format('Thanks for riding with Rent a Motor. %s is returned (booking %s).', b.vehicle, b.ref), k, new.booking_id);
    when 'cancelled' then
      perform public.wa_enqueue(b.rider, 'rider', format('Booking %s (%s, %s) is cancelled.%s', b.ref, b.vehicle, b.pickup, coalesce(' Reason: ' || nullif(new.note, 'cancelled by rider'), '')), k, new.booking_id);
      if new.actor = b.rider then
        perform public.wa_notify_staff(b.branch, format('%s cancelled booking %s (%s, %s).', b.rider_name, b.ref, b.vehicle, b.pickup), k, new.booking_id);
      end if;
    when 'expired' then
      perform public.wa_enqueue(b.rider, 'rider', format('Booking %s expired because it wasn''t paid in time. The bike is free again; book once more in the app if you still need it.', b.ref), k, new.booking_id);
    else null;
  end case;
  return new;
end $$;
create trigger wa_booking_events after insert on public.booking_events
  for each row execute function public.wa_on_booking_event();

create or replace function public.wa_on_slip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b record;
begin
  select * into b from public.wa_booking(new.booking_id);
  if tg_op = 'INSERT' then
    perform public.wa_notify_staff(b.branch, format('Transfer slip uploaded for %s by %s. Check it under Transfers.', b.ref, b.rider_name), 'slip' || new.id, new.booking_id);
  elsif new.status = 'rejected' and old.status = 'pending' then
    perform public.wa_enqueue(new.rider_id, 'rider', format('Your transfer slip for %s wasn''t accepted: %s. Please upload a clear slip in the app.', b.ref, coalesce(new.reject_reason, 'please check the amount and reference')), 'slipr' || new.id, new.booking_id);
  end if;
  return new;
end $$;
create trigger wa_transfer_slips after insert or update of status on public.transfer_slips
  for each row execute function public.wa_on_slip();

create or replace function public.wa_on_kyc() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.wa_notify_staff(null, format('%s sent identity documents to check (Verifications).', new.full_name), 'kyc' || new.id, null);
  elsif new.status = 'approved' and old.status = 'pending' then
    perform public.wa_enqueue(new.profile_id, 'rider', 'You''re verified. You can now book any bike in the Rent a Motor app.', 'kyca' || new.id, null);
  elsif new.status = 'rejected' and old.status = 'pending' then
    perform public.wa_enqueue(new.profile_id, 'rider', format('We couldn''t verify your documents: %s. Please upload them again in the app.', coalesce(new.note, 'photos unclear')), 'kycr' || new.id, null);
  end if;
  return new;
end $$;
create trigger wa_kyc_submissions after insert or update of status on public.kyc_submissions
  for each row execute function public.wa_on_kyc();

create or replace function public.wa_on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b record; excerpt text := left(regexp_replace(new.body, '\s+', ' ', 'g'), 300);
begin
  select * into b from public.wa_booking(new.booking_id);
  if new.from_staff then
    perform public.wa_enqueue(b.rider, 'rider', format('Rent a Motor about booking %s: "%s" Reply in the app (My rentals).', b.ref, excerpt), 'msg' || new.id, new.booking_id);
  else
    perform public.wa_notify_staff(b.branch, format('Message from %s about %s: "%s"', b.rider_name, b.ref, excerpt), 'msg' || new.id, new.booking_id);
  end if;
  return new;
end $$;
create trigger wa_booking_messages after insert on public.booking_messages
  for each row execute function public.wa_on_message();

-- ───────────────────────────── reminders + delivery kick ─────────────────────────────
create or replace function public.wa_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.bookings where status = 'confirmed'
            and lower(period) between now() + interval '50 minutes' and now() + interval '65 minutes' loop
    perform public.wa_enqueue(x.rider, 'rider', format('Reminder: pickup of %s at %s, %s (booking %s). Bring your driving licence.', x.vehicle, x.branch_name, x.pickup, x.ref), 'pick1h' || r.id, r.id)
      from public.wa_booking(r.id) x;
  end loop;
  for r in select id from public.bookings where status = 'active'
            and upper(period) between now() + interval '50 minutes' and now() + interval '65 minutes' loop
    perform public.wa_enqueue(x.rider, 'rider', format('Reminder: please return %s by %s (booking %s). Need longer? Message us in the app.', x.vehicle, x.ret, x.ref), 'ret1h' || r.id, r.id)
      from public.wa_booking(r.id) x;
  end loop;
end $$;

-- Wake the sender when there is something to send and WhatsApp is connected.
create or replace function public.wa_kick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.site_settings where whatsapp_ready) then return; end if;
  if not exists (select 1 from public.whatsapp_outbox where status = 'queued') then return; end if;
  perform net.http_post(
    url := 'https://xknvywpfnsnsvzuicuff.supabase.co/functions/v1/whatsapp-send',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_cron_secret')),
    body := '{}'::jsonb);
end $$;

-- Secret the sender checks so only our cron can trigger it.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'whatsapp_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'whatsapp_cron_secret');
  end if;
end $$;
create or replace function public.whatsapp_cron_secret_ok(s text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(s = (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_cron_secret'), false)
$$;

revoke execute on function public.wa_enqueue(uuid, text, text, text, uuid), public.wa_notify_staff(uuid, text, text, uuid),
  public.wa_booking(uuid), public.wa_reminders(), public.wa_kick(), public.whatsapp_cron_secret_ok(text),
  public.wa_on_booking_event(), public.wa_on_slip(), public.wa_on_kyc(), public.wa_on_message()
  from public, anon, authenticated;
revoke execute on function public.mark_whatsapp_sent(bigint) from public, anon;
grant execute on function public.mark_whatsapp_sent(bigint) to authenticated;

select cron.schedule('whatsapp-reminders', '*/5 * * * *', 'select public.wa_reminders()');
select cron.schedule('whatsapp-send', '* * * * *', 'select public.wa_kick()');

-- ───────────────────────────── login codes ─────────────────────────────
create table public.whatsapp_codes (
  id bigint generated always as identity primary key,
  phone text not null,
  purpose text not null check (purpose in ('login', 'link')),
  code_hash text not null,
  attempts smallint not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index whatsapp_codes_phone_idx on public.whatsapp_codes (phone, created_at desc);
alter table public.whatsapp_codes enable row level security;   -- no policies: service role only
