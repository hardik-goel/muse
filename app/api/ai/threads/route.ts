import { ApiError, okPrivate, withUser } from '@/lib/api';
import { requireAi } from '@/lib/ai/anthropic';
import { threads } from '@/lib/ai/features';
import { dayKey, readCache, writeCache } from '@/lib/ai/cache';
import { loadCaller, loadLibrary } from '@/lib/server/caller';
import { isFlagOn } from '@/lib/server/flags';
import type { ThreadPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/threads — connections the group names do not already make obvious.
 *
 * Flag-gated so it can be pulled without a deploy, and pointless below eight
 * items, where any "connection" is just a coincidence.
 */
export const GET = withUser({ route: 'ai:threads', scope: 'ai' }, async ({ db, user }) => {
  const caller = await loadCaller(db, user.id);
  requireAi(caller.aiActive);

  if (!(await isFlagOn(db, 'threads'))) throw new ApiError(404, 'Not available.');

  const key = dayKey('threads', caller.timezone);
  const cached = await readCache<{ threads: ThreadPayload[] }>(db, user.id, key);
  if (cached) return okPrivate(cached);

  const { items, groups } = await loadLibrary(db, user.id);
  if (items.length < 8) return okPrivate({ threads: [] });

  const { value } = await threads({ db, userId: user.id, plan: caller.plan }, items, groups);

  await writeCache(db, user.id, key, value);
  return okPrivate(value);
});
