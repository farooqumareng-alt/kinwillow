-- KinWillow — the second household of the Family + Parents plan (additive).
-- Run in the Supabase SQL editor BEFORE deploying the matching app code
-- (any time after …000008). Safe to re-run.
--
-- A parents' household is an ordinary household row (kind = 'parents') owned
-- by the same user as their own household. It is created by the server only
-- (there is no insert policy on households), after checking the plan.

-- At most one parents' household per owner.
do $$
begin
  create unique index if not exists households_one_parents_per_owner
    on public.households (owner_id) where kind = 'parents';
exception when unique_violation then
  raise notice 'An owner already has more than one parents household; unique index skipped.';
end $$;

-- Billing lives on the owner's own household. Refuse a subscription row for a
-- parents' household, so a second subscription can never be attached to it.
create or replace function public.guard_subscription_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.households where id = new.household_id and kind = 'parents') then
    raise exception 'Billing is managed on the owner''s own household.';
  end if;
  return new;
end;
$$;
drop trigger if exists subscriptions_guard_household on public.subscriptions;
create trigger subscriptions_guard_household
  before insert or update on public.subscriptions
  for each row execute function public.guard_subscription_household();
