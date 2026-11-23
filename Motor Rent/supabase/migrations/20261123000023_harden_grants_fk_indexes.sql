-- Defence in depth: signed-out visitors only ever read the catalogue and call a few RPCs.
-- RLS already blocks their writes; this removes the unused table-level write grants too.
revoke insert, update, delete, truncate on all tables in schema public from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;

-- Index foreign keys that are filtered or joined on (rider lookups, booking threads, outbox, reviews).
create index if not exists profiles_branch_idx on public.profiles (branch_id);
create index if not exists kyc_documents_profile_idx on public.kyc_documents (profile_id);
create index if not exists kyc_documents_submission_idx on public.kyc_documents (submission_id);
create index if not exists kyc_documents_reviewed_by_idx on public.kyc_documents (reviewed_by);
create index if not exists vehicles_price_plan_idx on public.vehicles (price_plan_id);
create index if not exists quotes_vehicle_idx on public.quotes (vehicle_id);
create index if not exists quotes_rider_idx on public.quotes (rider_id);
create index if not exists maintenance_created_by_idx on public.maintenance (created_by);
create index if not exists inspections_staff_idx on public.inspections (staff_id);
create index if not exists payments_recorded_by_idx on public.payments (recorded_by);
create index if not exists damage_claims_created_by_idx on public.damage_claims (created_by);
create index if not exists transfer_slips_reviewed_by_idx on public.transfer_slips (reviewed_by);
create index if not exists transfer_slips_rider_idx on public.transfer_slips (rider_id);
create index if not exists rider_blocks_created_by_idx on public.rider_blocks (created_by);
create index if not exists kyc_submissions_reviewed_by_idx on public.kyc_submissions (reviewed_by);
create index if not exists booking_messages_author_idx on public.booking_messages (author);
create index if not exists whatsapp_outbox_profile_idx on public.whatsapp_outbox (to_profile);
create index if not exists whatsapp_outbox_booking_idx on public.whatsapp_outbox (booking_id);
create index if not exists whatsapp_outbox_sent_by_idx on public.whatsapp_outbox (sent_by);
create index if not exists whatsapp_outbox_template_idx on public.whatsapp_outbox (template);
