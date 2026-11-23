-- Viber messages can carry a file (the signed rental agreement PDF). The sender makes a short-lived link at send time.
alter table public.viber_outbox
  add column if not exists file_bucket text check (file_bucket is null or file_bucket = 'contracts'),
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_size integer check (file_size is null or file_size between 1 and 50000000);
alter table public.viber_outbox drop constraint if exists viber_outbox_file_complete;
alter table public.viber_outbox add constraint viber_outbox_file_complete
  check ((file_path is null) = (file_bucket is null) and (file_path is null) = (file_name is null) and (file_path is null) = (file_size is null));
