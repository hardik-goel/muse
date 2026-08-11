import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, assertCronSecret, fail } from '@/lib/api';
import { serverEnv } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/server';
import { log, errorFields } from '@/lib/logger';
import { runBriefs, runMaintenance, runNudges, runWeeklyDigest } from '@/lib/server/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const JOBS = ['brief', 'nudges', 'digest', 'maintenance'] as const;
type Job = (typeof JOBS)[number];

/**
 * GET /api/cron?job=… — the scheduler's only entry point.
 *
 * Authenticated with a shared secret, not a session. Vercel Cron sends it as a
 * bearer token; pg_cron on hosted Supabase sends the same header. Each job is
 * idempotent, because at-least-once delivery is the only guarantee either one
 * offers.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const started = Date.now();

  try {
    assertCronSecret(request, serverEnv.cronSecret);
  } catch (err) {
    if (err instanceof ApiError) return fail(err.status, err.message);
    return fail(401, 'Not for you.');
  }

  const job = request.nextUrl.searchParams.get('job') as Job | null;
  if (!job || !JOBS.includes(job)) {
    return fail(400, `job must be one of: ${JOBS.join(', ')}`);
  }

  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return fail(503, 'Scheduled jobs need the service role key.');
  }

  try {
    const result =
      job === 'brief'
        ? await runBriefs(db)
        : job === 'nudges'
          ? await runNudges(db)
          : job === 'digest'
            ? await runWeeklyDigest(db)
            : await runMaintenance(db);

    log.info('cron job complete', { route: `cron:${job}`, durationMs: Date.now() - started, ...result });
    return NextResponse.json({ ok: true, job, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    log.error('cron job failed', { route: `cron:${job}`, ...errorFields(err) });
    return fail(500, 'That job did not finish.');
  }
}

/** Vercel Cron issues GET; POST is accepted so pg_cron's http_post also works. */
export const POST = GET;
