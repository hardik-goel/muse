import type { SupabaseClient } from '@supabase/supabase-js';
import { flagEnv } from '@/lib/env';

type Db = SupabaseClient;

/**
 * Feature flags are global rows read per environment. They exist so a feature
 * whose quality slips — Threads, semantic duplicates, the email digest — can be
 * switched off with an UPDATE instead of a deploy.
 */
export async function loadFlags(db: Db): Promise<Record<string, boolean>> {
  const { data } = await db.from('feature_flags').select('key, enabled').eq('env', flagEnv);

  const flags: Record<string, boolean> = {};
  for (const row of data ?? []) {
    flags[(row as { key: string }).key] = Boolean((row as { enabled: boolean }).enabled);
  }
  return flags;
}

export async function isFlagOn(db: Db, key: string): Promise<boolean> {
  const { data } = await db
    .from('feature_flags')
    .select('enabled')
    .eq('env', flagEnv)
    .eq('key', key)
    .maybeSingle();

  return Boolean(data?.enabled);
}
