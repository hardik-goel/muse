import { after } from 'next/server';
import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { zManualCapture } from '@/lib/zod-schemas';
import { detectPlatform, normaliseUrl, thumbnailFor } from '@/lib/url';
import {
  ITEM_COLUMNS,
  awardPoints,
  ensureGroup,
  logEvent,
  markChecklist,
  publicItem,
} from '@/lib/server/items';
import { embed, storeEmbedding } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/capture/manual — "By hand".
 *
 * No classifier and no duplicate check: the person already told us exactly what
 * this is, and second-guessing a deliberate entry is worse than a duplicate.
 */
export const POST = withUser({ route: 'capture:manual' }, async ({ db, user, request }) => {
  const input = await parseBody(request, zManualCapture);

  let groupId: string | null = null;
  if (input.groupName) {
    groupId = (await ensureGroup(db, user.id, input.groupName)).id;
  } else if (input.groupId) {
    const { data: group } = await db
      .from('groups')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', input.groupId)
      .maybeSingle();
    if (!group) throw new ApiError(400, 'That group does not exist.');
    groupId = input.groupId;
  }

  const now = new Date().toISOString();

  const { data, error } = await db
    .from('items')
    .insert({
      user_id: user.id,
      group_id: groupId,
      title: input.title,
      summary: input.summary,
      note: input.note,
      raw_input: input.title,
      type: input.type,
      state: input.state,
      priority: input.priority,
      tags: input.tags,
      due_at: input.dueAt,
      url: input.url,
      url_normalized: normaliseUrl(input.url),
      platform: detectPlatform(input.url),
      thumb_url: input.thumbPath ?? thumbnailFor(input.url),
      source: input.source,
      ai_status: 'ready',
      created_at: now,
      updated_at: now,
      touched_at: now,
    })
    .select(ITEM_COLUMNS)
    .single();

  if (error || !data) throw new ApiError(500, 'That did not save.');
  const item = publicItem(data as Record<string, unknown>);

  after(async () => {
    await logEvent(db, user.id, item.id, 'created');
    await awardPoints(db, user.id, 'capture');
    await markChecklist(db, user.id, 'first_drop');

    const vector = await embed(`${item.title}\n${item.summary}\n${item.note}`);
    if (vector) await storeEmbedding(db, item.id, vector);
  });

  return okPrivate({ item });
});
