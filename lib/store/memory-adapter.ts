import type { Group, Item } from '@/lib/types';
import type { CaptureInput, ItemPatchInput, ManualCaptureInput } from '@/lib/zod-schemas';
import type { CaptureResult, Snapshot, StoreAdapter } from '@/lib/store/adapter';
import { classifyLocal } from '@/lib/local-mode';
import { findDuplicate } from '@/lib/dupe';
import { detectPlatform, extractUrl, normaliseUrl, thumbnailFor } from '@/lib/url';
import { uid } from '@/lib/utils';
import { writeGuestSession } from '@/lib/guest';

/**
 * Guest-mode store. Lives in the tab, classified entirely by Local mode, no
 * network calls of any kind. The snapshot is mirrored to sessionStorage so
 * signing up can carry the work across; see lib/guest.ts.
 */
export class MemoryAdapter implements StoreAdapter {
  readonly kind = 'memory' as const;

  private items: Item[] = [];
  private groups: Group[] = [];

  constructor(seed?: Snapshot) {
    if (seed) {
      this.items = [...seed.items];
      this.groups = [...seed.groups];
    }
  }

  async load(): Promise<Snapshot> {
    return this.snapshot();
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const raw = input.raw.trim();
    const url = extractUrl(raw);
    const classification = classifyLocal(raw);

    if (!input.force) {
      const hit = findDuplicate(
        { url, title: classification.title },
        this.items.map((i) => ({
          id: i.id,
          title: i.title,
          created_at: i.created_at,
          thumb_url: i.thumb_url,
          url: i.url,
          url_normalized: i.url_normalized,
        })),
      );
      if (hit) return { item: null, duplicate: hit };
    }

    const group = this.ensureGroup(classification.group);
    const now = new Date().toISOString();

    const item: Item = {
      id: input.clientId ?? uid(),
      user_id: 'guest',
      group_id: group.id,
      title: classification.title,
      summary: classification.summary,
      note: '',
      raw_input: raw,
      type: classification.type,
      state: classification.state,
      priority: classification.priority,
      tags: classification.tags,
      due_at: null,
      url,
      url_normalized: normaliseUrl(url),
      platform: detectPlatform(url),
      thumb_url: input.thumbPath ?? thumbnailFor(url),
      source: input.source,
      ai_status: 'ready',
      created_at: now,
      updated_at: now,
      done_at: null,
      touched_at: now,
    };

    this.items = [item, ...this.items];
    this.persist();
    return { item };
  }

  async captureManual(input: ManualCaptureInput): Promise<Item> {
    const group = input.groupId
      ? this.groups.find((g) => g.id === input.groupId)
      : input.groupName
        ? this.ensureGroup(input.groupName)
        : undefined;

    const now = new Date().toISOString();
    const item: Item = {
      id: uid(),
      user_id: 'guest',
      group_id: group?.id ?? null,
      title: input.title,
      summary: input.summary,
      note: input.note,
      raw_input: input.title,
      type: input.type,
      state: input.state,
      priority: input.priority,
      tags: input.tags,
      due_at: input.dueAt,
      url: input.url,
      url_normalized: normaliseUrl(input.url),
      platform: detectPlatform(input.url),
      thumb_url: input.thumbPath ?? thumbnailFor(input.url),
      source: input.source,
      ai_status: 'ready',
      created_at: now,
      updated_at: now,
      done_at: null,
      touched_at: now,
    };

    this.items = [item, ...this.items];
    this.persist();
    return item;
  }

  async patch(id: string, patch: ItemPatchInput): Promise<Item> {
    const index = this.items.findIndex((i) => i.id === id);
    const existing = this.items[index];
    if (index === -1 || !existing) throw new Error('That item is gone.');

    const now = new Date().toISOString();
    const groupId =
      patch.groupName !== undefined
        ? this.ensureGroup(patch.groupName).id
        : patch.groupId !== undefined
          ? patch.groupId
          : existing.group_id;

    const next: Item = {
      ...existing,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.summary !== undefined && { summary: patch.summary }),
      ...(patch.note !== undefined && { note: patch.note }),
      ...(patch.type !== undefined && { type: patch.type }),
      ...(patch.state !== undefined && { state: patch.state }),
      ...(patch.tags !== undefined && { tags: patch.tags }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.dueAt !== undefined && { due_at: patch.dueAt }),
      ...(patch.url !== undefined && {
        url: patch.url,
        url_normalized: normaliseUrl(patch.url),
        platform: detectPlatform(patch.url),
      }),
      group_id: groupId,
      updated_at: now,
      touched_at: now,
      done_at: patch.state === 'done' ? now : patch.state ? null : existing.done_at,
    };

    this.items = this.items.map((i) => (i.id === id ? next : i));
    this.persist();
    return next;
  }

  async remove(id: string): Promise<void> {
    const target = this.items.find((i) => i.id === id);
    if (target) this.trash.set(id, target);
    this.items = this.items.filter((i) => i.id !== id);
    this.persist();
  }

  async restore(id: string): Promise<Item> {
    const target = this.trash.get(id);
    if (!target) throw new Error('Nothing to restore.');
    this.trash.delete(id);
    this.items = [target, ...this.items];
    this.persist();
    return target;
  }

  async createGroup(name: string): Promise<Group> {
    return this.ensureGroup(name);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private trash = new Map<string, Item>();

  private snapshot(): Snapshot {
    return { items: [...this.items], groups: [...this.groups] };
  }

  private ensureGroup(name: string): Group {
    const clean = name.replace(/^NEW:/i, '').trim();
    const existing = this.groups.find((g) => g.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing;

    const now = new Date().toISOString();
    const group: Group = {
      id: uid(),
      user_id: 'guest',
      name: clean,
      ai_created: true,
      sort_order: this.groups.length,
      created_at: now,
      updated_at: now,
    };
    this.groups = [...this.groups, group];
    return group;
  }

  private persist(): void {
    writeGuestSession({ items: this.items, groups: this.groups });
  }
}
