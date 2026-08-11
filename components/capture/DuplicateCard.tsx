'use client';

import type { DupeHit } from '@/lib/dupe';
import { Button } from '@/components/ui/Button';
import { daysBetween } from '@/lib/utils';

/**
 * Shown before the classifier runs, so a duplicate never costs an AI call.
 * Two ways out, both one tap.
 */
export function DuplicateCard({
  hit,
  onAddAnyway,
  onSkip,
}: {
  hit: DupeHit;
  onAddAnyway: () => void;
  onSkip: () => void;
}) {
  const days = Math.max(0, daysBetween(hit.item.created_at, new Date()));

  return (
    <div className="flex flex-col gap-4" data-testid="duplicate-card">
      <div className="card px-4 py-4">
        <p className="eyebrow">already here</p>
        <p className="mt-2 font-display text-xl leading-snug text-text">
          Looks like you already saved this
          <span className="text-muted"> · {days}d ago</span>
        </p>
        <p className="mt-2 text-sm text-soft">{hit.item.title}</p>
        {hit.item.url ? (
          <p className="mt-1 truncate text-xs text-faint">{hit.item.url}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" full onClick={onAddAnyway}>
          Add anyway
        </Button>
        <Button full onClick={onSkip} data-testid="dupe-skip">
          Good catch — skip
        </Button>
      </div>
    </div>
  );
}
