'use client';

import { useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { useStore } from '@/components/shell/StoreProvider';
import { useToast } from '@/components/ui/Toast';

type Decision = 'todo' | 'someday' | 'let_go' | 'keep';

const CHOICES: { key: Decision; label: string; variant: 'primary' | 'secondary' | 'ghost' }[] = [
  { key: 'todo', label: 'To do', variant: 'primary' },
  { key: 'someday', label: 'Someday', variant: 'secondary' },
  { key: 'let_go', label: 'Let go', variant: 'ghost' },
  { key: 'keep', label: 'Keep', variant: 'ghost' },
];

/**
 * Weekly Review — the inbox, one item at a time, one decision each. The point
 * is momentum, not deliberation, so there is a progress bar and no back button.
 */
export function WeeklyReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, patchItem, deleteItem, guest, reload } = useStore();
  const toast = useToast();

  const queue = useMemo(
    () =>
      items
        .filter((i) => i.state === 'inbox')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    // Snapshot taken when the sheet opens; decisions must not reshuffle the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const current = queue[index];
  const total = queue.length;

  async function decide(decision: Decision) {
    if (!current) return;
    setBusy(true);

    const previousState = current.state;
    if (decision === 'todo') await patchItem(current.id, { state: 'todo' });
    else if (decision === 'someday') await patchItem(current.id, { state: 'someday' });
    else if (decision === 'let_go') await deleteItem(current.id);

    if (decision !== 'let_go' && decision !== 'keep') {
      toast.push({
        message: `Moved to ${decision}.`,
        undo: async () => {
          await patchItem(current.id, { state: previousState });
        },
      });
    }

    setBusy(false);
    setIndex((i) => i + 1);
  }

  async function complete() {
    if (!guest) {
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions: total }),
      }).catch(() => undefined);
      await reload();
    }
    toast.push({ message: 'Review done. +25', tone: 'good' });
    setIndex(0);
    onClose();
  }

  const finished = index >= total;

  return (
    <Sheet open={open} onClose={onClose} title="One decision. Don't overthink it.">
      {total === 0 ? (
        <div className="py-4">
          <p className="font-display text-2xl text-text">Inbox zero. Rare air.</p>
          <p className="mt-2 text-sm text-muted">Nothing to decide on this week.</p>
        </div>
      ) : finished ? (
        <div className="flex flex-col gap-4 py-4">
          <p className="font-display text-2xl text-text">
            {total} {total === 1 ? 'decision' : 'decisions'}. Done.
          </p>
          <p className="text-sm text-muted">That is the whole habit.</p>
          <Button full onClick={() => void complete()} data-testid="review-complete">
            Finish review
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-raised">
              <span
                className="block h-full rounded-pill bg-champagne transition-all"
                style={{ width: `${(index / total) * 100}%` }}
              />
            </span>
            <span className="shrink-0 font-mono text-[0.625rem] text-faint">
              {index + 1}/{total}
            </span>
          </div>

          <div className="card px-4 py-4">
            <p className="font-display text-xl leading-snug text-text">{current?.title}</p>
            {current?.summary ? (
              <p className="mt-1.5 text-sm text-muted">{current.summary}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {CHOICES.map((choice) => (
              <Button
                key={choice.key}
                variant={choice.variant}
                busy={busy}
                onClick={() => void decide(choice.key)}
                data-testid={`review-${choice.key}`}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
