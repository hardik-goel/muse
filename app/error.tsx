'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-level error boundary. The copy matters here: a crash must never imply
 * that the person's work is gone, because it never is — every capture is
 * written before any of this code runs.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(JSON.stringify({ level: 'error', message: 'route error', digest: error.digest }));
  }, [error]);

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gutter text-center"
    >
      <h1 className="max-w-[20ch] font-display text-[clamp(1.75rem,8vw,2.5rem)] leading-tight text-text">
        That broke on our side.
      </h1>
      <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-muted">
        Nothing you dropped in was lost. Try again, or go back to Now.
      </p>

      <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-12 items-center justify-center rounded-pill bg-champagne px-6 font-medium text-bg"
        >
          Try again
        </button>
        <Link
          href="/now"
          className="inline-flex h-12 items-center justify-center rounded-pill border border-line bg-raised px-6 font-medium text-text"
        >
          Back to Now
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-6 font-mono text-[0.625rem] text-faint">ref {error.digest}</p>
      ) : null}
    </main>
  );
}
