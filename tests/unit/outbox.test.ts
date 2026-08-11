import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dequeue, enqueue, flushOutbox, isOffline, outboxSize } from '@/lib/outbox';
import type { StoreAdapter } from '@/lib/store/adapter';
import type { Item } from '@/lib/types';
import { makeItem } from '../fixtures/items';

function entry(clientId: string, raw = 'a thought') {
  return {
    clientId,
    queuedAt: new Date().toISOString(),
    input: { raw, source: 'app' as const, force: false },
  };
}

function adapterThatSucceeds(captured: string[]): StoreAdapter {
  return {
    kind: 'api',
    load: async () => ({ items: [], groups: [] }),
    capture: async (input) => {
      captured.push(input.clientId ?? '');
      return { item: makeItem({ id: input.clientId }) };
    },
    captureManual: async () => makeItem(),
    patch: async () => makeItem(),
    remove: async () => undefined,
    restore: async () => makeItem(),
    createGroup: async () => {
      throw new Error('not used');
    },
  };
}

describe('outbox', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('queues, counts and removes', () => {
    expect(outboxSize()).toBe(0);
    enqueue(entry('a'));
    enqueue(entry('b'));
    expect(outboxSize()).toBe(2);

    dequeue('a');
    expect(outboxSize()).toBe(1);
  });

  it('ignores a repeated client id, so a double tap queues once', () => {
    enqueue(entry('a'));
    enqueue(entry('a'));
    expect(outboxSize()).toBe(1);
  });

  it('replays in order and empties the queue', async () => {
    enqueue(entry('a', 'first'));
    enqueue(entry('b', 'second'));

    const captured: string[] = [];
    const result = await flushOutbox(adapterThatSucceeds(captured));

    expect(result.sent).toBe(2);
    expect(captured).toEqual(['a', 'b']);
    expect(outboxSize()).toBe(0);
  });

  it('forces the replay, because a duplicate prompt cannot be answered later', async () => {
    enqueue(entry('a'));
    const forced: boolean[] = [];

    await flushOutbox({
      ...adapterThatSucceeds([]),
      capture: async (input) => {
        forced.push(input.force);
        return { item: makeItem() };
      },
    });

    expect(forced).toEqual([true]);
  });

  it('stops at the first network failure and keeps the rest queued', async () => {
    enqueue(entry('a'));
    enqueue(entry('b'));

    const result = await flushOutbox({
      ...adapterThatSucceeds([]),
      capture: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    expect(result.sent).toBe(0);
    expect(outboxSize()).toBe(2);
  });

  it('drops an entry the server refuses, rather than wedging the queue', async () => {
    enqueue(entry('a'));
    enqueue(entry('b'));

    let call = 0;
    const result = await flushOutbox({
      ...adapterThatSucceeds([]),
      capture: async () => {
        call += 1;
        if (call === 1) throw new Error('Drop something in first.');
        return { item: makeItem() };
      },
    });

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
    expect(outboxSize()).toBe(0);
  });

  it('survives corrupt storage instead of throwing', () => {
    window.localStorage.setItem('muse.outbox.v1', 'not json');
    expect(outboxSize()).toBe(0);
  });
});

describe('isOffline', () => {
  it('treats a failed fetch as offline and a rejected request as not', () => {
    expect(isOffline(new TypeError('Failed to fetch'))).toBe(true);
    expect(isOffline(new Error('Sign in to continue.'))).toBe(false);
  });

  it('trusts navigator.onLine when the browser reports it', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(isOffline(new Error('anything'))).toBe(true);
    spy.mockRestore();
  });
});
