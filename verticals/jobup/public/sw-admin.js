/* JobUp Subscribers console — service worker.
 *
 * NOT served as a static file; src/services/pwa.js substitutes __BASE__,
 * __CACHE__ and __V__ for the root it is registered at.
 *
 * Scoped to the console path, so it controls this app and nothing else. Its job
 * is small and specific: keep the shell available, and turn a push into a
 * number on the home-screen icon.
 */
const CACHE = '__CACHE__';
const BASE = '__BASE__';
const ROOT = BASE + '/subscribers-admin';
const SHELL = [ROOT + '/', ROOT + '/manifest.webmanifest',
  BASE + '/icon-192.png__V__', BASE + '/icon-512.png__V__'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) =>
    // Individually, never addAll: addAll is atomic, so one 404 would abort the
    // install and leave the console with no worker and therefore no badge.
    Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  // NEVER cache the API. A billing register showing yesterday's subscribers
  // from cache is worse than showing an error.
  if (url.pathname.includes('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request)
      .then((r) => { if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request).then((m) => m || caches.match(ROOT + '/'))
        .then((m) => m || new Response('Offline', { status: 503 }))));
    return;
  }
  e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request)));
});

/**
 * THE BADGE. This is what makes the count visible on a closed app.
 *
 * The payload carries the number rather than the worker fetching it, because a
 * push handler has a few seconds and an unauthenticated worker cannot read the
 * console's API anyway — the session cookie is not attached to a background
 * fetch it initiates without credentials.
 */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = {}; }
  const count = Number(data.count || 0);

  e.waitUntil((async () => {
    if (self.navigator && self.navigator.setAppBadge) {
      try {
        if (count > 0) await self.navigator.setAppBadge(count);
        else await self.navigator.clearAppBadge();
      } catch (err) { /* badging unsupported here; the notification still lands */ }
    }
    // iOS only delivers a push to an installed PWA if a notification is shown.
    // Silent pushes are dropped and repeated silent pushes cost the site its
    // push permission, so this is not optional there.
    if (count > 0 && self.registration.showNotification) {
      await self.registration.showNotification(
        count === 1 ? 'New JobUp subscriber' : `${count} new JobUp subscribers`,
        {
          body: data.reason || 'Open the console to see who.',
          icon: BASE + '/icon-192.png__V__',
          badge: BASE + '/icon-192.png__V__',
          tag: 'jobup-new-subscriber',   // collapses, never stacks up
          renotify: false,
          data: { url: ROOT + '/' },
        });
    }
    // Tell any open window so its in-page count updates without a refresh.
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'new_subscriber', count }));
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || ROOT + '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => c.url.includes('/subscribers-admin'));
    if (open) return open.focus();
    return self.clients.openWindow(target);
  })());
});

/** The page can ask the worker to clear the badge the moment it is read. */
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'set_badge' && self.navigator && self.navigator.setAppBadge) {
    if (d.count > 0) self.navigator.setAppBadge(d.count).catch(() => {});
    else self.navigator.clearAppBadge().catch(() => {});
  }
});
