/* PLANEA PWA service worker — app-shell caching.
   Network-first for navigations AND for the portal's own CSS/JS (so deploys show
   immediately, no stale styles), cache-first for images/manifest, never /api/.
   Scope: /planea/portal/. */
var CACHE = 'planea-shell-v22';
var BASE = '/planea/portal/';
var SHELL = [
  BASE + 'inicio', BASE + 'patrimonio', BASE + 'metas', BASE + 'cuentas', BASE + 'diagnostico',
  BASE + 'retiro', BASE + 'ahorro', BASE + 'deuda', BASE + 'inversion',
  BASE + 'seguros', BASE + 'mas', BASE + 'configuracion', BASE + 'guia',
  BASE + 'planea-app.css', BASE + 'planea-nav.js', BASE + 'planea-data.js', BASE + 'planea-sb.js',
  BASE + 'planea-diagnostico.js', BASE + 'planea-patrimonio-edit.js', BASE + 'planea-metas-edit.js', BASE + 'maya-chat.js',
  BASE + 'manifest.webmanifest', BASE + 'apple-touch-icon.png', BASE + 'icon-192.png',
  BASE + 'icon-512.png', BASE + 'planea-logo-white.png', BASE + 'planea-mark-white.png'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;           // let cross-origin (fonts, tts) pass through
  if (url.pathname.indexOf('/api/') !== -1) return;      // never cache API / Maya / TTS

  // Navigations → network-first, fall back to cached page (offline).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match(BASE + 'inicio'); });
      })
    );
    return;
  }

  if (url.pathname.indexOf(BASE) === 0) {
    // Portal CSS/JS → network-first so code/style deploys are never stale; fall
    // back to cache offline. Images/manifest/fonts → cache-first (rarely change).
    if (/\.(css|js)$/i.test(url.pathname)) {
      e.respondWith(
        fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        }).catch(function () { return caches.match(req); })
      );
      return;
    }
    e.respondWith(
      caches.match(req).then(function (m) {
        return m || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
  }
});
