import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Two jobs, in order:
 *   1. Refresh the Supabase session cookie on every request.
 *   2. Gate the authenticated app.
 *
 * Guest mode is deliberately NOT gated: /guest renders the full client-side app
 * with no account. That is a first-class tier, not a teaser.
 */

const PUBLIC_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/reset',
  '/auth/callback',
  '/guest',
  '/privacy',
  '/terms',
  '/plans',
  '/api/health',
  // The same-origin front door for sign-up and sign-in. Public by definition:
  // it is what a signed-out visitor uses to stop being one. It does its own
  // per-IP rate limiting, since the usual per-user limiter has no user yet.
  '/api/auth',
  '/api/capture/token-drop',
  '/api/billing/webhook',
  '/api/cron',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline',
];

function isPublic(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    // A signed-in user landing on an auth screen goes straight to the app.
    if (user && (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'))) {
      const url = request.nextUrl.clone();
      url.pathname = '/now';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. Note that image
     * files are excluded so the icon set is served without a session lookup.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)',
  ],
};
