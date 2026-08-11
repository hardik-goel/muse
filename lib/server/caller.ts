import type { SupabaseClient } from '@supabase/supabase-js';
import type { Group, Item, Profile, UserSettings } from '@/lib/types';
import { isAiActive } from '@/lib/server/session';
import { ITEM_COLUMNS, publicItems } from '@/lib/server/items';

type Db = SupabaseClient;

export interface CallerContext {
  userId: string;
  profile: Profile | null;
  settings: UserSettings;
  timezone: string;
  plan: 'free' | 'intelligence';
  aiActive: boolean;
}

const DEFAULT_SETTINGS = (userId: string): UserSettings => ({
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
});

/**
 * The per-request answer to "who is this and what are they allowed to do".
 * Routes read plan and aiActive from here rather than deciding for themselves,
 * so a lapsed subscription behaves the same everywhere.
 */
export async function loadCaller(db: Db, userId: string): Promise<CallerContext> {
  const [profileRes, settingsRes] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).maybeSingle(),
    db.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  const profile = (profileRes.data as Profile) ?? null;
  const settings = (settingsRes.data as UserSettings) ?? DEFAULT_SETTINGS(userId);

  // A trial that ran out is not a subscription. Expiry is evaluated on read so
  // there is no window where a stale row grants access.
  const expiredTrial =
    settings.plan_status === 'trialing' &&
    Boolean(settings.trial_ends_at) &&
    new Date(settings.trial_ends_at as string).getTime() < Date.now();

  const effective: UserSettings = expiredTrial
    ? { ...settings, plan: 'free', plan_status: 'cancelled' }
    : settings;

  return {
    userId,
    profile,
    settings: effective,
    timezone: profile?.timezone || 'Asia/Kolkata',
    plan: effective.plan,
    aiActive: isAiActive(effective),
  };
}

/** Items + groups for the AI features, which reason over the whole library. */
export async function loadLibrary(
  db: Db,
  userId: string,
  limit = 200,
): Promise<{ items: Item[]; groups: Group[] }> {
  const [itemsRes, groupsRes] = await Promise.all([
    db
      .from('items')
      .select(ITEM_COLUMNS)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit),
    db.from('groups').select('*').eq('user_id', userId).order('sort_order'),
  ]);

  return {
    items: publicItems(itemsRes.data as Record<string, unknown>[] | null),
    groups: (groupsRes.data ?? []) as Group[],
  };
}
