'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ItemState } from '@/lib/types';

const stateStyles: Record<ItemState, string> = {
  inbox: 'bg-raised text-muted border-line',
  todo: 'bg-champagne-tint text-champagne border-champagne/25',
  doing: 'bg-wine-tint text-wine border-wine/35',
  done: 'bg-green-tint text-green border-green/25',
  someday: 'bg-violet-tint text-violet border-violet/25',
};

export const STATE_LABEL: Record<ItemState, string> = {
  inbox: 'inbox',
  todo: 'to do',
  doing: 'doing',
  done: 'done',
  someday: 'someday',
};

/** Tap to advance: inbox → todo → doing → done, and someday → todo. */
export function nextState(state: ItemState): ItemState {
  switch (state) {
    case 'inbox':
      return 'todo';
    case 'todo':
      return 'doing';
    case 'doing':
      return 'done';
    case 'done':
      return 'todo';
    case 'someday':
      return 'todo';
  }
}

export function StatePill({
  state,
  className,
  ...rest
}: { state: ItemState } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={`State: ${STATE_LABEL[state]}. Tap to advance.`}
      className={cn(
        'inline-flex h-7 shrink-0 items-center rounded-pill border px-3',
        'font-mono text-[0.6875rem] uppercase tracking-eyebrow transition-colors',
        stateStyles[state],
        className,
      )}
      {...rest}
    >
      {STATE_LABEL[state]}
    </button>
  );
}

export function Chip({
  active = false,
  className,
  children,
  ...rest
}: { active?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 shrink-0 scroll-ml-4 snap-start items-center whitespace-nowrap rounded-pill border px-3.5 text-[0.8125rem] transition-colors',
        active
          ? 'border-champagne/40 bg-champagne-tint text-champagne'
          : 'border-line bg-surface text-soft hover:text-text',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill bg-raised px-2 py-0.5 text-[0.6875rem] text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

const PRIORITY_STYLE: Record<1 | 2 | 3, string> = {
  1: 'bg-red-tint text-red',
  2: 'bg-champagne-tint text-champagne',
  3: 'bg-raised text-muted',
};

export function PriorityBadge({ priority }: { priority: 1 | 2 | 3 }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-pill px-2 font-mono text-[0.625rem] tracking-eyebrow',
        PRIORITY_STYLE[priority],
      )}
    >
      P{priority}
    </span>
  );
}
