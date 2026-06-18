/* Torna Idioma — service worker (PWA shell).
   Safe by design: only caches hashed build assets + icons; navigations are
   network-first; API responses are NEVER cached (always live). */
const CACHE = 'torna-idioma-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // never cache API

  // Cache-first for hashed static assets + icons (immutable, safe).
  if (url.pathname.startsWith('/Torna_Idioma/assets/') || url.pathname.startsWith('/Torna_Idioma/icons/')) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((resp) => {
          if (resp && resp.status === 200) c.put(req, resp.clone());
          return resp;
        }))
      )
    );
    return;
  }

  // Network-first for page navigations; fall back to the cached login shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/Torna_Idioma/login') || caches.match('/Torna_Idioma/'))
    );
  }
});
