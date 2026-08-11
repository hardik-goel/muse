import type { ReactNode } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/ui/Wordmark';

/**
 * The frame the two legal pages share. Deliberately plain: these are documents,
 * not surfaces, and the only thing they owe the reader is legibility.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main id="main" className="mx-auto min-h-dvh w-full max-w-2xl gutter py-10">
      <Link href="/" className="inline-block">
        <Wordmark size="sm" />
      </Link>

      <h1 className="mt-8 font-display text-[clamp(2rem,8vw,2.75rem)] leading-tight text-text">
        {title}
      </h1>
      <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-eyebrow text-faint">
        last updated {updated}
      </p>

      <div className="mt-8 flex flex-col gap-6">{children}</div>

      <div className="mt-12 flex gap-4 border-t border-line pt-6 text-xs text-faint">
        <Link href="/privacy" className="hover:text-muted">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-muted">
          Terms
        </Link>
        <Link href="/plans" className="hover:text-muted">
          Plans
        </Link>
      </div>
    </main>
  );
}

export function Clause({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl text-text">{heading}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-soft">{children}</div>
    </section>
  );
}
