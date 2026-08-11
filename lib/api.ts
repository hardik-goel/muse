import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { checkRateLimit, type LimitScope } from '@/lib/rate-limit';
import { log, errorFields } from '@/lib/logger';

export type Db = SupabaseClient;

export interface RouteContext<P = unknown> {
  user: User;
  db: Db;
  request: NextRequest;
  /** Resolved dynamic segment params, for routes that have them. */
  params: P;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Parses and validates a JSON body. Throws ApiError(400) with field detail.
 *
 * Generic over the schema rather than its output type, so that `.default()`
 * and `.transform()` are reflected in what the caller receives — a defaulted
 * field is required on the way out, not `T | undefined`.
 */
export async function parseBody<S extends ZodTypeAny>(
  request: NextRequest,
  schema: S,
): Promise<output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, 'Expected a JSON body.');
  }
  try {
    return schema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ApiError(400, err.issues[0]?.message ?? 'Invalid input.', {
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    throw err;
  }
}

export function parseQuery<S extends ZodTypeAny>(request: NextRequest, schema: S): output<S> {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  try {
    return schema.parse(params);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ApiError(400, err.issues[0]?.message ?? 'Invalid query.');
    }
    throw err;
  }
}

interface HandlerOptions {
  scope?: LimitScope;
  route: string;
}

/**
 * Wraps a route handler with: session resolution, per-user rate limiting,
 * structured logging, and uniform error shaping. Any handler that needs a user
 * goes through here — there is no second auth path.
 */
export function withUser<P = Record<string, never>>(
  options: HandlerOptions,
  handler: (ctx: RouteContext<P>) => Promise<NextResponse>,
) {
  // The second argument is declared (not optional) because Next validates every
  // exported handler against its generated RouteContext, which always has it.
  // Static routes simply receive an empty params object.
  return async function route(
    request: NextRequest,
    segment: { params: Promise<P> },
  ): Promise<NextResponse> {
    const started = Date.now();
    const { route: routeName, scope = 'general' } = options;

    try {
      const db = await supabaseServer();
      const {
        data: { user },
        error,
      } = await db.auth.getUser();

      if (error || !user) {
        return fail(401, 'Sign in to continue.');
      }

      const limit = await checkRateLimit(scope, user.id);
      if (!limit.allowed) {
        log.warn('rate limited', { route: routeName, userId: user.id, status: 429 });
        return NextResponse.json(
          { error: 'Slow down a moment.' },
          { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
        );
      }

      const params = ((await segment?.params) ?? {}) as P;
      const response = await handler({ user, db, request, params });
      log.info('request', {
        route: routeName,
        userId: user.id,
        status: response.status,
        durationMs: Date.now() - started,
      });
      return response;
    } catch (err) {
      if (err instanceof ApiError) {
        log.warn('request failed', {
          route: routeName,
          status: err.status,
          durationMs: Date.now() - started,
          ...errorFields(err),
        });
        return fail(err.status, err.message, err.extra);
      }
      log.error('unhandled route error', {
        route: routeName,
        status: 500,
        durationMs: Date.now() - started,
        ...errorFields(err),
      });
      return fail(500, 'Something broke on our side. Your input is safe.');
    }
  };
}

/**
 * Personal data must never sit in a shared cache. Every authenticated JSON
 * response goes out with this.
 */
export function okPrivate<T>(data: T): NextResponse {
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

/**
 * Cron and webhook callers have no session. They authenticate with a shared
 * secret compared in constant time, so a timing oracle cannot recover it.
 */
export function assertCronSecret(request: NextRequest, secret: string): void {
  if (!secret) throw new ApiError(503, 'Scheduled jobs are not configured.');

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : (request.headers.get('x-cron-secret') ?? '');

  if (!timingSafeEqual(provided, secret)) throw new ApiError(401, 'Not for you.');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Client IP for unauthenticated routes, behind Vercel's proxy headers. */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}
