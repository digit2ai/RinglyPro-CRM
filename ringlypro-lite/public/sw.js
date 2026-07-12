/* RinglyPro Lite service worker — installability + app-icon badge support. */
const CACHE = 'lite-v6';
const ASSETS = ['/dashboard', '/apple-touch-icon.png', '/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Network-first for navigations/API, cache fallback for the shell.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/voice') || url.pathname.startsWith('/webhooks')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// Page → SW messages to update the app-icon badge count.
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'badge' && 'setAppBadge' in self.registration) {
    if (d.count > 0) self.registration.setAppBadge(d.count).catch(() => {});
    else self.registration.clearAppBadge && self.registration.clearAppBadge().catch(() => {});
  }
});

// Web Push (optional future): show a notification + bump the badge.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {}
  const count = data.unread || 1;
  if ('setAppBadge' in self.registration) self.registration.setAppBadge(count).catch(() => {});
  e.waitUntil(self.registration.showNotification(data.title || 'RinglyPro Lite', {
    body: data.body || 'New message',
    icon: '/icon-192.png',
    badge: '/icon-192.png'
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => {
    for (const c of cs) if (c.url.includes('/dashboard')) return c.focus();
    return self.clients.openWindow('/dashboard');
  }));
});
