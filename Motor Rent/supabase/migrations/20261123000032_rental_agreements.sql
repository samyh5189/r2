-- Signed rental agreement (PDF) made at handover; company details for its letterhead; the counter licence
-- check also records the rider's identity, so riders without an account have full details on the agreement.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "contracts: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'contracts' and public.is_staff());
create policy "contracts: rider reads own" on storage.objects for select to authenticated
  using (bucket_id = 'contracts' and exists (
    select 1 from public.bookings b where b.id::text = (storage.foldername(name))[1] and b.rider_id = auth.uid()));

alter table public.bookings
  add column if not exists contract_path text,
  add column if not exists contract_sha256 text,
  add column if not exists contract_signed_at timestamptz,
  add column if not exists agreement_version text,
  add column if not exists counter_full_name text,
  add column if not exists counter_id_type text check (counter_id_type is null or counter_id_type in ('national_id', 'passport')),
  add column if not exists counter_id_number text,
  add column if not exists counter_licence_number text,
  add column if not exists counter_date_of_birth date;

alter table public.site_settings
  add column if not exists company_legal_name text,
  add column if not exists company_reg_no text,
  add column if not exists company_address text;

drop function if exists public.record_counter_check(uuid, text[], date);
create function public.record_counter_check(b uuid, p_categories text[], p_licence_expires_on date,
  p_full_name text, p_id_type text, p_id_number text, p_licence_number text, p_date_of_birth date)
returns void language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; cats text[];
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select * into bk from public.bookings where id = b for update;
  if bk.id is null or not public.can_see_branch(bk.branch_id) then raise exception 'booking not found' using errcode = 'P0002'; end if;
  if bk.status not in ('held', 'confirmed') then raise exception 'only before pickup' using errcode = '55000'; end if;
  select coalesce(array_agg(distinct c order by c), '{}') into cats from unnest(coalesce(p_categories, '{}')) c where c in ('A', 'B');
  if cardinality(cats) = 0 then raise exception 'tick the categories on the licence' using errcode = '22023'; end if;
  if p_licence_expires_on is null or p_licence_expires_on < upper(bk.period)::date then
    raise exception 'the licence must be valid until the rental ends' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'enter the name as on the ID' using errcode = '22023'; end if;
  if p_id_type not in ('national_id', 'passport') or length(trim(coalesce(p_id_number, ''))) < 3 then
    raise exception 'enter the ID card or passport number' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_licence_number, ''))) < 3 then raise exception 'enter the licence number' using errcode = '22023'; end if;
  if p_date_of_birth is null or p_date_of_birth > current_date - interval '18 years' then
    raise exception 'the rider must be at least 18' using errcode = '22023';
  end if;
  update public.bookings set counter_licence_categories = cats, counter_licence_expires_on = p_licence_expires_on,
    counter_full_name = trim(p_full_name), counter_id_type = p_id_type, counter_id_number = upper(trim(p_id_number)),
    counter_licence_number = upper(trim(p_licence_number)), counter_date_of_birth = p_date_of_birth,
    counter_checked_by = auth.uid(), counter_checked_at = now() where id = b;
end $$;
revoke all on function public.record_counter_check(uuid, text[], date, text, text, text, text, date) from public, anon;
grant execute on function public.record_counter_check(uuid, text[], date, text, text, text, text, date) to authenticated;

-- Company details printed on the agreement letterhead (managers and owners).
create or replace function public.update_company_details(p_legal_name text, p_reg_no text, p_address text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_manager();
  update public.site_settings set company_legal_name = nullif(trim(p_legal_name), ''), company_reg_no = nullif(trim(p_reg_no), ''),
    company_address = nullif(trim(p_address), ''), updated_at = now(), updated_by = auth.uid() where id;
end $$;
revoke all on function public.update_company_details(text, text, text) from public, anon;
grant execute on function public.update_company_details(text, text, text) to authenticated;
