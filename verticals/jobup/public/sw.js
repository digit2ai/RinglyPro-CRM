/* JobUp service worker.
 *
 * Caches the app shell only. It NEVER caches /api/ — a career dashboard
 * showing yesterday's matches from a stale cache would be worse than an
 * offline notice. Bump CACHE whenever a shell file changes.
 */
const CACHE = 'jobup-v1';
const SHELL = [
  '/jobup/app',
  '/jobup/manifest.webmanifest',
  '/jobup/icon-192.png',
  '/jobup/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  // Never serve API responses from cache.
  if (url.pathname.includes('/api/')) return;

  // Network-first for navigations so a deploy is picked up immediately.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/jobup/app'))));
    return;
  }
  e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request)));
});
