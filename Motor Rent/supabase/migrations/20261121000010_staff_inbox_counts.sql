-- Work waiting for the office, for the console nav. SECURITY INVOKER: RLS limits staff to their branch.
create or replace function public.staff_inbox_counts() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'slips', (select count(*) from public.transfer_slips where status = 'pending'),
    'kyc', (select count(*) from public.kyc_submissions where status = 'pending'),
    'messages', (select count(*) from (
        select distinct on (booking_id) from_staff from public.booking_messages order by booking_id, created_at desc
      ) last where not last.from_staff)
  )
$$;
revoke execute on function public.staff_inbox_counts() from public, anon;
grant execute on function public.staff_inbox_counts() to authenticated;
