import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/ui/Wordmark';

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

/**
 * Served by the service worker when a navigation fails. Nothing on this page
 * needs the network, including the reload link.
 */
export default function OfflinePage() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gutter text-center">
      <Wordmark size="md" />

      <h1 className="mt-8 max-w-[18ch] font-display text-[clamp(1.75rem,8vw,2.5rem)] leading-tight text-text">
        No signal.
      </h1>
      <p className="mt-3 max-w-[30ch] text-sm leading-relaxed text-muted">
        Anything you dropped in while offline is still on this device and will sync the moment you
        are back.
      </p>

      <Link
        href="/now"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-pill bg-champagne px-6 font-medium text-bg"
      >
        Try again
      </Link>
    </main>
  );
}
