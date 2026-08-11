import { okPrivate, withUser } from '@/lib/api';
import { requireAi } from '@/lib/ai/anthropic';
import { brief } from '@/lib/ai/features';
import { dayKey, readCache, writeCache } from '@/lib/ai/cache';
import { loadCaller, loadLibrary } from '@/lib/server/caller';
import type { BriefPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/brief — the Morning Brief.
 *
 * Written once per local day and cached, so opening Now five times before
 * breakfast costs one model call and shows one consistent brief.
 */
export const GET = withUser({ route: 'ai:brief', scope: 'ai' }, async ({ db, user }) => {
  const caller = await loadCaller(db, user.id);
  requireAi(caller.aiActive);

  const key = dayKey('brief', caller.timezone);
  const cached = await readCache<BriefPayload>(db, user.id, key);
  if (cached) return okPrivate(cached);

  const { items } = await loadLibrary(db, user.id);
  const { value } = await brief(
    { db, userId: user.id, plan: caller.plan },
    { items, settings: caller.settings, timezone: caller.timezone },
  );

  await writeCache(db, user.id, key, value);
  return okPrivate(value);
});
