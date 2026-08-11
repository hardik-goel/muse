'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useStore } from '@/components/shell/StoreProvider';
import { pluralise, relativeTime } from '@/lib/utils';

interface TrashRow {
  originalId: string;
  deletedAt: string;
  expiresInDays: number;
  item: { id: string; title: string; summary: string };
}

/**
 * Trash. Thirty days, then gone for good — the countdown is shown per item so
 * "restorable" is a fact with a date on it rather than a vague promise.
 */
export function TrashScreen() {
  const toast = useToast();
  const { reload } = useStore();

  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [retention, setRetention] = useState(30);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch('/api/trash');
      if (!res.ok) throw new Error('load failed');
      const body = (await res.json()) as { trash: TrashRow[]; retentionDays: number };
      setRows(body.trash);
      setRetention(body.retentionDays);
    } catch {
      setError(true);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(originalId: string) {
    setBusy(true);
    const res = await fetch('/api/trash/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: originalId }),
    });
    setBusy(false);

    if (!res.ok) {
      toast.push({ message: 'Could not bring that back.', tone: 'bad' });
      return;
    }

    setRows((current) => (current ?? []).filter((row) => row.originalId !== originalId));
    toast.push({ message: 'Back in the library.', tone: 'good' });
    await reload();
  }

  async function empty() {
    setBusy(true);
    await fetch('/api/trash', { method: 'DELETE' }).catch(() => undefined);
    setBusy(false);
    setRows([]);
    toast.push({ message: 'Trash emptied.' });
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(1.75rem,7vw,2.25rem)] leading-tight text-text">
            Trash
          </h1>
          <p className="mt-1 text-sm text-muted">
            Kept for {retention} days, then removed for good.
          </p>
        </div>
        <Link href="/settings" className="shrink-0 text-sm text-champagne">
          Settings
        </Link>
      </header>

      {rows === null ? (
        <LoadingState rows={3} />
      ) : error ? (
        <ErrorState onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <EmptyState headline="Nothing in here." hint="Deleted items wait here before they go." />
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <article
                key={row.originalId}
                className="card flex items-center gap-3 px-3.5 py-3.5"
                data-testid="trash-row"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[1.0625rem] text-text">
                    {row.item.title || 'Untitled'}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    Deleted {relativeTime(row.deletedAt)} · {row.expiresInDays}{' '}
                    {pluralise(row.expiresInDays, 'day')} left
                  </p>
                </div>
                <Button size="sm" variant="secondary" busy={busy} onClick={() => void restore(row.originalId)}>
                  Restore
                </Button>
              </article>
            ))}
          </div>

          <Button variant="danger" busy={busy} onClick={() => void empty()}>
            Empty trash now
          </Button>
        </>
      )}
    </div>
  );
}
