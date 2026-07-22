/* SpeakUp — service worker (PWA offline shell). */
const CACHE = 'speakup-v2';
const SHELL = [
  '/speakup/',
  '/speakup/login',
  '/speakup/manifest.webmanifest',
  '/speakup/favicon.svg',
  '/speakup/icon-192.png',
  '/speakup/icon-512.png',
  '/speakup/apple-touch-icon.png'
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
// NEVER cache /api/ (always live).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.includes('/api/')) return;

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
      fetch(req).catch(() => caches.match(req).then((hit) => hit || caches.match('/speakup/')))
    );
  }
});
