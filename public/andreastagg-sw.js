/* Andrea Stagg CV — service worker. Scoped to /andreastagg (registered
   with an explicit narrower scope) so it NEVER intercepts the rest of the RinglyPro
   CRM. Offline app-shell: network-first for the page, cache-first for static assets. */
const CACHE = 'adcv-v1';
const CORE = [
  '/andreastagg',
  '/andreastagg.vcf',
  '/andreastagg-192.png',
  '/andreastagg-512.png',
  '/andreastagg-apple-touch.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return Promise.allSettled(CORE.map(function (u) { return c.add(u); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin === self.location.origin && url.pathname.indexOf('/api') === 0) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) {
        var cp = r.clone();
        caches.open(CACHE).then(function (c) { c.put('/andreastagg', cp); });
        return r;
      }).catch(function () {
        return caches.match('/andreastagg').then(function (m) { return m || caches.match(req); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (r) {
        var cacheable = r && r.ok && (r.type === 'basic' || r.type === 'cors') &&
          (url.origin === self.location.origin ||
           /fonts\.(googleapis|gstatic)\.com$/.test(url.host) ||
           /cdnjs\.cloudflare\.com$/.test(url.host));
        if (cacheable) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
        return r;
      });
    })
  );
});
