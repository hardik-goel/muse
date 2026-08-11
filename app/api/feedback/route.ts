import { okPrivate, parseBody, withUser } from '@/lib/api';
import { zFeedback } from '@/lib/zod-schemas';

export const dynamic = 'force-dynamic';

/** POST /api/feedback — the "tell us" box in Settings. */
export const POST = withUser({ route: 'feedback' }, async ({ db, user, request }) => {
  const { text } = await parseBody(request, zFeedback);

  const { error } = await db.from('feedback').insert({ user_id: user.id, text });
  if (error) throw error;

  return okPrivate({ ok: true });
});
