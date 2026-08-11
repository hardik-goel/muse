import type { ReactNode } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/ui/Wordmark';

/**
 * The account screens share one backdrop: a wine fade behind the serif
 * wordmark. Nothing else competes with it.
 */
export function AuthShell({
  eyebrow,
  headline,
  children,
  footer,
}: {
  eyebrow: string;
  headline: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main id="main" className="relative flex min-h-dvh flex-col justify-center gutter py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[46vh] bg-wine opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />

      <div className="relative mx-auto w-full max-w-sm">
        <Link href="/" className="inline-block">
          <Wordmark size="md" />
        </Link>

        <p className="eyebrow mt-8">{eyebrow}</p>
        <h1 className="mt-1.5 font-display text-[clamp(1.75rem,8vw,2.5rem)] leading-tight text-text">
          {headline}
        </h1>

        <div className="mt-7">{children}</div>

        {footer ? <div className="mt-7 text-sm text-muted">{footer}</div> : null}
      </div>
    </main>
  );
}

export function AvatarCircle({ letter, className = '' }: { letter: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-champagne/30 bg-champagne-tint font-display text-lg text-champagne ${className}`}
    >
      {letter}
    </span>
  );
}
