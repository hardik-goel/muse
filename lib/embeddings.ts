import type { SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';
import { log, errorFields } from '@/lib/logger';
import { truncate } from '@/lib/utils';
import { SEMANTIC_THRESHOLD, type DupeHit } from '@/lib/dupe';

type Db = SupabaseClient;

/**
 * Embeddings are strictly an upgrade, never a dependency.
 *
 * With a provider key configured, items get a vector and two features switch
 * on: semantic duplicate detection (cosine > 0.9) and the "related" rail in the
 * detail view. With no key, both quietly do nothing and the cheaper signals in
 * lib/dupe.ts carry the product on their own.
 */

export function embeddingsEnabled(): boolean {
  const { provider, voyageKey } = serverEnv.embeddings;
  if (provider === 'none') return false;
  if (provider === 'voyage') return Boolean(voyageKey);
  return false;
}

/** Returns null on any failure — a missing vector is never an error. */
export async function embed(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;

  const { model, voyageKey, dimension } = serverEnv.embeddings;
  const input = truncate(text.trim(), 8000);
  if (!input) return null;

  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${voyageKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: [input], input_type: 'document' }),
      cache: 'no-store',
    });

    if (!res.ok) {
      log.warn('embeddings: provider rejected request', { status: res.status });
      return null;
    }

    const body = (await res.json()) as { data?: { embedding?: number[] }[] };
    const vector = body.data?.[0]?.embedding;
    if (!Array.isArray(vector)) return null;

    // A dimension mismatch would be silently truncated by Postgres or rejected
    // at insert; catching it here keeps the failure legible.
    if (vector.length !== dimension) {
      log.warn('embeddings: dimension mismatch', { got: vector.length, want: dimension });
      return null;
    }

    return vector;
  } catch (err) {
    log.warn('embeddings: call failed', errorFields(err));
    return null;
  }
}

export async function storeEmbedding(db: Db, itemId: string, vector: number[]): Promise<void> {
  const { error } = await db.from('items').update({ embedding: vector }).eq('id', itemId);
  if (error) log.warn('embeddings: could not store vector', { itemId, ...errorFields(error) });
}

export interface SemanticMatch {
  id: string;
  title: string;
  summary: string;
  similarity: number;
}

export async function matchItems(
  db: Db,
  userId: string,
  vector: number[],
  options: { threshold?: number; limit?: number; excludeId?: string } = {},
): Promise<SemanticMatch[]> {
  const { data, error } = await db.rpc('match_items', {
    p_user_id: userId,
    p_embedding: vector as unknown as string,
    p_threshold: options.threshold ?? 0.78,
    p_limit: options.limit ?? 5,
    p_exclude_id: options.excludeId ?? null,
  });

  if (error) {
    log.warn('embeddings: match_items failed', errorFields(error));
    return [];
  }
  return (data ?? []) as SemanticMatch[];
}

/**
 * The third duplicate signal, layered on top of URL and title matching. Only
 * fires above 0.9 — below that, two items are related, not the same thing.
 */
export async function semanticDuplicate(
  db: Db,
  userId: string,
  vector: number[],
): Promise<DupeHit | null> {
  const matches = await matchItems(db, userId, vector, {
    threshold: SEMANTIC_THRESHOLD,
    limit: 1,
  });

  const best = matches[0];
  if (!best) return null;

  const { data } = await db
    .from('items')
    .select('id,title,created_at,thumb_url,url')
    .eq('user_id', userId)
    .eq('id', best.id)
    .maybeSingle();

  if (!data) return null;

  return {
    item: data as DupeHit['item'],
    reason: 'semantic',
    confidence: best.similarity,
  };
}
