-- KinWillow — enforcement switch. Run this LAST, in the Supabase SQL editor,
-- AFTER the matching app code is deployed and you have signed in once on
-- production (confirm a row exists in public.verified_sessions first).
-- Requires …000008 and …000010. Safe to re-run.
--
-- Every household-scoped RLS policy and the document storage policies go
-- through these helpers, so after this runs:
--
--   1. A session that skipped the emailed sign-in code — or skipped the
--      authenticator app when one is switched on — can read and write nothing.
--      Anyone signed in at this moment is asked to sign in again.
--   2. A sealed household (lapsed billing) is read-only: reading, exporting
--      and vetoing an emergency request still work; adding or changing vault
--      content does not, until the plan is renewed.
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

-- Edit rights on vault content: a complete sign-in, an edit grant, and an
-- active (not sealed) household.
create or replace function public.has_edit_grant(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.session_state() = 'ok' and exists (
    select 1
    from public.household_members m
    join public.households h on h.id = m.household_id
    where m.household_id = hid and m.user_id = auth.uid()
      and m.grant_level = 'edit' and h.status = 'active'
  );
$$;

-- Edit rights that survive sealing (vetoing an emergency request).
create or replace function public.has_member_edit(hid uuid)
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
