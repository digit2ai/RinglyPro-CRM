'use strict';

/**
 * PWA: one generator for both manifests and the service worker, parameterized
 * by the mount (req.baseUrl). There is deliberately NO manifest.webmanifest on
 * disk: a static file would be served verbatim to the wrong origin or mount,
 * and a scope that does not match the mount installs an app whose own logo
 * link opens a browser tab.
 *
 *  - Buyer app:    id/scope `${base}/`,        start_url `${base}/?source=pwa`
 *  - Agent console: id/scope `${base}/admin/`, start_url `${base}/admin/` (trailing
 *    slash on purpose: scope matches by path prefix, so `/admin?x` would fall outside)
 *  - The worker lives at `${base}/sw.js`, so its scope is `${base}/`.
 *  - It caches shell entries ONE BY ONE (addAll is atomic: one 404 = no worker),
 *    NEVER caches /api/ or buyer reports (/r/), and serves navigations
 *    network-first with an offline page as the last resort.
 *  - Bump SHELL_VERSION when a shell file changes.
 */

const SHELL_VERSION = 'bl-shell-5';

function base(req) { return (req.baseUrl || '').replace(/\/+$/, ''); }

function buyerManifest(req) {
  const b = base(req);
  return {
    id: `${b}/`,
    name: 'BuyersLine',
    short_name: 'BuyersLine',
    description: 'New-construction homes and builder incentives, verified by a licensed agent and compared by monthly payment.',
    lang: 'en',
    dir: 'ltr',
    start_url: `${b}/?source=pwa`,
    scope: `${b}/`,
    display: 'standalone',
    orientation: 'any',
    background_color: '#FFFFFF',
    theme_color: '#FFFFFF',
    categories: ['lifestyle', 'finance', 'productivity'],
    icons: [
      { src: `${b}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${b}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${b}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: `${b}/favicon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ],
    shortcuts: [
      { name: 'Search homes', short_name: 'Search', url: `${b}/search?source=pwa`, icons: [{ src: `${b}/icon-192.png`, sizes: '192x192' }] },
      { name: 'Get my report', short_name: 'Report', url: `${b}/?source=pwa#intake`, icons: [{ src: `${b}/icon-192.png`, sizes: '192x192' }] }
    ]
  };
}

function consoleManifest(req) {
  const b = base(req).replace(/\/admin$/, '');
  return {
    id: `${b}/admin/`,
    name: 'BuyersLine Agent Console',
    short_name: 'BL Console',
    description: 'Verify builder incentives, review buyer reports and manage consults.',
    lang: 'en',
    start_url: `${b}/admin/`,
    scope: `${b}/admin/`,
    display: 'standalone',
    orientation: 'any',
    background_color: '#F4F5F9',
    theme_color: '#FFFFFF',
    icons: [
      { src: `${b}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${b}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${b}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}

function serviceWorker(req) {
  const b = base(req);
  return `/* BuyersLine service worker (${SHELL_VERSION}). Generated per mount; see src/services/pwa.js. */
'use strict';
const VERSION = ${JSON.stringify(SHELL_VERSION)};
const BASE = ${JSON.stringify(b)};
const SHELL = [BASE + '/', BASE + '/search', BASE + '/offline', BASE + '/admin/', BASE + '/admin/login',
  BASE + '/site.css', BASE + '/theme.js', BASE + '/flow.js', BASE + '/nav.js', BASE + '/install.js', BASE + '/search-widget.js', BASE + '/admin.js',
  BASE + '/favicon.svg', BASE + '/favicon-32.png', BASE + '/icon-192.png', BASE + '/icon-512.png', BASE + '/apple-touch-icon.png'];
const CACHEABLE_PAGES = [BASE + '/', BASE + '/search', BASE + '/offline', BASE + '/admin/', BASE + '/admin/login'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // One entry at a time: a single failure must not abort the whole install.
    await Promise.all(SHELL.map((url) => fetch(url, { cache: 'reload', credentials: 'omit' })
      .then((res) => (res.ok ? cache.put(url, res) : null)).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('bl-shell-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE + '/')) return;
  // Never cache the API or a buyer's report: stale data or a report left on a shared phone is worse than offline.
  if (url.pathname.startsWith(BASE + '/api/') || url.pathname === BASE + '/sw.js' || url.pathname.endsWith('.webmanifest')) return;
  // A report page is never stored; offline it falls through to the offline page below.
  if (url.pathname.startsWith(BASE + '/r/') && req.mode !== 'navigate') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const page = url.pathname;
      try {
        const res = await fetch(req);
        if (res.ok && CACHEABLE_PAGES.includes(page)) {
          const cache = await caches.open(VERSION);
          cache.put(page, res.clone());
        }
        return res;
      } catch (e) {
        const cache = await caches.open(VERSION);
        return (await cache.match(page)) || (await cache.match(BASE + '/offline')) || Response.error();
      }
    })());
    return;
  }

  if (/\\.(css|js|svg|png|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(url.pathname);
      const network = fetch(req).then((res) => { if (res.ok) cache.put(url.pathname, res.clone()); return res; }).catch(() => null);
      return cached || (await network) || Response.error();
    })());
  }
});
`;
}

function send(res, type, body) {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-cache');
  res.send(body);
}

module.exports = { buyerManifest, consoleManifest, serviceWorker, send, SHELL_VERSION };
