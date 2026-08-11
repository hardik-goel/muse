import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { clientIp, fail } from '@/lib/api';
import { zCapture } from '@/lib/zod-schemas';
import { classifyLocal } from '@/lib/local-mode';
import { detectPlatform, extractUrl, normaliseUrl, thumbnailFor } from '@/lib/url';
import { ITEM_COLUMNS, awardPoints, ensureGroup, logEvent, publicItem } from '@/lib/server/items';
import { log, errorFields } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/capture/token-drop — the Siri Shortcut / email-in endpoint.
 *
 * No cookie, no session: a bearer capture token identifies the owner. It runs
 * on the service role because there is no user JWT to satisfy RLS, so every
 * query below is scoped by the resolved user id by hand.
 *
 * Classification is Local mode only. This path has to answer fast from a
 * shortcut on a locked phone, and the classifier can catch up in the app.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  // Rate limit on the IP before touching the database, so an invalid token
  // cannot be used to hammer the lookup.
  const ipLimit = await checkRateLimit('capture-token', clientIp(request));
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: 'Slow down a moment.' }, { status: 429 });
  }

  if (!token || token.length > 200) return fail(401, 'Bad token.');

  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return fail(503, 'Not configured.');
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  const { data: record } = await db
    .from('capture_tokens')
    .select('id, user_id, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!record || record.revoked_at) return fail(401, 'Bad token.');
  const userId = record.user_id as string;

  const userLimit = await checkRateLimit('capture-token', userId);
  if (!userLimit.allowed) {
    return NextResponse.json({ error: 'Slow down a moment.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Expected a JSON body.');
  }

  const parsed = zCapture.safeParse({ ...(body as object), source: 'siri' });
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? 'Drop something in first.');
  }

  const raw = parsed.data.raw.trim();
  const url = extractUrl(raw);
  const local = classifyLocal(raw);

  try {
    const group = await ensureGroup(db, userId, local.group);
    const now = new Date().toISOString();

    const { data, error } = await db
      .from('items')
      .insert({
        user_id: userId,
        group_id: group.id,
        title: local.title,
        summary: local.summary,
        raw_input: raw,
        type: local.type,
        state: local.state,
        priority: local.priority,
        tags: local.tags,
        url,
        url_normalized: normaliseUrl(url),
        platform: detectPlatform(url),
        thumb_url: thumbnailFor(url),
        source: 'siri',
        ai_status: 'ready',
        created_at: now,
        updated_at: now,
        touched_at: now,
      })
      .select(ITEM_COLUMNS)
      .single();

    if (error || !data) return fail(500, 'That did not go through.');

    after(async () => {
      await db.from('capture_tokens').update({ last_used_at: now }).eq('id', record.id as string);
      await logEvent(db, userId, data.id as string, 'created');
      await awardPoints(db, userId, 'capture');
    });

    return NextResponse.json(
      { ok: true, item: publicItem(data as Record<string, unknown>) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    log.error('token drop failed', { route: 'capture:token-drop', ...errorFields(err) });
    return fail(500, 'That did not go through.');
  }
}
