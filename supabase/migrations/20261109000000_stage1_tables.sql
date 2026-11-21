-- KinWillow Stage 1 tables — contact form and checklist signups.
-- These were created by hand before the repo had migrations, so a fresh
-- database could not be rebuilt (…000005_stage2f alters two of them). This
-- file sorts first and records them.
--
-- On the live database, run it once in the Supabase SQL editor: the tables
-- already exist, so the CREATEs do nothing, and the important effect is the
-- last block — row-level security is switched ON for all three. They are only
-- ever read and written by the server (service role), which bypasses RLS, so
-- nothing changes for the app; but if RLS was off, anyone holding the public
-- anon key could read every contact message and signup address.
-- Safe to re-run.

create extension if not exists pgcrypto;

-- A contact-form message waiting for its emailed 6-digit code.
create table if not exists public.contact_pending (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topic text,
  message text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

-- A verified contact-form message (read_at / archived_at are added by stage2f).
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topic text,
  message text not null,
  created_at timestamptz not null default now()
);

-- A checklist (founding list) signup.
create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text,
  created_at timestamptz not null default now()
);

-- Server-only tables: RLS on, no policies.
alter table public.contact_pending enable row level security;
alter table public.messages enable row level security;
alter table public.signups enable row level security;
