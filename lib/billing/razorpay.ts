import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { log, errorFields } from '@/lib/logger';

/**
 * Razorpay subscriptions, in INR.
 *
 * Everything here degrades to "not configured" rather than throwing at import
 * time, because a developer clone with no billing keys must still run the whole
 * product — Plans simply offers the trial instead of a checkout.
 */

export function billingConfigured(): boolean {
  const { keyId, keySecret, planId } = serverEnv.razorpay;
  return Boolean(keyId && keySecret && planId);
}

const API = 'https://api.razorpay.com/v1';

function authHeader(): string {
  const { keyId, keySecret } = serverEnv.razorpay;
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

export interface CreatedSubscription {
  id: string;
  status: string;
  shortUrl: string | null;
}

/** Twelve monthly cycles; Razorpay requires a finite count on a plan like this. */
export async function createSubscription(
  email: string,
  userId: string,
): Promise<CreatedSubscription> {
  const res = await fetch(`${API}/subscriptions`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: serverEnv.razorpay.planId,
      total_count: 12,
      customer_notify: 1,
      // The webhook is the source of truth and arrives without a session, so
      // the user id has to ride along on the subscription itself.
      notes: { user_id: userId, email },
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    log.error('razorpay: subscription create failed', { status: res.status, body: body.slice(0, 300) });
    throw new Error('Could not start that subscription.');
  }

  const body = (await res.json()) as { id: string; status: string; short_url?: string };
  return { id: body.id, status: body.status, shortUrl: body.short_url ?? null };
}

export async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      // Cancel at the end of the paid period — they bought the month.
      body: JSON.stringify({ cancel_at_cycle_end: 1 }),
      cache: 'no-store',
    });
    return res.ok;
  } catch (err) {
    log.error('razorpay: cancel failed', errorFields(err));
    return false;
  }
}

/**
 * Verifies the webhook HMAC over the exact raw body. Comparing the parsed and
 * re-serialised JSON would not match, so callers must pass the original text.
 */
export function verifyWebhook(rawBody: string, signature: string): boolean {
  const secret = serverEnv.razorpay.webhookSecret;
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export interface SubscriptionEvent {
  event: string;
  subscriptionId: string | null;
  userId: string | null;
  status: string | null;
  currentEnd: string | null;
}

/** Pulls the four fields we act on out of Razorpay's envelope. */
export function parseSubscriptionEvent(payload: unknown): SubscriptionEvent | null {
  const body = payload as {
    event?: string;
    payload?: {
      subscription?: {
        entity?: {
          id?: string;
          status?: string;
          current_end?: number;
          notes?: Record<string, string>;
        };
      };
    };
  };

  const entity = body.payload?.subscription?.entity;
  if (!body.event || !entity) return null;

  return {
    event: body.event,
    subscriptionId: entity.id ?? null,
    userId: entity.notes?.user_id ?? null,
    status: entity.status ?? null,
    currentEnd: entity.current_end ? new Date(entity.current_end * 1000).toISOString() : null,
  };
}

/** Razorpay's subscription states, mapped onto the four this product knows. */
export function planStatusFor(razorpayStatus: string | null): string {
  switch (razorpayStatus) {
    case 'active':
    case 'authenticated':
      return 'active';
    case 'pending':
    case 'halted':
      return 'past_due';
    case 'cancelled':
    case 'completed':
    case 'expired':
      return 'cancelled';
    case 'created':
      return 'none';
    default:
      return 'none';
  }
}
