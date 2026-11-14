-- KinWillow login verification codes: 6-digit email codes required on every
-- sign-in, in addition to the password. Only SHA-256 hashes are stored;
-- the plaintext code is never written to the database.
-- Run in the Supabase SQL editor (project gelitbdxtqexwspjfotg). Safe to re-run.

create table if not exists public.login_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.login_codes enable row level security;
-- No policies: server-side (service role) access only. No user, anon or
-- authenticated, may read or write this table directly.
