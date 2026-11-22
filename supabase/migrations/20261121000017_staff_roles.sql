-- Staff roles for the admin panel, and a named log of what staff do.
-- Safe to run more than once.

-- 1. A role per staff member, replacing the single is_admin on/off flag.
--    is_admin is kept in step with it (true whenever a role is set).
alter table public.profiles add column if not exists staff_role text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_staff_role_check') then
    alter table public.profiles add constraint profiles_staff_role_check
      check (staff_role is null or staff_role in ('owner', 'support', 'billing', 'partnerships', 'compliance'));
  end if;
end $$;

-- Existing admins become owners.
update public.profiles set staff_role = 'owner' where is_admin = true and staff_role is null;

-- 2. Nobody can give themselves (or anyone) a staff role through the site's
--    normal data access. Roles change only through the admin panel's server
--    code (service role) or direct SQL.
create or replace function public.guard_is_admin()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if new.is_admin is distinct from old.is_admin
       or new.staff_role is distinct from old.staff_role then
      raise exception 'Staff access is granted by KinWillow, not from the app.';
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

-- 3. Staff log: who did what, to whom, and why. Append-only.
create table if not exists public.staff_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  target_label text,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists staff_actions_created_idx on public.staff_actions (created_at desc);
create index if not exists staff_actions_target_idx on public.staff_actions (target_type, target_id, created_at desc);
alter table public.staff_actions enable row level security;
-- No policies: only the server (service role) can read or write.

create or replace function public.staff_actions_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The staff log cannot be changed or deleted.';
end;
$$;
drop trigger if exists staff_actions_no_change on public.staff_actions;
create trigger staff_actions_no_change
  before update or delete on public.staff_actions
  for each row execute function public.staff_actions_append_only();
