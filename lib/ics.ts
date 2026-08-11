import type { Item } from '@/lib/types';

/**
 * Add to Calendar. One event per item: the due date at 09:00 local, or an hour
 * from now if there is no due date. One hour long, with the link in the body.
 */

const CRLF = '\r\n';

function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** RFC 5545: escape commas, semicolons, backslashes; fold at 75 octets. */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 74) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  if (remaining) parts.push(` ${remaining}`);
  return parts.join(CRLF);
}

export function startTimeFor(item: Pick<Item, 'due_at'>, now: Date = new Date()): Date {
  if (item.due_at) {
    const due = new Date(item.due_at);
    // Due dates land at 09:00 in whatever timezone the browser is in — a due
    // date is a day, not a moment, and 09:00 is when the day starts working.
    due.setHours(9, 0, 0, 0);
    return due;
  }
  return new Date(now.getTime() + 60 * 60 * 1000);
}

export function buildIcs(
  item: Pick<Item, 'id' | 'title' | 'summary' | 'url' | 'due_at'>,
  now: Date = new Date(),
): string {
  const start = startTimeFor(item, now);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const description = [item.summary, item.url].filter(Boolean).join('\n\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Muse//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${item.id}@muse.app`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(item.title || 'Muse item')}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    item.url ? `URL:${escapeText(item.url)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => line !== null);

  return lines.map(fold).join(CRLF) + CRLF;
}

/**
 * Inline data href for the calendar file. Kept for callers outside React —
 * components use CalendarButton instead, which builds the file on click. An
 * href rendered ahead of time bakes in a DTSTAMP that differs between the
 * server and the client, which React reports as a hydration mismatch.
 */
export function icsHrefFor(item: Pick<Item, 'id' | 'title' | 'summary' | 'url' | 'due_at'>): string {
  const ics = buildIcs(item);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
