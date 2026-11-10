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
