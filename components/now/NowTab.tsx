'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/components/shell/StoreProvider';
import { MorningBrief } from '@/components/now/MorningBrief';
import { TheCurrent } from '@/components/now/TheCurrent';
import { ArchiveCard } from '@/components/now/ArchiveCard';
import { ItemCard } from '@/components/items/ItemCard';
import { EmptyState, LoadingState, Section } from '@/components/ui/States';
import { FocusSession } from '@/components/habit/FocusSession';
import { OnboardingChecklist } from '@/components/now/OnboardingChecklist';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { INTERESTS } from '@/lib/types';
import { rankLocal } from '@/lib/local-mode';
import { daysBetween } from '@/lib/utils';

/**
 * Now — what today asks of you, in the order it asks.
 *
 * On wide screens this becomes two columns: the decision surfaces on the left,
 * the queues on the right. On a phone it is one honest column.
 */
export function NowTab() {
  const { items, loading, profile, stats, guest } = useStore();
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  const { inMotion, upNext, freshInbox, reviewDue } = useMemo(() => {
    const active = items.filter((i) => i.state !== 'done');

    return {
      // Oldest first: the thing you started longest ago is the thing nagging you.
      inMotion: active
        .filter((i) => i.state === 'doing')
        .sort((a, b) => new Date(a.touched_at).getTime() - new Date(b.touched_at).getTime()),
      upNext: rankLocal(active.filter((i) => i.state === 'todo'))
        .slice(0, 5)
        .map(({ item }) => item),
      freshInbox: active
        .filter((i) => i.state === 'inbox')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 4),
      reviewDue:
        active.filter((i) => i.state === 'inbox').length >= 5 ||
        (stats?.last_review_at ? daysBetween(stats.last_review_at, new Date()) >= 7 : false),
    };
  }, [items, stats]);

  if (loading) return <LoadingState rows={4} />;

  const interestHints = (profile?.interests ?? [])
    .map((key) => INTERESTS.find((i) => i.key === key))
    .filter((i): i is (typeof INTERESTS)[number] => Boolean(i))
    .slice(0, 3);

  const empty = items.length === 0;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-7">
      {/* The tab bar names this screen visually; assistive tech needs it in the
          document too, so every tab carries one heading it does not draw. */}
      <h1 className="sr-only">Now</h1>
      <div className="flex flex-col gap-6">
        <MorningBrief />
        <TheCurrent onFocus={setFocusItemId} />
        {!guest ? <OnboardingChecklist /> : null}
        {!guest ? <InstallPrompt /> : null}
        <ArchiveCard />

        {reviewDue ? (
          <Link
            href={guest ? '/guest/pulse' : '/pulse'}
            className="card flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:border-champagne/40"
            data-testid="review-nudge"
          >
            <div>
              <p className="eyebrow">weekly review</p>
              <p className="mt-1 font-display text-lg text-text">Your inbox has opinions.</p>
            </div>
            <span className="shrink-0 text-champagne">→</span>
          </Link>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        {empty ? (
          <EmptyState
            headline="Nothing yet."
            hint={
              interestHints[0]
                ? interestHints[0].emptyHint
                : 'Paste a link, type a thought. Muse files it.'
            }
          />
        ) : null}

        {inMotion.length > 0 ? (
          <Section eyebrow={`in motion · ${inMotion.length}`}>
            <div className="flex flex-col gap-2.5">
              {inMotion.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </Section>
        ) : null}

        {upNext.length > 0 ? (
          <Section eyebrow="up next">
            <div className="flex flex-col gap-2.5">
              {upNext.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </Section>
        ) : null}

        {freshInbox.length > 0 ? (
          <Section
            eyebrow="fresh in inbox"
            action={
              <Link
                href={guest ? '/guest/library' : '/library'}
                className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-champagne"
              >
                All
              </Link>
            }
          >
            <div className="flex flex-col gap-2.5">
              {freshInbox.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </Section>
        ) : null}

        {!empty && inMotion.length === 0 && upNext.length === 0 && freshInbox.length === 0 ? (
          <EmptyState headline="Inbox zero. Rare air." hint="Nothing is waiting on you." />
        ) : null}

        {empty && interestHints.length > 1 ? (
          <Section eyebrow="since you mentioned">
            <ul className="flex flex-col gap-2">
              {interestHints.slice(1).map((interest) => (
                <li key={interest.key} className="card px-4 py-3 text-sm text-muted">
                  {interest.emptyHint}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>

      <FocusSession itemId={focusItemId} onClose={() => setFocusItemId(null)} />
    </div>
  );
}
