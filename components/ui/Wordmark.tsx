import { cn } from '@/lib/utils';

/**
 * `Muse.` — the period is champagne and italic. This is the only place the
 * wordmark is constructed; never hand-write it elsewhere.
 * Size uses clamp() so it never overflows a 320px viewport.
 */
export function Wordmark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'text-[clamp(1.25rem,5vw,1.5rem)]',
    md: 'text-[clamp(1.75rem,7vw,2.25rem)]',
    lg: 'text-[clamp(2.5rem,12vw,4rem)]',
  } as const;

  return (
    <span className={cn('font-display leading-none text-text', sizes[size], className)}>
      Muse
      <span className="italic text-champagne">.</span>
    </span>
  );
}
