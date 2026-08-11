import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv, serverEnv } from '@/lib/env';

/**
 * Request-scoped Supabase client for Server Components and Route Handlers.
 * Carries the user's session cookie, so RLS applies exactly as it would in the
 * browser. This is the default client for anything user-facing.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where cookies are read-only.
          // Session refresh is handled by middleware, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS entirely — use only for:
 *   - cron fan-out across users
 *   - webhook handlers with no user session (Razorpay)
 *   - the admin dashboard's aggregate reads
 *   - capture-token routes, after the token has been resolved to a user
 * Every call site must scope its own queries by user_id manually.
 */
export function supabaseAdmin() {
  const key = serverEnv.serviceRoleKey;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createServerClient(publicEnv.supabaseUrl, key, {
    cookies: {
      getAll: () => [],
      setAll: () => undefined,
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
