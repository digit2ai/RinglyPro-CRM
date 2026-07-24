/* Lawn Co-Pilot portal service worker.
   Network-first for navigations, NEVER caches /api/. Bump CACHE on every
   portal JS/CSS change or users get stale screens. */
var CACHE = 'lawncopilot-portal-v2';
var SHELL = [
  '/lawncopilot/portal/app.css',
  '/lawncopilot/portal/data.js',
  '/lawncopilot/styles.css',
  '/lawncopilot/logo.png',
  '/lawncopilot/mark.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (url.pathname.indexOf('/api/') !== -1) return;            // never cache data
  if (e.request.method !== 'GET') return;

  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(function () { return caches.match('/lawncopilot/portal/app.css'); }));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      });
    })
  );
});
