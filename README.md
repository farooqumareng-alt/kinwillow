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
npm run lint        # ESLint (Next.js rules)
npm run typecheck   # TypeScript
npm test            # release, package, reminders and household tests
npm run build
```

The same four run in GitHub Actions on every pull request and on pushes to
`main` (`.github/workflows/ci.yml`). Once it has run once, the "Lint, types,
tests, build" check can be made required in the branch protection settings.

Server errors are written to the Vercel log as one JSON line each
(`src/instrumentation.ts`); the reference shown on the error page is the
`digest` to search for.

## Mobile apps

The site is an installable PWA (`public/manifest.webmanifest`, `public/sw.js`).
The store apps are thin wrappers around the live site, so they update whenever
the site deploys.

- **Android:** a Trusted Web Activity. Generate it at pwabuilder.com from
  `https://www.kinwillow.com` (package id `com.kinwillow.app`, start URL
  `/app?source=twa`), upload the `.aab` to Play Console, then put the app
  signing certificate's SHA-256 fingerprint in `ANDROID_CERT_SHA256` and
  redeploy. `/.well-known/assetlinks.json` then links app and site; without it
  the app shows a browser address bar.
- **iOS:** a native wrapper (PWABuilder's iOS package or Capacitor), built in
  Xcode on a Mac. Start URL `/app?source=ios-app`.
- Inside either store app the Billing page shows the current plan only, with no
  purchase buttons (`src/lib/store-app.ts`), because the stores restrict how
  digital subscriptions may be sold in apps.
- `/delete-account` is the public account-deletion page both stores ask for.

## Migrations added by the safety-net change

Run both in the Supabase SQL editor; neither depends on deploy order:

- `supabase/migrations/20261109000000_stage1_tables.sql` — records the three
  Stage 1 tables and **switches row-level security on** for them. If it was
  off, anyone with the public anon key could read contact messages and signup
  addresses.
- `supabase/migrations/20261121000015_annual_review.sql` — adds the
  "last confirmed" date behind the Annual review page and its reminder email.
  Until it is run that page says it is not available yet.
- `supabase/migrations/20261121000016_helpers_and_partners.sql` — helpers
  (people an owner invites into their vault) and the partner programme. Run it
  **before** deploying the matching code. To make someone a partner, use
  "Make partner" on their row in Admin → Users & households; to give partner
  clients a discount, create a coupon in Stripe and put its id in
  `STRIPE_PARTNER_COUPON`.
- `supabase/migrations/20261121000014_rate_limits.sql` — the rate limiter for
  the public forms and sign-in. Until it is run the app logs
  `is not being limited` and lets requests through.

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
