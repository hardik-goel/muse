import { okPrivate, parseBody, withUser } from '@/lib/api';
import { zAsk } from '@/lib/zod-schemas';
import { requireAi } from '@/lib/ai/anthropic';
import { ask } from '@/lib/ai/features';
import { loadCaller, loadLibrary } from '@/lib/server/caller';

export const dynamic = 'force-dynamic';

/** POST /api/ai/ask — a question about your own library, answered from it only. */
export const POST = withUser({ route: 'ai:ask', scope: 'ai' }, async ({ db, user, request }) => {
  const { question } = await parseBody(request, zAsk);

  const caller = await loadCaller(db, user.id);
  requireAi(caller.aiActive);

  const { items, groups } = await loadLibrary(db, user.id);
  const { value } = await ask({ db, userId: user.id, plan: caller.plan }, question, items, groups);

  return okPrivate(value);
});
