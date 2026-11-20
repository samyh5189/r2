-- Profile photos + per-booking conversation (Odoo-style chatter).

-- ───────────────────────────── avatars ─────────────────────────────
alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint profiles_avatar_path_own_folder
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: owner lists" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────────────── messages ─────────────────────────────
create table public.booking_messages (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  author uuid not null default auth.uid() references public.profiles (id),
  from_staff boolean not null default false,       -- set by trigger
  author_name text,                                -- snapshot (riders can't read staff profiles)
  author_avatar text,                              -- snapshot of avatars/<path>
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index booking_messages_booking_idx on public.booking_messages (booking_id, created_at);

create or replace function public.booking_message_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; me public.profiles;
begin
  select * into bk from public.bookings where id = new.booking_id;
  select * into me from public.profiles where id = auth.uid();
  if bk.id is null or me.id is null then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.rider_id <> me.id and not public.can_see_branch(bk.branch_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select count(*) from public.booking_messages where author = me.id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'too many messages, please wait a minute' using errcode = '54000';
  end if;
  new.author := me.id;
  new.from_staff := bk.rider_id <> me.id;
  new.author_name := case when new.from_staff then coalesce(nullif(split_part(me.full_name, ' ', 1), ''), 'Rent a Motor team')
                          else coalesce(me.full_name, 'Rider') end;
  new.author_avatar := me.avatar_path;
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end $$;
create trigger booking_messages_stamp before insert on public.booking_messages
  for each row execute function public.booking_message_stamp();
revoke execute on function public.booking_message_stamp() from public, anon, authenticated;

alter table public.booking_messages enable row level security;
create policy "messages: rider or branch staff read" on public.booking_messages for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id
                 and (b.rider_id = auth.uid() or public.can_see_branch(b.branch_id))));
create policy "messages: rider or branch staff write" on public.booking_messages for insert to authenticated
  with check (exists (select 1 from public.bookings b where b.id = booking_id
                      and (b.rider_id = auth.uid() or public.can_see_branch(b.branch_id))));
grant select, insert on public.booking_messages to authenticated;
-- No update / delete policies: the conversation is a permanent record.

-- Live updates for the chatter.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.booking_messages;
  end if;
end $$;
