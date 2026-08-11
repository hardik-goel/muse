import { describe, expect, it } from 'vitest';
import {
  advanceDailyStreak,
  advanceWeekStreak,
  archivePick,
  archiveCandidates,
  POINTS,
  weekStart,
} from '@/lib/gamification';
import { makeItem } from '../fixtures/items';

const TZ = 'Asia/Kolkata';

describe('points', () => {
  it('matches the published values', () => {
    expect(POINTS).toEqual({ done: 10, review: 25, focusFinish: 15, capture: 2 });
  });
});

describe('advanceDailyStreak', () => {
  // now (UTC) | last_done_date | current | => streak | advanced
  const cases: [string, string | null, number, number, boolean][] = [
    ['2026-08-10T04:00:00Z', null, 0, 1, true], // first ever completion
    ['2026-08-10T04:00:00Z', '2026-08-09', 4, 5, true], // chains off yesterday
    ['2026-08-10T04:00:00Z', '2026-08-10', 5, 5, false], // second done same day
    ['2026-08-10T04:00:00Z', '2026-08-08', 9, 1, true], // one day missed => reset
    ['2026-08-10T04:00:00Z', '2026-07-01', 30, 1, true], // long lapse => reset
    // 22:00 UTC is already tomorrow in Asia/Kolkata (+05:30) — the streak must
    // follow the user's calendar, not the server's.
    ['2026-08-09T22:00:00Z', '2026-08-09', 3, 4, true],
  ];

  it.each(cases)(
    'at %s with last=%s and streak=%d yields %d',
    (nowIso, lastDone, current, expected, advanced) => {
      const result = advanceDailyStreak(
        { daily_streak: current, last_done_date: lastDone },
        new Date(nowIso),
        TZ,
      );
      expect(result.dailyStreak).toBe(expected);
      expect(result.advanced).toBe(advanced);
    },
  );
});

describe('advanceWeekStreak', () => {
  const now = new Date('2026-08-10T09:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

  const cases: [string, string | null, number, number, boolean][] = [
    ['first review ever', null, 0, 1, true],
    ['same day, does not double-count', daysAgo(0), 3, 3, false],
    ['two days later, still the same week habit', daysAgo(2), 3, 3, false],
    ['three days later, counts', daysAgo(3), 3, 4, true],
    ['seven days later, counts', daysAgo(7), 3, 4, true],
    ['fourteen days later, still counts', daysAgo(14), 3, 4, true],
    ['fifteen days later, lapsed', daysAgo(15), 9, 1, true],
  ];

  it.each(cases)('%s', (_label, lastReview, current, expected, counted) => {
    const result = advanceWeekStreak({ week_streak: current, last_review_at: lastReview }, now);
    expect(result.weekStreak).toBe(expected);
    expect(result.counted).toBe(counted);
  });
});

describe('archive rotation', () => {
  const now = new Date('2026-08-10T09:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

  it('only considers items untouched for two weeks', () => {
    const items = [
      makeItem({ touched_at: daysAgo(20) }),
      makeItem({ touched_at: daysAgo(13) }),
      makeItem({ touched_at: daysAgo(14) }),
    ];
    expect(archiveCandidates(items, now)).toHaveLength(2);
  });

  it('never resurfaces something already finished', () => {
    const items = [makeItem({ state: 'done', touched_at: daysAgo(30) })];
    expect(archivePick(items, now)).toBeNull();
  });

  it('is stable within a day and moves the next day', () => {
    const items = Array.from({ length: 5 }, () => makeItem({ touched_at: daysAgo(30) }));
    const morning = archivePick(items, new Date('2026-08-10T01:00:00Z'));
    const evening = archivePick(items, new Date('2026-08-10T23:00:00Z'));
    const tomorrow = archivePick(items, new Date('2026-08-11T09:00:00Z'));

    expect(morning?.id).toBe(evening?.id);
    expect(tomorrow?.id).not.toBe(morning?.id);
  });

  it('returns null when nothing is old enough', () => {
    expect(archivePick([makeItem({ touched_at: daysAgo(1) })], now)).toBeNull();
  });
});

describe('weekStart', () => {
  it('rolls back to Monday', () => {
    // 2026-08-10 is a Monday; 2026-08-14 is the Friday of the same week.
    expect(weekStart(new Date('2026-08-14T12:00:00Z'), 'UTC').toISOString()).toBe(
      '2026-08-10T00:00:00.000Z',
    );
  });

  it('treats Sunday as the end of the previous week', () => {
    expect(weekStart(new Date('2026-08-16T12:00:00Z'), 'UTC').toISOString()).toBe(
      '2026-08-10T00:00:00.000Z',
    );
  });
});
