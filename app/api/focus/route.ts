import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { zFocusEnd, zFocusStart } from '@/lib/zod-schemas';
import { awardPoints } from '@/lib/server/items';

export const dynamic = 'force-dynamic';

/** POST /api/focus — a session started. Returns the id used to close it. */
export const POST = withUser({ route: 'focus:start' }, async ({ db, user, request }) => {
  const { itemId, minutes } = await parseBody(request, zFocusStart);

  if (itemId) {
    const { data: item } = await db
      .from('items')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', itemId)
      .maybeSingle();
    if (!item) throw new ApiError(404, 'That item is gone.');
  }

  // Moving the item into "doing" is the honest side effect of starting a timer
  // on it, and it keeps The Current pointing at what you are actually doing.
  if (itemId) {
    await db
      .from('items')
      .update({ state: 'doing', touched_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('id', itemId)
      .eq('state', 'todo');
  }

  const { data, error } = await db
    .from('focus_sessions')
    .insert({ user_id: user.id, item_id: itemId, minutes })
    .select('id')
    .single();

  if (error || !data) throw new ApiError(500, 'Could not start that session.');
  return okPrivate({ sessionId: data.id as string });
});

/** PATCH /api/focus — a session ended, completed or abandoned. */
export const PATCH = withUser({ route: 'focus:end' }, async ({ db, user, request }) => {
  const { sessionId, completed } = await parseBody(request, zFocusEnd);

  const { data, error } = await db
    .from('focus_sessions')
    .update({ completed, ended_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('id', sessionId)
    .is('ended_at', null)
    .select('id')
    .maybeSingle();

  if (error) throw new ApiError(500, 'Could not close that session.');
  // Already closed. Closing twice is a double-tap, not a failure.
  if (!data) return okPrivate({ ok: true, awarded: false });

  if (completed) await awardPoints(db, user.id, 'focusFinish');

  return okPrivate({ ok: true, awarded: completed });
});
