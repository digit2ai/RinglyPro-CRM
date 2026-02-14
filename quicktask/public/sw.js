// Self-destruct: clear all caches and unregister
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.registration.unregister())
  );
  self.clients.claim();
});

// Pass everything through to network — no caching
self.addEventListener('fetch', () => {});
