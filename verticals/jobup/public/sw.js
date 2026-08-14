/* JobUp service worker.
 *
 * NOT served as a static file. src/services/pwa.js substitutes __BASE__ and
 * __CACHE__ for the root this worker is being registered at, because JobUp
 * answers at jobup.dev/, <name>.jobup.dev/ and aiagent.ringlypro.com/jobup/ and
 * a worker with the wrong base controls nothing.
 *
 * It caches the app shell only. It NEVER caches /api/ — a career dashboard
 * showing yesterday's matches from a stale cache would be worse than an offline
 * notice. Bump SHELL_VERSION in pwa.js whenever a shell file changes.
 */
const CACHE = '__CACHE__';
const BASE = '__BASE__';
const OFFLINE = BASE + '/offline';
const SHELL = [
  BASE + '/',
  BASE + '/app',
  OFFLINE,
  BASE + '/manifest.webmanifest',
  // Versioned, so these match the urls the pages actually request. Precaching
  // the bare url would fill the cache with entries nothing ever asks for.
  BASE + '/icon-192.png__V__',
  BASE + '/icon-512.png__V__',
  // The onboarding translator. Without it in the shell, a Spanish visitor on a
  // poor connection gets the account form in English — the one moment where
  // being confused costs a signup.
  BASE + '/i18n-onboarding.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) =>
    // Individually, not addAll: addAll is atomic, so one 404 anywhere would
    // abort the whole install and leave the app with no worker at all.
    Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  // Never serve API responses from cache.
  if (url.pathname.includes('/api/')) return;

  // Network-first for navigations so a deploy is picked up immediately, with
  // the offline page as the last resort rather than a dashboard shell whose
  // every request would then fail in place.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request)
      .then((r) => {
        if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request)
        .then((m) => m || caches.match(BASE + '/app'))
        .then((m) => m || caches.match(OFFLINE))
        .then((m) => m || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))));
    return;
  }

  e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => {
    if (r && r.ok && r.type === 'basic') {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return r;
  })));
});
