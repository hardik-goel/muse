import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseSubscriptionEvent, planStatusFor, verifyWebhook } from '@/lib/billing/razorpay';
import { log, errorFields } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/billing/webhook — the only thing that grants or revokes a plan.
 *
 * Unauthenticated by necessity, so the HMAC over the raw body is the entire
 * security boundary. The body is read as text and verified before it is parsed;
 * re-serialised JSON would not match the signature.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';

  if (!verifyWebhook(raw, signature)) {
    log.warn('billing webhook: bad signature', { route: 'billing:webhook' });
    return NextResponse.json({ error: 'Bad signature.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad payload.' }, { status: 400 });
  }

  const event = parseSubscriptionEvent(payload);
  if (!event) return NextResponse.json({ ok: true, ignored: true });

  let db;
  try {
    db = supabaseAdmin();
  } catch {
    // Returning 500 makes Razorpay retry, which is what we want if this is a
    // temporary misconfiguration rather than a bad event.
    return NextResponse.json({ error: 'Not configured.' }, { status: 500 });
  }

  try {
    // The user id travels in the subscription notes, but a replayed or
    // hand-crafted event could carry any id — so it is only trusted when the
    // stored subscription id matches too.
    let userId = event.userId;

    if (event.subscriptionId) {
      const { data } = await db
        .from('user_settings')
        .select('user_id')
        .eq('razorpay_subscription_id', event.subscriptionId)
        .maybeSingle();
      if (data?.user_id) userId = data.user_id as string;
    }

    if (!userId) {
      log.warn('billing webhook: no user for event', { event: event.event });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const status = planStatusFor(event.status);
    const active = status === 'active';

    await db
      .from('user_settings')
      .update({
        plan: active ? 'intelligence' : 'free',
        plan_status: status,
        current_period_end: event.currentEnd,
        razorpay_subscription_id: event.subscriptionId,
        // Switching Intelligence on for someone who just paid is the expected
        // behaviour; switching it off on lapse keeps the promise that a lapsed
        // plan quietly returns Local mode with every item intact.
        ...(active ? { ai_enabled: true } : { ai_enabled: false }),
      })
      .eq('user_id', userId);

    await db.from('events').insert({
      user_id: userId,
      name: 'billing_webhook',
      props: { event: event.event, status },
    });

    log.info('billing webhook applied', { route: 'billing:webhook', userId, planStatus: status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error('billing webhook failed', { route: 'billing:webhook', ...errorFields(err) });
    return NextResponse.json({ error: 'Failed.' }, { status: 500 });
  }
}
