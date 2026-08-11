'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker and, when a new one is waiting, activates it
 * rather than leaving the user pinned to an old build until every tab closes.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // A worker registered against the dev server caches a build that is about
    // to change under it; the debugging cost is not worth the fidelity.
    if (process.env.NODE_ENV !== 'production') return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage('skip-waiting');
            }
          });
        });
      } catch {
        // No service worker means no offline page. The app itself is unaffected.
      }
    };

    void register();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
