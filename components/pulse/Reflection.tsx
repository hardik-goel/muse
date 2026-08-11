'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/components/shell/StoreProvider';
import { Section } from '@/components/ui/States';
import { reflectLocal } from '@/lib/local-mode';
import { daysBetween } from '@/lib/utils';

/**
 * The weekly reflection. Three or four sentences, exact titles, zero flattery —
 * the same contract whether it comes from Claude or from the template.
 */
export function Reflection() {
  const { items, groups, aiActive } = useStore();

  const local = useMemo(() => {
    const now = new Date();
    const weekAgo = now.getTime() - 7 * 86_400_000;

    const done = items.filter(
      (i) => i.state === 'done' && i.done_at && new Date(i.done_at).getTime() >= weekAgo,
    );
    const captured = items.filter((i) => new Date(i.created_at).getTime() >= weekAgo).length;

    const counts = new Map<string, number>();
    for (const item of done) {
      if (!item.group_id) continue;
      counts.set(item.group_id, (counts.get(item.group_id) ?? 0) + 1);
    }
    const topGroupId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return reflectLocal({
      done: done.length,
      captured,
      inMotion: items.filter((i) => i.state === 'doing').length,
      inboxOverdue: items.filter(
        (i) => i.state === 'inbox' && daysBetween(i.created_at, now) > 7,
      ).length,
      topGroup: groups.find((g) => g.id === topGroupId)?.name ?? null,
    });
  }, [items, groups]);

  const [text, setText] = useState(local);

  useEffect(() => {
    setText(local);
    if (!aiActive) return;

    let cancelled = false;
    fetch('/api/ai/reflect')
      .then((res) => (res.ok ? (res.json() as Promise<{ reflection: string }>) : Promise.reject(res)))
      .then((data) => {
        if (!cancelled) setText(data.reflection);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [aiActive, local]);

  return (
    <Section eyebrow="this week">
      <div className="card px-5 py-5" data-testid="reflection">
        <p className="text-sm leading-relaxed text-soft">{text}</p>
      </div>
    </Section>
  );
}
