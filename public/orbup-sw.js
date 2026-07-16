/* OrbUp PWA service worker — root-scoped, registered ONLY on orbup.app.
   Offline shell for the landing + cached brand icons. Never touches API calls. */
const CACHE = 'orbup-v2';
const ASSETS = [
  '/orbup-assets/icon-192.png',
  '/orbup-assets/icon-512.png',
  '/orbup-assets/apple-touch-icon.png',
  '/orbup-assets/favicon-32.png',
  '/orbup-assets/manifest.webmanifest'
];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){ return Promise.all(keys.map(function(k){ if(k!==CACHE) return caches.delete(k); })); })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;                       // never cache POST/PUT (checkout, booking)
  var url = new URL(req.url);
  if(url.pathname.indexOf('/api') !== -1) return;        // never touch API/pricing/booking endpoints

  // Navigations: network-first, cache the landing as the offline fallback.
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(resp){
        var copy = resp.clone();
        caches.open(CACHE).then(function(c){ c.put('/orbup', copy); });
        return resp;
      }).catch(function(){ return caches.match('/orbup'); })
    );
    return;
  }

  // Static brand assets: cache-first.
  if(url.pathname.indexOf('/orbup-assets/') === 0){
    e.respondWith(caches.match(req).then(function(c){ return c || fetch(req); }));
  }
});
