/* Visionarium CoachTrack — install service worker.
   Registered from /coachtrack with scope "/coachtrack" ONLY, so it never
   controls the rest of the origin (safe on aiagent.ringlypro.com + visionarium.app).
   Provides an offline shell for the landing so it qualifies as an installable PWA. */
const CACHE = 'vsn-coachtrack-v1';
const SHELL = ['/coachtrack'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.pathname.includes('/api/')) return; // never cache API
  if (u.pathname === '/coachtrack' || u.pathname === '/coachtrack/') {
    e.respondWith(fetch(req).catch(() => caches.match('/coachtrack')));
  }
});
