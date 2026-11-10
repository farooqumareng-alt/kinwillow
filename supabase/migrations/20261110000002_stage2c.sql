-- KinWillow Stage 2c — inventory items, documents, storage (spec §3.2)
-- Run in the Supabase SQL editor (project gelitbdxtqexwspjfotg).
-- Safe to re-run.

-- Edit-grant helper (owner/member with grant_level='edit')
create or replace function public.has_edit_grant(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid() and grant_level = 'edit'
  );
$$;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category text not null check (category in ('account', 'subscription', 'document', 'device', 'person', 'other')),
  section int check (section between 1 and 10),
  title text not null,
  provider_name text,
  notes text,
  criticality text not null default 'medium' check (criticality in ('low', 'medium', 'high')),
  renewal_date date,
  notice_days int,
  archived boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inventory_items_household_idx on public.inventory_items (household_id, archived);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid references public.inventory_items (id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime text,
  size_bytes bigint,
  sha256 text not null,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists documents_household_idx on public.documents (household_id);

alter table public.inventory_items enable row level security;
alter table public.documents enable row level security;

drop policy if exists "items member read" on public.inventory_items;
create policy "items member read" on public.inventory_items
  for select using (public.is_household_member(household_id));
drop policy if exists "items editor insert" on public.inventory_items;
create policy "items editor insert" on public.inventory_items
  for insert with check (public.has_edit_grant(household_id));
drop policy if exists "items editor update" on public.inventory_items;
create policy "items editor update" on public.inventory_items
  for update using (public.has_edit_grant(household_id));
drop policy if exists "items editor delete" on public.inventory_items;
create policy "items editor delete" on public.inventory_items
  for delete using (public.has_edit_grant(household_id));

drop policy if exists "docs member read" on public.documents;
create policy "docs member read" on public.documents
  for select using (public.is_household_member(household_id));
drop policy if exists "docs editor insert" on public.documents;
create policy "docs editor insert" on public.documents
  for insert with check (public.has_edit_grant(household_id));
drop policy if exists "docs editor delete" on public.documents;
create policy "docs editor delete" on public.documents
  for delete using (public.has_edit_grant(household_id));

-- Free plan gate: max 25 non-archived items (spec §3.6)
create or replace function public.enforce_free_item_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tier text;
  cnt int;
begin
  select plan_tier into tier from public.households where id = new.household_id;
  if tier = 'free' then
    select count(*) into cnt from public.inventory_items
      where household_id = new.household_id and archived = false;
    if cnt >= 25 then
      raise exception 'Free plan limit reached (25 items). Upgrade to Family for unlimited items.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_free_limit on public.inventory_items;
create trigger inventory_items_free_limit
  before insert on public.inventory_items
  for each row execute function public.enforce_free_item_limit();

-- Private storage bucket for documents: paths are {household_id}/{doc uuid}-{filename}
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create or replace function public.doc_path_household(path text)
returns uuid
language plpgsql
stable
as $$
declare
  first text;
begin
  first := (storage.foldername(path))[1];
  if first is null then return null; end if;
  return first::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists "doc files member read" on storage.objects;
create policy "doc files member read" on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.is_household_member(public.doc_path_household(name))
  );
drop policy if exists "doc files editor insert" on storage.objects;
create policy "doc files editor insert" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.has_edit_grant(public.doc_path_household(name))
  );
drop policy if exists "doc files editor delete" on storage.objects;
create policy "doc files editor delete" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and public.has_edit_grant(public.doc_path_household(name))
  );
