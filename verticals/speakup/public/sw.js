/* SpeakUp — service worker (installable shell).
 * - Shell entries cached one by one: addAll is atomic and one 404 would leave no worker.
 * - Navigations: network first, cached shell as the offline fallback.
 * - JS/CSS: stale-while-revalidate, so a deploy reaches the phone on the next open.
 * - /api/ is NEVER cached: a task status from cache would be a lie.
 */
const CACHE = 'speakup-v25';
const SHELL = [
  '/speakup/',
  '/speakup/meetings',
  '/speakup/login',
  '/speakup/theme.css?v=2',
  '/speakup/header-menu.js?v=1',
  '/speakup/console.js?v=7',
  '/speakup/meetings.js?v=1',
  '/speakup/record-engine.js?v=1',
  '/speakup/manifest.webmanifest',
  '/speakup/favicon.svg',
  '/speakup/icon-192.png',
  '/speakup/icon-512.png',
  '/speakup/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // never touch CDN / model downloads
  if (!url.pathname.startsWith('/speakup/')) return;
  if (url.pathname.includes('/api/')) return;

  if (/\.(js|css)$/.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  if (/\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).catch(() => caches.match(req).then((hit) => hit || caches.match('/speakup/'))));
});
