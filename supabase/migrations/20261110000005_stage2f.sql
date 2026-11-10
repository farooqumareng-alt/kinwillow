-- KinWillow Stage 2f — Super Admin data additions (spec §13)
alter table public.profiles add column if not exists is_admin boolean not null default false;

alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists archived_at timestamptz;
alter table public.signups add column if not exists read_at timestamptz;
alter table public.signups add column if not exists archived_at timestamptz;

-- Guard: is_admin can only be changed by direct SQL (postgres) or the
-- service role — never through the API roles, even on one's own profile row
-- (RLS is row-level, so without this trigger a user could self-grant).
create or replace function public.guard_is_admin()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and current_setting('role', true) not in ('postgres', 'service_role') then
    raise exception 'is_admin can only be granted by direct SQL';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
  before update on public.profiles
  for each row execute function public.guard_is_admin();

-- Grant example (run manually, direct SQL only):
--   update public.profiles set is_admin = true where email = 'owner@example.com';
