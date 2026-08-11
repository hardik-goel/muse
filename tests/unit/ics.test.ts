import { describe, expect, it } from 'vitest';
import { buildIcs, icsHrefFor, startTimeFor } from '@/lib/ics';

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Pay the bill',
  summary: 'Before it doubles',
  url: 'https://example.com/bill',
  due_at: null as string | null,
};

describe('startTimeFor', () => {
  it('uses 09:00 on the due date', () => {
    const start = startTimeFor({ due_at: '2026-08-20T00:00:00.000Z' });
    expect(start.getHours()).toBe(9);
    expect(start.getMinutes()).toBe(0);
  });

  it('falls back to an hour from now when nothing is due', () => {
    const now = new Date('2026-08-11T10:00:00.000Z');
    expect(startTimeFor({ due_at: null }, now).toISOString()).toBe('2026-08-11T11:00:00.000Z');
  });
});

describe('buildIcs', () => {
  const ics = buildIcs(base, new Date('2026-08-11T10:00:00.000Z'));

  it('is a complete VCALENDAR', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });

  it('uses CRLF line endings, as RFC 5545 requires', () => {
    expect(ics.includes('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('carries the title, link and a stable UID', () => {
    expect(ics).toContain('SUMMARY:Pay the bill');
    expect(ics).toContain(`UID:${base.id}@muse.app`);
    expect(ics).toContain('URL:https://example.com/bill');
  });

  it('escapes commas and semicolons in text', () => {
    const escaped = buildIcs({ ...base, title: 'Buy milk, bread; eggs' });
    expect(escaped).toContain('SUMMARY:Buy milk\\, bread\\; eggs');
  });

  it('folds lines longer than 75 octets', () => {
    const long = buildIcs({ ...base, title: 'x'.repeat(200) });
    for (const line of long.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it('omits DESCRIPTION when there is nothing to describe', () => {
    const bare = buildIcs({ ...base, summary: '', url: null });
    expect(bare).not.toContain('DESCRIPTION:');
    expect(bare).not.toContain('URL:');
  });

  it('ends the event an hour after it starts', () => {
    const start = ics.match(/DTSTART:(\d{8}T\d{6}Z)/)?.[1];
    const end = ics.match(/DTEND:(\d{8}T\d{6}Z)/)?.[1];
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    expect(end).not.toBe(start);
  });
});

describe('icsHrefFor', () => {
  it('is an inline data URL that needs no round trip', () => {
    const href = icsHrefFor(base);
    expect(href.startsWith('data:text/calendar;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(href.split(',').slice(1).join(','))).toContain('BEGIN:VCALENDAR');
  });
});
