-- A person who is both rider and staff gets both the rider message and the office alert.
create or replace function public.wa_enqueue(p_profile uuid, p_audience text, p_body text, p_dedupe text, p_booking uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = p_profile;
  if p.id is null or p.whatsapp is null then return; end if;
  if p_audience = 'staff' and not p.whatsapp_alerts then return; end if;
  insert into public.whatsapp_outbox (to_phone, to_profile, to_name, audience, to_verified, body, booking_id, dedupe)
  values (p.whatsapp, p.id, p.full_name, p_audience, p.whatsapp_verified, left(p_body, 900), p_booking,
          case when p_dedupe is null then null else p_dedupe || ':' || p_audience || ':' || p.id end)
  on conflict (dedupe) do nothing;
end $$;
revoke execute on function public.wa_enqueue(uuid, text, text, text, uuid) from public, anon, authenticated;
