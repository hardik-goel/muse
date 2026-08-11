'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/shell/AppHeader';
import { TabBar } from '@/components/shell/TabBar';
import { CaptureSheet } from '@/components/capture/CaptureSheet';
import { useStore } from '@/components/shell/StoreProvider';

/**
 * The frame every signed-in and guest screen sits inside: header, scrolling
 * content, tab bar, and the capture sheet the FAB opens.
 *
 * Desktop keyboard shortcuts live here because they are global:
 *   n → new drop · / → search · 1 2 3 → tabs
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [dropOpen, setDropOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const { guest } = useStore();
  const basePath = guest ? '/guest' : '';

  const openDrop = useCallback(() => setDropOpen(true), []);

  // Marks the point where the shell's handlers are actually attached. Server
  // HTML renders the FAB immediately, so without this a tap — or a test — can
  // land on a button that is not listening yet and silently do nothing.
  useEffect(() => setReady(true), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Never hijack a key the user is typing into a field.
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case 'n':
          event.preventDefault();
          setDropOpen(true);
          break;
        case '/':
          event.preventDefault();
          router.push(`${basePath}/library?focus=search`);
          break;
        case '1':
          router.push(`${basePath}/now`);
          break;
        case '2':
          router.push(`${basePath}/library`);
          break;
        case '3':
          router.push(`${basePath}/pulse`);
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, basePath]);

  return (
    <div className="flex min-h-dvh flex-col" data-shell-ready={ready ? 'true' : 'false'}>
      <AppHeader />

      <main
        id="main"
        className="mx-auto w-full max-w-2xl flex-1 gutter pb-32 pt-5 lg:max-w-5xl"
        tabIndex={-1}
      >
        {children}
      </main>

      <TabBar basePath={basePath} onDrop={openDrop} />
      <CaptureSheet open={dropOpen} onClose={() => setDropOpen(false)} />
    </div>
  );
}
