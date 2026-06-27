/* Service worker for Digit2Ai Voice-to-Intake PWA.
   On push: badge the home-screen icon with the unread count + show a notification.
   (iOS 16.4+ requires a notification to be shown on each push.) */

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  var unread = typeof data.unread === 'number' ? data.unread : 1;
  var title = data.title || 'Digit2Ai';
  var body = data.body || 'New message';
  var url = data.url || '/voice-to-intake-transcript-direct-pipeli/';

  event.waitUntil((async function () {
    if (self.registration.setAppBadge) {
      try { await self.registration.setAppBadge(unread); } catch (e) {}
    } else if (navigator.setAppBadge) {
      try { await navigator.setAppBadge(unread); } catch (e) {}
    }
    await self.registration.showNotification(title, {
      body: body,
      icon: 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6a3feadac408020f97ca4060.png',
      badge: 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6a3feadac408020f97ca4060.png',
      tag: 'intercom-message',
      renotify: true,
      data: { url: url }
    });
  })());
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/voice-to-intake-transcript-direct-pipeli/';
  event.waitUntil((async function () {
    var all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < all.length; i++) {
      if (all[i].url.indexOf('voice-to-intake-transcript-direct-pipeli') !== -1 && 'focus' in all[i]) return all[i].focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
