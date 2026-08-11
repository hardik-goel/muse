'use client';

import { useState } from 'react';
import { useStore } from '@/components/shell/StoreProvider';
import { useToast } from '@/components/ui/Toast';
import { ITEM_STATES, type ItemState } from '@/lib/types';

/**
 * Multi-select actions. Appears only when something is selected, and every
 * action it performs is a single undoable step rather than N separate toasts.
 */
export function BulkBar({ selected, onClear }: { selected: Set<string>; onClear: () => void }) {
  const { items, groups, patchItem, deleteItem, reload, guest } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (selected.size === 0) return null;
  const ids = [...selected];

  async function applyLocally(fn: (id: string) => Promise<unknown>) {
    setBusy(true);
    await Promise.all(ids.map(fn));
    setBusy(false);
    onClear();
  }

  async function setStateAll(state: ItemState) {
    const before = new Map(
      ids.map((id) => [id, items.find((i) => i.id === id)?.state ?? 'inbox'] as const),
    );

    if (guest) {
      await applyLocally((id) => patchItem(id, { state }));
    } else {
      setBusy(true);
      await fetch('/api/items/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: { kind: 'state', state } }),
      }).catch(() => undefined);
      await reload();
      setBusy(false);
      onClear();
    }

    toast.push({
      message: `${ids.length} moved to ${state}.`,
      undo: async () => {
        await Promise.all(
          ids.map((id) => patchItem(id, { state: before.get(id) ?? 'inbox' })),
        );
      },
    });
  }

  async function moveAll(groupId: string | null) {
    const before = new Map(
      ids.map((id) => [id, items.find((i) => i.id === id)?.group_id ?? null] as const),
    );

    if (guest) {
      await applyLocally((id) => patchItem(id, { groupId }));
    } else {
      setBusy(true);
      await fetch('/api/items/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: { kind: 'group', groupId } }),
      }).catch(() => undefined);
      await reload();
      setBusy(false);
      onClear();
    }

    toast.push({
      message: `${ids.length} moved.`,
      undo: async () => {
        await Promise.all(ids.map((id) => patchItem(id, { groupId: before.get(id) ?? null })));
      },
    });
  }

  async function deleteAll() {
    setBusy(true);
    await Promise.all(ids.map((id) => deleteItem(id)));
    setBusy(false);
    onClear();
  }

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-50 gutter"
      data-testid="bulk-bar"
    >
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-card border border-line bg-raised px-3.5 py-3 shadow-lg">
        <span className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-champagne">
          {selected.size} selected
        </span>

        <select
          aria-label="Move to state"
          disabled={busy}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) void setStateAll(e.target.value as ItemState);
            e.target.value = '';
          }}
          className="rounded-pill border border-line bg-surface px-3 py-1.5 text-[0.8125rem] text-soft"
        >
          <option value="">State…</option>
          {ITEM_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          aria-label="Move to group"
          disabled={busy}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) void moveAll(e.target.value === '__none' ? null : e.target.value);
            e.target.value = '';
          }}
          className="rounded-pill border border-line bg-surface px-3 py-1.5 text-[0.8125rem] text-soft"
        >
          <option value="">Group…</option>
          <option value="__none">Unfiled</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={busy}
          onClick={() => void deleteAll()}
          className="rounded-pill border border-red/30 bg-red-tint px-3 py-1.5 text-[0.8125rem] text-red"
        >
          Delete
        </button>

        <button
          type="button"
          onClick={onClear}
          className="ml-auto font-mono text-[0.625rem] uppercase tracking-eyebrow text-faint"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
