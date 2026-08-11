'use client';

import { useState } from 'react';
import type { Item } from '@/lib/types';
import { PLATFORM_GRADIENT } from '@/lib/url';
import { cn } from '@/lib/utils';

/**
 * Four tiers, in order:
 *   1. a real thumbnail (uploaded image, or YouTube's mqdefault)
 *   2. the platform's gradient tile
 *   3. a serif letter glyph for plain notes
 * There is never an empty grey box.
 */
export function Thumb({ item, size = 56 }: { item: Item; size?: number }) {
  const [failed, setFailed] = useState(false);
  const dimension = { width: size, height: size };

  if (item.thumb_url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.thumb_url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        style={dimension}
        className="shrink-0 rounded-2xl border border-line object-cover"
      />
    );
  }

  if (item.platform) {
    return (
      <span
        aria-hidden="true"
        style={{ ...dimension, backgroundImage: PLATFORM_GRADIENT[item.platform] }}
        className="shrink-0 rounded-2xl border border-line"
      />
    );
  }

  const glyph = (item.title.trim()[0] ?? '·').toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={dimension}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-2xl border border-line bg-raised',
        'font-display text-2xl text-champagne/70',
      )}
    >
      {glyph}
    </span>
  );
}
