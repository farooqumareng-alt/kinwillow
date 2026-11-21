# KinWillow app (Stage 2)

Next.js (App Router, TypeScript) application that replaces the static
Stage 1 site: marketing pages, checklist signup, verified contact form,
auth with MFA, households with row-level security, and the vault app
shell at /app. Built per files/Stage2a-Build-Specification.md in the
goal workspace.

## Local development

```bash
cp .env.example .env.local   # fill in the anon key
npm install
npm run dev
```

## Checks

```bash
npm run typecheck   # TypeScript
npm test            # release, package and scheduled-job tests
npm run build
```

## Deploying the Phase 1 + 2 changes

(Emergency release, plan lock, sign-in enforcement, reminders, password reset,
account deletion, activity log, read-only sealing.) Order matters:

1. **Run, in the Supabase SQL editor, in this order:**
   - `supabase/migrations/20261121000008_phase1_core.sql`
   - `supabase/migrations/20261121000010_phase2_honesty.sql`
   - `supabase/migrations/20261121000012_phase3_contacts.sql`
   - `supabase/migrations/20261121000013_parents_household.sql`

   All four are additive (new columns, guards, the `verified_sessions` table,
   `session_state()`, the hardened `append_audit`, contact invitation dates).
   Do **not** run `…000011` yet — it is the enforcement switch and goes last.
2. **Set the new Vercel env vars** (see `.env.example`):
   - `CRON_SECRET` — any long random string. Without it the scheduled jobs
     refuse to run: nothing is auto-released, no reminders go out and no
     requested account deletion is carried out.
   - `KINWILLOW_MASTER_KEY` — must already be set; released packages are now
     stored encrypted with it.
   - `NEXT_PUBLIC_SITE_URL` — optional, defaults to `https://www.kinwillow.com`.
3. **Update the Supabase password-recovery email template**: paste
   `supabase/templates/recovery.html` into Authentication → Emails → Reset
   password. It now links to `/auth/confirm?token_hash=…`, which works even
   when the email is opened on a different device. Without this, "Forgot your
   password?" sends a link that does not reach the reset page.
4. **Deploy.** `vercel.json` registers two daily jobs (14:00 and 14:30 UTC):
   `/api/cron/disclosure` (owner reminders and automatic release) and
   `/api/cron/reminders` (renewal and re-check reminders, account deletions).
   On a Vercel Pro plan, change the first schedule to `0 * * * *` (hourly) so
   releases land closer to the minute.
5. **Sign in once on production**, then confirm a row appeared in
   `public.verified_sessions`.
6. **Run `supabase/migrations/20261121000011_enforce_after_deploy.sql`.**
   From this point a session that skipped the emailed code (or the
   authenticator app, when one is switched on) can read nothing, and a sealed
   household is read-only. Everyone signed in at that moment is asked to sign
   in again.

How emergency release now works: a contact's request emails the owner at once;
the job sends a midpoint and a final reminder; when the waiting period ends
without a veto the package (vault items, documents, legacy-setting
instructions, limited by scope) is released and emailed to the contact, with a
link valid for 30 days. A request is never auto-released unless at least one
owner notification was accepted by the email provider — the job keeps retrying
and logs `owner still not notified; release is on hold`.

If a user loses their authenticator app, remove the factor for them in the
Supabase dashboard (Authentication → Users → the user → MFA factors).

## Before first deploy

1. **Run the database migration** — `supabase/migrations/20261109000001_stage2b.sql`
   in the Supabase SQL editor (project `gelitbdxtqexwspjfotg`): creates
   profiles, households, household_members, RLS policies, and the
   on-signup trigger that provisions a household.
2. **Supabase Auth settings** — Site URL `https://www.kinwillow.com`,
   redirect URL `https://www.kinwillow.com/auth/callback`; TOTP MFA
   enabled (it is by default).
3. **Vercel env vars** — add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key: Supabase dashboard →
   Project Settings → API). `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   and `RESEND_API_KEY` are already set from Stage 1.
4. Deploy from this directory as the project root (it supersedes the
   static site; all Stage 1 URLs — /, /contact, the checklist PDF, the
   Stripe deposit link on the homepage — are preserved).
