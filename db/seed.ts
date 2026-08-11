/**
 * Local development seed.
 *
 *   npm run db:start && npm run db:reset && npm run db:seed
 *
 * Creates one confirmed account and fills it with a library that exercises
 * every surface: items in each state, a duplicate pair, a due-today task, an
 * item stale enough for the Archive card, and enough volume for Threads.
 *
 * Refuses to run against anything but a local Supabase, because seeding a
 * hosted project with fake data is not a mistake you get to make twice.
 */
import { loadEnv } from '../scripts/load-env';
import { createClient } from '@supabase/supabase-js';
import { classifyLocal } from '../lib/local-mode';
import { detectPlatform, extractUrl, normaliseUrl, thumbnailFor } from '../lib/url';

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const EMAIL = process.env.SEED_EMAIL ?? 'you@muse.test';
const PASSWORD = process.env.SEED_PASSWORD ?? 'muse-dev-password';

if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required. Copy it from `supabase status`.');
  process.exit(1);
}

if (!/127\.0\.0\.1|localhost/.test(url) && process.env.SEED_ALLOW_REMOTE !== 'true') {
  console.error(`Refusing to seed a non-local Supabase (${url}).`);
  console.error('Set SEED_ALLOW_REMOTE=true if you genuinely mean it.');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

interface Seed {
  raw: string;
  state?: 'inbox' | 'todo' | 'doing' | 'done' | 'someday';
  group?: string;
  priority?: 1 | 2 | 3 | null;
  createdDaysAgo?: number;
  touchedDaysAgo?: number;
  dueAt?: string | null;
  doneDaysAgo?: number;
}

const SEEDS: Seed[] = [
  { raw: 'Finish the onboarding copy pass\nThe three questions still read like a form.', state: 'doing', group: 'Product Ideas', priority: 1, createdDaysAgo: 6, touchedDaysAgo: 3 },
  { raw: 'Ship the export button', state: 'doing', group: 'Product Ideas', createdDaysAgo: 9, touchedDaysAgo: 1 },
  { raw: 'Pay the electricity bill by Friday', state: 'todo', priority: 1, dueAt: ahead(0), createdDaysAgo: 2 },
  { raw: 'Renew the domain', state: 'todo', priority: 2, dueAt: ahead(5), createdDaysAgo: 4 },
  { raw: 'Read the attention paper properly, not the summary\nhttps://arxiv.org/abs/1706.03762', state: 'todo', group: 'AI Learning', createdDaysAgo: 12 },
  { raw: 'https://www.youtube.com/watch?v=aircAruvnKk', group: 'AI Learning', createdDaysAgo: 20, touchedDaysAgo: 20 },
  { raw: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', group: 'Music', createdDaysAgo: 3 },
  { raw: 'A song idea: the bridge should drop to just the bass', group: 'Music', createdDaysAgo: 11, touchedDaysAgo: 11 },
  { raw: 'Poem: the city keeps its lights on for nobody in particular', group: 'Poetry', createdDaysAgo: 30, touchedDaysAgo: 30 },
  { raw: 'What if the inbox sorted itself by how long you have avoided it', group: 'Product Ideas', createdDaysAgo: 1 },
  { raw: 'Squat 3x5, then mobility. Knees have been complaining.', group: 'Fitness', state: 'done', createdDaysAgo: 2, doneDaysAgo: 1 },
  { raw: 'Deadlift session, keep it light', group: 'Fitness', state: 'done', createdDaysAgo: 5, doneDaysAgo: 4 },
  { raw: 'Book the flights for December', state: 'someday', group: 'Travel', createdDaysAgo: 18, touchedDaysAgo: 18 },
  { raw: 'The bookshop in Bandra with the mezzanine', group: 'Travel', createdDaysAgo: 40, touchedDaysAgo: 40 },
  { raw: 'Move the emergency fund to the higher-rate account', state: 'todo', group: 'Finance', priority: 2, createdDaysAgo: 8 },
  { raw: 'Finish the Le Guin essays', state: 'todo', group: 'Reading', createdDaysAgo: 15, touchedDaysAgo: 15 },
  { raw: 'https://arxiv.org/abs/1706.03762', group: 'AI Learning', createdDaysAgo: 0 },
  { raw: 'Write the changelog for this release', state: 'done', group: 'Product Ideas', createdDaysAgo: 3, doneDaysAgo: 2 },
];

async function main(): Promise<void> {
  const userId = await ensureUser();
  console.log(`seeding ${EMAIL} (${userId})`);

  await db.from('items').delete().eq('user_id', userId);
  await db.from('groups').delete().eq('user_id', userId);

  await db
    .from('profiles')
    .update({ name: 'You', onboarded: true, interests: ['ai', 'product', 'music', 'fitness'] })
    .eq('id', userId);

  await db
    .from('user_settings')
    .update({ workout_enabled: true, workout_why: 'Because I said I would.' })
    .eq('user_id', userId);

  await db
    .from('user_stats')
    .update({ points: 120, daily_streak: 3, last_done_date: new Date().toISOString().slice(0, 10), week_streak: 2 })
    .eq('user_id', userId);

  const groups = new Map<string, string>();

  const rows = [];
  for (const seed of SEEDS) {
    const local = classifyLocal(seed.raw);
    const groupName = seed.group ?? local.group;

    if (!groups.has(groupName)) {
      const { data } = await db
        .from('groups')
        .insert({ user_id: userId, name: groupName, sort_order: groups.size })
        .select('id')
        .single();
      groups.set(groupName, data?.id as string);
    }

    const link = extractUrl(seed.raw);
    const created = ago(seed.createdDaysAgo ?? 0);

    rows.push({
      user_id: userId,
      group_id: groups.get(groupName),
      title: local.title,
      summary: local.summary,
      raw_input: seed.raw,
      type: local.type,
      state: seed.state ?? local.state,
      priority: seed.priority ?? local.priority,
      tags: local.tags,
      due_at: seed.dueAt ?? null,
      url: link,
      url_normalized: normaliseUrl(link),
      platform: detectPlatform(link),
      thumb_url: thumbnailFor(link),
      source: 'app',
      ai_status: 'ready',
      created_at: created,
      updated_at: created,
      touched_at: ago(seed.touchedDaysAgo ?? seed.createdDaysAgo ?? 0),
      done_at: seed.doneDaysAgo !== undefined ? ago(seed.doneDaysAgo) : null,
    });
  }

  const { error } = await db.from('items').insert(rows);
  if (error) {
    console.error('seed failed:', error.message);
    process.exit(1);
  }

  console.log(`seeded ${rows.length} items across ${groups.size} groups`);
  console.log(`sign in with ${EMAIL} / ${PASSWORD}`);
}

async function ensureUser(): Promise<string> {
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((u) => u.email === EMAIL);
  if (existing) return existing.id;

  const { data, error } = await db.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: 'You', timezone: 'Asia/Kolkata' },
  });

  if (error || !data.user) {
    console.error('could not create the seed user:', error?.message);
    process.exit(1);
  }

  // The signup trigger creates profile/settings/stats; give it a moment.
  await new Promise((resolve) => setTimeout(resolve, 400));
  return data.user.id;
}

void main();
