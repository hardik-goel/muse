import type { SupabaseClient } from '@supabase/supabase-js';

export const THUMB_BUCKET = 'item-thumbs';

/** Bytes the API will accept for one image, matching the bucket's own limit. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const SIGNATURES: { mime: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

/**
 * Content-Type on an upload is a claim, not a fact. The bucket only accepts
 * three formats, so the first twelve bytes are checked against their magic
 * numbers before anything is written.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  return SIGNATURES.find((sig) => sig.test(bytes))?.mime ?? null;
}

/**
 * Storage paths always begin with the owner's uuid — that first segment is what
 * the bucket's RLS policies match on, and what the thumbnail proxy re-checks.
 */
export function thumbObjectPath(userId: string, id: string, kind: 'thumb' | 'full'): string {
  return `${userId}/${id}${kind === 'full' ? '-full' : ''}.webp`;
}

/** The app-relative URL stored in items.thumb_url for an uploaded image. */
export function thumbPublicUrl(objectPath: string): string {
  return `/api/thumb/${objectPath}`;
}

export function isManagedThumb(url: string | null): boolean {
  return Boolean(url && url.startsWith('/api/thumb/'));
}

export function objectPathFromThumbUrl(url: string): string {
  return url.replace(/^\/api\/thumb\//, '');
}

/** Removes both renditions. Missing objects are not an error. */
export async function deleteThumbObjects(
  db: SupabaseClient,
  objectPath: string,
): Promise<void> {
  const full = objectPath.replace(/\.webp$/, '-full.webp');
  await db.storage.from(THUMB_BUCKET).remove([objectPath, full]);
}
