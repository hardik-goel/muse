import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { flagEnv } from '@/lib/env';
import type { Group, Item, Profile, UserSettings, UserStats } from '@/lib/types';
import { ITEM_COLUMNS, publicItems } from '@/lib/server/items';
import type { SessionInfo } from '@/components/shell/StoreProvider';

export interface LoadedSession {
  user: User;
  profile: Profile;
  settings: UserSettings;
  stats: UserStats;
  flags: Record<string, boolean>;
}

/**
 * Loads everything the shell needs in one pass. `cache` dedupes it across the
 * layout and every page in the same render, so nested Server Components can
 * call it freely without a second round trip.
 */
export const loadSession = cache(async (): Promise<LoadedSession> => {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) redirect('/sign-in');

  const [profileRes, settingsRes, statsRes, flagsRes] = await Promise.all([
    db.from('profiles').select('*').eq('id', user.id).single(),
    db.from('user_settings').select('*').eq('user_id', user.id).single(),
    db.from('user_stats').select('*').eq('user_id', user.id).single(),
    db.from('feature_flags').select('key, enabled').eq('env', flagEnv),
  ]);

  // The signup trigger creates all three rows atomically. If one is missing the
  // account is mid-provision rather than broken; fall back to defaults so the
  // app renders instead of erroring.
  const profile = (profileRes.data ?? {
    id: user.id,
    email: user.email ?? '',
    name: '',
    timezone: 'Asia/Kolkata',
    interests: [],
    onboarded: false,
    checklist: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }) as Profile;

  const settings = settingsRes.data as UserSettings | null;
  const stats = statsRes.data as UserStats | null;

  const flags: Record<string, boolean> = {};
  for (const row of flagsRes.data ?? []) {
    flags[(row as { key: string }).key] = Boolean((row as { enabled: boolean }).enabled);
  }

  return {
    user,
    profile,
    settings: settings ?? defaultSettings(user.id),
    stats: stats ?? defaultStats(user.id),
    flags,
  };
});

/** Loads the initial item + group snapshot for the client store. */
export async function loadSnapshot(userId: string): Promise<{ items: Item[]; groups: Group[] }> {
  const db = await supabaseServer();

  const [itemsRes, groupsRes] = await Promise.all([
    db
      // Never `select('*')` on items: it would ship a 1024-float embedding per
      // row to the browser, which is megabytes of vector nobody can use there.
      .from('items')
      .select(ITEM_COLUMNS)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(200),
    db.from('groups').select('*').eq('user_id', userId).order('sort_order'),
  ]);

  return {
    items: publicItems(itemsRes.data as Record<string, unknown>[] | null),
    groups: (groupsRes.data ?? []) as Group[],
  };
}

export function toSessionInfo(loaded: LoadedSession): SessionInfo {
  return {
    guest: false,
    profile: loaded.profile,
    settings: loaded.settings,
    stats: loaded.stats,
    flags: loaded.flags,
    aiActive: isAiActive(loaded.settings),
  };
}

/**
 * AI runs only when the plan allows it AND the user has left the toggle on.
 * A lapsed subscription keeps every item intact and quietly returns Local mode.
 */
export function isAiActive(settings: UserSettings): boolean {
  if (!settings.ai_enabled) return false;
  if (settings.plan === 'intelligence') {
    return settings.plan_status === 'active' || settings.plan_status === 'trialing';
  }
  return false;
}

function defaultSettings(userId: string): UserSettings {
  return {
    user_id: userId,
    plan: 'free',
    plan_status: 'none',
    trial_ends_at: null,
    current_period_end: null,
    ai_enabled: false,
    notif_master: true,
    notif_prefs: {
      morning_brief: true,
      workout: true,
      review_due: true,
      streak_guard: true,
      email_digest: false,
    },
    brief_time: '07:30',
    workout_enabled: false,
    workout_split: ['Push', 'Pull', 'Legs', 'Rest', 'Push', 'Pull', 'Rest'],
    workout_why: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function defaultStats(userId: string): UserStats {
  return {
    user_id: userId,
    points: 0,
    daily_streak: 0,
    last_done_date: null,
    week_streak: 0,
    last_review_at: null,
    updated_at: new Date().toISOString(),
  };
}
