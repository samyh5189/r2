-- Staff-only blocklist of people who broke the rental terms (damage, unpaid balance, abuse...).
-- It is NOT public: only staff can read it, and a blocked person only ever learns that their
-- account cannot book. create-booking refuses anyone matching an active entry.

create table public.rider_blocks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text not null check (length(full_name) between 1 and 100),
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{6,20}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  id_number text check (id_number is null or length(id_number) <= 40),
  reason text not null check (length(reason) between 3 and 1000),
  amount_owed integer not null default 0 check (amount_owed >= 0),
  currency text not null default 'MVR' check (currency in ('MVR', 'USD')),
  photo_path text,                -- private `blocklist` bucket
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rider_blocks_profile_idx on public.rider_blocks (profile_id) where active;
create index rider_blocks_phone_idx on public.rider_blocks (regexp_replace(phone, '\D', '', 'g')) where active;
create index rider_blocks_email_idx on public.rider_blocks (lower(email)) where active;
create trigger rider_blocks_touch before update on public.rider_blocks for each row execute function public.touch_updated_at();
create trigger audit_rider_blocks after insert or update or delete on public.rider_blocks for each row execute function public.audit_row();

alter table public.rider_blocks enable row level security;
create policy "blocks: staff read" on public.rider_blocks for select to authenticated using (public.is_staff());
create policy "blocks: managers insert" on public.rider_blocks for insert to authenticated
  with check (public.my_role() in ('manager', 'owner') and created_by = auth.uid());
create policy "blocks: managers update" on public.rider_blocks for update to authenticated
  using (public.my_role() in ('manager', 'owner')) with check (public.my_role() in ('manager', 'owner'));
create policy "blocks: managers delete" on public.rider_blocks for delete to authenticated
  using (public.my_role() in ('manager', 'owner'));
grant select, insert, update, delete on public.rider_blocks to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('blocklist', 'blocklist', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "blocklist: managers upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'blocklist' and public.my_role() in ('manager', 'owner'));
create policy "blocklist: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'blocklist' and public.is_staff());
create policy "blocklist: managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'blocklist' and public.my_role() in ('manager', 'owner'));

-- True when a user matches an active block (by account, phone or email). Used by create-booking.
create or replace function public.is_blocked(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from auth.users au
    join public.rider_blocks rb on rb.active and (
         rb.profile_id = au.id
      or (rb.email is not null and lower(rb.email) = lower(au.email))
      or (rb.phone is not null and au.phone is not null
          and right(regexp_replace(rb.phone, '\D', '', 'g'), 7) = right(regexp_replace(au.phone, '\D', '', 'g'), 7))
    )
    where au.id = u
  )
$$;
revoke execute on function public.is_blocked(uuid) from public, anon, authenticated;
grant execute on function public.is_blocked(uuid) to service_role;

-- A rider may ask "can I book?" for themselves only.
create or replace function public.am_i_blocked() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_blocked(auth.uid())
$$;
revoke execute on function public.am_i_blocked() from public, anon;
grant execute on function public.am_i_blocked() to authenticated;
