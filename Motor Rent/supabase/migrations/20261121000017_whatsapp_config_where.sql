-- Supabase's safe-update guard rejects UPDATE without WHERE from API calls; site_settings is a single row.
create or replace function public.set_whatsapp_config(p_phone_number_id text, p_token text, p_waba_id text) returns void
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
  update public.site_settings set whatsapp_ready = true where true;
end $$;

create or replace function public.clear_whatsapp_config() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'owner' then raise exception 'owner only' using errcode = '42501'; end if;
  delete from vault.secrets where name = 'whatsapp_config';
  update public.site_settings set whatsapp_ready = false where true;
end $$;
