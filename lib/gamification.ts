import type { Item, UserStats } from '@/lib/types';
import { localDate } from '@/lib/utils';

/**
 * Streaks, points and the archive rotation. Pure functions — the API routes
 * read stats, call these, and write the result back. Table-driven tests in
 * tests/unit/gamification.test.ts cover the boundaries.
 */

export const POINTS = {
  done: 10,
  review: 25,
  focusFinish: 15,
  capture: 2,
} as const;

export type PointEvent = keyof typeof POINTS;

// ── daily streak ────────────────────────────────────────────────────────────

export interface StreakResult {
  dailyStreak: number;
  lastDoneDate: string;
  /** True only on the first completion of a new day — the moment worth marking. */
  advanced: boolean;
}

/**
 * The streak counts days on which at least one item was completed, in the
 * user's own timezone. A second completion on the same day changes nothing.
 * A gap of one day or more resets to 1 — the day just completed still counts.
 */
export function advanceDailyStreak(
  stats: Pick<UserStats, 'daily_streak' | 'last_done_date'>,
  now: Date,
  timezone: string,
): StreakResult {
  const today = localDate(now, timezone);

  if (stats.last_done_date === today) {
    return { dailyStreak: stats.daily_streak, lastDoneDate: today, advanced: false };
  }

  if (!stats.last_done_date) {
    return { dailyStreak: 1, lastDoneDate: today, advanced: true };
  }

  const yesterday = localDate(new Date(now.getTime() - 86_400_000), timezone);
  const chained = stats.last_done_date === yesterday;

  return {
    dailyStreak: chained ? stats.daily_streak + 1 : 1,
    lastDoneDate: today,
    advanced: true,
  };
}

// ── weekly review streak ────────────────────────────────────────────────────

export interface WeekStreakResult {
  weekStreak: number;
  counted: boolean;
}

/**
 * Weekly reviews are meant to be weekly, not hourly. A review inside two days
 * of the last one is welcome but does not extend the streak; a gap over
 * fourteen days means the habit lapsed and the count restarts at one.
 */
export function advanceWeekStreak(
  stats: Pick<UserStats, 'week_streak' | 'last_review_at'>,
  now: Date,
): WeekStreakResult {
  if (!stats.last_review_at) return { weekStreak: 1, counted: true };

  const gapDays = (now.getTime() - new Date(stats.last_review_at).getTime()) / 86_400_000;

  if (gapDays > 14) return { weekStreak: 1, counted: true };
  if (gapDays > 2) return { weekStreak: stats.week_streak + 1, counted: true };

  return { weekStreak: stats.week_streak, counted: false };
}

// ── archive rotation ────────────────────────────────────────────────────────

export const ARCHIVE_MIN_AGE_DAYS = 14;

/** Items untouched for two weeks or more are eligible to resurface. */
export function archiveCandidates(items: Item[], now: Date = new Date()): Item[] {
  const cutoff = now.getTime() - ARCHIVE_MIN_AGE_DAYS * 86_400_000;
  return items
    .filter((item) => item.state !== 'done' && new Date(item.touched_at).getTime() <= cutoff)
    .sort((a, b) => a.id.localeCompare(b.id)); // stable order so rotation is deterministic
}

/**
 * One item per day, rotating deterministically. Same input, same day, same
 * answer — on every device, with no state to store.
 */
export function archivePick(items: Item[], now: Date = new Date()): Item | null {
  const candidates = archiveCandidates(items, now);
  if (candidates.length === 0) return null;
  const index = Math.floor(now.getTime() / 86_400_000) % candidates.length;
  return candidates[index] ?? null;
}

// ── momentum summary ────────────────────────────────────────────────────────

export interface Momentum {
  dayStreak: number;
  weekReviews: number;
  points: number;
}

export function momentumFrom(stats: UserStats): Momentum {
  return {
    dayStreak: stats.daily_streak,
    weekReviews: stats.week_streak,
    points: stats.points,
  };
}

/** Start of the current week (Monday 00:00) in the user's timezone, as a Date. */
export function weekStart(now: Date, timezone: string): Date {
  const dateStr = localDate(now, timezone);
  const parts = dateStr.split('-').map(Number);
  const [year, month, day] = [parts[0] ?? 1970, parts[1] ?? 1, parts[2] ?? 1];
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  const dow = utcMidnight.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dow + 6) % 7;
  return new Date(utcMidnight.getTime() - daysSinceMonday * 86_400_000);
}
