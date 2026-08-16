import { type NextRequest, NextResponse } from 'next/server';
import { fail, ok, parseBody, clientIp } from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabaseServer } from '@/lib/supabase/server';
import { zSignUp } from '@/lib/zod-schemas';
import { publicEnv } from '@/lib/env';
import { log, errorFields } from '@/lib/logger';
import { signUpErrorMessage } from '@/lib/auth-errors';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/sign-up — the same-origin front door for account creation.
 *
 * The browser used to call Supabase directly, which meant anything that could
 * not resolve or reach `*.supabase.co` — a filtering DNS resolver, a mobile
 * carrier, a content blocker, iCloud Private Relay — failed the sign-up with a
 * bare "Load failed" and no way around it. Reported from a real phone on a real
 * network, on a build where the service itself was demonstrably healthy.
 *
 * Routing it through this app's own origin removes that entire class of
 * failure: the browser only ever talks to the host it already loaded the page
 * from. The Supabase call now happens server side, where the network is ours.
 *
 * The session cookie is written by the SSR client's cookie adapter, so a
 * confirmed sign-up lands signed in exactly as the direct call did.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = clientIp(request);

  // Anonymous, so the limiter is keyed by address rather than user. This is the
  // only thing standing between an open sign-up endpoint and a scripted flood.
  const limit = await checkRateLimit('general', `ip:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body;
  try {
    body = await parseBody(request, zSignUp);
  } catch (err) {
    return fail(400, err instanceof Error ? err.message : 'Check the form and try again.');
  }

  const { email, password, name, timezone, next } = body;

  try {
    const db = await supabaseServer();
    const redirectPath = next?.startsWith('/') && !next.startsWith('//') ? next : '/onboarding';

    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: { name: name ?? '', timezone: timezone ?? 'Asia/Kolkata' },
        emailRedirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
      },
    });

    if (error) {
      // Logged with the status but without the address: a sign-up log that
      // accumulates email addresses is a liability, not an aid.
      log.warn('sign-up refused', {
        route: 'auth/sign-up',
        status: error.status ?? 400,
        ...errorFields(error),
      });
      return fail(error.status ?? 400, signUpErrorMessage(error.message));
    }

    // No session means confirmation is switched on and the account is waiting
    // on an emailed link. With confirmation off, the cookie is already set.
    return ok({ confirmed: Boolean(data.session), email });
  } catch (err) {
    log.error('sign-up failed', { route: 'auth/sign-up', ...errorFields(err) });
    return fail(502, 'Could not reach the server. Check your connection and try again.');
  }
}
