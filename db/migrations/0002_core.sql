-- 0002 — profiles, settings, groups, items, activity.
-- Every table here is owned by exactly one user and carries RLS keyed on user_id.

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  name          text not null default '',
  timezone      text not null default 'Asia/Kolkata',
  interests     text[] not null default '{}',
  onboarded     boolean not null default false,
  -- Onboarding checklist. Keys: first_drop, first_done, first_review,
  -- install_app, enable_notifications.
  checklist     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── user_settings ───────────────────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  plan               plan_tier not null default 'free',
  plan_status        text not null default 'none',      -- none|trialing|active|past_due|cancelled
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  razorpay_customer_id     text,
  razorpay_subscription_id text,

  -- Intelligence master switch. Free plan forces this off at the API layer.
  ai_enabled         boolean not null default false,

  -- Nudges. `notif_master` gates every channel below it.
  notif_master       boolean not null default true,
  notif_prefs        jsonb not null default jsonb_build_object(
                       'morning_brief', true,
                       'workout',       true,
                       'review_due',    true,
                       'streak_guard',  true,
                       'email_digest',  false
                     ),
  brief_time         time not null default '07:30',

  -- Workout. Sunday-first, matching the SU–SA editor in the UI.
  workout_enabled    boolean not null default false,
  workout_split      text[] not null default array['Push','Pull','Legs','Rest','Push','Pull','Rest'],
  workout_why        text not null default '',

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ── groups ──────────────────────────────────────────────────────────────────
create table if not exists public.groups (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 60),
  ai_created    boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Group names are unique per user, case-insensitively: "Travel" and "travel"
-- must resolve to one group or the AI's `NEW:Name` path will fork duplicates.
create unique index if not exists groups_user_name_uniq
  on public.groups (user_id, lower(name));
create index if not exists groups_user_idx on public.groups (user_id, sort_order);

drop trigger if exists groups_touch on public.groups;
create trigger groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();

-- ── items ───────────────────────────────────────────────────────────────────
create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  group_id      uuid references public.groups(id) on delete set null,

  title         text not null default '',
  summary       text not null default '',
  note          text not null default '',          -- free-form body, edited in detail view
  raw_input     text not null default '',          -- exactly what the user dropped; never overwritten

  type          item_type not null default 'note',
  state         item_state not null default 'inbox',
  priority      smallint check (priority between 1 and 3),
  tags          text[] not null default '{}',
  due_at        timestamptz,

  url           text,
  url_normalized text,                             -- for exact-match duplicate detection
  platform      text,                              -- instagram|youtube|spotify|x|linkedin|substack|web|null
  thumb_url     text,                              -- Supabase Storage path or remote thumbnail

  source        capture_source not null default 'app',

  -- 'pending' while the classifier runs, 'ready' once patched, 'failed' if AI
  -- died. A 'failed' item is still a complete, editable item — never a loss.
  ai_status     text not null default 'ready' check (ai_status in ('pending','ready','failed')),

  embedding     extensions.vector(1024),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  done_at       timestamptz,
  touched_at    timestamptz not null default now() -- last user interaction; drives Archive + idle scoring
);

drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- Cursor pagination is on (updated_at, id); every list query leads with user_id.
create index if not exists items_user_updated_idx on public.items (user_id, updated_at desc, id desc);
create index if not exists items_user_state_idx   on public.items (user_id, state);
create index if not exists items_user_group_idx   on public.items (user_id, group_id);
create index if not exists items_user_due_idx     on public.items (user_id, due_at) where due_at is not null;
create index if not exists items_user_touched_idx on public.items (user_id, touched_at);
create index if not exists items_url_norm_idx     on public.items (user_id, url_normalized) where url_normalized is not null;
create index if not exists items_tags_idx         on public.items using gin (tags);
-- Search across title + summary + note.
create index if not exists items_fts_idx on public.items
  using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(note,'')));

-- ── item activity timeline ──────────────────────────────────────────────────
create table if not exists public.item_events (
  id          bigserial primary key,
  item_id     uuid not null references public.items(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,                    -- created|state|edited|group|priority|due|ai
  from_value  text,
  to_value    text,
  created_at  timestamptz not null default now()
);

create index if not exists item_events_item_idx on public.item_events (item_id, created_at desc);

-- ── trash (30-day retention, restorable) ────────────────────────────────────
create table if not exists public.trash_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  original_id  uuid not null,
  payload      jsonb not null,                   -- full row snapshot for restore
  deleted_at   timestamptz not null default now()
);

create index if not exists trash_user_idx on public.trash_items (user_id, deleted_at desc);
