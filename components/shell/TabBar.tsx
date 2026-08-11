'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: 'now', label: 'Now', key: '1' },
  { href: 'library', label: 'Library', key: '2' },
  { href: 'pulse', label: 'Pulse', key: '3' },
] as const;

/**
 * Bottom tab bar with the "+ Drop" FAB sitting in the middle. On desktop it
 * stays put — the shortcut keys (1/2/3) are the faster path there anyway.
 */
export function TabBar({ basePath, onDrop }: { basePath: string; onDrop: () => void }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2">
        {TABS.slice(0, 1).map((tab) => (
          <TabLink key={tab.href} tab={tab} basePath={basePath} pathname={pathname} />
        ))}

        <button
          type="button"
          onClick={onDrop}
          data-testid="drop-fab"
          aria-label="Drop something in"
          className="-mt-5 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-champagne text-2xl text-bg shadow-lg transition-transform active:scale-95"
        >
          +
        </button>

        {TABS.slice(1).map((tab) => (
          <TabLink key={tab.href} tab={tab} basePath={basePath} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({
  tab,
  basePath,
  pathname,
}: {
  tab: (typeof TABS)[number];
  basePath: string;
  pathname: string;
}) {
  const href = `${basePath}/${tab.href}`.replace('//', '/');
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-w-[72px] flex-col items-center gap-1 px-3 py-3 font-mono text-[0.625rem] uppercase tracking-eyebrow transition-colors',
        active ? 'text-champagne' : 'text-faint hover:text-muted',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('h-1 w-1 rounded-full', active ? 'bg-champagne' : 'bg-transparent')}
      />
      {tab.label}
    </Link>
  );
}

export const TAB_ORDER = TABS;
