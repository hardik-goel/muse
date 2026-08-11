'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/components/shell/StoreProvider';
import { Section } from '@/components/ui/States';
import type { ThreadPayload } from '@/lib/types';

/**
 * Threads — two or three connections across the library that are not obvious
 * from the group names. Intelligence-only, and flag-gated so it can be pulled
 * without a deploy if the quality slips.
 */
export function Threads() {
  const { aiActive, flags, items, guest } = useStore();
  const [threads, setThreads] = useState<ThreadPayload[] | null>(null);

  const enabled = aiActive && flags.threads && items.length >= 8;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    fetch('/api/ai/threads')
      .then((res) => (res.ok ? (res.json() as Promise<{ threads: ThreadPayload[] }>) : Promise.reject(res)))
      .then((data) => {
        if (!cancelled) setThreads(data.threads);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || !threads || threads.length === 0) return null;

  return (
    <Section eyebrow="threads">
      <div className="flex flex-col gap-2.5">
        {threads.map((thread) => (
          <article key={thread.title} className="card px-5 py-4">
            <h3 className="font-display text-lg leading-snug text-text">{thread.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{thread.detail}</p>
            <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
              {thread.itemIds.map((id) => (
                <li key={id}>
                  <Link
                    href={guest ? `/guest/item/${id}` : `/item/${id}`}
                    className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-champagne"
                  >
                    open
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </Section>
  );
}
