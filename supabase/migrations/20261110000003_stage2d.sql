-- KinWillow Stage 2d — continuity state engine (spec §3.3-3.6, §4; patent §§2-9)
-- Provider catalog, continuity records, evidence, state transitions, hash-chained audit log.
-- recovery_path / key_location are stored ONLY as AES-256-GCM ciphertext (field-level
-- encryption, per-household keys) produced by the server route; never plaintext.

create extension if not exists pgcrypto;

-- ---------- provider catalog (public reference data) ----------
create table if not exists public.provider_catalog (
  id text primary key,
  name text not null,
  mechanism_type text not null,
  walkthrough jsonb not null default '[]'::jsonb,
  accepts_confirmation boolean not null default true,
  recheck_months int not null default 12,
  recovery_summary text not null default ''
);
alter table public.provider_catalog enable row level security;
drop policy if exists "catalog public read" on public.provider_catalog;
create policy "catalog public read" on public.provider_catalog
  for select using (true);

insert into public.provider_catalog (id, name, mechanism_type, walkthrough, accepts_confirmation, recheck_months, recovery_summary) values
('apple', 'Apple', 'Legacy Contact',
 '["Open Settings on your iPhone (or System Settings on a Mac) and tap your name at the top.", "Tap Sign-In & Security, then Legacy Contact.", "Tap Add Legacy Contact and choose your trusted person.", "Apple generates an access key — this key is what your contact will need, together with a death certificate.", "Give the access key to your contact (or record below where it is kept) and ask them to save it."]'::jsonb,
 true, 12,
 'Your Legacy Contact uses their access key plus a copy of the death certificate at iforgot.apple.com to request access. Apple reviews, then grants access to data stored in iCloud.'),
('google', 'Google', 'Inactive Account Manager',
 '["Go to myaccount.google.com/inactive while signed in.", "Click Start and set the waiting period (for example 3 months of inactivity).", "Add the phone number Google should text before anything happens.", "Add your trusted person and choose what they can access, or set a personal message.", "Optionally set auto-delete. Review and turn the plan on — Google shows a confirmation page."]'::jsonb,
 true, 12,
 'After the inactivity period you chose, Google follows your plan: it notifies your contact and, if you allowed it, gives them access to the data you selected.'),
('meta', 'Meta (Facebook & Instagram)', 'Legacy Contact',
 '["Open Facebook Settings, then Accounts Center, then Personal details.", "Open Memorialization settings.", "Choose a legacy contact — a trusted friend or family member.", "Decide whether they may download a copy of what you shared."]'::jsonb,
 true, 12,
 'After Meta verifies a death, the legacy contact can manage the memorialized profile (tribute posts, friend requests, profile photo) but cannot log in as you or read messages.'),
('microsoft', 'Microsoft', 'Estate / account-closure process',
 '["Microsoft has no legacy-contact setting, so the setup is different: make sure your recovery email and phone in your Microsoft account are current.", "Keep your devices and account email written down in your vault so your family can find the account.", "Record in the recovery path below that access runs through Microsoft\u2019s formal Next of Kin process."]'::jsonb,
 false, 12,
 'Microsoft\u2019s Next of Kin process requires documentation (including a death certificate and proof of authority) submitted to Microsoft; they decide what can be released. There is no pre-set trusted contact.'),
('onepassword', '1Password', 'Emergency Kit + family recovery',
 '["Sign in at 1password.com and download or print your Emergency Kit.", "Store the printed kit somewhere your trusted person can reach in an emergency — and record where below.", "If you use 1Password Families, make sure at least one trusted person is a family organizer who can help with account recovery."]'::jsonb,
 false, 12,
 'With the Emergency Kit (account email, Secret Key, and password) your trusted person signs in directly. Family organizers can also start account recovery for family members.'),
('bitwarden', 'Bitwarden', 'Emergency Access',
 '["Open the Bitwarden web vault and go to Settings, then Emergency Access.", "Invite your trusted person as an emergency contact (they need a Bitwarden account).", "Set their access type (View or Takeover) and the wait time before access is granted.", "Your contact must accept the invitation."]'::jsonb,
 true, 12,
 'Your emergency contact requests access; if you do not reject it within the wait time you set, access is granted automatically.'),
('lastpass', 'LastPass', 'Emergency Access',
 '["Open your LastPass vault and choose Emergency Access.", "Add your trusted person\u2019s email and set the waiting period.", "Your contact accepts the invitation."]'::jsonb,
 true, 12,
 'Your emergency contact can request access; it is granted after the waiting period you set unless you decline the request.')
on conflict (id) do update set
  name = excluded.name, mechanism_type = excluded.mechanism_type,
  walkthrough = excluded.walkthrough, accepts_confirmation = excluded.accepts_confirmation,
  recheck_months = excluded.recheck_months, recovery_summary = excluded.recovery_summary;

-- ---------- continuity records ----------
create table if not exists public.continuity_records (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid references public.inventory_items (id) on delete set null,
  provider_id text not null references public.provider_catalog (id),
  account_ref text,
  designated_recipient text,
  verified_state text not null default 'not_started' check (verified_state in
    ('not_started', 'in_progress', 'attested', 'evidence_verified', 'drift_suspected', 'stale', 'revoked_or_invalid')),
  drift_state text not null default 'none' check (drift_state in ('none', 'suspected', 'confirmed')),
  evidence_type text,
  evidence_hash text,
  evidence_at timestamptz,
  recheck_due date,
  recovery_path_enc text,
  key_location_enc text,
  release_scope text not null default 'instructions_only' check (release_scope in ('instructions_only', 'instructions_and_key_location')),
  criticality text not null default 'medium' check (criticality in ('low', 'medium', 'high')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists continuity_household_idx on public.continuity_records (household_id, verified_state);

create table if not exists public.evidence_artifacts (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.continuity_records (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('confirmation_text', 'attestation')),
  content_hash text not null,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.state_transitions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.continuity_records (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  from_state text,
  to_state text not null,
  actor uuid references auth.users (id),
  reason text,
  created_at timestamptz not null default now()
);

-- ---------- hash-chained audit log ----------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  actor uuid references auth.users (id),
  action text not null,
  entity text,
  entity_id uuid,
  prev_hash text,
  entry_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists audit_household_idx on public.audit_log (household_id, created_at);

create or replace function public.append_audit(
  p_household uuid, p_actor uuid, p_action text, p_entity text, p_entity_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
  v_hash text;
  v_id uuid;
begin
  select entry_hash into v_prev from public.audit_log
    where household_id is not distinct from p_household
    order by created_at desc, id desc limit 1;
  v_hash := encode(digest(
    coalesce(v_prev, 'GENESIS') || '|' || coalesce(p_household::text, '') || '|' ||
    coalesce(p_actor::text, '') || '|' || p_action || '|' ||
    coalesce(p_entity, '') || '|' || coalesce(p_entity_id::text, '') || '|' ||
    clock_timestamp()::text, 'sha256'), 'hex');
  insert into public.audit_log (household_id, actor, action, entity, entity_id, prev_hash, entry_hash)
  values (p_household, p_actor, p_action, p_entity, p_entity_id, v_prev, v_hash)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- RLS ----------
alter table public.continuity_records enable row level security;
alter table public.evidence_artifacts enable row level security;
alter table public.state_transitions enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "cont member read" on public.continuity_records;
create policy "cont member read" on public.continuity_records
  for select using (public.is_household_member(household_id));
drop policy if exists "cont editor insert" on public.continuity_records;
create policy "cont editor insert" on public.continuity_records
  for insert with check (public.has_edit_grant(household_id));
drop policy if exists "cont editor update" on public.continuity_records;
create policy "cont editor update" on public.continuity_records
  for update using (public.has_edit_grant(household_id));
drop policy if exists "cont editor delete" on public.continuity_records;
create policy "cont editor delete" on public.continuity_records
  for delete using (public.has_edit_grant(household_id));

drop policy if exists "ev member read" on public.evidence_artifacts;
create policy "ev member read" on public.evidence_artifacts
  for select using (public.is_household_member(household_id));
drop policy if exists "ev editor insert" on public.evidence_artifacts;
create policy "ev editor insert" on public.evidence_artifacts
  for insert with check (public.has_edit_grant(household_id));

drop policy if exists "tr member read" on public.state_transitions;
create policy "tr member read" on public.state_transitions
  for select using (public.is_household_member(household_id));
drop policy if exists "tr editor insert" on public.state_transitions;
create policy "tr editor insert" on public.state_transitions
  for insert with check (public.has_edit_grant(household_id));

drop policy if exists "audit member read" on public.audit_log;
create policy "audit member read" on public.audit_log
  for select using (household_id is not null and public.is_household_member(household_id));
-- audit inserts happen only through append_audit (security definer); no direct insert policy.
