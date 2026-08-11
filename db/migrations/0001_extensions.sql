-- 0001 — extensions and shared helpers.
-- Muse runs on Supabase Postgres. Everything below is idempotent so that
-- `supabase db reset` and a fresh hosted project converge on the same state.

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "vector" with schema extensions;
-- pg_cron is only available on hosted Supabase; guarded so local reset succeeds.
do $$
begin
  create extension if not exists "pg_cron";
exception
  when others then
    raise notice 'pg_cron unavailable in this environment; scheduled jobs fall back to Vercel Cron';
end $$;

-- ── shared enums ────────────────────────────────────────────────────────────
do $$ begin
  create type item_type as enum ('idea', 'learning', 'music', 'poetry', 'note', 'task');
exception when duplicate_object then null; end $$;

do $$ begin
  create type item_state as enum ('inbox', 'todo', 'doing', 'done', 'someday');
exception when duplicate_object then null; end $$;

do $$ begin
  create type capture_source as enum ('app', 'share', 'siri', 'email');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_tier as enum ('free', 'intelligence');
exception when duplicate_object then null; end $$;

-- ── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Convenience: the calling user's id, or null for anon. Used by RLS policies.
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;
