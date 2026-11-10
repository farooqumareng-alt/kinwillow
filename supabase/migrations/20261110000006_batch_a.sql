-- KinWillow Batch A — ease of entry: structured fields, wizard skips.
-- Run in the Supabase SQL editor (project gelitbdxtqexwspjfotg). Safe to re-run.

alter table public.inventory_items add column if not exists location text;
alter table public.inventory_items add column if not exists last4 text;
alter table public.inventory_items add column if not exists account_type text;
alter table public.inventory_items add column if not exists slot_key text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_last4_len') then
    alter table public.inventory_items
      add constraint inventory_items_last4_len check (last4 is null or char_length(last4) <= 4);
  end if;
end $$;

create table if not exists public.wizard_skips (
  household_id uuid not null references public.households (id) on delete cascade,
  prompt_key text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (household_id, prompt_key)
);
alter table public.wizard_skips enable row level security;
drop policy if exists "skips member read" on public.wizard_skips;
create policy "skips member read" on public.wizard_skips
  for select using (public.is_household_member(household_id));
drop policy if exists "skips editor insert" on public.wizard_skips;
create policy "skips editor insert" on public.wizard_skips
  for insert with check (public.has_edit_grant(household_id));
drop policy if exists "skips editor delete" on public.wizard_skips;
create policy "skips editor delete" on public.wizard_skips
  for delete using (public.has_edit_grant(household_id));
