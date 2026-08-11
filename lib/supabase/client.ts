'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Browser Supabase client. Only ever sees the anon key, and every query it
 * makes is filtered by RLS. Guest mode never constructs one of these.
 */
let cached: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!cached) {
    cached = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
      auth: {
        // Sessions persist until an explicit Sign out.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return cached;
}
