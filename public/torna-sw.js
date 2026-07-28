/* Torna PWA service worker — root-scoped, registered ONLY on torna.dev.
   Offline shell for the landing + cached brand icons. Never touches API calls. */
const CACHE = 'torna-v4';
const ASSETS = [
  '/torna-assets/icon-192.png',
  '/torna-assets/icon-512.png',
  '/torna-assets/apple-touch-icon.png',
  '/torna-assets/favicon-32.png',
  '/torna-assets/manifest.webmanifest'
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

  // Navigations: always network-first. Only cache the CANONICAL landing as the
  // offline fallback — never cache workspace/login/es/build URLs under '/torna'
  // (that poisoned the fallback so offline could serve a private page as home).
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(resp){
        if(url.pathname === '/torna' || url.pathname === '/'){
          var copy = resp.clone();
          caches.open(CACHE).then(function(c){ c.put('/torna', copy); });
        }
        return resp;
      }).catch(function(){ return caches.match('/torna'); })
    );
    return;
  }

  // Static brand assets: cache-first.
  if(url.pathname.indexOf('/torna-assets/') === 0){
    e.respondWith(caches.match(req).then(function(c){ return c || fetch(req); }));
  }
});
