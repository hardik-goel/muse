import { okPrivate, parseBody, withUser } from '@/lib/api';
import { zReviewComplete } from '@/lib/zod-schemas';
import { POINTS, advanceWeekStreak } from '@/lib/gamification';
import { markChecklist, readStats } from '@/lib/server/items';
import { loadCaller } from '@/lib/server/caller';
import { bustCache, dayKey } from '@/lib/ai/cache';
import type { UserStats } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/review — the weekly review was completed.
 *
 * The decisions themselves already went through /api/items as state changes;
 * this records the ritual, which is the thing the streak is actually about.
 */
export const POST = withUser({ route: 'review:complete' }, async ({ db, user, request }) => {
  const { decisions } = await parseBody(request, zReviewComplete);
  const now = new Date();

  await db.from('reviews').insert({
    user_id: user.id,
    decisions,
    completed_at: now.toISOString(),
  });

  const stats = await readStats(db, user.id);
  const week = advanceWeekStreak(stats, now);

  const { data } = await db
    .from('user_stats')
    .update({
      points: stats.points + POINTS.review,
      week_streak: week.weekStreak,
      last_review_at: now.toISOString(),
    })
    .eq('user_id', user.id)
    .select('*')
    .single();

  await markChecklist(db, user.id, 'first_review');

  // The reflection is about the week just reviewed, so it should be rewritten.
  const caller = await loadCaller(db, user.id);
  await bustCache(db, user.id, dayKey('reflect', caller.timezone));

  return okPrivate({
    ok: true,
    counted: week.counted,
    stats: (data as UserStats) ?? stats,
  });
});
