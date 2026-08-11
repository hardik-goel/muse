-- 0005 — Row Level Security.
--
-- Hard requirement: RLS is enabled on EVERY table, and every user-owned table
-- restricts to `user_id = auth.uid()`. There is no table a signed-in user can
-- read another user's rows from. tests/e2e/rls.spec.ts proves this with two
-- real accounts.

-- Helper that installs the standard four policies on a user-owned table.
create or replace function public.install_owner_policies(p_table text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('alter table public.%I force row level security', p_table);

  execute format('drop policy if exists %I on public.%I', p_table || '_select_own', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_insert_own', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_update_own', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_delete_own', p_table);

  execute format(
    'create policy %I on public.%I for select using (user_id = auth.uid())',
    p_table || '_select_own', p_table);
  execute format(
    'create policy %I on public.%I for insert with check (user_id = auth.uid())',
    p_table || '_insert_own', p_table);
  execute format(
    'create policy %I on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())',
    p_table || '_update_own', p_table);
  execute format(
    'create policy %I on public.%I for delete using (user_id = auth.uid())',
    p_table || '_delete_own', p_table);
end;
$$;

select public.install_owner_policies(t) from (values
  ('user_settings'),
  ('groups'),
  ('items'),
  ('item_events'),
  ('trash_items'),
  ('user_stats'),
  ('reviews'),
  ('focus_sessions'),
  ('archive_decisions'),
  ('push_subscriptions'),
  ('capture_tokens'),
  ('ai_usage_log'),
  ('ai_cache'),
  ('calendar_connections'),
  ('calendar_links'),
  ('feedback')
) as t(t);

-- ── profiles: keyed on `id`, not `user_id` ──────────────────────────────────
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ── events: users may write their own, and read nothing ─────────────────────
-- Analytics are write-only for users; the admin page reads via service role.
alter table public.events enable row level security;
alter table public.events force row level security;

drop policy if exists events_insert_own on public.events;
drop policy if exists events_select_own on public.events;

create policy events_insert_own on public.events
  for insert with check (user_id = auth.uid() or user_id is null);
create policy events_select_own on public.events
  for select using (user_id = auth.uid());

-- ── feature_flags: readable by any authenticated user, writable by no one ───
alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;

drop policy if exists feature_flags_read on public.feature_flags;
create policy feature_flags_read on public.feature_flags
  for select to authenticated using (true);

-- ── rate_limits: no direct access; only the security-definer function ───────
alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;
-- Intentionally no policies: every access path goes through bump_rate_limit().

-- ── privileges ──────────────────────────────────────────────────────────────
--
-- RLS decides which rows a role may see. It says nothing about whether the role
-- may touch the table at all — that is a GRANT, and without one every request
-- fails with "permission denied for table items" before a policy is ever
-- consulted. Supabase's default privileges cover tables created through the
-- dashboard; tables created by a migration must grant explicitly, so that is
-- done here rather than left to the environment.

grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'user_settings', 'groups', 'items', 'item_events', 'trash_items',
    'user_stats', 'reviews', 'focus_sessions', 'archive_decisions',
    'push_subscriptions', 'capture_tokens', 'ai_usage_log', 'ai_cache',
    'calendar_connections', 'calendar_links', 'feedback', 'events'
  ]
  loop
    -- Row access is still governed entirely by the policies in this file.
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', v_table);
    execute format(
      'grant select, insert, update, delete on public.%I to service_role', v_table);
  end loop;
end $$;

-- Flags are global and read-only to users.
grant select on public.feature_flags to authenticated, service_role;

-- `rate_limits` deliberately gets nothing: every access path goes through
-- bump_rate_limit(), which is security definer.

grant usage, select on all sequences in schema public to authenticated, service_role;

grant execute on function public.bump_rate_limit(text, integer)
  to anon, authenticated, service_role;
grant execute on function public.current_user_id() to anon, authenticated, service_role;

-- Anything added by a later migration inherits the same shape.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
