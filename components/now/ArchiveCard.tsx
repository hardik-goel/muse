'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/components/shell/StoreProvider';
import { archivePick } from '@/lib/gamification';
import { Button } from '@/components/ui/Button';
import { relativeTime } from '@/lib/utils';

/**
 * From the Archive — one forgotten item a day, three ways out. The rotation is
 * deterministic (day index modulo candidate count), so it does not change if
 * you refresh, and it does change tomorrow.
 */
export function ArchiveCard() {
  const { items, patchItem, deleteItem, guest } = useStore();
  const [dismissed, setDismissed] = useState<string | null>(null);

  const pick = useMemo(() => archivePick(items), [items]);
  if (!pick || dismissed === pick.id) return null;

  async function decide(decision: 'still_matters' | 'someday' | 'let_go') {
    if (!pick) return;
    setDismissed(pick.id);

    if (decision === 'still_matters') await patchItem(pick.id, { state: 'todo' });
    else if (decision === 'someday') await patchItem(pick.id, { state: 'someday' });
    else await deleteItem(pick.id);

    if (!guest) {
      void fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: pick.id, decision }),
      }).catch(() => undefined);
    }
  }

  return (
    <section className="card px-5 py-5" data-testid="archive-card">
      <p className="eyebrow">from the archive</p>
      <p className="mt-2 font-display text-xl leading-snug text-text">{pick.title}</p>
      <p className="mt-1 text-xs text-faint">Untouched since {relativeTime(pick.touched_at)}</p>
      <p className="mt-3 font-display text-lg text-champagne">Still matters?</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void decide('still_matters')}>
          Still matters
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void decide('someday')}>
          Someday
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void decide('let_go')}>
          Let go
        </Button>
      </div>
    </section>
  );
}
