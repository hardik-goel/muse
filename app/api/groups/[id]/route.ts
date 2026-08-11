import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { zGroupPatch, zUuid } from '@/lib/zod-schemas';
import type { Group } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { id: string };

function groupId(raw: string): string {
  const parsed = zUuid.safeParse(raw);
  if (!parsed.success) throw new ApiError(404, 'That group is gone.');
  return parsed.data;
}

export const PATCH = withUser<Params>({ route: 'groups:patch' }, async ({ db, user, request, params }) => {
  const id = groupId(params.id);
  const patch = await parseBody(request, zGroupPatch);

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    update.name = patch.name;
    update.ai_created = false;
  }
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (Object.keys(update).length === 0) throw new ApiError(400, 'Nothing to update.');

  const { data, error } = await db
    .from('groups')
    .update(update)
    .eq('user_id', user.id)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  // The unique index on (user_id, lower(name)) is what rejects a rename onto
  // an existing group; say that plainly rather than leaking a constraint name.
  if (error) throw new ApiError(409, 'You already have a group with that name.');
  if (!data) throw new ApiError(404, 'That group is gone.');

  return okPrivate({ group: data as Group });
});

/**
 * DELETE — the group only. Its items survive and become Unfiled, which the
 * schema already guarantees via `on delete set null`.
 */
export const DELETE = withUser<Params>({ route: 'groups:delete' }, async ({ db, user, params }) => {
  const id = groupId(params.id);

  const { error } = await db.from('groups').delete().eq('user_id', user.id).eq('id', id);
  if (error) throw new ApiError(500, 'That did not delete.');

  return okPrivate({ ok: true });
});
