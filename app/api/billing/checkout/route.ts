import { z } from 'zod';
import { ApiError, okPrivate, parseBody, withUser } from '@/lib/api';
import { billingConfigured, cancelSubscription, createSubscription } from '@/lib/billing/razorpay';
import { loadCaller } from '@/lib/server/caller';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TRIAL_DAYS = 14;

const zStart = z.object({
  mode: z.enum(['trial', 'subscribe']).default('subscribe'),
});

export const GET = withUser({ route: 'billing:state' }, async ({ db, user }) => {
  const caller = await loadCaller(db, user.id);

  return okPrivate({
    plan: caller.settings.plan,
    status: caller.settings.plan_status,
    trialEndsAt: caller.settings.trial_ends_at,
    currentPeriodEnd: caller.settings.current_period_end,
    aiActive: caller.aiActive,
    // A trial is a one-time offer; the UI hides the button once it is spent.
    trialAvailable: !caller.settings.trial_ends_at,
    checkoutAvailable: billingConfigured(),
    keyId: publicEnv.razorpayKeyId,
    priceInr: publicEnv.priceIntelligenceInr,
  });
});

/**
 * POST /api/billing/checkout.
 *
 * Two doors into Intelligence: a fourteen-day trial that needs no card and can
 * only be taken once, and a real Razorpay subscription. On a deployment with no
 * billing keys the trial is the only door, which is what makes a fresh clone
 * fully testable.
 */
export const POST = withUser({ route: 'billing:checkout' }, async ({ db, user, request }) => {
  const { mode } = await parseBody(request, zStart);
  const caller = await loadCaller(db, user.id);

  if (caller.settings.plan_status === 'active') {
    throw new ApiError(400, 'You are already subscribed.');
  }

  if (mode === 'trial' || !billingConfigured()) {
    if (caller.settings.trial_ends_at) {
      throw new ApiError(400, 'That trial has already been used.');
    }

    const endsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();

    const { error } = await db
      .from('user_settings')
      .update({
        plan: 'intelligence',
        plan_status: 'trialing',
        trial_ends_at: endsAt,
        ai_enabled: true,
      })
      .eq('user_id', user.id);

    if (error) throw new ApiError(500, 'Could not start the trial.');

    return okPrivate({ kind: 'trial', trialEndsAt: endsAt, days: TRIAL_DAYS });
  }

  const subscription = await createSubscription(user.email ?? '', user.id);

  await db
    .from('user_settings')
    .update({ razorpay_subscription_id: subscription.id })
    .eq('user_id', user.id);

  // The plan is not granted here. The webhook does that, because a client that
  // says "I paid" is not evidence that anyone paid.
  return okPrivate({
    kind: 'subscription',
    subscriptionId: subscription.id,
    keyId: publicEnv.razorpayKeyId,
    shortUrl: subscription.shortUrl,
  });
});

/** DELETE — cancel at the end of the paid period. Nothing is deleted. */
export const DELETE = withUser({ route: 'billing:cancel' }, async ({ db, user }) => {
  const { data } = await db
    .from('user_settings')
    .select('razorpay_subscription_id, plan_status')
    .eq('user_id', user.id)
    .maybeSingle();

  const subscriptionId = data?.razorpay_subscription_id as string | null;

  if (subscriptionId && billingConfigured()) {
    const ok = await cancelSubscription(subscriptionId);
    if (!ok) throw new ApiError(502, 'Could not reach billing. Nothing was changed.');
  }

  // A trial has no subscription to cancel; ending it is a local write.
  await db
    .from('user_settings')
    .update({ plan_status: 'cancelled', plan: 'free', ai_enabled: false })
    .eq('user_id', user.id);

  return okPrivate({ ok: true });
});
