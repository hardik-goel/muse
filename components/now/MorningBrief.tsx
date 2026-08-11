'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/components/shell/StoreProvider';
import { briefLocal } from '@/lib/local-mode';
import { localDayOfWeek, localHour } from '@/lib/utils';
import type { BriefPayload } from '@/lib/types';

/**
 * The Morning Brief. Cached per day server-side when Intelligence is on;
 * generated from templates in Local mode. Both obey the same rules: no emojis,
 * at most one exclamation, names exactly one first win.
 */
export function MorningBrief() {
  const { items, settings, profile, aiActive } = useStore();
  const timezone = profile?.timezone ?? 'Asia/Kolkata';

  const local = useMemo(() => {
    const now = new Date();
    const hour = localHour(now, timezone);
    const dayOfWeek = localDayOfWeek(now, timezone);

    const active = items.filter((i) => i.state !== 'done');
    const todos = active
      .filter((i) => i.state === 'todo')
      .sort((a, b) => (a.priority ?? 4) - (b.priority ?? 4));
    const firstWin = todos[0] ? { id: todos[0].id, title: todos[0].title } : null;

    const todayStr = new Date().toDateString();
    const dueToday = active.filter(
      (i) => i.due_at && new Date(i.due_at).toDateString() === todayStr,
    ).length;

    const workoutToday =
      settings?.workout_enabled && settings.workout_split[dayOfWeek]
        ? (settings.workout_split[dayOfWeek] as string)
        : null;

    return briefLocal({
      hour,
      firstWin,
      dueToday,
      inMotion: active.filter((i) => i.state === 'doing').length,
      workoutToday,
      workoutWhy: settings?.workout_why ?? '',
    });
  }, [items, settings, timezone]);

  const [brief, setBrief] = useState<{ greeting: string; body: string }>(local);

  useEffect(() => {
    setBrief(local);
    if (!aiActive) return;

    let cancelled = false;
    fetch('/api/ai/brief')
      .then((res) => (res.ok ? (res.json() as Promise<BriefPayload>) : Promise.reject(res)))
      .then((data) => {
        if (!cancelled) setBrief({ greeting: data.greeting, body: data.body });
      })
      .catch(() => undefined); // Local copy is already correct and on screen.

    return () => {
      cancelled = true;
    };
  }, [aiActive, local]);

  return (
    <section className="card px-5 py-5" data-testid="morning-brief">
      <p className="eyebrow">the brief</p>
      <p className="mt-2 font-display text-2xl leading-tight text-text">{brief.greeting}</p>
      <p className="mt-2 text-sm leading-relaxed text-soft">{brief.body}</p>
    </section>
  );
}
