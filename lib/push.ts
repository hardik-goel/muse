import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';
import { log, errorFields } from '@/lib/logger';
import type { NotifPrefs } from '@/lib/types';

type Db = SupabaseClient;

/**
 * Web Push. Every send goes through here so three rules hold everywhere:
 *   - the master switch is checked before the per-channel preference
 *   - a subscription the browser has revoked (404/410) is deleted, not retried
 *   - a missing VAPID key disables notifications rather than throwing
 */

let configured: boolean | null = null;

function ready(): boolean {
  if (configured !== null) return configured;

  const { publicKey, privateKey, subject } = serverEnv.vapid;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (err) {
    log.error('push: invalid VAPID configuration', errorFields(err));
    configured = false;
  }
  return configured;
}

export function pushEnabled(): boolean {
  return ready();
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where the notification click lands. Always a same-origin path. */
  url?: string;
  tag?: string;
}

export type NotifChannel = keyof NotifPrefs;

export interface SendResult {
  sent: number;
  removed: number;
}

/**
 * Sends one message to every device a user has registered. Returns counts
 * rather than throwing: a cron fan-out must not stop because one device is
 * unreachable.
 */
export async function sendToUser(
  db: Db,
  userId: string,
  message: PushMessage,
): Promise<SendResult> {
  if (!ready()) return { sent: 0, removed: 0 };

  const { data: subscriptions } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subscriptions || subscriptions.length === 0) return { sent: 0, removed: 0 };

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url ?? '/now',
    tag: message.tag ?? 'muse',
  });

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint as string,
            keys: { p256dh: row.p256dh as string, auth: row.auth as string },
          },
          payload,
          { TTL: 3600 },
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(row.id as string);
        else log.warn('push: send failed', { userId, status, ...errorFields(err) });
      }
    }),
  );

  if (dead.length > 0) {
    await db.from('push_subscriptions').delete().in('id', dead);
  }

  return { sent, removed: dead.length };
}

/** True when this user wants this specific nudge right now. */
export function wantsChannel(
  settings: { notif_master: boolean; notif_prefs: NotifPrefs },
  channel: NotifChannel,
): boolean {
  if (!settings.notif_master) return false;
  return Boolean(settings.notif_prefs?.[channel]);
}
