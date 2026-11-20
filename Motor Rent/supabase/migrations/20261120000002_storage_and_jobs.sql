-- Storage buckets
--   vehicle-photos : public catalogue images
--   kyc            : private; rider uploads to kyc/<uid>/..., staff read; served via short signed URLs
--   inspections    : private; staff upload; rider + staff read through signed URLs from Edge Functions
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('vehicle-photos', 'vehicle-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('kyc', 'kyc', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'application/pdf']),
  ('inspections', 'inspections', false, 10485760, array['image/jpeg', 'image/png', 'image/heic'])
on conflict (id) do nothing;

create policy "kyc: rider uploads to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kyc: rider reads own, staff read all" on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

create policy "inspections: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'inspections' and public.is_staff());
create policy "inspections: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'inspections' and public.is_staff());

create policy "vehicle-photos: staff manage" on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-photos' and public.my_role() in ('manager', 'owner'));

-- Scheduled jobs
create extension if not exists pg_cron;

select cron.schedule('expire-held-bookings', '* * * * *', $$ select public.expire_held_bookings() $$);
select cron.schedule('mark-overdue-bookings', '*/5 * * * *', $$ select public.mark_overdue_bookings() $$);
