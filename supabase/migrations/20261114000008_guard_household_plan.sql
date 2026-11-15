-- KinWillow — guard households.plan_tier and status (RLS audit 2026-11-14).
-- The "households owner update" policy lets an owner update any column of
-- their own household row, including plan_tier/status, from the browser with
-- the anon key. Plan gates read households.plan_tier directly
-- (enforce_free_item_limit, enforce_contact_limit), so this was a
-- self-upgrade without payment — the likely mechanism behind the admin
-- showing a household on family_parents with no Stripe subscription.
-- This trigger mirrors the existing guard_is_admin pattern (stage2f): only
-- postgres / service_role may change billing columns. Owner updates to name
-- and waiting_period_hours stay allowed. The Stripe webhook and the admin
-- action both use the service role, so they keep working. Safe to re-run.
create or replace function public.guard_household_plan()
returns trigger
language plpgsql
as $$
begin
  if (new.plan_tier is distinct from old.plan_tier
      or new.status is distinct from old.status)
     and current_setting('role', true) not in ('postgres', 'service_role') then
    raise exception 'plan_tier and status can only be changed by billing or admin';
  end if;
  return new;
end;
$$;
drop trigger if exists households_guard_plan on public.households;
create trigger households_guard_plan
  before update on public.households
  for each row execute function public.guard_household_plan();
