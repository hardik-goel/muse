import type { SupabaseClient } from '@supabase/supabase-js';
import { serverEnv, publicEnv } from '@/lib/env';
import { log, errorFields } from '@/lib/logger';
import { localDate, localDayOfWeek, localHour, pluralise } from '@/lib/utils';
import { briefLocal, reflectLocal } from '@/lib/local-mode';
import { sendToUser, wantsChannel } from '@/lib/push';
import { digestEmail, sendEmail } from '@/lib/email';
import { isFlagOn } from '@/lib/server/flags';
import type { Item, NotifPrefs, UserSettings } from '@/lib/types';

type Db = SupabaseClient;

/**
 * The scheduled jobs.
 *
 * All four run on the service role across every user, so each one filters by
 * user_id by hand. They are written to be safe to run twice: the schedule only
 * promises at-least-once delivery, and a duplicate nudge is worse than a late
 * one.
 */

interface Recipient {
  userId: string;
  email: string;
  name: string;
  timezone: string;
  settings: UserSettings;
}

/**
 * Everyone with notifications switched on, joined to their profile.
 *
 * The join is done here rather than by PostgREST: `user_settings` and
 * `profiles` both reference `auth.users`, and neither references the other, so
 * there is no foreign key for an embedded select to follow.
 */
async function recipients(db: Db): Promise<Recipient[]> {
  const { data: settings, error } = await db
    .from('user_settings')
    .select('*')
    .eq('notif_master', true);

  if (error) {
    log.error('jobs: could not load recipients', errorFields(error));
    return [];
  }

  const rows = (settings ?? []) as UserSettings[];
  if (rows.length === 0) return [];

  const { data: profiles } = await db
    .from('profiles')
    .select('id, email, name, timezone')
    .in(
      'id',
      rows.map((row) => row.user_id),
    );

  const byId = new Map(
    (profiles ?? []).map((profile) => [
      profile.id as string,
      profile as { email: string; name: string; timezone: string },
    ]),
  );

  return rows.map((row) => {
    const profile = byId.get(row.user_id);
    return {
      userId: row.user_id,
      email: profile?.email ?? '',
      name: profile?.name ?? '',
      timezone: profile?.timezone || serverEnv.defaults.timezone,
      settings: row,
    };
  });
}

async function activeItems(db: Db, userId: string): Promise<Item[]> {
  const { data } = await db
    .from('items')
    .select('id,title,summary,state,type,priority,due_at,created_at,touched_at,done_at,group_id,tags')
    .eq('user_id', userId)
    .limit(500);

  return (data ?? []) as unknown as Item[];
}

/**
 * Delivers the Morning Brief to anyone whose local clock has just reached their
 * chosen time. Runs every fifteen minutes; the ±7 minute window means each user
 * is hit exactly once per day regardless of their offset.
 */
export async function runBriefs(db: Db, now: Date = new Date()): Promise<Record<string, number>> {
  const people = await recipients(db);
  let sent = 0;
  let skipped = 0;

  for (const person of people) {
    if (!wantsChannel(person.settings, 'morning_brief')) {
      skipped += 1;
      continue;
    }

    if (!isDueNow(person.settings.brief_time, person.timezone, now)) {
      skipped += 1;
      continue;
    }

    // One brief per local day, no matter how many times the schedule fires.
    const stamp = `brief-push:${localDate(now, person.timezone)}`;
    if (await alreadyDone(db, person.userId, stamp)) {
      skipped += 1;
      continue;
    }

    const items = await activeItems(db, person.userId);
    const active = items.filter((i) => i.state !== 'done');
    const todos = active
      .filter((i) => i.state === 'todo')
      .sort((a, b) => (a.priority ?? 4) - (b.priority ?? 4));

    const today = now.toDateString();
    const dayOfWeek = localDayOfWeek(now, person.timezone);
    const workout =
      person.settings.workout_enabled && wantsChannel(person.settings, 'workout')
        ? (person.settings.workout_split?.[dayOfWeek] ?? null)
        : null;

    const brief = briefLocal({
      hour: localHour(now, person.timezone),
      firstWin: todos[0] ? { id: todos[0].id, title: todos[0].title } : null,
      dueToday: active.filter((i) => i.due_at && new Date(i.due_at).toDateString() === today).length,
      inMotion: active.filter((i) => i.state === 'doing').length,
      workoutToday: workout,
      workoutWhy: person.settings.workout_why ?? '',
    });

    const result = await sendToUser(db, person.userId, {
      title: brief.greeting,
      body: brief.body,
      url: '/now',
      tag: 'muse-brief',
    });

    if (result.sent > 0) sent += 1;
    await markDone(db, person.userId, stamp);
  }

  return { sent, skipped, considered: people.length };
}

/**
 * Evening pass: the review nudge and the streak guard. Both fire at 20:00 local
 * and are deliberately quiet — at most one notification per person per day.
 */
export async function runNudges(db: Db, now: Date = new Date()): Promise<Record<string, number>> {
  const people = await recipients(db);
  let sent = 0;
  let skipped = 0;

  for (const person of people) {
    const hour = localHour(now, person.timezone);
    if (hour !== 20) {
      skipped += 1;
      continue;
    }

    const stamp = `nudge:${localDate(now, person.timezone)}`;
    if (await alreadyDone(db, person.userId, stamp)) {
      skipped += 1;
      continue;
    }

    const items = await activeItems(db, person.userId);
    const message = await pickNudge(db, person, items, now);

    if (!message) {
      skipped += 1;
      await markDone(db, person.userId, stamp);
      continue;
    }

    const result = await sendToUser(db, person.userId, message);
    if (result.sent > 0) sent += 1;
    await markDone(db, person.userId, stamp);
  }

  return { sent, skipped, considered: people.length };
}

async function pickNudge(
  db: Db,
  person: Recipient,
  items: Item[],
  now: Date,
): Promise<{ title: string; body: string; url: string; tag: string } | null> {
  const { data: stats } = await db
    .from('user_stats')
    .select('daily_streak, last_done_date, last_review_at')
    .eq('user_id', person.userId)
    .maybeSingle();

  const today = localDate(now, person.timezone);
  const streak = (stats?.daily_streak as number) ?? 0;
  const doneToday = stats?.last_done_date === today;

  // A streak about to break beats every other nudge — it is the only one that
  // is time-critical tonight.
  if (wantsChannel(person.settings, 'streak_guard') && streak > 0 && !doneToday) {
    return {
      title: `${streak} ${pluralise(streak, 'day')} on the board.`,
      body: 'One thing finished keeps it. There is still time.',
      url: '/now',
      tag: 'muse-streak',
    };
  }

  if (wantsChannel(person.settings, 'review_due')) {
    const inbox = items.filter((i) => i.state === 'inbox').length;
    const lastReview = stats?.last_review_at ? new Date(stats.last_review_at as string) : null;
    const daysSince = lastReview ? (now.getTime() - lastReview.getTime()) / 86_400_000 : Infinity;

    if (inbox >= 5 && daysSince >= 7) {
      return {
        title: 'Your inbox has opinions.',
        body: `${inbox} ${pluralise(inbox, 'thing')} waiting on one decision each.`,
        url: '/pulse',
        tag: 'muse-review',
      };
    }
  }

  return null;
}

/** Weekly email digest. Opt-in, flag-gated, and plain text in voice. */
export async function runWeeklyDigest(db: Db, now: Date = new Date()): Promise<Record<string, number>> {
  if (!(await isFlagOn(db, 'email_digest'))) return { sent: 0, skipped: 0, disabled: 1 };

  const people = await recipients(db);
  let sent = 0;
  let skipped = 0;

  for (const person of people) {
    if (!wantsChannel(person.settings, 'email_digest') || !person.email) {
      skipped += 1;
      continue;
    }

    const stamp = `digest:${weekStamp(now, person.timezone)}`;
    if (await alreadyDone(db, person.userId, stamp)) {
      skipped += 1;
      continue;
    }

    const items = await activeItems(db, person.userId);
    const weekAgo = now.getTime() - 7 * 86_400_000;

    const done = items.filter(
      (i) => i.state === 'done' && i.done_at && new Date(i.done_at).getTime() >= weekAgo,
    );
    const captured = items.filter((i) => new Date(i.created_at).getTime() >= weekAgo).length;
    const inboxWaiting = items.filter((i) => i.state === 'inbox').length;

    const reflection = reflectLocal({
      done: done.length,
      captured,
      inMotion: items.filter((i) => i.state === 'doing').length,
      inboxOverdue: items.filter(
        (i) => i.state === 'inbox' && now.getTime() - new Date(i.created_at).getTime() > 7 * 86_400_000,
      ).length,
      topGroup: null,
    });

    const email = digestEmail({
      name: person.name,
      done: done.length,
      captured,
      inboxWaiting,
      reflection,
      appUrl: publicEnv.appUrl,
    });

    const result = await sendEmail({ to: person.email, ...email });
    if (result.sent) sent += 1;
    else skipped += 1;

    await markDone(db, person.userId, stamp);
  }

  return { sent, skipped, considered: people.length };
}

/** Retention and housekeeping. Both functions are security-definer in the DB. */
export async function runMaintenance(db: Db): Promise<Record<string, number>> {
  let purgedTrash = 0;

  const { data, error } = await db.rpc('purge_expired_trash', {
    p_days: serverEnv.defaults.trashRetentionDays,
  });
  if (error) log.warn('maintenance: trash purge failed', errorFields(error));
  else purgedTrash = (data as number) ?? 0;

  const { error: rateError } = await db.rpc('purge_stale_rate_limits');
  if (rateError) log.warn('maintenance: rate limit purge failed', errorFields(rateError));

  // Cached AI output older than a week is never read again.
  const { error: cacheError } = await db
    .from('ai_cache')
    .delete()
    .lt('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString());
  if (cacheError) log.warn('maintenance: cache purge failed', errorFields(cacheError));

  return { purgedTrash };
}

// ── de-duplication of scheduled sends ───────────────────────────────────────
//
// The events table doubles as the delivery ledger. It already exists, it is
// already per-user, and a row there is cheaper than another table.

async function alreadyDone(db: Db, userId: string, stamp: string): Promise<boolean> {
  const { data } = await db
    .from('events')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'cron_delivery')
    .contains('props', { stamp })
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

async function markDone(db: Db, userId: string, stamp: string): Promise<void> {
  await db.from('events').insert({ user_id: userId, name: 'cron_delivery', props: { stamp } });
}

/** True when the user's local clock is within seven minutes of `hhmm`. */
export function isDueNow(hhmm: string, timezone: string, now: Date): boolean {
  const [hourText, minuteText] = (hhmm ?? '07:30').split(':');
  const targetMinutes = Number(hourText) * 60 + Number(minuteText ?? '0');
  if (!Number.isFinite(targetMinutes)) return false;

  const localMinutes = minutesOfDay(now, timezone);
  const delta = Math.abs(localMinutes - targetMinutes);

  // Wrap around midnight so 23:58 and 00:02 are eight minutes apart, not 1436.
  return Math.min(delta, 1440 - delta) <= 7;
}

function minutesOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const [hour, minute] = parts.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function weekStamp(now: Date, timezone: string): string {
  const date = localDate(now, timezone);
  const parts = date.split('-').map(Number);
  const utc = new Date(Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1));
  const dow = (utc.getUTCDay() + 6) % 7;
  const monday = new Date(utc.getTime() - dow * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

export type { NotifPrefs };
