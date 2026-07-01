/* =====================================================
 * EquiMind service worker — installable PWA + offline app shell.
 *   - static assets (css/js/svg/png/fonts): cache-first
 *   - pages: network-first, fall back to cache when offline
 *   - API calls (/api/): never cached (analysis, auth, credits stay live)
 * Bump CACHE to invalidate old caches on deploy.
 * ===================================================== */
'use strict';
var CACHE = 'equimind-v1';

self.addEventListener('install', function (e) { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;         // only same-origin
  if (url.pathname.indexOf('/api/') !== -1) return;         // never cache API (analysis/auth/credits live)

  // Stable media/fonts: cache-first (icons, images, web fonts rarely change).
  if (/\.(svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|otf)$/i.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res && res.status === 200) c.put(req, res.clone()); return res; });
      });
    }));
    return;
  }

  // Code + pages (js/css/mjs/html/manifest): network-first, cache fallback when
  // offline. Keeps the analysis engine fresh right after every deploy.
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.status === 200) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req).then(function (hit) { return hit || caches.match('./inicio'); }); }));
});
