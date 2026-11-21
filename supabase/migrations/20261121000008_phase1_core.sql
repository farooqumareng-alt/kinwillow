-- KinWillow Phase 1 (part 1 of 2) — make the core promise true.
-- Additive columns, guards, and the session-verification table.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.
-- Safe to re-run. Part 2 (…000009) switches enforcement on AFTER the deploy.

-- ---------- 1. Plan, status and ownership can only change server-side ----------
-- Before this, the "households owner update" policy let an owner update any
-- column from the browser, including plan_tier and status.
create or replace function public.guard_household_columns()
returns trigger
language plpgsql
as $$
begin
  -- auth.role() is 'authenticated' / 'anon' for API callers, 'service_role'
  -- for the server (Stripe webhook, admin), and null for direct SQL.
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if new.plan_tier is distinct from old.plan_tier
       or new.status is distinct from old.status
       or new.owner_id is distinct from old.owner_id
       or new.kind is distinct from old.kind
       or new.id is distinct from old.id then
      raise exception 'Plan, status and ownership can only be changed by KinWillow billing.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists households_guard_columns on public.households;
create trigger households_guard_columns
  before update on public.households
  for each row execute function public.guard_household_columns();

-- Belt and braces: column-level privileges for the API roles.
revoke update on public.households from authenticated, anon;
grant update (name, waiting_period_hours) on public.households to authenticated;

drop policy if exists "households owner update" on public.households;
create policy "households owner update" on public.households
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- 2. Free item limit also applies when restoring archived items ----------
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
  if tg_op = 'UPDATE' and not (old.archived = true and new.archived = false) then
    return new;
  end if;
  if new.archived then return new; end if;
  select plan_tier into tier from public.households where id = new.household_id;
  if tier = 'free' then
    select count(*) into cnt from public.inventory_items
      where household_id = new.household_id and archived = false and id <> new.id;
    if cnt >= 25 then
      raise exception 'Free plan limit reached (25 items). Upgrade to Family for unlimited items.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists inventory_items_free_limit on public.inventory_items;
create trigger inventory_items_free_limit
  before insert or update of archived on public.inventory_items
  for each row execute function public.enforce_free_item_limit();

-- ---------- 3. Inventory items can be limited to a release scope ----------
-- null = included for every trusted contact (same meaning as continuity records).
alter table public.inventory_items
  add column if not exists release_scope_id uuid references public.release_scopes (id) on delete set null;

-- ---------- 4. Automatic release bookkeeping ----------
alter table public.disclosure_requests add column if not exists owner_notified_at timestamptz;
alter table public.disclosure_requests add column if not exists owner_reminder_stage int not null default 0;
alter table public.disclosure_requests add column if not exists released_at timestamptz;
alter table public.disclosure_packages add column if not exists contact_notified_at timestamptz;

-- One package per request (stops a double click or a cron/owner race creating two).
do $$
begin
  create unique index if not exists disclosure_packages_request_uidx
    on public.disclosure_packages (request_id);
exception when unique_violation then
  raise notice 'disclosure_packages has duplicate request_id rows; unique index skipped. Remove duplicates and re-run.';
end $$;

-- ---------- 5. Sessions must be proven by the emailed sign-in code ----------
-- The app writes a row here (service role) only after the 6-digit code is
-- verified, or after an email confirmation link is used. A session created by
-- calling the password endpoint directly never gets a row.
create table if not exists public.verified_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  verified_at timestamptz not null default now()
);
create index if not exists verified_sessions_user_idx on public.verified_sessions (user_id);
alter table public.verified_sessions enable row level security;
-- No policies: service role only.

-- 'none'       — not signed in
-- 'needs_code' — signed in, but this session never passed the emailed code
-- 'needs_mfa'  — an authenticator app is switched on and this session has not used it
-- 'ok'         — fully signed in
create or replace function public.session_state()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 'none'
    when not exists (
      select 1 from public.verified_sessions v
      where v.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and v.user_id = auth.uid()
    ) then 'needs_code'
    when exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    ) and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then 'needs_mfa'
    else 'ok'
  end;
$$;
