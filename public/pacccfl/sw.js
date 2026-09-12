/* PACC-CFL — service worker.
 *
 * SCOPE IS THE DIRECTORY THIS FILE IS FETCHED FROM, so it lives at
 * /pacccfl/sw.js and controls /pacccfl/ and nothing else. A worker served from
 * the site root would claim the whole CRM.
 *
 * Bump CACHE whenever a shell file changes, or a returning visitor keeps the
 * old one until their browser happens to revalidate.
 */
const CACHE = 'pacccfl-v1';

const SHELL = [
  '/pacccfl/',
  '/pacccfl/offline.html',
  '/pacccfl/manifest.webmanifest',
  '/pacccfl/icon-192.png',
  '/pacccfl/icon-512.png',
  '/pacccfl/apple-touch-icon.png',
  '/pacccfl/favicon-32.png',
  '/pacccfl/pacc-seal.png',
];

// INDIVIDUALLY, NEVER addAll. addAll is atomic: one 404 rejects the whole
// install and leaves the page with no worker at all — which is strictly worse
// than a worker missing one asset, and it fails silently.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(
    SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))
  )));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Same-origin only. Fonts and any third-party asset go straight to the
  // network — caching an opaque cross-origin response fills the cache with
  // things we cannot inspect or revalidate.
  if (url.origin !== self.location.origin) return;
  // NEVER the API. A chamber directory showing yesterday's members from cache
  // is worse than an honest error, and a cached auth response is a bug.
  if (url.pathname.includes('/api/')) return;
  // Leave everything outside this app alone, so the worker can never answer
  // for another part of the CRM that happens to share the origin.
  if (!url.pathname.startsWith('/pacccfl/')) return;

  const isAsset = /\.(png|jpe?g|svg|webp|webmanifest|css|js|mp3|woff2?)$/.test(url.pathname);

  if (isAsset) {
    // Cache-first: these are versioned by deploy and change rarely.
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  // Navigations: network-first, so a visitor always gets the live page when
  // they have a connection; the cached shell, then offline.html, only when
  // they do not.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req)
        .then((hit) => hit || caches.match('/pacccfl/'))
        .then((hit) => hit || caches.match('/pacccfl/offline.html')))
  );
});
