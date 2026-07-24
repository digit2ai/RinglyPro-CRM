/* Lawn Co-Pilot — app-wide service worker.
 *
 * Scope is /lawncopilot/, so it covers the platform page, every company page
 * and both portals.
 *
 * Rules that matter:
 *   - NEVER cache /api/ or /mcp/. Prices, availability and balances must be
 *     live; a stale quote is worse than no quote.
 *   - Navigations are network-first so a company always sees their current
 *     page, falling back to the offline shell only when the network is gone.
 *   - Static assets are cache-first, which is what makes a repeat visit from a
 *     truck on 4G feel instant.
 */
var CACHE = 'lawncopilot-app-v2';
// Scope-relative, so the same worker serves lawncopilot.com/ and
// aiagent.ringlypro.com/lawncopilot/ without a second build.
var BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');
var SHELL = [
  BASE + '/styles.css',
  BASE + '/tenant.css',
  BASE + '/orb.js',
  BASE + '/simulator.js',
  BASE + '/logo.png',
  BASE + '/mark.png',
  BASE + '/icon-192.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .catch(function () { /* a missing asset must not block install */ })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k !== CACHE && k.indexOf('lawncopilot-') === 0;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') !== -1) return;      // never cache data
  if (url.pathname.indexOf('/mcp') !== -1) return;
  if (BASE && url.pathname.indexOf(BASE + '/') !== 0) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(function () {
        return caches.match(BASE + '/offline.html')
          .then(function (r) { return r || new Response('Offline', { status: 503 }); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      });
    })
  );
});
