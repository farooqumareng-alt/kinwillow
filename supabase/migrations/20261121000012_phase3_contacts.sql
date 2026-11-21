-- KinWillow Phase 3 (additive) — trusted-contact invitations.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code
-- (any time after …000008; it does not depend on …000011). Safe to re-run.

-- When the owner emailed the contact their personal link, and when the
-- contact confirmed they received and saved it.
alter table public.trusted_contacts add column if not exists invited_at timestamptz;
alter table public.trusted_contacts add column if not exists accepted_at timestamptz;
