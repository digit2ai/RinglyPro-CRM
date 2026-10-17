'use strict';
/**
 * ONE generator for the manifest, the service worker and the HTML shells,
 * parameterised by req.baseUrl.
 *
 * THERE IS NO MANIFEST ON DISK, DELIBERATELY. A manifest's scope and start_url
 * resolve against the manifest's OWN url, and a worker's scope is the directory
 * it was fetched from. A static /marapet/-scoped manifest served on
 * marapet.app would install an app whose scope EXCLUDES marapet.app itself:
 * tapping the logo inside the installed app drops the owner into a browser tab,
 * and the worker controls nothing. JobUp shipped exactly that bug. The SIT
 * fails if a manifest file appears in public/.
 */
const fs = require('fs');
const path = require('path');

// Bump when any shell file changes, or installed copies keep serving the old one.
const SHELL_VERSION = 'marapet-v3';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function base(req) {
  // '' on marapet.app (the host handler calls the router directly), '/marapet'
  // when mounted on the CRM host.
  return (req && req.baseUrl) || '';
}

function manifest(req) {
  const b = base(req);
  const root = b === '' ? '/' : b + '/';
  return {
    id: root,
    name: 'MaraPet',
    short_name: 'MaraPet',
    description: 'Canine health monitoring by ISTC and Digit2AI.',
    start_url: root + '?src=pwa',
    scope: root,
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'en',
    dir: 'ltr',
    icons: [
      { src: root + 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: root + 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: root + 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    shortcuts: [
      { name: 'Today', url: root + 'app?tab=today' },
      { name: 'Breathing check', url: root + 'app?tab=breathing' }
    ]
  };
}

/**
 * The worker. Caches the shell ENTRY BY ENTRY, never addAll: addAll is atomic,
 * so one 404 rejects the install and leaves the page with no worker at all.
 * It never caches /api/ — a health screen showing yesterday's vitals out of
 * cache is worse than an offline notice.
 */
function serviceWorker(req) {
  const b = base(req);
  const root = b === '' ? '/' : b + '/';
  const shell = [
    root, root + 'app', root + 'login', root + 'offline',
    root + 'theme.css', root + 'js/app.js', root + 'js/landing.js',
    root + 'js/breathing-core.js', root + 'js/breathing-capture.js',
    root + 'fonts/Pretendard-Regular.latin.woff2',
    root + 'fonts/Pretendard-Medium.latin.woff2',
    root + 'fonts/Pretendard-Bold.latin.woff2',
    root + 'icon-192.png'
  ];
  return `/* MaraPet service worker — generated per root, never a file on disk. */
const CACHE = '${SHELL_VERSION}';
const ROOT = ${JSON.stringify(root)};
const SHELL = ${JSON.stringify(shell)};

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // One by one: addAll is atomic and one 404 would abort the whole install.
    for (const url of SHELL) {
      try { await c.add(new Request(url, { cache: 'reload' })); } catch (_) {}
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(ROOT)) return;
  // Vitals are never served from cache.
  if (url.pathname.includes('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { return await fetch(req); }
      catch (_) {
        const c = await caches.open(CACHE);
        return (await c.match(req)) || (await c.match(ROOT + 'offline')) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone());
      return res;
    } catch (_) {
      return hit || Response.error();
    }
  })());
});
`;
}

let cache = {};
function readShell(name) {
  if (!cache[name] || process.env.NODE_ENV !== 'production') {
    cache[name] = fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8');
  }
  return cache[name];
}

/**
 * Serve an HTML shell with {{BASE}} and {{VERSION}} substituted. Two passes,
 * because an injected partial carries its own tokens.
 */
function page(req, res, name, extra) {
  const b = base(req);
  let html = readShell(name);
  // BASE_JSON is BASE as a JSON string literal, so a page can hand the mount
  // prefix to its script without a hand-written quote that an empty base
  // (marapet.app, where BASE is '') would turn into a syntax error.
  const subs = Object.assign(
    { BASE: b, BASE_JSON: JSON.stringify(b), VERSION: SHELL_VERSION },
    extra || {}
  );
  for (let pass = 0; pass < 2; pass++) {
    html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) =>
      Object.prototype.hasOwnProperty.call(subs, k) ? String(subs[k]) : m);
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.send(html);
}

module.exports = { SHELL_VERSION, PUBLIC_DIR, base, manifest, serviceWorker, page };
