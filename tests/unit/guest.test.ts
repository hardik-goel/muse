import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGuestSession,
  readGuestHandoff,
  readGuestSession,
  stashGuestHandoff,
  writeGuestSession,
} from '@/lib/guest';
import type { DraftItem, Group } from '@/lib/types';

const groups = [{ id: 'g1', name: 'Personal' }] as unknown as Group[];

function draft(title: string): DraftItem {
  return {
    id: `i-${title}`,
    user_id: null,
    title,
    summary: '',
    note: '',
    raw_input: title,
    type: 'note',
    state: 'inbox',
    group_id: 'g1',
    tags: [],
    priority: null,
    due_at: null,
    url: null,
    platform: null,
    thumb_url: null,
    created_at: new Date('2026-08-14T10:00:00Z').toISOString(),
    done_at: null,
  } as unknown as DraftItem;
}

/** Wipes the tab, the way opening a verification link in a new one does. */
function newTab(): void {
  window.sessionStorage.clear();
}

describe('guest handoff across the verification email', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('keeps guest work when the account is confirmed in a different tab', () => {
    writeGuestSession({ items: [draft('buy milk')], groups });
    // The user hits "Create account"; production replies "check your inbox".
    stashGuestHandoff();

    newTab();

    const recovered = readGuestSession();
    expect(recovered).not.toBeNull();
    expect(recovered?.items).toHaveLength(1);
    expect(recovered?.artifact.items[0]?.title).toBe('buy milk');
  });

  it('loses nothing but is also not stashed until signup is attempted', () => {
    writeGuestSession({ items: [draft('a thought')], groups });

    // Merely browsing as a guest must not outlive the tab — that is the promise
    // the banner makes, and it still holds.
    newTab();
    expect(readGuestSession()).toBeNull();
  });

  it('prefers the live session over an older stash', () => {
    writeGuestSession({ items: [draft('older')], groups });
    stashGuestHandoff();
    writeGuestSession({ items: [draft('newer'), draft('and more')], groups });

    expect(readGuestSession()?.items).toHaveLength(2);
  });

  it('ignores and clears a stash older than a day', () => {
    writeGuestSession({ items: [draft('stale')], groups });
    stashGuestHandoff();

    // Age the stash past the window by rewriting its timestamp.
    const key = 'muse.guest.handoff.v1';
    const stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as { savedAt: string };
    stored.savedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem(key, JSON.stringify(stored));

    newTab();

    expect(readGuestHandoff()).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('stashes nothing when there was no guest session to begin with', () => {
    stashGuestHandoff();
    expect(readGuestHandoff()).toBeNull();
  });

  it('clears both copies once the work has been imported', () => {
    writeGuestSession({ items: [draft('imported')], groups });
    stashGuestHandoff();

    clearGuestSession();

    expect(readGuestSession()).toBeNull();
    expect(readGuestHandoff()).toBeNull();
    expect(window.localStorage.getItem('muse.guest.handoff.v1')).toBeNull();
  });
});
