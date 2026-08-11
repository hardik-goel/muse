'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'wine';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  full?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-champagne text-bg hover:bg-champDeep active:bg-champDeep',
  secondary: 'bg-raised text-text border border-line hover:border-champagne/40',
  ghost: 'bg-transparent text-soft hover:text-text hover:bg-raised',
  danger: 'bg-red-tint text-red border border-red/30 hover:bg-red/20',
  wine: 'bg-wine text-text hover:bg-wine/85',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[0.8125rem]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-6 text-base py-3.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', busy = false, full = false, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-pill font-medium',
        'transition-colors duration-150 select-none',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {busy ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
});
