'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/components/shell/StoreProvider';
import { prioritiseLocal } from '@/lib/local-mode';
import { nextState } from '@/components/ui/Pill';
import { Button } from '@/components/ui/Button';
import type { Prioritisation } from '@/lib/types';
import { CalendarButton } from '@/components/items/CalendarButton';

/**
 * The Current — the one thing to do next, and why.
 *
 * Finish before you start is the whole point: an item already in motion beats a
 * shiny new one. In Local mode that rule lives in prioritiseLocal(); with
 * Intelligence on, it is hard-coded into the prompt and the answer arrives from
 * the server. Either way the card looks and behaves identically.
 */
export function TheCurrent({ onFocus }: { onFocus: (itemId: string) => void }) {
  const { items, aiActive, setState, guest } = useStore();

  const local = useMemo<Prioritisation>(() => prioritiseLocal(items), [items]);
  const [result, setResult] = useState<Prioritisation>(local);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    setResult(local);
    if (!aiActive) return;

    let cancelled = false;
    fetch('/api/ai/current')
      .then((res) => (res.ok ? (res.json() as Promise<Prioritisation>) : Promise.reject(res)))
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        // AI is unavailable or over budget. Local mode already has an answer on
        // screen; say so quietly rather than showing an error.
        if (!cancelled) setDegraded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [aiActive, local]);

  const item = items.find((i) => i.id === result.itemId) ?? null;

  if (!item) {
    return (
      <section className="rounded-card bg-wine px-5 py-7">
        <p className="eyebrow text-champagne/70">the current</p>
        <p className="mt-2 font-display text-2xl leading-snug text-text">
          Inbox zero. Rare air.
        </p>
        <p className="mt-2 text-sm text-soft">{result.why}</p>
      </section>
    );
  }

  const href = guest ? `/guest/item/${item.id}` : `/item/${item.id}`;

  return (
    <section className="rounded-card bg-wine px-5 py-6" data-testid="the-current">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow text-champagne/70">the current</p>
        {degraded ? (
          <span className="font-mono text-[0.5625rem] uppercase tracking-eyebrow text-soft/60">
            local mode
          </span>
        ) : null}
      </div>

      <Link href={href}>
        <h2 className="mt-2 font-display text-[clamp(1.5rem,6vw,2rem)] leading-tight text-text">
          {item.title}
        </h2>
      </Link>

      <p className="mt-2.5 text-sm leading-relaxed text-soft">{result.why}</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => void setState(item.id, nextState(item.state))}
        >
          {item.state === 'doing' ? 'Done' : 'Start'}
        </Button>

        <Button size="sm" variant="secondary" onClick={() => onFocus(item.id)}>
          ◉ Focus
        </Button>

        <CalendarButton item={item} className="h-9 px-3.5 text-[0.8125rem]" />
      </div>

      {result.alsoConsider.length > 0 ? (
        <div className="mt-5 border-t border-champagne/10 pt-3">
          <p className="eyebrow text-champagne/50">also worth a look</p>
          <ul className="mt-2 flex flex-col gap-1">
            {result.alsoConsider.map((alt) => (
              <li key={alt.id}>
                <Link
                  href={guest ? `/guest/item/${alt.id}` : `/item/${alt.id}`}
                  className="text-sm text-soft underline-offset-4 hover:underline"
                >
                  {alt.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
