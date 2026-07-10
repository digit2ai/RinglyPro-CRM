/* RoundShare service worker — app-shell cache for installable PWA + offline.
   Scope is derived from the SW location, so it works at both roundshare.app/
   (root) and aiagent.ringlypro.com/roundshare/. Bump CACHE to invalidate. */
const CACHE = 'roundshare-v1';
const PRECACHE = [
  './',
  './index.html',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './site.webmanifest'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // never touch POSTs (waitlist/plan-signup)
  const url = new URL(req.url);
  if (url.pathname.indexOf('/api/') !== -1) return; // always hit network for API
  if (url.origin !== self.location.origin) return;  // don't cache cross-origin (CDN video, fonts)

  // Navigations: network-first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })
        .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
    );
    return;
  }

  // Static assets: cache-first, then network (and cache the result).
  e.respondWith(
    caches.match(req).then((m) => m || fetch(req).then((r) => {
      if (r && r.status === 200 && r.type === 'basic') {
        const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp));
      }
      return r;
    }).catch(() => m))
  );
});
