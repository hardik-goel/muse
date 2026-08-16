import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** "3d ago", "just now" — the compact relative form used on cards. */
export function relativeTime(iso: string | Date, now: Date = new Date()): string {
  const then = typeof iso === 'string' ? new Date(iso) : iso;
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const d1 = typeof a === 'string' ? new Date(a) : a;
  const d2 = typeof b === 'string' ? new Date(b) : b;
  return Math.floor((d2.getTime() - d1.getTime()) / 86_400_000);
}

/** Calendar date in a specific IANA timezone, as YYYY-MM-DD. */
export function localDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts;
}

/** Hour 0–23 in a specific IANA timezone. Drives the brief's greeting. */
export function localHour(date: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  return Number(h);
}

/** Day of week in a timezone, 0 = Sunday (matches the SU–SA split editor). */
export function localDayOfWeek(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
  return idx === -1 ? date.getDay() : idx;
}

export function initials(name: string, email = ''): string {
  const source = name.trim() || email.trim();
  if (!source) return '?';
  const first = source[0];
  return (first ?? '?').toUpperCase();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Word-limited truncation — the AI contract caps titles at 10 words.
 *
 * The ellipsis matters more than it looks. Cut silently, a clipped title reads
 * as a finished thought that happens to make no sense: "the city keeps its
 * lights on for nobody in". With the mark, the same title reads as deliberately
 * shortened, which is what it is.
 */
export function limitWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  // Trailing punctuation before the ellipsis reads as a stutter ("first,…").
  return `${words.slice(0, maxWords).join(' ').replace(/[,;:.\-–—]+$/, '')}…`;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `tmp-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function pluralise(n: number, singular: string, plural = `${singular}s`): string {
  return n === 1 ? singular : plural;
}
