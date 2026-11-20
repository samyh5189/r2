-- Storage deletes (and upserts) first SELECT the object row, so managers need a select policy
-- on vehicle-photos; without it, remove() silently deletes nothing. Public reads of the images
-- themselves go through the public CDN URL and do not need this.
create policy "vehicle-photos: managers list" on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-photos' and public.my_role() in ('manager', 'owner'));
