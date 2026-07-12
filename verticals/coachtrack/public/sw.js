/* Visionarium Coaching — service worker (PWA offline shell). */
const CACHE = 'vsn-coaching-v2';
const SHELL = [
  '/coaching/',
  '/coaching/login',
  '/coaching/manifest.webmanifest',
  '/coaching/favicon.svg',
  '/coaching/icon-192.png',
  '/coaching/icon-512.png',
  '/coaching/apple-touch-icon.png',
  '/coaching/visionarium-logo.png'
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

// Network-first for API + navigations (fresh data / auth), cache-first for static assets.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.includes('/api/')) return; // never cache API — always live

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
    // navigations: network first, fall back to cached shell
    e.respondWith(
      fetch(req).catch(() => caches.match(req).then((hit) => hit || caches.match('/coaching/')))
    );
  }
});
