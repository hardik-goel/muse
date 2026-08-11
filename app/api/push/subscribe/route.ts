import { z } from 'zod';
import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { zPushSubscribe } from '@/lib/zod-schemas';
import { markChecklist } from '@/lib/server/items';
import { pushEnabled, sendToUser } from '@/lib/push';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** GET — tells the client whether push is configured, and with which key. */
export const GET = withUser({ route: 'push:config' }, async () =>
  okPrivate({ enabled: pushEnabled(), publicKey: publicEnv.vapidPublicKey }),
);

/** POST — registers this browser. Re-subscribing is an update, not a duplicate. */
export const POST = withUser({ route: 'push:subscribe' }, async ({ db, user, request }) => {
  if (!pushEnabled()) throw new ApiError(503, 'Nudges are not configured yet.');

  const subscription = await parseBody(request, zPushSubscribe);

  const { error } = await db.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: request.headers.get('user-agent')?.slice(0, 200) ?? null,
    },
    { onConflict: 'user_id,endpoint' },
  );

  if (error) throw new ApiError(500, 'Could not turn nudges on.');

  await markChecklist(db, user.id, 'enable_notifications');

  // One confirmation push, so "on" is something the person can see rather than
  // a claim they have to trust until 07:30 tomorrow.
  await sendToUser(db, user.id, {
    title: 'Nudges are on.',
    body: 'You will hear from Muse in the morning, not all day.',
    tag: 'muse-welcome',
  });

  return okPrivate({ ok: true });
});

const zUnsubscribe = z.object({ endpoint: z.string().url().max(2000) });

export const DELETE = withUser({ route: 'push:unsubscribe' }, async ({ db, user, request }) => {
  const { endpoint } = await parseBody(request, zUnsubscribe);

  await db
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  return okPrivate({ ok: true });
});
