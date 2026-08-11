import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Every list in Muse ships all three of these. The copy is in-voice: sharp
 * friend, never a cheerleader, never an apology.
 */

export function EmptyState({
  headline,
  hint,
  action,
  className,
}: {
  headline: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('card flex flex-col items-start gap-2 px-5 py-7', className)}>
      <p className="font-display text-xl text-text">{headline}</p>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card shimmer h-[84px] w-full" />
      ))}
    </div>
  );
}

export function ErrorState({
  message = 'That did not load.',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('card flex flex-col items-start gap-2 border-red/25 px-5 py-6', className)}>
      <p className="font-display text-lg text-text">{message}</p>
      <p className="text-sm text-muted">Nothing was lost. Try again when you are ready.</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-pill border border-line px-3.5 py-1.5 text-[0.8125rem] text-soft transition-colors hover:text-text"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Section({
  eyebrow,
  action,
  children,
  className,
}: {
  eyebrow: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">{eyebrow}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
