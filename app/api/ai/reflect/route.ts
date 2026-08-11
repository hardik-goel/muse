import { okPrivate, withUser } from '@/lib/api';
import { requireAi } from '@/lib/ai/anthropic';
import { reflect } from '@/lib/ai/features';
import { dayKey, readCache, writeCache } from '@/lib/ai/cache';
import { loadCaller, loadLibrary } from '@/lib/server/caller';

export const dynamic = 'force-dynamic';

/** GET /api/ai/reflect — the weekly reflection, cached for the day. */
export const GET = withUser({ route: 'ai:reflect', scope: 'ai' }, async ({ db, user }) => {
  const caller = await loadCaller(db, user.id);
  requireAi(caller.aiActive);

  const key = dayKey('reflect', caller.timezone);
  const cached = await readCache<{ reflection: string }>(db, user.id, key);
  if (cached) return okPrivate(cached);

  const { items, groups } = await loadLibrary(db, user.id);
  const { value } = await reflect({ db, userId: user.id, plan: caller.plan }, items, groups);

  await writeCache(db, user.id, key, value);
  return okPrivate(value);
});
