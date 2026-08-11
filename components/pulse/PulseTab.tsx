'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/components/shell/StoreProvider';
import { ItemCard } from '@/components/items/ItemCard';
import { EmptyState, LoadingState, Section } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { WeeklyReview } from '@/components/habit/WeeklyReview';
import { Threads } from '@/components/pulse/Threads';
import { Reflection } from '@/components/pulse/Reflection';
import { ITEM_STATES, type ItemState } from '@/lib/types';
import { daysBetween, pluralise } from '@/lib/utils';

const FLOW_STATES: ItemState[] = ['inbox', 'todo', 'doing', 'done'];

export function PulseTab() {
  const { items, groups, stats, loading } = useStore();
  const [reviewOpen, setReviewOpen] = useState(false);

  const metrics = useMemo(() => {
    const now = new Date();
    const weekAgo = now.getTime() - 7 * 86_400_000;

    const doneThisWeek = items.filter(
      (i) => i.state === 'done' && i.done_at && new Date(i.done_at).getTime() >= weekAgo,
    ).length;

    const inMotion = items.filter((i) => i.state === 'doing').length;

    const inboxOld = items.filter(
      (i) => i.state === 'inbox' && daysBetween(i.created_at, now) > 7,
    ).length;

    const byState = Object.fromEntries(
      ITEM_STATES.map((state) => [state, items.filter((i) => i.state === state).length]),
    ) as Record<ItemState, number>;

    const byGroup = groups
      .map((group) => {
        const groupItems = items.filter((i) => i.group_id === group.id);
        const done = groupItems.filter((i) => i.state === 'done').length;
        return {
          id: group.id,
          name: group.name,
          total: groupItems.length,
          done,
          pct: groupItems.length === 0 ? 0 : Math.round((done / groupItems.length) * 100),
        };
      })
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total);

    const stuck = [...items]
      .filter((i) => i.state !== 'done')
      .sort((a, b) => new Date(a.touched_at).getTime() - new Date(b.touched_at).getTime())
      .slice(0, 3);

    return { doneThisWeek, inMotion, inboxOld, byState, byGroup, stuck };
  }, [items, groups]);

  if (loading) return <LoadingState rows={4} />;

  const inboxCount = metrics.byState.inbox;
  const flowMax = Math.max(1, ...FLOW_STATES.map((s) => metrics.byState[s]));

  return (
    <div className="flex flex-col gap-6">
      {/* Momentum shares The Current's wine gradient — the two places the
          product raises its voice. */}
      <section className="rounded-card bg-wine px-5 py-6" data-testid="momentum">
        <p className="eyebrow text-champagne/70">momentum</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat value={stats?.daily_streak ?? 0} label={pluralise(stats?.daily_streak ?? 0, 'day')} />
          <Stat value={stats?.week_streak ?? 0} label="reviews" />
          <Stat value={stats?.points ?? 0} label="points" />
        </div>
      </section>

      <Threads />
      <Reflection />

      <Section eyebrow="weekly review">
        {inboxCount === 0 ? (
          <EmptyState headline="Inbox zero. Rare air." hint="Nothing left to decide on." />
        ) : (
          <div className="card flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="font-display text-lg text-text">
                {inboxCount} {pluralise(inboxCount, 'thing')} waiting on a decision
              </p>
              <p className="mt-0.5 text-sm text-muted">One decision. Don&rsquo;t overthink it.</p>
            </div>
            <Button size="sm" onClick={() => setReviewOpen(true)} data-testid="start-review">
              Start
            </Button>
          </div>
        )}
      </Section>

      <div className="grid grid-cols-3 gap-2.5">
        <Tile value={metrics.doneThisWeek} label="done this week" />
        <Tile value={metrics.inMotion} label="in motion" />
        <Tile value={metrics.inboxOld} label="inbox > 7d" />
      </div>

      <Section eyebrow="flow">
        <div className="card flex flex-col gap-2.5 px-5 py-5">
          {FLOW_STATES.map((state) => (
            <div key={state} className="flex items-center gap-3">
              <span className="w-14 shrink-0 font-mono text-[0.625rem] uppercase tracking-eyebrow text-faint">
                {state}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-pill bg-raised">
                <span
                  className="block h-full rounded-pill bg-champagne/70"
                  style={{ width: `${(metrics.byState[state] / flowMax) * 100}%` }}
                />
              </span>
              <span className="w-7 shrink-0 text-right font-mono text-xs text-muted">
                {metrics.byState[state]}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {metrics.byGroup.length > 0 ? (
        <Section eyebrow="by group">
          <div className="card flex flex-col gap-3 px-5 py-5">
            {metrics.byGroup.map((group) => (
              <div key={group.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm text-soft">{group.name}</span>
                  <span className="shrink-0 font-mono text-[0.625rem] text-faint">
                    {group.done}/{group.total}
                  </span>
                </div>
                <span className="h-1.5 overflow-hidden rounded-pill bg-raised">
                  <span
                    className="block h-full rounded-pill bg-green/70"
                    style={{ width: `${group.pct}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {metrics.stuck.length > 0 ? (
        <Section eyebrow="stuck the longest">
          <div className="flex flex-col gap-2.5">
            {metrics.stuck.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </Section>
      ) : null}

      <WeeklyReview open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-[clamp(2rem,9vw,2.75rem)] leading-none text-text">{value}</p>
      <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-eyebrow text-champagne/70">
        {label}
      </p>
    </div>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="card px-3.5 py-4">
      <p className="font-display text-3xl leading-none text-text">{value}</p>
      <p className="mt-1.5 font-mono text-[0.5625rem] uppercase tracking-eyebrow text-faint">
        {label}
      </p>
    </div>
  );
}
