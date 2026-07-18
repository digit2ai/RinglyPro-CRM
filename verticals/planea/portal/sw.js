/* PLANEA — service worker KILL SWITCH.
   The app-shell cache repeatedly served stale JS (module editor / API client),
   causing "nothing saves". This SW takes over, deletes ALL caches, unregisters
   itself, and reloads open tabs so every asset loads fresh from the network.
   Freshness is now handled purely by the ?v=NN version stamps on each <script>. */
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) { clients.forEach(function (c) { try { c.navigate(c.url); } catch (e) {} }); })
  );
});

// No fetch handler → every request goes straight to the network (never cached).
