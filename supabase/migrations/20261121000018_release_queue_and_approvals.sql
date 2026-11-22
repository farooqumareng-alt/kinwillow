-- Emergency-request review (hold / cancel by staff) and two-person approval.
-- Safe to run more than once. Run after 20261121000017_staff_roles.sql.

-- 1. Staff can pause an emergency request for review, or cancel it.
alter table public.disclosure_requests add column if not exists held_at timestamptz;
alter table public.disclosure_requests add column if not exists held_by uuid;
alter table public.disclosure_requests add column if not exists hold_reason text;
alter table public.disclosure_requests add column if not exists staff_cancelled_at timestamptz;

-- The app itself can still only veto. A hold or a staff cancellation can only
-- be recorded by the server.
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
       or new.owner_notified_at is distinct from old.owner_notified_at
       or new.held_at is distinct from old.held_at
       or new.held_by is distinct from old.held_by
       or new.hold_reason is distinct from old.hold_reason
       or new.staff_cancelled_at is distinct from old.staff_cancelled_at then
      raise exception 'Only the veto can be recorded on an emergency request.';
    end if;
    new.vetoed_by := auth.uid();
    new.vetoed_at := now();
  end if;
  return new;
end;
$$;

-- 2. Two-person approval: one staff member asks, a different one decides.
create table if not exists public.staff_approvals (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  target_type text,
  target_id text,
  target_label text,
  summary text not null,
  reason text not null,
  requested_by uuid not null,
  requested_by_email text,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'failed')),
  decided_by uuid,
  decided_by_email text,
  decided_at timestamptz,
  decision_note text,
  -- The database itself refuses a self-approval.
  constraint staff_approvals_two_people check (decided_by is null or decided_by <> requested_by or status = 'withdrawn')
);
create index if not exists staff_approvals_status_idx on public.staff_approvals (status, requested_at desc);
alter table public.staff_approvals enable row level security;
-- No policies: only the server (service role) can read or write.
