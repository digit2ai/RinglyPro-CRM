const CACHE_NAME = 'd2ai-projects-v30';
const STATIC_ASSETS = [
  '/projects/',
  '/projects/assets/styles.css',
  '/projects/assets/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Network-first for API calls
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  // Network-first for static assets (ensures fresh code after deploys)
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});

// ---- Web Push: badge the Projects Hub icon + notify on new Intercom messages ----
// The voice-to-intake backend (push.sendToOwner) sends to every owner
// subscription, including this Hub PWA's. iOS 16.4+ requires a notification on
// each push for the badge to stick.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const unread = typeof data.unread === 'number' ? data.unread : 1;
  const title = data.title || 'Digit2Ai Projects';
  const body = data.body || 'New Intercom message';
  event.waitUntil((async () => {
    if (self.registration.setAppBadge) { try { await self.registration.setAppBadge(unread); } catch (e) {} }
    else if (self.navigator && navigator.setAppBadge) { try { await navigator.setAppBadge(unread); } catch (e) {} }
    await self.registration.showNotification(title, {
      body,
      icon: 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6a3feadac408020f97ca4060.png',
      badge: 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6a3feadac408020f97ca4060.png',
      tag: 'projects-intercom',
      renotify: true,
      data: { url: '/projects/?view=intercom' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/projects/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.indexOf('/projects') !== -1 && 'focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
