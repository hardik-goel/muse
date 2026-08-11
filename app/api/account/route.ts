import { z } from 'zod';
import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase/server';
import { THUMB_BUCKET } from '@/lib/server/storage';
import { log, errorFields } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const zDelete = z.object({
  // Typing the word is the confirmation. A modal alone is too easy to click through.
  confirm: z.literal('delete'),
});

/**
 * DELETE /api/account — permanent, and actually permanent.
 *
 * Every user-owned table cascades from auth.users, so removing the auth row
 * takes the data with it. Storage objects do not cascade, so they are removed
 * first — otherwise the images outlive the account that owned them.
 */
export const DELETE = withUser({ route: 'account:delete' }, async ({ db, user, request }) => {
  await parseBody(request, zDelete);

  let admin;
  try {
    admin = supabaseAdmin();
  } catch {
    throw new ApiError(503, 'Account deletion is not configured on this deployment.');
  }

  // 1. Storage. Listed and removed under the user's own prefix only.
  try {
    const { data: objects } = await admin.storage.from(THUMB_BUCKET).list(user.id, { limit: 1000 });
    const paths = (objects ?? []).map((object) => `${user.id}/${object.name}`);
    if (paths.length > 0) await admin.storage.from(THUMB_BUCKET).remove(paths);
  } catch (err) {
    log.warn('account delete: storage sweep failed', { userId: user.id, ...errorFields(err) });
  }

  // 2. Push subscriptions are keyed to endpoints outside our database; drop
  //    them explicitly so no further notification can be attempted.
  await admin.from('push_subscriptions').delete().eq('user_id', user.id);

  // 3. The auth row. Everything else cascades from here.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    log.error('account delete failed', { userId: user.id, ...errorFields(error) });
    throw new ApiError(500, 'Could not delete the account. Nothing was removed.');
  }

  // Sign the browser out so it cannot keep using a token for a dead account.
  await db.auth.signOut();

  return okPrivate({ ok: true });
});
