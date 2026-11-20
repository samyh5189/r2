-- Only verified numbers are sent automatically; unverified ones stay queued for staff to send by hand.
create or replace function public.wa_kick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.site_settings where whatsapp_ready) then return; end if;
  if not exists (select 1 from public.whatsapp_outbox where status = 'queued' and to_verified) then return; end if;
  perform net.http_post(
    url := 'https://xknvywpfnsnsvzuicuff.supabase.co/functions/v1/whatsapp-send',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_cron_secret')),
    body := '{}'::jsonb);
end $$;
revoke execute on function public.wa_kick() from public, anon, authenticated;

-- One account per verified WhatsApp number (it is also a login).
create unique index profiles_whatsapp_verified_uniq on public.profiles (whatsapp) where whatsapp_verified;
