'use client';

import Link from 'next/link';
import { Wordmark } from '@/components/ui/Wordmark';
import { useStore } from '@/components/shell/StoreProvider';
import { initials } from '@/lib/utils';

export function AppHeader() {
  const { guest, profile } = useStore();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 gutter py-3">
        <Link href={guest ? '/guest/now' : '/now'} aria-label="Muse home">
          <Wordmark size="sm" />
        </Link>

        {guest ? (
          <div className="flex items-center gap-3">
            <span
              data-testid="guest-banner"
              className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-muted"
            >
              guest — nothing is saved
            </span>
            <Link
              href="/sign-up"
              className="rounded-pill bg-champagne px-3.5 py-1.5 text-[0.8125rem] font-medium text-bg"
            >
              Keep it
            </Link>
          </div>
        ) : (
          <Link
            href="/settings"
            aria-label="Settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-champagne/30 bg-champagne-tint font-display text-base text-champagne"
          >
            {initials(profile?.name ?? '', profile?.email ?? '')}
          </Link>
        )}
      </div>
    </header>
  );
}
