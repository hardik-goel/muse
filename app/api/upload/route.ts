import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, okPrivate, withUser } from '@/lib/api';
import {
  MAX_IMAGE_BYTES,
  THUMB_BUCKET,
  sniffImageMime,
  thumbObjectPath,
  thumbPublicUrl,
} from '@/lib/server/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/upload — multipart, two renditions.
 *
 * The browser has already downscaled to 1100px and produced a 260px thumb, so
 * this route validates and stores rather than transforms. Both objects live
 * under `<user_id>/…` in a private bucket; the card renders the thumb through
 * /api/thumb, never a public URL.
 */
export const POST = withUser({ route: 'upload' }, async ({ db, user, request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, 'Expected an image upload.');
  }

  const thumb = form.get('thumb');
  const full = form.get('full');

  if (!(thumb instanceof File)) throw new ApiError(400, 'No image in that upload.');

  const id = randomUUID();
  const thumbPath = thumbObjectPath(user.id, id, 'thumb');
  const fullPath = thumbObjectPath(user.id, id, 'full');

  await store(db, thumb, thumbPath);
  if (full instanceof File) {
    // A failed full-size write must not lose the thumb the card needs.
    try {
      await store(db, full, fullPath);
    } catch {
      /* the thumbnail is the part the product depends on */
    }
  }

  return okPrivate({ thumbPath: thumbPublicUrl(thumbPath), objectPath: thumbPath });
});

async function store(db: SupabaseClient, file: File, path: string): Promise<void> {
  if (file.size === 0) throw new ApiError(400, 'That image was empty.');
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError(413, 'That one is over 8MB.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) throw new ApiError(400, 'Images only — JPEG, PNG or WebP.');

  const { error } = await db.storage.from(THUMB_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
    cacheControl: '31536000',
  });

  if (error) throw new ApiError(500, 'That image would not upload.');
}
