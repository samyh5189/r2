-- Staff see rider messages and their own alerts; managers and owners see everything.
drop policy "outbox: staff read" on public.whatsapp_outbox;
create policy "outbox: staff read" on public.whatsapp_outbox for select to authenticated
  using (public.is_staff() and (audience = 'rider' or to_profile = auth.uid() or public.my_role() in ('manager', 'owner')));

-- Nav badge: rider messages that still need someone to press "Send" (unconfirmed numbers, or WhatsApp not connected).
create or replace function public.staff_inbox_counts() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'slips', (select count(*) from public.transfer_slips where status = 'pending'),
    'kyc', (select count(*) from public.kyc_submissions where status = 'pending'),
    'messages', (select count(*) from (
        select distinct on (booking_id) from_staff from public.booking_messages order by booking_id, created_at desc
      ) last where not last.from_staff),
    'whatsapp', (select count(*) from public.whatsapp_outbox o
        where o.audience = 'rider' and o.status in ('queued', 'failed') and o.created_at > now() - interval '2 days'
          and (not o.to_verified or not exists (select 1 from public.site_settings where whatsapp_ready)))
  )
$$;
