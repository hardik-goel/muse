-- 0004 — analytics, feedback, flags, push, capture tokens, rate limiting,
--        AI accounting and calendar links.

-- ── first-party analytics (no third-party trackers, ever) ───────────────────
create table if not exists public.events (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete set null,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists events_name_created_idx on public.events (name, created_at desc);
create index if not exists events_user_created_idx on public.events (user_id, created_at desc);

-- ── in-app feedback ─────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  text        text not null check (char_length(text) between 1 and 4000),
  created_at  timestamptz not null default now()
);

-- ── feature flags (global, read at session start) ───────────────────────────
create table if not exists public.feature_flags (
  key         text not null,
  env         text not null default 'development',
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (key, env)
);

insert into public.feature_flags (key, env, enabled) values
  ('threads',        'development', true),
  ('threads',        'production',  false),
  ('semantic_dupe',  'development', true),
  ('semantic_dupe',  'production',  false),
  ('email_digest',   'development', true),
  ('email_digest',   'production',  false),
  ('calendar_sync',  'development', true),
  ('calendar_sync',  'production',  false),
  ('bulk_actions',   'development', true),
  ('bulk_actions',   'production',  true)
on conflict (key, env) do nothing;

-- ── web push ────────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_user_idx on public.push_subscriptions (user_id);

-- ── capture tokens (Siri Shortcuts, email-in) ───────────────────────────────
-- Only the SHA-256 hash is stored; the plaintext token is shown once at creation.
create table if not exists public.capture_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token_hash   text not null unique,
  label        text not null default 'Siri',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists capture_tokens_user_idx on public.capture_tokens (user_id);

-- ── rate limiting (Postgres fallback when Upstash is not configured) ────────
create table if not exists public.rate_limits (
  bucket       text primary key,               -- "<scope>:<user_id>:<minute>"
  count        integer not null default 0,
  window_start timestamptz not null default now()
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

create or replace function public.bump_rate_limit(p_bucket text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (bucket, count, window_start)
    values (p_bucket, 1, now())
  on conflict (bucket) do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- ── AI accounting ───────────────────────────────────────────────────────────
create table if not exists public.ai_usage_log (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  feature        text not null,                 -- classify|current|ask|brief|reflect|threads|embed
  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  ok             boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists ai_usage_user_day_idx on public.ai_usage_log (user_id, created_at desc);

-- Cached AI output keyed by (user, feature, day) — the Morning Brief is
-- generated once per day and re-read, not regenerated on every Now render.
create table if not exists public.ai_cache (
  user_id     uuid not null references auth.users(id) on delete cascade,
  cache_key   text not null,                    -- e.g. "brief:2026-08-10"
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, cache_key)
);

-- ── Google Calendar connection ──────────────────────────────────────────────
create table if not exists public.calendar_connections (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  access_token   text not null,
  refresh_token  text not null,
  expires_at     timestamptz not null,
  calendar_id    text not null default 'primary',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists calendar_touch on public.calendar_connections;
create trigger calendar_touch before update on public.calendar_connections
  for each row execute function public.touch_updated_at();

-- Maps a Muse item to the calendar event it created, so edits update rather
-- than duplicate.
create table if not exists public.calendar_links (
  item_id     uuid primary key references public.items(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_id    text not null,
  synced_at   timestamptz not null default now()
);
