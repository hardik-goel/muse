import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { zImport } from '@/lib/zod-schemas';
import { ITEM_STATES, ITEM_TYPES } from '@/lib/types';
import { detectPlatform, normaliseUrl, thumbnailFor } from '@/lib/url';
import { ensureGroup, markChecklist } from '@/lib/server/items';
import {
  MAX_IMAGE_BYTES,
  THUMB_BUCKET,
  sniffImageMime,
  thumbObjectPath,
  thumbPublicUrl,
} from '@/lib/server/storage';
import { log, errorFields } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/import — the guest handoff and the restore-from-export path.
 *
 * The same artifact shape comes out of /api/export, out of a guest session, and
 * out of the original prototype. Importing is idempotent: an item is skipped
 * when its carried id or its normalised URL is already here, so re-importing
 * your own export is a no-op rather than a second copy of your library.
 */
export const POST = withUser({ route: 'import' }, async ({ db, user, request }) => {
  const payload = await parseBody(request, zImport);
  if (payload.items.length === 0) return okPrivate({ imported: 0, skipped: 0, groups: 0 });

  // Group names in the artifact are just names; ids from another account (or
  // from a guest tab) mean nothing here and are deliberately discarded.
  const groupIdByName = new Map<string, string>();
  for (const group of payload.groups) {
    const created = await ensureGroup(db, user.id, group.name);
    groupIdByName.set(group.name.toLowerCase(), created.id);
  }

  const { data: existing } = await db
    .from('items')
    .select('id, url_normalized')
    .eq('user_id', user.id)
    .limit(5000);

  const seenUrls = new Set(
    (existing ?? []).map((row) => row.url_normalized as string | null).filter(Boolean) as string[],
  );
  const seenIds = new Set((existing ?? []).map((row) => row.id as string));

  let imported = 0;
  let skipped = 0;
  const rows: Record<string, unknown>[] = [];

  for (const raw of payload.items) {
    const url = raw.url && /^https?:\/\//i.test(raw.url) ? raw.url : null;
    const normalised = normaliseUrl(url);

    // The artifact's own id is the strongest signal there is: re-importing an
    // export must be a no-op, and a URL-only check cannot see that for the
    // majority of items, which are plain thoughts with no link at all.
    const carriedId = raw.id && UUID_RE.test(raw.id) ? raw.id : null;
    if (carriedId && seenIds.has(carriedId)) {
      skipped += 1;
      continue;
    }

    if (normalised && seenUrls.has(normalised)) {
      skipped += 1;
      continue;
    }
    if (normalised) seenUrls.add(normalised);

    const groupName = raw.group?.trim();
    let groupId: string | null = null;
    if (groupName) {
      const cached = groupIdByName.get(groupName.toLowerCase());
      if (cached) groupId = cached;
      else {
        const created = await ensureGroup(db, user.id, groupName);
        groupIdByName.set(groupName.toLowerCase(), created.id);
        groupId = created.id;
      }
    }

    // Keeping the carried id makes a repeated import idempotent rather than
    // merely deduplicated.
    const id = carriedId ?? randomUUID();
    seenIds.add(id);
    const thumb = await rehostThumb(db, user.id, id, raw.thumb);

    rows.push({
      id,
      user_id: user.id,
      group_id: groupId,
      title: (raw.title || raw.raw || 'Untitled').slice(0, 200),
      summary: (raw.summary ?? '').slice(0, 400),
      note: raw.note ?? '',
      raw_input: raw.raw ?? raw.title ?? '',
      type: coerce(raw.type, ITEM_TYPES, 'note'),
      state: coerce(raw.state, ITEM_STATES, 'inbox'),
      priority: raw.priority,
      tags: raw.tags.slice(0, 8).map((t) => t.slice(0, 32)),
      due_at: isoOrNull(raw.due),
      url,
      url_normalized: normalised,
      platform: detectPlatform(url),
      thumb_url: thumb ?? thumbnailFor(url),
      source: 'app',
      ai_status: 'ready',
      created_at: isoOrNull(raw.createdAt) ?? new Date().toISOString(),
      done_at: isoOrNull(raw.doneAt),
      touched_at: isoOrNull(raw.createdAt) ?? new Date().toISOString(),
    });

    imported += 1;
  }

  // Chunked so one oversized artifact does not exceed the statement limit.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from('items').insert(rows.slice(i, i + 200));
    if (error) {
      log.error('import: insert failed', { userId: user.id, ...errorFields(error) });
      throw new ApiError(500, 'Some of that would not import. Nothing was lost on your side.');
    }
  }

  if (imported > 0) await markChecklist(db, user.id, 'first_drop');

  return okPrivate({ imported, skipped, groups: groupIdByName.size });
});

function coerce<T extends readonly string[]>(
  value: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

function isoOrNull(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The prototype exported thumbnails as base64 data URLs. Those never go into a
 * row — they are decoded, validated and written to Storage like any upload.
 */
async function rehostThumb(
  db: SupabaseClient,
  userId: string,
  itemId: string,
  thumb: string | null,
): Promise<string | null> {
  if (!thumb) return null;

  // An http(s) thumbnail is already hosted somewhere; keep the reference.
  if (/^https?:\/\//i.test(thumb)) return thumb.slice(0, 400);
  if (thumb.startsWith('/api/thumb/')) return thumb.slice(0, 400);
  if (!thumb.startsWith('data:image/')) return null;

  const base64 = thumb.slice(thumb.indexOf(',') + 1);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  } catch {
    return null;
  }

  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  const mime = sniffImageMime(bytes);
  if (!mime) return null;

  const path = thumbObjectPath(userId, itemId, 'thumb');
  const { error } = await db.storage.from(THUMB_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
    cacheControl: '31536000',
  });

  if (error) return null;
  return thumbPublicUrl(path);
}
