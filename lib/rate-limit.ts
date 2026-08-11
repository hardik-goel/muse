import { supabaseAdmin } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { log, errorFields } from '@/lib/logger';

export type LimitScope = 'general' | 'ai' | 'capture-token';

function limitFor(scope: LimitScope): number {
  const limits = serverEnv.rateLimits;
  if (scope === 'ai') return limits.ai;
  if (scope === 'capture-token') return limits.captureToken;
  return limits.general;
}

/** Fixed one-minute windows. Bucket key includes the minute so it self-expires. */
function bucketKey(scope: LimitScope, identity: string, now: Date): string {
  const minute = Math.floor(now.getTime() / 60_000);
  return `${scope}:${identity}:${minute}`;
}

async function upstashAllow(bucket: string, limit: number): Promise<boolean | null> {
  const { url, token } = serverEnv.upstash;
  if (!url || !token) return null;

  try {
    // INCR then EXPIRE — two commands, pipelined.
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', bucket],
        ['EXPIRE', bucket, '120'],
      ]),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Array<{ result?: number }>;
    const count = body[0]?.result;
    if (typeof count !== 'number') return null;
    return count <= limit;
  } catch (err) {
    log.warn('rate limit: upstash unavailable, falling back to postgres', errorFields(err));
    return null;
  }
}

async function postgresAllow(bucket: string, limit: number): Promise<boolean> {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.rpc('bump_rate_limit', {
      p_bucket: bucket,
      p_limit: limit,
    });
    if (error) throw error;
    return data !== false;
  } catch (err) {
    // A limiter outage must not take the product down. Fail open, but say so.
    log.error('rate limit: postgres limiter failed, allowing request', errorFields(err));
    return true;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Per-user, per-scope limiter. Uses Upstash when configured, Postgres otherwise.
 * `identity` is the user id, or the client IP for unauthenticated routes.
 */
export async function checkRateLimit(
  scope: LimitScope,
  identity: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const limit = limitFor(scope);
  const bucket = bucketKey(scope, identity, now);
  const retryAfterSeconds = 60 - Math.floor((now.getTime() % 60_000) / 1000);

  const viaUpstash = await upstashAllow(bucket, limit);
  const allowed = viaUpstash ?? (await postgresAllow(bucket, limit));

  return { allowed, limit, retryAfterSeconds };
}
