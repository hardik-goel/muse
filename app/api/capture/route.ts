import { after } from 'next/server';
import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { zCapture, zUuid } from '@/lib/zod-schemas';
import { classifyLocal } from '@/lib/local-mode';
import { findDuplicate, type DupeHit } from '@/lib/dupe';
import { detectPlatform, extractUrl, normaliseUrl, thumbnailFor } from '@/lib/url';
import { loadCaller } from '@/lib/server/caller';
import {
  ITEM_COLUMNS,
  awardPoints,
  ensureGroup,
  logEvent,
  markChecklist,
  publicItem,
} from '@/lib/server/items';
import { classify } from '@/lib/ai/features';
import { embed, embeddingsEnabled, semanticDuplicate, storeEmbedding } from '@/lib/embeddings';
import { isFlagOn } from '@/lib/server/flags';
import { bustCache, dayKey } from '@/lib/ai/cache';
import type { Group, Item } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/capture — Smart Drop.
 *
 * The contract that matters: the item exists before this route returns. The
 * classifier runs afterwards and patches it. If Anthropic is down, over budget,
 * or not configured, the Local-mode classification the item was created with is
 * simply the final answer — the user loses nothing but the polish.
 */
export const POST = withUser({ route: 'capture', scope: 'general' }, async ({ db, user, request }) => {
  const input = await parseBody(request, zCapture);
  const raw = input.raw.trim();

  const url = extractUrl(raw);
  const normalised = normaliseUrl(url);
  const local = classifyLocal(raw);

  // ── duplicate detection, before any spend ────────────────────────────────
  if (!input.force) {
    const duplicate = await findExistingDuplicate(db, user.id, {
      url,
      normalised,
      title: local.title,
      raw,
    });
    if (duplicate) return okPrivate({ item: null, duplicate });
  }

  const caller = await loadCaller(db, user.id);
  const group = await ensureGroup(db, user.id, local.group);
  const now = new Date().toISOString();

  // A client-supplied id makes a retried drop idempotent instead of duplicated.
  const requestedId = input.clientId && zUuid.safeParse(input.clientId).success ? input.clientId : null;

  const row: Record<string, unknown> = {
    ...(requestedId ? { id: requestedId } : {}),
    user_id: user.id,
    group_id: group.id,
    title: local.title,
    summary: local.summary,
    note: '',
    raw_input: raw,
    type: local.type,
    state: local.state,
    priority: local.priority,
    tags: local.tags,
    url,
    url_normalized: normalised,
    platform: detectPlatform(url),
    thumb_url: input.thumbPath ?? thumbnailFor(url),
    source: input.source,
    // "pending" is what makes the card shimmer and say "organising…".
    ai_status: caller.aiActive ? 'pending' : 'ready',
    created_at: now,
    updated_at: now,
    touched_at: now,
  };

  // Only a client-supplied id can conflict. Without one the row has no id at
  // all, and an upsert with a conflict target the payload does not contain is
  // not something to rely on — plain insert says what is meant.
  const query = db.from('items');
  const { data, error } = await (requestedId
    ? query.upsert(row, { onConflict: 'id' })
    : query.insert(row)
  )
    .select(ITEM_COLUMNS)
    .single();

  if (error || !data) throw new ApiError(500, 'That did not go through. Try again.');
  const item = publicItem(data as Record<string, unknown>);

  after(async () => {
    await logEvent(db, user.id, item.id, 'created');
    await awardPoints(db, user.id, 'capture');
    await markChecklist(db, user.id, 'first_drop');

    const vector = await embed(`${item.title}\n${item.summary}\n${raw}`);
    if (vector) await storeEmbedding(db, item.id, vector);

    if (caller.aiActive) {
      await runClassifier(db, user.id, caller.plan, item, raw);
    }

    // Tomorrow's brief should know about this; today's cached one is now stale.
    await bustCache(db, user.id, dayKey('current', caller.timezone));
  });

  return okPrivate({ item });
});

/** URL match, then title overlap, then (when configured) semantic similarity. */
async function findExistingDuplicate(
  db: Parameters<typeof ensureGroup>[0],
  userId: string,
  candidate: { url: string | null; normalised: string | null; title: string; raw: string },
): Promise<DupeHit | null> {
  if (candidate.normalised) {
    const { data } = await db
      .from('items')
      .select('id,title,created_at,thumb_url,url,url_normalized')
      .eq('user_id', userId)
      .eq('url_normalized', candidate.normalised)
      .limit(1)
      .maybeSingle();

    if (data) return { item: data as DupeHit['item'], reason: 'url', confidence: 1 };
  }

  const { data: recent } = await db
    .from('items')
    .select('id,title,created_at,thumb_url,url,url_normalized')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(300);

  const byTitle = findDuplicate(
    { url: candidate.url, title: candidate.title },
    (recent ?? []) as Parameters<typeof findDuplicate>[1],
  );
  if (byTitle) return byTitle;

  if (embeddingsEnabled() && (await isFlagOn(db, 'semantic_dupe'))) {
    const vector = await embed(candidate.raw);
    if (vector) return semanticDuplicate(db, userId, vector);
  }

  return null;
}

/**
 * The post-response classifier pass. Runs inside `after()`, so a slow model
 * never delays the item appearing. Failure sets ai_status to 'failed', which
 * the UI treats as a perfectly normal item — because it is one.
 */
async function runClassifier(
  db: Parameters<typeof ensureGroup>[0],
  userId: string,
  plan: 'free' | 'intelligence',
  item: Item,
  raw: string,
): Promise<void> {
  try {
    const { data: groupRows } = await db.from('groups').select('*').eq('user_id', userId);
    const groups = (groupRows ?? []) as Group[];

    const { value } = await classify({ db, userId, plan }, raw, groups);
    const group = await ensureGroup(db, userId, value.group);

    // A degraded call returns the Local-mode answer, which is still a complete
    // classification — so the item lands as 'ready' either way.
    await db
      .from('items')
      .update({
        title: value.title,
        summary: value.summary,
        type: value.type,
        state: value.state,
        priority: value.priority,
        tags: value.tags,
        group_id: group.id,
        ai_status: 'ready',
      })
      .eq('user_id', userId)
      .eq('id', item.id);

    await logEvent(db, userId, item.id, 'ai', 'pending', 'ready');
  } catch {
    // The item keeps its Local-mode classification, which is a complete answer.
    await db
      .from('items')
      .update({ ai_status: 'failed' })
      .eq('user_id', userId)
      .eq('id', item.id);
    await logEvent(db, userId, item.id, 'ai', 'pending', 'failed');
  }
}
