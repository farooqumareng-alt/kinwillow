-- KinWillow Phase 2 (additive) — make the remaining claims true.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code,
-- right after …000008. Safe to re-run.

-- ---------- 1. An activity log that really can't quietly change ----------
-- Before this, append_audit accepted any household and any actor from any
-- caller, so entries could be forged; and the hashed timestamp was not stored,
-- so a chain could not be recomputed.
alter table public.audit_log add column if not exists hashed_at text;

create or replace function public.append_audit(
  p_household uuid, p_actor uuid, p_action text, p_entity text, p_entity_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prev text;
  v_hash text;
  v_id uuid;
  v_actor uuid := p_actor;
  v_ts text;
  v_role text := coalesce(auth.role(), '');
begin
  -- API callers may only write to a household they belong to, as themselves.
  -- The server (service role) and direct SQL may record system events.
  if v_role in ('authenticated', 'anon') then
    if auth.uid() is null or p_household is null or not exists (
      select 1 from public.household_members
      where household_id = p_household and user_id = auth.uid()
    ) then
      raise exception 'Not allowed to write to this activity log.';
    end if;
    v_actor := auth.uid();
  end if;

  -- One writer per household at a time, so the chain cannot fork.
  perform pg_advisory_xact_lock(hashtext(coalesce(p_household::text, 'GLOBAL')));

  select entry_hash into v_prev from public.audit_log
    where household_id is not distinct from p_household
    order by created_at desc, id desc limit 1;
  v_ts := clock_timestamp()::text;
  v_hash := encode(digest(
    coalesce(v_prev, 'GENESIS') || '|' || coalesce(p_household::text, '') || '|' ||
    coalesce(v_actor::text, '') || '|' || p_action || '|' ||
    coalesce(p_entity, '') || '|' || coalesce(p_entity_id::text, '') || '|' ||
    v_ts, 'sha256'), 'hex');
  insert into public.audit_log (household_id, actor, action, entity, entity_id, prev_hash, entry_hash, hashed_at)
  values (p_household, v_actor, p_action, p_entity, p_entity_id, v_prev, v_hash, v_ts)
  returning id into v_id;
  return v_id;
end;
$$;

-- Entries can never be edited, and can only disappear together with the
-- household they belong to (account deletion).
create or replace function public.guard_audit_log()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Activity log entries cannot be changed.';
  end if;
  if old.household_id is not null
     and exists (select 1 from public.households where id = old.household_id) then
    raise exception 'Activity log entries cannot be deleted.';
  end if;
  return old;
end;
$$;
drop trigger if exists audit_log_guard on public.audit_log;
create trigger audit_log_guard
  before update or delete on public.audit_log
  for each row execute function public.guard_audit_log();

-- ---------- 2. Renewal and re-check reminders ----------
-- Stage 0 = nothing sent, 1 = early notice sent, 2 = final (7-day) notice sent.
alter table public.inventory_items add column if not exists renewal_reminder_stage int not null default 0;
alter table public.continuity_records add column if not exists recheck_reminded_for date;

-- Changing a renewal date re-arms its reminders.
create or replace function public.reset_renewal_reminder()
returns trigger
language plpgsql
as $$
begin
  if new.renewal_date is distinct from old.renewal_date then
    new.renewal_reminder_stage := 0;
  end if;
  return new;
end;
$$;
drop trigger if exists inventory_items_reset_reminder on public.inventory_items;
create trigger inventory_items_reset_reminder
  before update of renewal_date on public.inventory_items
  for each row execute function public.reset_renewal_reminder();

-- ---------- 3. Account deletion with a 30-day grace period ----------
alter table public.profiles add column if not exists deletion_requested_at timestamptz;

-- deletion_requested_at is set and cleared by the server only (after the
-- password is re-checked); is_admin keeps its existing protection.
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
  end if;
  return new;
end;
$$;

-- ---------- 4. Vetoing must keep working for a sealed household ----------
-- Part …000011 makes sealed households read-only by tightening
-- has_edit_grant(). Emergency requests are the exception: an owner must
-- always be able to veto, and to change the waiting period.
create or replace function public.has_member_edit(hid uuid)
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

drop policy if exists "dr editor update" on public.disclosure_requests;
create policy "dr editor update" on public.disclosure_requests
  for update using (public.has_member_edit(household_id))
  with check (public.has_member_edit(household_id));

-- An API caller may only veto: nothing else about a request can be rewritten
-- (not the release time, and a veto cannot be undone into "waiting").
create or replace function public.guard_disclosure_request()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if not (old.state = 'waiting' and new.state = 'vetoed') then
      raise exception 'An emergency request can only be vetoed while it is waiting.';
    end if;
    if new.release_at is distinct from old.release_at
       or new.household_id is distinct from old.household_id
       or new.trusted_contact_id is distinct from old.trusted_contact_id
       or new.requested_at is distinct from old.requested_at
       or new.owner_notified_at is distinct from old.owner_notified_at then
      raise exception 'Only the veto can be recorded on an emergency request.';
    end if;
    new.vetoed_by := auth.uid();
    new.vetoed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists disclosure_requests_guard on public.disclosure_requests;
create trigger disclosure_requests_guard
  before update on public.disclosure_requests
  for each row execute function public.guard_disclosure_request();
