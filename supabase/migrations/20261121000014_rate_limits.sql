-- KinWillow — rate limiting for the public endpoints (additive).
-- Run in the Supabase SQL editor before or after deploying the matching code:
-- until it exists the app logs a warning and lets requests through.
-- Safe to re-run.

-- One row per (action, caller) fixed window. Keys hold a hash of the caller's
-- IP address or email, never the raw value.
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);
alter table public.rate_limits enable row level security;
-- No policies: service role only.

-- Count one hit and report whether the caller is still within the limit.
-- A single atomic statement, so concurrent requests cannot slip past.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < v_cutoff then 1 else r.count + 1 end,
    window_start = case when r.window_start < v_cutoff then now() else r.window_start end
  returning r.count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
