'use client';

/**
 * Browser half of Web Push. Kept separate from lib/push.ts so no client bundle
 * ever pulls in the server library or the VAPID private key.
 */

export interface PushResult {
  ok: boolean;
  message: string;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** base64url → Uint8Array, the format applicationServerKey insists on. */
function decodeKey(base64: string): Uint8Array {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const raw = window.atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function subscribeToPush(publicKey: string): Promise<PushResult> {
  if (!pushSupported()) {
    return { ok: false, message: 'This browser cannot do notifications.' };
  }
  if (!publicKey) {
    return { ok: false, message: 'Nudges are not configured on this deployment.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    // A denied permission cannot be re-prompted, so say where the switch lives.
    return {
      ok: false,
      message:
        permission === 'denied'
          ? 'Notifications are blocked for this site in your browser settings.'
          : 'Notifications were not allowed.',
    };
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey) as BufferSource,
      }));

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, message: body.error ?? 'Could not turn nudges on.' };
    }

    return { ok: true, message: 'Nudges on.' };
  } catch {
    return { ok: false, message: 'Could not turn nudges on.' };
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    // Tell the server first: an endpoint we forget about here would keep
    // receiving pushes forever.
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);

    await subscription.unsubscribe();
  } catch {
    /* nothing to clean up */
  }
}
