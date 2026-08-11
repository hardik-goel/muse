import { okPrivate, parseQuery, withUser } from '@/lib/api';
import { zItemsQuery } from '@/lib/zod-schemas';
import { ITEM_COLUMNS, publicItems } from '@/lib/server/items';
import { scoreItem } from '@/lib/local-mode';
import type { Item } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/items — the library, filtered and sorted.
 *
 * Search runs in Postgres via websearch_to_tsquery when a query is present, so
 * it stays correct past the first page. Score sorting is computed in the
 * application because the formula depends on "now", which no index can hold.
 */
export const GET = withUser({ route: 'items:list' }, async ({ db, user, request }) => {
  const query = parseQuery(request, zItemsQuery);

  let builder = db.from('items').select(ITEM_COLUMNS).eq('user_id', user.id);

  if (query.state === 'active') builder = builder.neq('state', 'done');
  else if (query.state !== 'all') builder = builder.eq('state', query.state);

  if (query.type !== 'all') builder = builder.eq('type', query.type);
  if (query.group) builder = builder.eq('group_id', query.group);

  if (query.q) {
    const escaped = query.q.replace(/[%,()]/g, ' ');
    builder = builder.or(
      `title.ilike.%${escaped}%,summary.ilike.%${escaped}%,note.ilike.%${escaped}%`,
    );
  }

  // Score sorting needs the whole candidate set, so it is applied after the
  // fetch; the other three orderings push down into the query.
  if (query.sort === 'newest') builder = builder.order('created_at', { ascending: false });
  else if (query.sort === 'oldest') builder = builder.order('created_at', { ascending: true });
  else if (query.sort === 'due') {
    builder = builder.order('due_at', { ascending: true, nullsFirst: false });
  } else builder = builder.order('updated_at', { ascending: false });

  if (query.cursor) builder = builder.lt('updated_at', query.cursor);

  const { data, error } = await builder.limit(query.sort === 'score' ? 200 : query.limit);
  if (error) throw error;

  let items = publicItems(data as Record<string, unknown>[] | null);

  if (query.sort === 'score') {
    const now = new Date();
    items = [...items].sort((a, b) => scoreItem(b, now) - scoreItem(a, now)).slice(0, query.limit);
  }

  const last: Item | undefined = items[items.length - 1];
  const nextCursor = items.length === query.limit && last ? last.updated_at : null;

  return okPrivate({ items, nextCursor });
});
