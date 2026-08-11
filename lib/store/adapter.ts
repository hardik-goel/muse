import type { Group, Item } from '@/lib/types';
import type { DupeHit } from '@/lib/dupe';
import type { CaptureInput, ItemPatchInput, ManualCaptureInput } from '@/lib/zod-schemas';

/**
 * One interface, two implementations:
 *   - ApiAdapter    — signed in. Every call is an authenticated fetch.
 *   - MemoryAdapter — guest mode. Everything stays in the tab, classified by
 *                     Local mode. Nothing is saved, exactly as promised.
 *
 * The UI is written against this interface only, so guest mode is genuinely the
 * same product rather than a stripped-down demo.
 */

export interface Snapshot {
  items: Item[];
  groups: Group[];
}

export interface CaptureResult {
  item: Item | null;
  /** Set when a duplicate was found and `force` was not passed. */
  duplicate?: DupeHit;
}

export interface StoreAdapter {
  readonly kind: 'api' | 'memory';

  load(): Promise<Snapshot>;

  capture(input: CaptureInput): Promise<CaptureResult>;
  captureManual(input: ManualCaptureInput): Promise<Item>;

  patch(id: string, patch: ItemPatchInput): Promise<Item>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<Item>;

  createGroup(name: string): Promise<Group>;
}
