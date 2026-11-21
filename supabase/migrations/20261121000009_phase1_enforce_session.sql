-- KinWillow Phase 1 (part 2 of 2) — switch on session enforcement.
-- Run in the Supabase SQL editor AFTER the matching app code is deployed
-- (the deployed sign-in must already be writing public.verified_sessions,
-- otherwise every signed-in user sees an empty vault until they sign in again).
-- Safe to re-run.
--
-- Effect: every household-scoped RLS policy and the document storage policies
-- go through these two helpers, so a session that skipped the emailed code —
-- or skipped the authenticator app when one is switched on — can read and
-- write nothing. Anyone signed in at the moment this runs is asked to sign in
-- again.
--
-- To roll back, re-run the two function definitions from
-- 20261109000001_stage2b.sql and 20261110000002_stage2c.sql.

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.session_state() = 'ok' and exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create or replace function public.has_edit_grant(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.session_state() = 'ok' and exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid() and grant_level = 'edit'
  );
$$;
