import { okPrivate, withUser } from '@/lib/api';
import { requireAi } from '@/lib/ai/anthropic';
import { prioritise } from '@/lib/ai/features';
import { loadCaller, loadLibrary } from '@/lib/server/caller';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/current — The Current.
 *
 * Deliberately uncached: the answer must change the moment something is
 * started, finished or dropped in, and a stale "do this next" is worse than a
 * slightly slower one.
 */
export const GET = withUser({ route: 'ai:current', scope: 'ai' }, async ({ db, user }) => {
  const caller = await loadCaller(db, user.id);
  requireAi(caller.aiActive);

  const { items, groups } = await loadLibrary(db, user.id);
  const { value } = await prioritise({ db, userId: user.id, plan: caller.plan }, items, groups);

  return okPrivate(value);
});
