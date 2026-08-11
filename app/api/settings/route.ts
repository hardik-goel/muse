import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { zSettingsPatch } from '@/lib/zod-schemas';
import { loadCaller } from '@/lib/server/caller';
import type { NotifPrefs, UserSettings } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = withUser({ route: 'settings:get' }, async ({ db, user }) => {
  const caller = await loadCaller(db, user.id);
  return okPrivate({ settings: caller.settings, aiActive: caller.aiActive });
});

/**
 * PATCH /api/settings.
 *
 * The one rule enforced here rather than in the UI: a free plan cannot switch
 * Intelligence on. The toggle stays visible and remembers its position, it just
 * does not grant anything until the plan does.
 */
export const PATCH = withUser({ route: 'settings:patch' }, async ({ db, user, request }) => {
  const patch = await parseBody(request, zSettingsPatch);
  const caller = await loadCaller(db, user.id);

  const update: Record<string, unknown> = {};

  if (patch.aiEnabled !== undefined) {
    if (patch.aiEnabled && caller.settings.plan !== 'intelligence') {
      throw new ApiError(402, 'Intelligence is not on this plan yet.');
    }
    update.ai_enabled = patch.aiEnabled;
  }

  if (patch.notifMaster !== undefined) update.notif_master = patch.notifMaster;
  if (patch.briefTime !== undefined) update.brief_time = patch.briefTime;
  if (patch.workoutEnabled !== undefined) update.workout_enabled = patch.workoutEnabled;
  if (patch.workoutWhy !== undefined) update.workout_why = patch.workoutWhy;

  if (patch.workoutSplit !== undefined) {
    // Sunday-first, seven entries, blanks read as Rest — the editor allows an
    // empty box and a blank day is a rest day.
    update.workout_split = patch.workoutSplit.map((day) => day.trim() || 'Rest');
  }

  if (patch.notifPrefs !== undefined) {
    update.notif_prefs = { ...caller.settings.notif_prefs, ...patch.notifPrefs } as NotifPrefs;
  }

  if (patch.timezone !== undefined) {
    if (!isValidTimezone(patch.timezone)) throw new ApiError(400, 'That is not a timezone.');
    await db.from('profiles').update({ timezone: patch.timezone }).eq('id', user.id);
  }

  if (Object.keys(update).length === 0) {
    return okPrivate({ settings: caller.settings });
  }

  const { data, error } = await db
    .from('user_settings')
    .update(update)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (error) throw new ApiError(500, 'That did not save.');
  return okPrivate({ settings: data as UserSettings });
});

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
