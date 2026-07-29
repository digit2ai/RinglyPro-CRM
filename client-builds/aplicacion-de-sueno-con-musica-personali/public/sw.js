// =====================================================
// sw.js — offline shell for Modo Noche.
//
// Two rules that matter:
//   1. /api/ is NEVER cached. Session history and the track library must always
//      come from the server; a stale cached history would be a lie.
//   2. The audio loops ARE cached on first play, cache-first. They are
//      immutable and content-addressed by filename, and a bedtime app that
//      stops working on a bad hotel connection is useless.
//
// Bump CACHE whenever the shell files change, or clients keep the old ones.
// =====================================================

'use strict';

const CACHE = 'modo-noche-v2';
const BASE = '/aplicacion-de-sueno-con-musica-personali/';

const SHELL = [
  BASE,
  BASE + 'player.js',
  BASE + 'manifest.webmanifest',
  BASE + 'icon.svg',
  BASE + 'icon-192.png',
  BASE + 'apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Individually, so one 404 cannot fail the whole install.
      .then((cache) => Promise.all(SHELL.map((u) => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE)) return;

  // Rule 1: never cache the API.
  if (url.pathname.startsWith(BASE + 'api/')) return;

  // Rule 2: audio is immutable — serve from cache, fill on first play.
  if (url.pathname.endsWith('.mp3')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }))
    );
    return;
  }

  // Everything else (the shell): network first, cache as the offline fallback.
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match(BASE)))
  );
});
