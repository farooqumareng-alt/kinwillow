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

## Deploying the Phase 1 change (emergency release, plan lock, sign-in enforcement)

Order matters. Do these in sequence:

1. **Run `supabase/migrations/20261121000008_phase1_core.sql`** in the Supabase
   SQL editor. It is additive: new columns, the plan/status guard on
   `households`, the `verified_sessions` table and `session_state()`.
2. **Set the new Vercel env vars** (see `.env.example`):
   - `CRON_SECRET` — any long random string. Without it the scheduled job
     refuses to run and nothing is ever released automatically.
   - `KINWILLOW_MASTER_KEY` — must already be set; released packages are now
     stored encrypted with it.
   - `NEXT_PUBLIC_SITE_URL` — optional, defaults to `https://www.kinwillow.com`.
3. **Deploy.** `vercel.json` registers a daily job at 14:00 UTC calling
   `/api/cron/disclosure`. On a Vercel Pro plan, change the schedule to
   `0 * * * *` (hourly) so releases and reminders land closer to the minute.
4. **Sign in once on production**, then confirm a row appeared in
   `public.verified_sessions`.
5. **Run `supabase/migrations/20261121000009_phase1_enforce_session.sql`.**
   From this point a session that skipped the emailed code (or the
   authenticator app, when one is switched on) can read nothing. Everyone
   signed in at that moment is asked to sign in again.

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
