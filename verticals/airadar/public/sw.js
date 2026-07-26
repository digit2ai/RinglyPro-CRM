/* AI Radar — service worker (PWA offline shell). */
const CACHE = 'airadar-v1';
const SHELL = [
  '/airadar/',
  '/airadar/login',
  '/airadar/manifest.webmanifest',
  '/airadar/favicon.svg',
  '/airadar/icon-192.png',
  '/airadar/icon-512.png',
  '/airadar/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for navigations (fresh + auth), cache-first for static assets,
// NEVER cache /api/ and never intercept a share-target hit.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/api/')) return;
  if (url.pathname === '/airadar/share') return;

  const isAsset = /\.(png|svg|webmanifest|css|js|woff2?)$/.test(url.pathname);
  if (isAsset) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit))
    );
  } else {
    e.respondWith(
      fetch(req).catch(() => caches.match(req).then((hit) => hit || caches.match('/airadar/')))
    );
  }
});
