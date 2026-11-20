-- WhatsApp only approves fixed-wording "utility" templates for booking updates, so each event gets its own template.
-- This table is the single source of wording: triggers fill it in for the outbox (and hand-sending), and the
-- whatsapp-templates function submits the same text to Meta for approval.

create table public.whatsapp_templates (
  name text primary key check (name ~ '^[a-z0-9_]{1,60}$'),
  audience text not null check (audience in ('rider', 'staff', 'code')),
  category text not null check (category in ('UTILITY', 'AUTHENTICATION')),
  body text not null,
  example text[] not null default '{}',
  status text,            -- from Meta: APPROVED, PENDING, REJECTED …
  rejected_reason text,
  synced_at timestamptz
);
alter table public.whatsapp_templates enable row level security;
create policy "templates: staff read" on public.whatsapp_templates for select to authenticated using (public.is_staff());
grant select on public.whatsapp_templates to authenticated;

insert into public.whatsapp_templates (name, audience, category, body, example) values
 ('rm_booking_reserved', 'rider', 'UTILITY',
  'Your Rent a Motor booking {{1}} is reserved: {{2}}, pickup {{3}} at {{4}}. Pay by bank transfer and upload the slip in the app to confirm it.',
  array['AB12CD34', 'Honda Dio (P-1234)', 'Sun 22 Nov, 09:00', 'Kulhudhuffushi']),
 ('rm_booking_confirmed', 'rider', 'UTILITY',
  'Payment received. Your Rent a Motor booking {{1}} is confirmed: {{2}}, pickup {{3}} at {{4}}. Please bring your driving licence.',
  array['AB12CD34', 'Honda Dio (P-1234)', 'Sun 22 Nov, 09:00', 'Kulhudhuffushi']),
 ('rm_rental_started', 'rider', 'UTILITY',
  'Your rental {{1}} has started. {{2}} is yours until {{3}}. Ride safe and wear your helmet.',
  array['AB12CD34', 'Honda Dio (P-1234)', 'Mon 23 Nov, 18:00']),
 ('rm_rental_overdue', 'rider', 'UTILITY',
  'Your rental {{1}} was due back at {{2}}. Please return {{3}} now or call us. Late fees apply for each started hour.',
  array['AB12CD34', 'Mon 23 Nov, 18:00', 'Honda Dio (P-1234)']),
 ('rm_rental_returned', 'rider', 'UTILITY',
  'Thank you for riding with Rent a Motor. {{1}} has been returned and rental {{2}} is now closed.',
  array['Honda Dio (P-1234)', 'AB12CD34']),
 ('rm_booking_cancelled', 'rider', 'UTILITY',
  'Your Rent a Motor booking {{1}} for {{2}} with pickup {{3}} has been cancelled. Reason: {{4}}. You can book again in the app.',
  array['AB12CD34', 'Honda Dio (P-1234)', 'Sun 22 Nov, 09:00', 'vehicle under repair']),
 ('rm_booking_expired', 'rider', 'UTILITY',
  'Your Rent a Motor booking {{1}} has expired because payment was not received in time. You can book again in the app.',
  array['AB12CD34']),
 ('rm_slip_rejected', 'rider', 'UTILITY',
  'Your transfer slip for Rent a Motor booking {{1}} was not accepted: {{2}}. Please upload a clear slip in the app.',
  array['AB12CD34', 'the amount does not match']),
 ('rm_id_approved', 'rider', 'UTILITY',
  'Your identity check with Rent a Motor is approved. You can now book any vehicle in the app.',
  '{}'),
 ('rm_id_rejected', 'rider', 'UTILITY',
  'Your identity check with Rent a Motor was not approved: {{1}}. Please upload your documents again in the app.',
  array['the licence photo is blurry']),
 ('rm_office_reply', 'rider', 'UTILITY',
  'Rent a Motor replied about your booking {{1}}: "{{2}}" Open My rentals in the app to reply.',
  array['AB12CD34', 'Yes, you can pick up at 9.']),
 ('rm_pickup_reminder', 'rider', 'UTILITY',
  'Reminder: your pickup of {{1}} for booking {{2}} is at {{3}} at our {{4}} counter. Please bring your driving licence.',
  array['Honda Dio (P-1234)', 'AB12CD34', 'Sun 22 Nov, 09:00', 'Kulhudhuffushi']),
 ('rm_return_reminder', 'rider', 'UTILITY',
  'Reminder: please return {{1}} for booking {{2}} by {{3}}. Need more time? Message us in the app.',
  array['Honda Dio (P-1234)', 'AB12CD34', 'Mon 23 Nov, 18:00']),
 ('rm_staff_new_booking', 'staff', 'UTILITY',
  'New reservation {{1}} from {{2}} for {{3}}, from {{4}} until {{5}}. It is waiting for payment.',
  array['AB12CD34', 'Aisha Ali', 'Honda Dio (P-1234)', 'Sun 22 Nov, 09:00', 'Mon 23 Nov, 18:00']),
 ('rm_staff_slip', 'staff', 'UTILITY',
  'A transfer slip was uploaded for booking {{1}} by {{2}}. Please check it under Transfers in the admin console.',
  array['AB12CD34', 'Aisha Ali']),
 ('rm_staff_documents', 'staff', 'UTILITY',
  'New identity documents from {{1}} are waiting. Please check them under Verifications in the admin console.',
  array['Aisha Ali']),
 ('rm_staff_message', 'staff', 'UTILITY',
  'New message from {{1}} about booking {{2}}: "{{3}}" Please reply in the admin console.',
  array['Aisha Ali', 'AB12CD34', 'Can I pick up at 9?']),
 ('rm_staff_overdue', 'staff', 'UTILITY',
  'Booking {{1}} is overdue: {{2}} was due back at {{3}}. The rider is {{4}}. Please contact them.',
  array['AB12CD34', 'Honda Dio (P-1234)', 'Mon 23 Nov, 18:00', 'Aisha Ali']),
 ('rm_staff_cancelled', 'staff', 'UTILITY',
  'Booking {{1}} for {{2}} with pickup {{3}} was cancelled by the rider, {{4}}. The vehicle is free again.',
  array['AB12CD34', 'Honda Dio (P-1234)', 'Sun 22 Nov, 09:00', 'Aisha Ali']),
 ('rm_login_code', 'code', 'AUTHENTICATION',
  '{{1}} is your verification code.',
  array['123456']);

-- ───────────── outbox carries the template + its values ─────────────
alter table public.whatsapp_outbox add column template text references public.whatsapp_templates (name), add column params text[];
update public.whatsapp_outbox set status = 'expired', error = 'replaced by templates' where status in ('queued', 'failed');

-- Owner adds the WhatsApp Business account ID (needed to submit templates).
drop function public.set_whatsapp_config(text, text);
create function public.set_whatsapp_config(p_phone_number_id text, p_token text, p_waba_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare v jsonb := jsonb_build_object('phone_number_id', btrim(p_phone_number_id), 'token', btrim(p_token), 'waba_id', btrim(p_waba_id));
begin
  if public.my_role() is distinct from 'owner' then raise exception 'owner only' using errcode = '42501'; end if;
  if coalesce(btrim(p_phone_number_id), '') !~ '^[0-9]{6,30}$' or coalesce(btrim(p_waba_id), '') !~ '^[0-9]{6,30}$'
     or length(coalesce(btrim(p_token), '')) < 20 then
    raise exception 'enter the phone number ID, the WhatsApp account ID (digits) and the access token' using errcode = '22023';
  end if;
  if exists (select 1 from vault.secrets where name = 'whatsapp_config') then
    perform vault.update_secret((select id from vault.secrets where name = 'whatsapp_config'), v::text);
  else
    perform vault.create_secret(v::text, 'whatsapp_config');
  end if;
  update public.site_settings set whatsapp_ready = true;
end $$;
revoke execute on function public.set_whatsapp_config(text, text, text) from public, anon;
grant execute on function public.set_whatsapp_config(text, text, text) to authenticated;

-- ───────────── enqueue by template ─────────────
drop function public.wa_enqueue(uuid, text, text, text, uuid);
drop function public.wa_notify_staff(uuid, text, text, uuid);

create function public.wa_enqueue(p_profile uuid, p_template text, p_params text[], p_dedupe text, p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles; t public.whatsapp_templates; vals text[] := '{}'; txt text; i int;
begin
  select * into t from public.whatsapp_templates where name = p_template;
  select * into p from public.profiles where id = p_profile;
  if t.name is null or p.id is null or p.whatsapp is null then return; end if;
  if t.audience = 'staff' and not p.whatsapp_alerts then return; end if;
  txt := t.body;
  for i in 1 .. coalesce(array_length(p_params, 1), 0) loop
    -- WhatsApp values may not hold new lines, tabs or long runs of spaces.
    vals := vals || coalesce(nullif(left(btrim(regexp_replace(p_params[i], '\s+', ' ', 'g')), 300), ''), '-');
    txt := replace(txt, '{{' || i || '}}', vals[i]);
  end loop;
  insert into public.whatsapp_outbox (to_phone, to_profile, to_name, audience, to_verified, body, template, params, booking_id, dedupe)
  values (p.whatsapp, p.id, p.full_name, t.audience, p.whatsapp_verified, txt, t.name, vals, p_booking,
          case when p_dedupe is null then null else p_dedupe || ':' || t.audience || ':' || p.id end)
  on conflict (dedupe) do nothing;
end $$;

create function public.wa_notify_staff(p_branch uuid, p_template text, p_params text[], p_dedupe text, p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  for s in select id from public.profiles
            where whatsapp is not null and whatsapp_alerts
              and (role in ('manager', 'owner') or (role = 'staff' and (p_branch is null or branch_id = p_branch)))
  loop
    perform public.wa_enqueue(s.id, p_template, p_params, p_dedupe, p_booking);
  end loop;
end $$;

create or replace function public.wa_on_booking_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b record; k text := 'ev' || new.id;
begin
  select * into b from public.wa_booking(new.booking_id);
  if b.ref is null then return new; end if;
  case new.to_status
    when 'held' then
      perform public.wa_enqueue(b.rider, 'rm_booking_reserved', array[b.ref, b.vehicle, b.pickup, b.branch_name], k, new.booking_id);
      perform public.wa_notify_staff(b.branch, 'rm_staff_new_booking', array[b.ref, b.rider_name, b.vehicle, b.pickup, b.ret], k, new.booking_id);
    when 'confirmed' then
      perform public.wa_enqueue(b.rider, 'rm_booking_confirmed', array[b.ref, b.vehicle, b.pickup, b.branch_name], k, new.booking_id);
    when 'active' then
      perform public.wa_enqueue(b.rider, 'rm_rental_started', array[b.ref, b.vehicle, b.ret], k, new.booking_id);
    when 'overdue' then
      perform public.wa_enqueue(b.rider, 'rm_rental_overdue', array[b.ref, b.ret, b.vehicle], k, new.booking_id);
      perform public.wa_notify_staff(b.branch, 'rm_staff_overdue', array[b.ref, b.vehicle, b.ret, b.rider_name], k, new.booking_id);
    when 'returned' then
      perform public.wa_enqueue(b.rider, 'rm_rental_returned', array[b.vehicle, b.ref], k, new.booking_id);
    when 'cancelled' then
      perform public.wa_enqueue(b.rider, 'rm_booking_cancelled',
        array[b.ref, b.vehicle, b.pickup, coalesce(nullif(nullif(new.note, ''), 'cancelled by rider'), case when new.actor = b.rider then 'cancelled by you' else 'cancelled by the office' end)],
        k, new.booking_id);
      if new.actor = b.rider then
        perform public.wa_notify_staff(b.branch, 'rm_staff_cancelled', array[b.ref, b.vehicle, b.pickup, b.rider_name], k, new.booking_id);
      end if;
    when 'expired' then
      perform public.wa_enqueue(b.rider, 'rm_booking_expired', array[b.ref], k, new.booking_id);
    else null;
  end case;
  return new;
end $$;

create or replace function public.wa_on_slip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b record;
begin
  select * into b from public.wa_booking(new.booking_id);
  if tg_op = 'INSERT' then
    perform public.wa_notify_staff(b.branch, 'rm_staff_slip', array[b.ref, b.rider_name], 'slip' || new.id, new.booking_id);
  elsif new.status = 'rejected' and old.status = 'pending' then
    perform public.wa_enqueue(new.rider_id, 'rm_slip_rejected', array[b.ref, coalesce(new.reject_reason, 'please check the amount and reference')], 'slipr' || new.id, new.booking_id);
  end if;
  return new;
end $$;

create or replace function public.wa_on_kyc() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.wa_notify_staff(null, 'rm_staff_documents', array[new.full_name], 'kyc' || new.id, null);
  elsif new.status = 'approved' and old.status = 'pending' then
    perform public.wa_enqueue(new.profile_id, 'rm_id_approved', '{}', 'kyca' || new.id, null);
  elsif new.status = 'rejected' and old.status = 'pending' then
    perform public.wa_enqueue(new.profile_id, 'rm_id_rejected', array[coalesce(new.note, 'the photos were unclear')], 'kycr' || new.id, null);
  end if;
  return new;
end $$;

create or replace function public.wa_on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b record; excerpt text := left(regexp_replace(new.body, '\s+', ' ', 'g'), 300);
begin
  select * into b from public.wa_booking(new.booking_id);
  if new.from_staff then
    perform public.wa_enqueue(b.rider, 'rm_office_reply', array[b.ref, excerpt], 'msg' || new.id, new.booking_id);
  else
    perform public.wa_notify_staff(b.branch, 'rm_staff_message', array[b.rider_name, b.ref, excerpt], 'msg' || new.id, new.booking_id);
  end if;
  return new;
end $$;

create or replace function public.wa_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare r record; x record;
begin
  for r in select id from public.bookings where status = 'confirmed'
            and lower(period) between now() + interval '50 minutes' and now() + interval '65 minutes' loop
    select * into x from public.wa_booking(r.id);
    perform public.wa_enqueue(x.rider, 'rm_pickup_reminder', array[x.vehicle, x.ref, x.pickup, x.branch_name], 'pick1h' || r.id, r.id);
  end loop;
  for r in select id from public.bookings where status = 'active'
            and upper(period) between now() + interval '50 minutes' and now() + interval '65 minutes' loop
    select * into x from public.wa_booking(r.id);
    perform public.wa_enqueue(x.rider, 'rm_return_reminder', array[x.vehicle, x.ref, x.ret], 'ret1h' || r.id, r.id);
  end loop;
end $$;

revoke execute on function public.wa_enqueue(uuid, text, text[], text, uuid), public.wa_notify_staff(uuid, text, text[], text, uuid)
  from public, anon, authenticated;
