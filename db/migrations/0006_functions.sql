-- 0006 — signup bootstrap, semantic search, maintenance jobs.

-- ── new user bootstrap ──────────────────────────────────────────────────────
-- Creates profile + settings + stats atomically when auth.users gains a row,
-- so no API path ever has to handle "user exists but has no settings".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_tz   text;
begin
  v_name := coalesce(
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(new.email, ''), '@', 1)
  );
  v_tz := coalesce(new.raw_user_meta_data ->> 'timezone', 'Asia/Kolkata');

  insert into public.profiles (id, email, name, timezone)
    values (new.id, coalesce(new.email, ''), v_name, v_tz)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_stats (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── semantic search over items ──────────────────────────────────────────────
-- ivfflat needs rows before it can build meaningful lists, so the index is
-- created with a modest list count suited to a personal-scale corpus.
create index if not exists items_embedding_idx
  on public.items using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_items(
  p_user_id    uuid,
  p_embedding  extensions.vector(1024),
  p_threshold  float default 0.78,
  p_limit      integer default 5,
  p_exclude_id uuid default null
)
returns table (
  id         uuid,
  title      text,
  summary    text,
  type       item_type,
  state      item_state,
  similarity float
)
language sql
stable
security invoker
as $$
  select
    i.id,
    i.title,
    i.summary,
    i.type,
    i.state,
    1 - (i.embedding <=> p_embedding) as similarity
  from public.items i
  where i.user_id = p_user_id
    and i.embedding is not null
    and (p_exclude_id is null or i.id <> p_exclude_id)
    and 1 - (i.embedding <=> p_embedding) >= p_threshold
  order by i.embedding <=> p_embedding
  limit p_limit;
$$;

-- ── maintenance ─────────────────────────────────────────────────────────────
-- Trash retention. Called by cron; the window is a parameter so the README's
-- documented 30 days stays the single source of truth in env.
create or replace function public.purge_expired_trash(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.trash_items
   where deleted_at < now() - make_interval(days => p_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.purge_stale_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '10 minutes';
$$;

-- ── hard account deletion ───────────────────────────────────────────────────
-- Every user-owned table cascades from auth.users, so removing the auth row is
-- sufficient for rows. Storage objects are purged separately by the API route.
create or replace function public.delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.delete_account(uuid) from public, anon, authenticated;

-- Callable by a signed-in user; `security invoker` means RLS on items still
-- applies inside it, so it can only ever match rows the caller already owns.
grant execute on function public.match_items(uuid, extensions.vector, float, integer, uuid)
  to authenticated, service_role;
