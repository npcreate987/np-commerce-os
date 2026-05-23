/**
 * NP Commerce — dedicated push service worker
 *
 * Why a separate SW from the next-pwa-generated `sw.js`?
 *   - Push events are routed to whichever SW owns the subscription; this file
 *     has a narrow, audit-able responsibility (display + click-to-open) and
 *     doesn't fight with workbox's offline cache strategy.
 *   - Registered explicitly from `lib/push.ts` only after user opts in,
 *     so users who don't want notifications never get a 2nd SW installed.
 */

self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return { title: 'NP Commerce', body: event.data ? event.data.text() : '' };
    }
  })();

  const title = data.title || 'NP Commerce';
  const body = data.body || '';
  const url = data.url || '/';
  const tag = data.tag || 'np';
  const icon = data.imageUrl || '/icons/icon-192.png';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon,
      badge: '/icons/badge-72.png',
      data: { url, ...(data.data || {}) },
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Prefer focusing an existing tab on the same origin
      for (const c of clientList) {
        if ('focus' in c) {
          try {
            await c.focus();
            if ('navigate' in c) {
              await c.navigate(target);
            }
            return;
          } catch {
            // fall through to opening a fresh window
          }
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
