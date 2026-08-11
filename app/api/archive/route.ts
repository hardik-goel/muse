import { okPrivate, parseBody, withUser } from '@/lib/api';
import { zArchiveDecision } from '@/lib/zod-schemas';

export const dynamic = 'force-dynamic';

/**
 * POST /api/archive — records what was decided about a resurfaced item.
 *
 * The state change itself already went through /api/items. This row exists so
 * the rotation can avoid re-offering something that was just judged, and so
 * "let go" is distinguishable from an ordinary delete when reading history.
 */
export const POST = withUser({ route: 'archive:decide' }, async ({ db, user, request }) => {
  const { itemId, decision } = await parseBody(request, zArchiveDecision);

  // No 404 on a missing item: "let go" deletes the row before this call lands,
  // and losing the decision because the user was fast would be perverse.
  const { error } = await db.from('archive_decisions').insert({
    user_id: user.id,
    item_id: itemId,
    decision,
  });

  if (error) return okPrivate({ ok: true, recorded: false });
  return okPrivate({ ok: true, recorded: true });
});
