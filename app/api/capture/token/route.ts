import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { zCaptureTokenCreate } from '@/lib/zod-schemas';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Capture tokens power Siri Shortcuts and email-in: a long-lived bearer secret
 * that can create items and do nothing else.
 *
 * Only the SHA-256 hash is stored. The plaintext is returned exactly once, at
 * creation, and cannot be recovered — losing it means minting a new one.
 */

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const GET = withUser({ route: 'capture:tokens' }, async ({ db, user }) => {
  const { data } = await db
    .from('capture_tokens')
    .select('id, label, last_used_at, created_at, revoked_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  return okPrivate({ tokens: data ?? [], endpoint: `${publicEnv.appUrl}/api/capture/token-drop` });
});

export const POST = withUser({ route: 'capture:token:create' }, async ({ db, user, request }) => {
  const { label } = await parseBody(request, zCaptureTokenCreate);

  const { count } = await db
    .from('capture_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('revoked_at', null);

  if ((count ?? 0) >= 10) throw new ApiError(400, 'Ten shortcuts is plenty. Revoke one first.');

  const token = randomBytes(32).toString('base64url');

  const { data, error } = await db
    .from('capture_tokens')
    .insert({ user_id: user.id, token_hash: hashToken(token), label })
    .select('id, label, created_at')
    .single();

  if (error || !data) throw new ApiError(500, 'Could not make that token.');

  return okPrivate({
    token,
    record: data,
    endpoint: `${publicEnv.appUrl}/api/capture/token-drop`,
  });
});

const zRevoke = z.object({ id: z.string().uuid() });

export const DELETE = withUser({ route: 'capture:token:revoke' }, async ({ db, user, request }) => {
  const { id } = await parseBody(request, zRevoke);

  await db
    .from('capture_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('id', id);

  return okPrivate({ ok: true });
});
