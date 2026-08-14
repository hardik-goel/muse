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

/**
 * The signup handoff, and only the signup handoff.
 *
 * sessionStorage dies with the tab, which is the promise guest mode makes and
 * worth keeping. But production requires email verification, so the account
 * comes into existence when a link is clicked — in a new tab, where
 * sessionStorage is empty and the guest work would be silently dropped on the
 * floor. So at the moment the user asks for an account, and not before, the
 * snapshot is copied somewhere that survives the round trip. It is cleared the
 * instant it is imported, and ignored if the trip took more than a day.
 */
const HANDOFF_KEY = 'muse.guest.handoff.v1';
const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;

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

/** Reads and validates a stored snapshot, whichever storage it came from. */
function parseSnapshot(raw: string | null): GuestSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GuestSnapshot;
    if (!Array.isArray(parsed.items)) return null;
    return { ...parsed, artifact: toArtifact(parsed) };
  } catch {
    return null;
  }
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
    const live = parseSnapshot(window.sessionStorage.getItem(KEY));
    if (live) return live;
  } catch {
    /* fall through to the handoff */
  }
  return readGuestHandoff();
}

/**
 * Copies the current snapshot somewhere it will survive the verification email.
 * Called when the user commits to an account, never during ordinary guest use.
 */
export function stashGuestHandoff(): void {
  if (!isBrowser()) return;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return;
    window.localStorage.setItem(HANDOFF_KEY, raw);
  } catch {
    // Storage full or blocked. Guest mode still works; only the handoff is lost.
  }
}

/** The stashed snapshot, if one is waiting and it has not gone stale. */
export function readGuestHandoff(): GuestSession | null {
  if (!isBrowser()) return null;
  try {
    const parsed = parseSnapshot(window.localStorage.getItem(HANDOFF_KEY));
    if (!parsed) return null;

    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(age) || age > HANDOFF_TTL_MS) {
      window.localStorage.removeItem(HANDOFF_KEY);
      return null;
    }

    return parsed;
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
  try {
    window.localStorage.removeItem(HANDOFF_KEY);
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
