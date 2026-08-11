import { serverEnv } from '@/lib/env';
import { log, errorFields } from '@/lib/logger';

/**
 * Transactional email, used only for the opt-in weekly digest.
 *
 * With no RESEND_API_KEY the send is logged and reported as skipped rather than
 * failing — a developer clone should be able to exercise the digest job without
 * an email provider, and without silently pretending mail went out.
 */

export function emailEnabled(): boolean {
  return Boolean(serverEnv.email.resendKey);
}

export interface Email {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(email: Email): Promise<{ sent: boolean; reason?: string }> {
  if (!emailEnabled()) {
    log.info('email skipped: no provider configured', { to: hash(email.to), subject: email.subject });
    return { sent: false, reason: 'not-configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.email.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: serverEnv.email.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      log.warn('email: provider rejected', { status: res.status, to: hash(email.to) });
      return { sent: false, reason: `status-${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    log.warn('email: send failed', errorFields(err));
    return { sent: false, reason: 'error' };
  }
}

/** Addresses never appear in logs in the clear. */
function hash(address: string): string {
  const [name, domain] = address.split('@');
  return `${(name ?? '').slice(0, 2)}***@${domain ?? ''}`;
}

export interface DigestInput {
  name: string;
  done: number;
  captured: number;
  inboxWaiting: number;
  reflection: string;
  appUrl: string;
}

/** Plain text, in voice. No images, no tracking pixel, nothing to unsubscribe from twice. */
export function digestEmail(input: DigestInput): { subject: string; text: string; html: string } {
  const subject =
    input.done === 0
      ? 'Nothing finished this week'
      : `${input.done} finished this week`;

  const lines = [
    input.name ? `${input.name},` : 'Hello,',
    '',
    input.reflection,
    '',
    `Captured: ${input.captured}. Waiting on a decision: ${input.inboxWaiting}.`,
    '',
    `Open Muse: ${input.appUrl}/pulse`,
    '',
    'You can turn this email off in Settings → Nudges.',
  ];

  const text = lines.join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;color:#211a1f;line-height:1.6">${lines
    .map((line) => (line ? `<p style="margin:0 0 12px">${escapeHtml(line)}</p>` : ''))
    .join('')}</div>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
