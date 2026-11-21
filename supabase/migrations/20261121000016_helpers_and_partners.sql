-- KinWillow — helpers (practitioners invited into a client's vault) and the
-- partner programme (additive).
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.
-- Requires …000008 (session_state). Safe to re-run.

-- ---------- 1. Invitations to help manage a vault ----------
-- The owner invites someone by email; that person accepts while signed in
-- with the same address and becomes a household member with role 'proxy'.
create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null,
  grant_level text not null default 'edit' check (grant_level in ('view', 'edit')),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists household_invites_household_idx on public.household_invites (household_id);
alter table public.household_invites enable row level security;
-- No policies: read and written by the server only.

-- ---------- 2. Owner-only actions ----------
-- A helper with edit rights can add and correct vault content, but only the
-- owner may veto or release an emergency request.
create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.session_state() = 'ok' and exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid() and role = 'owner'
  );
$$;

drop policy if exists "dr editor update" on public.disclosure_requests;
drop policy if exists "dr owner update" on public.disclosure_requests;
create policy "dr owner update" on public.disclosure_requests
  for update using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

-- ---------- 3. Partner programme ----------
-- is_partner / partner_code are granted from the admin panel; referred_by
-- records which partner's link a new account signed up through.
alter table public.profiles add column if not exists is_partner boolean not null default false;
alter table public.profiles add column if not exists partner_code text;
alter table public.profiles add column if not exists referred_by uuid references auth.users (id) on delete set null;
create unique index if not exists profiles_partner_code_uidx on public.profiles (partner_code) where partner_code is not null;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;

-- None of the server-managed profile fields can be changed through the API roles.
create or replace function public.guard_is_admin()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin can only be granted by direct SQL';
    end if;
    if new.deletion_requested_at is distinct from old.deletion_requested_at then
      raise exception 'Account deletion is requested from Settings.';
    end if;
    if new.is_partner is distinct from old.is_partner
       or new.partner_code is distinct from old.partner_code
       or new.referred_by is distinct from old.referred_by then
      raise exception 'Partner details are managed by KinWillow.';
    end if;
  end if;
  return new;
end;
$$;

-- On signup: create profile + household + owner membership, and record the
-- partner whose referral code (if any, and if valid) came with the signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  v_code text := nullif(upper(trim(new.raw_user_meta_data ->> 'partner_code')), '');
  v_partner uuid;
begin
  if v_code is not null then
    select user_id into v_partner from public.profiles
      where partner_code = v_code and is_partner limit 1;
  end if;

  insert into public.profiles (user_id, display_name, email, referred_by)
  values (new.id, new.raw_user_meta_data ->> 'display_name', new.email, v_partner);

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
