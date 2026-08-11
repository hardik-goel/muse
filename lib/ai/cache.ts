import type { SupabaseClient } from '@supabase/supabase-js';
import { localDate } from '@/lib/utils';
import { log, errorFields } from '@/lib/logger';

type Db = SupabaseClient;

/**
 * Day-scoped cache for expensive AI output.
 *
 * The Morning Brief is written once per local day and re-read on every render
 * of Now; the reflection and threads follow the same pattern on their own
 * cadences. Without this, opening the app five times before breakfast costs
 * five model calls and produces five slightly different briefs.
 */

export function dayKey(feature: string, timezone: string, now: Date = new Date()): string {
  return `${feature}:${localDate(now, timezone)}`;
}

export async function readCache<T>(db: Db, userId: string, key: string): Promise<T | null> {
  const { data, error } = await db
    .from('ai_cache')
    .select('payload')
    .eq('user_id', userId)
    .eq('cache_key', key)
    .maybeSingle();

  if (error || !data) return null;
  return data.payload as T;
}

export async function writeCache<T>(db: Db, userId: string, key: string, payload: T): Promise<void> {
  const { error } = await db
    .from('ai_cache')
    .upsert(
      { user_id: userId, cache_key: key, payload, created_at: new Date().toISOString() },
      { onConflict: 'user_id,cache_key' },
    );
  if (error) log.warn('ai cache write failed', { userId, ...errorFields(error) });
}

/** Drops one feature's cached answer so the next read regenerates it. */
export async function bustCache(db: Db, userId: string, key: string): Promise<void> {
  await db.from('ai_cache').delete().eq('user_id', userId).eq('cache_key', key);
}
