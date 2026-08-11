/* eslint-disable no-restricted-globals */
/**
 * Muse service worker.
 *
 * Three jobs, and deliberately no more:
 *   1. Serve the offline page when a navigation cannot reach the network.
 *   2. Cache-first for static build assets, network-first for everything else.
 *   3. Receive push notifications and route the click.
 *
 * It never caches an API response. Personal data behind a cookie has no place
 * in a cache that outlives the session, and a stale library is worse than a
 * spinner.
 */

const VERSION = 'muse-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = '/offline';

const SHELL = [OFFLINE_URL, '/icons/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache anything user-specific.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }),
    );
    return;
  }

  // Build assets are content-hashed, so a cache hit is always correct.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Muse', body: '', url: '/now', tag: 'muse' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url },
      // Muse sends at most a couple of notifications a day; none of them should
      // vibrate a phone at length or stack silently.
      renotify: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/now';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Focus an existing tab rather than opening a fourth copy of the app.
      for (const client of windows) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// The page asks for an immediate activation after an update is downloaded.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
