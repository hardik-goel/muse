'use client';

import type { CaptureInput } from '@/lib/zod-schemas';
import type { StoreAdapter } from '@/lib/store/adapter';
import type { Item } from '@/lib/types';

/**
 * The offline capture queue.
 *
 * Capture is the one thing that must never fail. When the network is gone the
 * drop is written to localStorage with a client-generated id, shown on screen
 * immediately, and replayed when connectivity returns. The server treats that
 * id as an idempotency key, so a replay that already landed does not duplicate.
 */

const KEY = 'muse.outbox.v1';
const MAX_QUEUED = 200;

export interface QueuedCapture {
  clientId: string;
  input: CaptureInput;
  queuedAt: string;
}

function read(): QueuedCapture[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedCapture[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(queue: QueuedCapture[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(queue.slice(-MAX_QUEUED)));
  } catch {
    // Storage is full or blocked. The item is still on screen; it just will not
    // survive a reload, which is the best that can be done here.
  }
}

export function outboxSize(): number {
  return read().length;
}

export function enqueue(entry: QueuedCapture): void {
  const queue = read();
  if (queue.some((q) => q.clientId === entry.clientId)) return;
  write([...queue, entry]);
}

export function dequeue(clientId: string): void {
  write(read().filter((entry) => entry.clientId !== clientId));
}

/** True when a thrown error is a lost connection rather than a rejected request. */
export function isOffline(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  // fetch() rejects with a TypeError when the request never reached a server;
  // every server-side refusal arrives as a parsed ApiError message instead.
  return error instanceof TypeError;
}

export interface FlushResult {
  sent: number;
  failed: number;
  items: Item[];
}

/**
 * Replays the queue in the order it was captured. Stops on the first network
 * failure — if the connection is still down, the rest will not fare better —
 * but drops entries the server rejects outright, since retrying a 400 forever
 * would wedge the queue.
 */
export async function flushOutbox(adapter: StoreAdapter): Promise<FlushResult> {
  const queue = read();
  if (queue.length === 0) return { sent: 0, failed: 0, items: [] };

  let sent = 0;
  let failed = 0;
  const items: Item[] = [];

  for (const entry of queue) {
    try {
      const result = await adapter.capture({
        ...entry.input,
        clientId: entry.clientId,
        // A queued drop was already the user's decision; a duplicate prompt
        // cannot be answered hours later on their behalf.
        force: true,
      });
      dequeue(entry.clientId);
      sent += 1;
      if (result.item) items.push(result.item);
    } catch (error) {
      if (isOffline(error)) {
        failed = queue.length - sent;
        break;
      }
      dequeue(entry.clientId);
      failed += 1;
    }
  }

  return { sent, failed, items };
}
