import type { Item, ItemState, ItemType } from '@/lib/types';

let counter = 0;

/** Builds a complete Item with sensible defaults; override only what matters. */
export function makeItem(overrides: Partial<Item> = {}): Item {
  counter += 1;
  const now = new Date('2026-08-10T09:00:00.000Z').toISOString();

  return {
    id: `item-${String(counter).padStart(4, '0')}`,
    user_id: 'user-1',
    group_id: null,
    title: `Item ${counter}`,
    summary: '',
    note: '',
    raw_input: '',
    type: 'note' as ItemType,
    state: 'inbox' as ItemState,
    priority: null,
    tags: [],
    due_at: null,
    url: null,
    url_normalized: null,
    platform: null,
    thumb_url: null,
    source: 'app',
    ai_status: 'ready',
    created_at: now,
    updated_at: now,
    done_at: null,
    touched_at: now,
    ...overrides,
  };
}

export function resetItemCounter(): void {
  counter = 0;
}
