import type { DraftItem, Group, Item } from '@/lib/types';
import type { ImportPayload } from '@/lib/zod-schemas';

/**
 * Guest mode.
 *
 * The header says "guest — nothing is saved", and that stays literally true of
 * the server: no row, no account, no request. The snapshot below lives in
 * sessionStorage so it survives the one navigation that matters — guest →
 * signup — and dies with the tab like the promise implies. Signing up posts
 * this snapshot to /api/import so nothing dropped as a guest is lost.
 */

const KEY = 'muse.guest.v1';

export interface GuestSnapshot {
  items: DraftItem[];
  groups: Group[];
  savedAt: string;
}

export interface GuestSession extends GuestSnapshot {
  artifact: ImportPayload;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function writeGuestSession(snapshot: Omit<GuestSnapshot, 'savedAt'>): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage full or blocked. Guest mode still works; only the handoff is lost.
  }
}

export function readGuestSession(): GuestSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestSnapshot;
    if (!Array.isArray(parsed.items)) return null;
    return { ...parsed, artifact: toArtifact(parsed) };
  } catch {
    return null;
  }
}

export function clearGuestSession(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clean up */
  }
}

/**
 * Guest drafts carry `user_id: null` because there is no account behind them.
 * The store and every component below it work on `Item`, so the owner is filled
 * in with the sentinel the memory adapter already uses when it creates rows.
 */
export function asItems(drafts: DraftItem[]): Item[] {
  return drafts.map((draft) => ({ ...draft, user_id: draft.user_id ?? 'guest' }));
}

/** Converts an in-memory guest session into the standard export artifact. */
export function toArtifact(snapshot: GuestSnapshot): ImportPayload {
  const groupsById = new Map(snapshot.groups.map((g) => [g.id, g.name]));

  return {
    version: 1,
    exportedAt: snapshot.savedAt,
    groups: snapshot.groups.map((g) => ({ id: g.id, name: g.name })),
    items: snapshot.items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      note: item.note,
      raw: item.raw_input,
      type: item.type,
      state: item.state,
      group: item.group_id ? (groupsById.get(item.group_id) ?? null) : null,
      tags: item.tags,
      priority: item.priority,
      due: item.due_at,
      url: item.url,
      platform: item.platform,
      thumb: item.thumb_url,
      createdAt: item.created_at,
      doneAt: item.done_at,
    })),
  };
}
