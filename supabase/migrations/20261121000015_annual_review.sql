-- KinWillow — annual review and staleness (additive).
-- Run in the Supabase SQL editor; it does not depend on deploy order (until it
-- is run, the Annual review page says it is not available yet).
-- Safe to re-run.

-- When the owner last confirmed an item is still correct. Editing an item's
-- content counts as confirming it.
alter table public.inventory_items add column if not exists reviewed_at timestamptz;
update public.inventory_items
  set reviewed_at = coalesce(updated_at, created_at, now())
  where reviewed_at is null;
alter table public.inventory_items alter column reviewed_at set default now();
alter table public.inventory_items alter column reviewed_at set not null;

create or replace function public.touch_item_reviewed()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title
     or new.provider_name is distinct from old.provider_name
     or new.notes is distinct from old.notes
     or new.location is distinct from old.location
     or new.last4 is distinct from old.last4
     or new.account_type is distinct from old.account_type
     or new.renewal_date is distinct from old.renewal_date
     or new.criticality is distinct from old.criticality
     or new.category is distinct from old.category
     or new.release_scope_id is distinct from old.release_scope_id then
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists inventory_items_touch_reviewed on public.inventory_items;
create trigger inventory_items_touch_reviewed
  before update on public.inventory_items
  for each row execute function public.touch_item_reviewed();

-- When the owner was last emailed a review reminder (at most one every 90 days).
alter table public.households add column if not exists review_reminded_at timestamptz;
