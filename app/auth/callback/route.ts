import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { log, errorFields } from '@/lib/logger';

/**
 * OAuth and email-link landing. Exchanges the code for a session cookie, then
 * forwards to the requested path. `next` is validated as a same-origin path so
 * this can never be turned into an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/now';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/now';

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  try {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      log.warn('auth callback: exchange failed', { route: 'auth/callback', ...errorFields(error) });
      return NextResponse.redirect(`${origin}/sign-in?error=link_expired`);
    }
  } catch (err) {
    log.error('auth callback: unexpected failure', { route: 'auth/callback', ...errorFields(err) });
    return NextResponse.redirect(`${origin}/sign-in?error=unknown`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
