import { okPrivate, withUser } from '@/lib/api';
import { serverEnv } from '@/lib/env';
import type { Item } from '@/lib/types';

export const dynamic = 'force-dynamic';

export interface TrashRow {
  originalId: string;
  deletedAt: string;
  /** Days left before the retention job removes it for good. */
  expiresInDays: number;
  item: Pick<Item, 'id' | 'title' | 'summary' | 'type' | 'thumb_url' | 'platform' | 'url'>;
}

/** GET /api/trash — everything deleted in the retention window, newest first. */
export const GET = withUser({ route: 'trash:list' }, async ({ db, user }) => {
  const { data, error } = await db
    .from('trash_items')
    .select('original_id, deleted_at, payload')
    .eq('user_id', user.id)
    .order('deleted_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  const retention = serverEnv.defaults.trashRetentionDays;

  const rows: TrashRow[] = (data ?? []).map((row) => {
    const payload = row.payload as Item;
    const ageDays = (Date.now() - new Date(row.deleted_at as string).getTime()) / 86_400_000;

    return {
      originalId: row.original_id as string,
      deletedAt: row.deleted_at as string,
      expiresInDays: Math.max(0, Math.ceil(retention - ageDays)),
      item: {
        id: payload.id,
        title: payload.title,
        summary: payload.summary,
        type: payload.type,
        thumb_url: payload.thumb_url,
        platform: payload.platform,
        url: payload.url,
      },
    };
  });

  return okPrivate({ trash: rows, retentionDays: retention });
});

/** DELETE /api/trash — empty it now, rather than waiting for the retention job. */
export const DELETE = withUser({ route: 'trash:empty' }, async ({ db, user }) => {
  const { error } = await db.from('trash_items').delete().eq('user_id', user.id);
  if (error) throw error;
  return okPrivate({ ok: true });
});
