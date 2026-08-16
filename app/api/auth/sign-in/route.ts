import { type NextRequest, NextResponse } from 'next/server';
import { fail, ok, parseBody, clientIp } from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabaseServer } from '@/lib/supabase/server';
import { zSignIn } from '@/lib/zod-schemas';
import { log, errorFields } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/sign-in — the same-origin front door for signing in.
 *
 * Exists for the same reason as the sign-up proxy: a browser that cannot reach
 * `*.supabase.co` could not sign in either, and the failure looked like a
 * broken product rather than a blocked domain. See that route for the full
 * account.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = clientIp(request);

  const limit = await checkRateLimit('general', `ip:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body;
  try {
    body = await parseBody(request, zSignIn);
  } catch (err) {
    return fail(400, err instanceof Error ? err.message : 'Check the form and try again.');
  }

  try {
    const db = await supabaseServer();
    const { error } = await db.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) {
      log.warn('sign-in refused', {
        route: 'auth/sign-in',
        status: error.status ?? 400,
      });
      // Deliberately one message for both a wrong password and an address that
      // has no account: telling them apart is a way to enumerate users.
      return fail(400, 'That email and password do not match.');
    }

    return ok({ signedIn: true });
  } catch (err) {
    log.error('sign-in failed', { route: 'auth/sign-in', ...errorFields(err) });
    return fail(502, 'Could not reach the server. Check your connection and try again.');
  }
}
