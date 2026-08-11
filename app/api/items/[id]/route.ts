import { after } from 'next/server';
import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { zItemPatch, zUuid } from '@/lib/zod-schemas';
import {
  ITEM_COLUMNS,
  ensureGroup,
  logEvent,
  markChecklist,
  profileTimezone,
  publicItem,
  recordCompletion,
  trashItem,
} from '@/lib/server/items';
import { detectPlatform, normaliseUrl } from '@/lib/url';
import { embed, embeddingsEnabled, matchItems, storeEmbedding } from '@/lib/embeddings';
import type { Item, ItemEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { id: string };

function itemId(raw: string): string {
  const parsed = zUuid.safeParse(raw);
  if (!parsed.success) throw new ApiError(404, 'That item is gone.');
  return parsed.data;
}

async function readItem(
  db: Parameters<typeof ensureGroup>[0],
  userId: string,
  id: string,
): Promise<Item> {
  const { data } = await db
    .from('items')
    .select(ITEM_COLUMNS)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  if (!data) throw new ApiError(404, 'That item is gone.');
  return publicItem(data as Record<string, unknown>);
}

/** GET — the item, its activity timeline, and semantically related items. */
export const GET = withUser<Params>({ route: 'items:get' }, async ({ db, user, params }) => {
  const id = itemId(params.id);
  const item = await readItem(db, user.id, id);

  const { data: events } = await db
    .from('item_events')
    .select('*')
    .eq('user_id', user.id)
    .eq('item_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  let related: { id: string; title: string; summary: string; similarity: number }[] = [];

  if (embeddingsEnabled()) {
    const { data: row } = await db.from('items').select('embedding').eq('id', id).maybeSingle();
    const stored = row?.embedding as number[] | string | null | undefined;
    const vector = Array.isArray(stored)
      ? stored
      : typeof stored === 'string'
        ? (JSON.parse(stored) as number[])
        : await embed(`${item.title}\n${item.summary}\n${item.raw_input}`);

    if (vector) {
      related = await matchItems(db, user.id, vector, { excludeId: id, limit: 5 });
    }
  }

  return okPrivate({ item, events: (events ?? []) as ItemEvent[], related });
});

/** PATCH — the single write path for editing an item. */
export const PATCH = withUser<Params>({ route: 'items:patch' }, async ({ db, user, request, params }) => {
  const id = itemId(params.id);
  const patch = await parseBody(request, zItemPatch);
  const before = await readItem(db, user.id, id);

  const now = new Date();
  const update: Record<string, unknown> = { touched_at: now.toISOString() };

  if (patch.title !== undefined) update.title = patch.title;
  if (patch.summary !== undefined) update.summary = patch.summary;
  if (patch.note !== undefined) update.note = patch.note;
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.dueAt !== undefined) update.due_at = patch.dueAt;

  if (patch.url !== undefined) {
    update.url = patch.url;
    update.url_normalized = normaliseUrl(patch.url);
    update.platform = detectPlatform(patch.url);
  }

  // groupName wins over groupId: the caller asked for a name, which may not
  // exist yet, and that intent is more specific than an id.
  if (patch.groupName !== undefined) {
    update.group_id = (await ensureGroup(db, user.id, patch.groupName)).id;
  } else if (patch.groupId !== undefined) {
    if (patch.groupId) {
      const { data: group } = await db
        .from('groups')
        .select('id')
        .eq('user_id', user.id)
        .eq('id', patch.groupId)
        .maybeSingle();
      if (!group) throw new ApiError(400, 'That group does not exist.');
    }
    update.group_id = patch.groupId;
  }

  const becameDone = patch.state === 'done' && before.state !== 'done';

  if (patch.state !== undefined) {
    update.state = patch.state;
    update.done_at = patch.state === 'done' ? (before.done_at ?? now.toISOString()) : null;
  }

  const { data, error } = await db
    .from('items')
    .update(update)
    .eq('user_id', user.id)
    .eq('id', id)
    .select(ITEM_COLUMNS)
    .single();

  if (error || !data) throw new ApiError(500, 'That did not save.');
  const item = publicItem(data as Record<string, unknown>);

  after(async () => {
    if (patch.state !== undefined && patch.state !== before.state) {
      await logEvent(db, user.id, id, 'state', before.state, patch.state);
    }
    if (update.group_id !== undefined && update.group_id !== before.group_id) {
      await logEvent(db, user.id, id, 'group', before.group_id, (update.group_id as string) ?? null);
    }
    if (patch.priority !== undefined && patch.priority !== before.priority) {
      await logEvent(db, user.id, id, 'priority', String(before.priority), String(patch.priority));
    }
    if (patch.title !== undefined || patch.summary !== undefined || patch.note !== undefined) {
      await logEvent(db, user.id, id, 'edited');
    }

    if (becameDone) {
      await recordCompletion(db, user.id, await profileTimezone(db, user.id), now);
      await markChecklist(db, user.id, 'first_done');
    }

    // An edited title or summary changes what the item means, so its vector is
    // stale. Recompute rather than leave "related" pointing at the old idea.
    if (patch.title !== undefined || patch.summary !== undefined || patch.note !== undefined) {
      const vector = await embed(`${item.title}\n${item.summary}\n${item.note}`);
      if (vector) await storeEmbedding(db, id, vector);
    }
  });

  return okPrivate({ item });
});

/** DELETE — soft. The row moves to trash and stays restorable for 30 days. */
export const DELETE = withUser<Params>({ route: 'items:delete' }, async ({ db, user, params }) => {
  const id = itemId(params.id);
  await trashItem(db, user.id, id);
  return okPrivate({ ok: true });
});
