'use client';

import Link from 'next/link';
import type { Item } from '@/lib/types';
import { Thumb } from '@/components/items/Thumb';
import { PriorityBadge, StatePill, Tag, nextState } from '@/components/ui/Pill';
import { useStore } from '@/components/shell/StoreProvider';
import { cn, relativeTime } from '@/lib/utils';

/**
 * The unit the whole product is built out of. Tapping the card opens the detail
 * view; tapping the state pill advances the state without leaving the list.
 */
export function ItemCard({
  item,
  selectable = false,
  selected = false,
  onSelect,
  className,
}: {
  item: Item;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const { setState, groupName, guest } = useStore();
  const organising = item.ai_status === 'pending';
  const href = guest ? `/guest/item/${item.id}` : `/item/${item.id}`;

  return (
    <article
      data-testid="item-card"
      data-item-id={item.id}
      className={cn(
        'card relative flex gap-3 px-3.5 py-3.5 transition-colors animate-rise',
        selected && 'border-champagne/50 bg-champagne-tint',
        className,
      )}
    >
      {selectable ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect?.(item.id)}
          aria-label={`Select ${item.title}`}
          className="mt-1 h-4 w-4 shrink-0 accent-[#D8C39A]"
        />
      ) : null}

      <Thumb item={item} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Link href={href} className="min-w-0">
          <h3
            className={cn(
              'font-display text-[1.0625rem] leading-snug text-text',
              organising && 'shimmer rounded',
            )}
          >
            {item.title || 'Untitled'}
          </h3>
          {organising ? (
            <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-eyebrow text-champagne/70">
              organising…
            </p>
          ) : item.summary ? (
            <p className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug text-muted">
              {item.summary}
            </p>
          ) : null}
        </Link>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatePill
            state={item.state}
            onClick={(event) => {
              event.stopPropagation();
              void setState(item.id, nextState(item.state));
            }}
          />
          {item.priority ? <PriorityBadge priority={item.priority} /> : null}
          {item.group_id ? <Tag>{groupName(item.group_id)}</Tag> : null}
          {item.tags.slice(0, 2).map((tag) => (
            <Tag key={tag}>#{tag}</Tag>
          ))}
          <span className="ml-auto shrink-0 font-mono text-[0.625rem] text-faint">
            {relativeTime(item.created_at)}
          </span>
        </div>
      </div>
    </article>
  );
}
