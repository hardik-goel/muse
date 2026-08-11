import { okPrivate, parseBody, withUser } from '@/lib/api';
import { zTrashRestore } from '@/lib/zod-schemas';
import { logEvent, restoreItem } from '@/lib/server/items';

export const dynamic = 'force-dynamic';

/** POST /api/trash/restore — the other half of the five-second undo. */
export const POST = withUser({ route: 'trash:restore' }, async ({ db, user, request }) => {
  const { id } = await parseBody(request, zTrashRestore);
  const item = await restoreItem(db, user.id, id);

  await logEvent(db, user.id, item.id, 'created', 'trash', item.state);

  return okPrivate({ item });
});
