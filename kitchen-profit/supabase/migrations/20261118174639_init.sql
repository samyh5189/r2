-- Kitchen Profit — Supabase schema
-- Run this in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  entry_date  date        not null default current_date,
  item_name   text        not null,
  qty         numeric     not null default 0,   -- plates / portions sold
  total_cost  numeric     not null default 0,   -- all ingredients + gas etc. for this item that day
  unit_price  numeric     not null default 0,   -- selling price per plate / portion
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists entries_date_idx on public.entries (entry_date desc);

-- Row Level Security.
-- This app uses only the public "anon" key (no login), so anyone who has your
-- project URL + anon key can read/write. That is fine for a private personal
-- tool you don't share. The policy below allows the anon role full access.
-- For real protection, switch to Supabase Auth and scope rows to auth.uid().
alter table public.entries enable row level security;

drop policy if exists "anon full access" on public.entries;
create policy "anon full access"
  on public.entries
  for all
  to anon
  using (true)
  with check (true);
