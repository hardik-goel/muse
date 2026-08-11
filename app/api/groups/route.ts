import { okPrivate, parseBody, withUser } from '@/lib/api';
import { zGroupCreate } from '@/lib/zod-schemas';
import { ensureGroup } from '@/lib/server/items';
import type { Group } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = withUser({ route: 'groups:list' }, async ({ db, user }) => {
  const { data, error } = await db
    .from('groups')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')
    .order('name');

  if (error) throw error;
  return okPrivate({ groups: (data ?? []) as Group[] });
});

/** Creating a group that already exists returns the existing one, not a 409. */
export const POST = withUser({ route: 'groups:create' }, async ({ db, user, request }) => {
  const { name } = await parseBody(request, zGroupCreate);
  const group = await ensureGroup(db, user.id, name);

  // A group the person typed themselves is not an AI guess.
  if (group.ai_created) {
    await db.from('groups').update({ ai_created: false }).eq('id', group.id);
    group.ai_created = false;
  }

  return okPrivate({ group });
});
