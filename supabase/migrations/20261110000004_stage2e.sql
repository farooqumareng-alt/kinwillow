-- KinWillow Stage 2e — trusted contacts, scopes, disclosure, billing cache (spec §3.3/§3.5/§3.6, §8.3/§8.4)

-- ---------- release scopes ----------
create table if not exists public.release_scopes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- ---------- trusted contacts ----------
create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  relationship text,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'removed')),
  request_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  readiness_opt_in boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_household_idx on public.trusted_contacts (household_id, status);

create table if not exists public.contact_scopes (
  contact_id uuid not null references public.trusted_contacts (id) on delete cascade,
  scope_id uuid not null references public.release_scopes (id) on delete cascade,
  primary key (contact_id, scope_id)
);

-- link continuity records to a scope (nullable = household default scope)
alter table public.continuity_records
  add column if not exists release_scope_id uuid references public.release_scopes (id) on delete set null;

-- plan gate: trusted contacts per tier (Free 1, Family 5, Family+Parents 5)
create or replace function public.enforce_contact_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tier text;
  lim int;
  cnt int;
begin
  if new.status = 'removed' then return new; end if;
  select plan_tier into tier from public.households where id = new.household_id;
  lim := case tier when 'free' then 1 else 5 end;
  select count(*) into cnt from public.trusted_contacts
    where household_id = new.household_id and status <> 'removed' and id <> new.id;
  if cnt >= lim then
    raise exception 'Trusted contact limit reached for your plan (%).', lim;
  end if;
  return new;
end;
$$;
drop trigger if exists trusted_contacts_limit on public.trusted_contacts;
create trigger trusted_contacts_limit
  before insert or update on public.trusted_contacts
  for each row execute function public.enforce_contact_limit();

-- plan gate: release scopes per tier (Free 1, paid unlimited)
create or replace function public.enforce_scope_limit()
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
    select count(*) into cnt from public.release_scopes where household_id = new.household_id;
    if cnt >= 1 then
      raise exception 'Free plan includes 1 release scope. Upgrade to Family for more.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists release_scopes_limit on public.release_scopes;
create trigger release_scopes_limit
  before insert on public.release_scopes
  for each row execute function public.enforce_scope_limit();

-- ---------- disclosure ----------
create table if not exists public.disclosure_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trusted_contact_id uuid not null references public.trusted_contacts (id) on delete cascade,
  request_class text not null check (request_class in ('death', 'incapacity')),
  reason text,
  state text not null default 'waiting' check (state in ('waiting', 'vetoed', 'released', 'expired', 'completed')),
  requested_at timestamptz not null default now(),
  release_at timestamptz not null,
  vetoed_by uuid references auth.users (id),
  vetoed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists disclosure_household_idx on public.disclosure_requests (household_id, state);

create table if not exists public.disclosure_packages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.disclosure_requests (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  trusted_contact_id uuid not null references public.trusted_contacts (id) on delete cascade,
  content jsonb not null,
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null,
  first_accessed_at timestamptz,
  access_count int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- billing cache ----------
create table if not exists public.subscriptions (
  household_id uuid primary key references public.households (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  tier text,
  status text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table public.release_scopes enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.contact_scopes enable row level security;
alter table public.disclosure_requests enable row level security;
alter table public.disclosure_packages enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "scopes member read" on public.release_scopes;
create policy "scopes member read" on public.release_scopes
  for select using (public.is_household_member(household_id));
drop policy if exists "scopes editor write" on public.release_scopes;
create policy "scopes editor write" on public.release_scopes
  for all using (public.has_edit_grant(household_id)) with check (public.has_edit_grant(household_id));

drop policy if exists "contacts member read" on public.trusted_contacts;
create policy "contacts member read" on public.trusted_contacts
  for select using (public.is_household_member(household_id));
drop policy if exists "contacts editor write" on public.trusted_contacts;
create policy "contacts editor write" on public.trusted_contacts
  for all using (public.has_edit_grant(household_id)) with check (public.has_edit_grant(household_id));

drop policy if exists "cs member read" on public.contact_scopes;
create policy "cs member read" on public.contact_scopes
  for select using (exists (
    select 1 from public.trusted_contacts c
    where c.id = contact_id and public.is_household_member(c.household_id)));
drop policy if exists "cs editor write" on public.contact_scopes;
create policy "cs editor write" on public.contact_scopes
  for all using (exists (
    select 1 from public.trusted_contacts c
    where c.id = contact_id and public.has_edit_grant(c.household_id)))
  with check (exists (
    select 1 from public.trusted_contacts c
    where c.id = contact_id and public.has_edit_grant(c.household_id)));

drop policy if exists "dr member read" on public.disclosure_requests;
create policy "dr member read" on public.disclosure_requests
  for select using (public.is_household_member(household_id));
drop policy if exists "dr editor update" on public.disclosure_requests;
create policy "dr editor update" on public.disclosure_requests
  for update using (public.has_edit_grant(household_id));
-- disclosure inserts happen server-side (public request page) via service role.

drop policy if exists "dp member read" on public.disclosure_packages;
create policy "dp member read" on public.disclosure_packages
  for select using (public.is_household_member(household_id));
-- package inserts/access happen server-side via service role.

drop policy if exists "subs member read" on public.subscriptions;
create policy "subs member read" on public.subscriptions
  for select using (public.is_household_member(household_id));
-- subscription writes happen only via the Stripe webhook (service role).
