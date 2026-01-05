// RinglyPro Service Worker
const CACHE_NAME = 'ringlypro-v19';
const urlsToCache = [
  '/manifest.json'
];

// Install event - cache static resources only
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        // Use Promise.allSettled to handle failures gracefully
        return Promise.allSettled(
          urlsToCache.map(url =>
            cache.add(url).catch(err => {
              console.warn(`Failed to cache ${url}:`, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('Service Worker: Install complete');
      })
      .catch((error) => {
        console.error('Service Worker: Install failed', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network-first strategy for authenticated routes
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for authenticated routes and settings pages
  if (url.pathname.startsWith('/api') ||
      url.pathname.startsWith('/dashboard') ||
      url.pathname.startsWith('/settings') ||
      url.pathname === '/') {
    // Network-only for dynamic content
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        // Fetch from network and cache for next time
        return fetch(event.request).then((response) => {
          // Only cache valid responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        });
      })
      .catch(() => {
        // Network failed, try to serve from cache anyway
        return caches.match(event.request);
      })
  );
});
