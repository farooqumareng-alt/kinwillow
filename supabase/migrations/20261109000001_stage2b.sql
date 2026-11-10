-- KinWillow Stage 2b — identity, households, membership (spec §3.1)
-- Run in the Supabase SQL editor (project gelitbdxtqexwspjfotg) or via
-- `supabase db push`. Safe to re-run: uses IF NOT EXISTS / drop-if-exists
-- around policies and the trigger.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My household',
  owner_id uuid not null references auth.users (id) on delete cascade,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'family', 'family_parents')),
  waiting_period_hours int not null default 168 check (waiting_period_hours between 48 and 720),
  status text not null default 'active' check (status in ('active', 'sealed')),
  kind text not null default 'own' check (kind in ('own', 'parents')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member', 'proxy')),
  grant_level text not null default 'edit' check (grant_level in ('view', 'edit')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- Membership helper (security definer to avoid policy recursion)
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (user_id = auth.uid());
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (user_id = auth.uid());

drop policy if exists "households member read" on public.households;
create policy "households member read" on public.households
  for select using (public.is_household_member(id));
drop policy if exists "households owner update" on public.households;
create policy "households owner update" on public.households
  for update using (owner_id = auth.uid());

drop policy if exists "members read own household" on public.household_members;
create policy "members read own household" on public.household_members
  for select using (public.is_household_member(household_id));

-- On signup: create profile + household + owner membership
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  insert into public.profiles (user_id, display_name, email)
  values (new.id, new.raw_user_meta_data ->> 'display_name', new.email);

  insert into public.households (name, owner_id)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', '') || '''s household', 'My household'),
    new.id
  )
  returning id into hid;

  insert into public.household_members (household_id, user_id, role, grant_level)
  values (hid, new.id, 'owner', 'edit');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
