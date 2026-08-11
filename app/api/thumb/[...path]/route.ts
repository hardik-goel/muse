import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { THUMB_BUCKET } from '@/lib/server/storage';
import { log, errorFields } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/thumb/<user_id>/<file> — the only way an uploaded image is served.
 *
 * The bucket is private. Signed URLs would expire inside a saved page and put a
 * token in the DOM, so images stream through here instead: same-origin (which
 * the CSP already allows), authenticated on every request, and re-checked
 * against the path's owner segment so one account cannot read another's.
 */
export async function GET(
  _request: NextRequest,
  segment: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await segment.params;
  const objectPath = path.join('/');

  // No traversal, no absolute paths, and the first segment must be the owner.
  if (path.length < 2 || path.some((part) => part === '..' || part === '' || part.includes('\\'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (path[0] !== user.id) return new NextResponse('Not found', { status: 404 });

  const { data, error } = await db.storage.from(THUMB_BUCKET).download(objectPath);
  if (error || !data) {
    log.debug('thumb miss', { objectPath, ...errorFields(error) });
    return new NextResponse('Not found', { status: 404 });
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': data.type || 'image/webp',
      // Private, but immutable: the object name contains a uuid, so a changed
      // image is always a changed URL.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
