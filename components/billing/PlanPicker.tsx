'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface BillingState {
  plan: 'free' | 'intelligence';
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  trialAvailable: boolean;
  checkoutAvailable: boolean;
  keyId: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/**
 * The upgrade control.
 *
 * Two doors: a fourteen-day trial with no card, and a Razorpay subscription.
 * The client never grants the plan — checkout only opens the sheet, and the
 * webhook is what actually flips the row.
 */
export function PlanPicker() {
  const router = useRouter();
  const toast = useToast();

  const [state, setState] = useState<BillingState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/billing/checkout')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: BillingState) => {
        if (!cancelled) setState(data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  async function start(mode: 'trial' | 'subscribe') {
    setBusy(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        kind?: 'trial' | 'subscription';
        subscriptionId?: string;
        keyId?: string;
        shortUrl?: string;
        days?: number;
      };

      if (!res.ok) throw new Error(body.error ?? 'Could not start that.');

      if (body.kind === 'trial') {
        toast.push({ message: `Intelligence on for ${body.days} days.`, tone: 'good' });
        router.push('/now');
        router.refresh();
        return;
      }

      await openCheckout(body.subscriptionId as string, body.keyId as string, body.shortUrl ?? null);
    } catch (err) {
      toast.push({
        message: err instanceof Error ? err.message : 'Could not start that.',
        tone: 'bad',
      });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    const res = await fetch('/api/billing/checkout', { method: 'DELETE' });
    setBusy(false);

    if (!res.ok) {
      toast.push({ message: 'Could not reach billing. Nothing changed.', tone: 'bad' });
      return;
    }

    toast.push({ message: 'Cancelled. Everything stays where it is.' });
    router.refresh();
    setState((current) => (current ? { ...current, plan: 'free', status: 'cancelled' } : current));
  }

  if (!state) {
    return <div className="h-11 animate-pulse rounded-pill bg-black/20" aria-hidden="true" />;
  }

  if (state.plan === 'intelligence' && state.status !== 'cancelled') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-soft">
          {state.status === 'trialing' && state.trialEndsAt
            ? `Trial runs until ${new Date(state.trialEndsAt).toLocaleDateString()}.`
            : state.currentPeriodEnd
              ? `Renews ${new Date(state.currentPeriodEnd).toLocaleDateString()}.`
              : 'Active.'}
        </p>

        {state.status === 'trialing' && state.checkoutAvailable ? (
          <Button busy={busy} onClick={() => void start('subscribe')}>
            Subscribe now
          </Button>
        ) : null}

        <Button variant="ghost" busy={busy} onClick={() => void cancel()}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {state.trialAvailable ? (
        <Button busy={busy} onClick={() => void start('trial')} data-testid="start-trial">
          Try it free for 14 days
        </Button>
      ) : null}

      {state.checkoutAvailable ? (
        <Button
          variant={state.trialAvailable ? 'secondary' : 'primary'}
          busy={busy}
          onClick={() => void start('subscribe')}
        >
          Subscribe
        </Button>
      ) : !state.trialAvailable ? (
        <p className="text-sm text-soft">
          Card payments are not switched on for this deployment yet.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Loads Razorpay's checkout on demand. If the script is blocked — an extension,
 * a strict network — the hosted short URL is the fallback rather than a dead
 * button.
 */
async function openCheckout(
  subscriptionId: string,
  keyId: string,
  shortUrl: string | null,
): Promise<void> {
  const loaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');

  if (!loaded || !window.Razorpay) {
    if (shortUrl) window.location.href = shortUrl;
    return;
  }

  const checkout = new window.Razorpay({
    key: keyId,
    subscription_id: subscriptionId,
    name: 'Muse',
    description: 'Intelligence',
    theme: { color: '#A05266' },
    // No success handler writes the plan: the webhook does. This only returns
    // the person to the app.
    callback_url: `${window.location.origin}/now`,
    redirect: false,
  });

  checkout.open();
}

function loadScript(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}
