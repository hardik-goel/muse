import type { Group, Item } from '@/lib/types';
import type { CaptureInput, ItemPatchInput, ManualCaptureInput } from '@/lib/zod-schemas';
import type { CaptureResult, Snapshot, StoreAdapter } from '@/lib/store/adapter';
import type { DupeHit } from '@/lib/dupe';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'That did not go through.');
  }
  return (await res.json()) as T;
}

/** Signed-in store. Thin — the interesting logic lives server-side. */
export class ApiAdapter implements StoreAdapter {
  readonly kind = 'api' as const;

  async load(): Promise<Snapshot> {
    const [items, groups] = await Promise.all([
      request<{ items: Item[] }>('/api/items?state=all&limit=100'),
      request<{ groups: Group[] }>('/api/groups'),
    ]);
    return { items: items.items, groups: groups.groups };
  }

  async capture(input: CaptureInput): Promise<CaptureResult> {
    const body = await request<{ item: Item | null; duplicate?: DupeHit }>('/api/capture', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { item: body.item, duplicate: body.duplicate };
  }

  async captureManual(input: ManualCaptureInput): Promise<Item> {
    const body = await request<{ item: Item }>('/api/capture/manual', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return body.item;
  }

  async patch(id: string, patch: ItemPatchInput): Promise<Item> {
    const body = await request<{ item: Item }>(`/api/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return body.item;
  }

  async remove(id: string): Promise<void> {
    await request<{ ok: true }>(`/api/items/${id}`, { method: 'DELETE' });
  }

  async restore(id: string): Promise<Item> {
    const body = await request<{ item: Item }>('/api/trash/restore', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return body.item;
  }

  async createGroup(name: string): Promise<Group> {
    const body = await request<{ group: Group }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return body.group;
  }
}
