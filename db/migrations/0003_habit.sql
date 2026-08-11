-- 0003 — streaks, points, reviews, focus sessions, archive rotation.

create table if not exists public.user_stats (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  points           integer not null default 0,
  daily_streak     integer not null default 0,
  last_done_date   date,                        -- user-local date of the last completed item
  week_streak      integer not null default 0,
  last_review_at   timestamptz,
  updated_at       timestamptz not null default now()
);

drop trigger if exists user_stats_touch on public.user_stats;
create trigger user_stats_touch before update on public.user_stats
  for each row execute function public.touch_updated_at();

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  decisions     integer not null default 0,
  completed_at  timestamptz not null default now()
);

create index if not exists reviews_user_idx on public.reviews (user_id, completed_at desc);

create table if not exists public.focus_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  item_id       uuid references public.items(id) on delete set null,
  minutes       smallint not null check (minutes in (15, 25, 50)),
  completed     boolean not null default false,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);

create index if not exists focus_user_idx on public.focus_sessions (user_id, started_at desc);

-- Archive decisions are recorded so an item is not resurfaced the day after it
-- was let go. Rotation itself is deterministic: floor(now/86400000) % n.
create table if not exists public.archive_decisions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  decision    text not null check (decision in ('still_matters', 'someday', 'let_go')),
  created_at  timestamptz not null default now()
);

create index if not exists archive_decisions_user_idx on public.archive_decisions (user_id, created_at desc);
