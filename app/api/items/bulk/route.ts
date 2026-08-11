import { after } from 'next/server';
import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { zBulkAction } from '@/lib/zod-schemas';
import { logEvent, markChecklist, profileTimezone, recordCompletion, trashItem } from '@/lib/server/items';

export const dynamic = 'force-dynamic';

/**
 * POST /api/items/bulk — one action across many items.
 *
 * Done in a single statement rather than N round trips, and scoped by user_id
 * on top of RLS so a forged id list can only ever touch the caller's own rows.
 */
export const POST = withUser({ route: 'items:bulk' }, async ({ db, user, request }) => {
  const { ids, action } = await parseBody(request, zBulkAction);
  const now = new Date();

  if (action.kind === 'delete') {
    // Trash is per-item because each row's payload is snapshotted for restore.
    let removed = 0;
    for (const id of ids) {
      try {
        await trashItem(db, user.id, id);
        removed += 1;
      } catch {
        // Already gone. Deleting something twice is not an error worth failing on.
      }
    }
    return okPrivate({ ok: true, affected: removed });
  }

  if (action.kind === 'group') {
    if (action.groupId) {
      const { data: group } = await db
        .from('groups')
        .select('id')
        .eq('user_id', user.id)
        .eq('id', action.groupId)
        .maybeSingle();
      if (!group) throw new ApiError(400, 'That group does not exist.');
    }

    const { data, error } = await db
      .from('items')
      .update({ group_id: action.groupId, touched_at: now.toISOString() })
      .eq('user_id', user.id)
      .in('id', ids)
      .select('id');

    if (error) throw new ApiError(500, 'That did not save.');

    after(async () => {
      for (const row of data ?? []) {
        await logEvent(db, user.id, row.id as string, 'group', null, action.groupId);
      }
    });

    return okPrivate({ ok: true, affected: (data ?? []).length });
  }

  // State change. Completions have side effects (streak, points, checklist), so
  // the previous states are read first to tell a real completion from a no-op.
  const { data: before } = await db
    .from('items')
    .select('id,state,done_at')
    .eq('user_id', user.id)
    .in('id', ids);

  const newlyDone = (before ?? []).filter(
    (row) => action.state === 'done' && row.state !== 'done',
  );

  const { data, error } = await db
    .from('items')
    .update({
      state: action.state,
      done_at: action.state === 'done' ? now.toISOString() : null,
      touched_at: now.toISOString(),
    })
    .eq('user_id', user.id)
    .in('id', ids)
    .select('id');

  if (error) throw new ApiError(500, 'That did not save.');

  after(async () => {
    const previous = new Map((before ?? []).map((row) => [row.id as string, row.state as string]));
    for (const row of data ?? []) {
      const id = row.id as string;
      if (previous.get(id) !== action.state) {
        await logEvent(db, user.id, id, 'state', previous.get(id) ?? null, action.state);
      }
    }

    if (newlyDone.length > 0) {
      const timezone = await profileTimezone(db, user.id);
      // The streak counts days, not items: one advance no matter how many rows
      // were completed in the batch. Points are still per item.
      await recordCompletion(db, user.id, timezone, now);
      if (newlyDone.length > 1) {
        const { data: stats } = await db
          .from('user_stats')
          .select('points')
          .eq('user_id', user.id)
          .maybeSingle();
        await db
          .from('user_stats')
          .update({ points: ((stats?.points as number) ?? 0) + 10 * (newlyDone.length - 1) })
          .eq('user_id', user.id);
      }
      await markChecklist(db, user.id, 'first_done');
    }
  });

  return okPrivate({ ok: true, affected: (data ?? []).length });
});
