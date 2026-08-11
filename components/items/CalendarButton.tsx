'use client';

import type { Item } from '@/lib/types';
import { buildIcs } from '@/lib/ics';
import { cn } from '@/lib/utils';

/**
 * "Block time" — downloads a one-hour calendar event for this item.
 *
 * The file is built when the button is pressed, not when the page renders, for
 * two reasons. An .ics carries a DTSTAMP and, for an undated item, a start time
 * of "an hour from now" — both of which are wrong by the time anyone clicks a
 * link rendered minutes earlier. And because those timestamps differ between
 * the server render and the client's, putting them in an href produced a
 * hydration mismatch on every screen that showed one.
 */
export function CalendarButton({
  item,
  label = 'Block time',
  className,
}: {
  item: Pick<Item, 'id' | 'title' | 'summary' | 'url' | 'due_at'>;
  label?: string;
  className?: string;
}) {
  function download() {
    const ics = buildIcs(item);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const href = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = href;
    link.download = `${item.title.slice(0, 40).trim() || 'muse'}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Safari needs the URL to outlive the click; a tick is enough.
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return (
    <button
      type="button"
      onClick={download}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border border-line bg-raised text-text',
        'transition-colors hover:border-champagne/40',
        className,
      )}
    >
      <span aria-hidden="true">📅</span>
      {label}
    </button>
  );
}
