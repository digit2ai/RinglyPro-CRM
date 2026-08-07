'use strict';

/**
 * PWA surface — the manifest, the service worker, and the HTML shells, all
 * generated for the ORIGIN that asked for them.
 *
 * JobUp answers on three different roots and the PWA has to be correct at every
 * one of them:
 *
 *   https://jobup.dev/                     base ''        the flagship domain
 *   https://<name>.jobup.dev/              base ''        a subscriber's address
 *   https://aiagent.ringlypro.com/jobup/   base '/jobup'  the path mount
 *
 * A manifest is NOT portable across those. `scope` and `start_url` resolve
 * against the manifest's own URL and define what the installed app may contain,
 * so shipping the /jobup/ scope to jobup.dev produced an install whose scope
 * EXCLUDED jobup.dev/ itself — tapping the logo inside the installed app dropped
 * the user back out into the browser. The service worker had the mirror-image
 * bug: a worker fetched from /jobup/sw.js gets scope /jobup/, so on jobup.dev it
 * never controlled the landing page that registered it, and the site had no
 * offline behaviour at all on its own home page.
 *
 * Both are therefore generated per request and never served as static files.
 * The HTML shells carry a {{BASE}} token substituted here for the same reason —
 * a hardcoded /jobup/ href is wrong on two of the three roots.
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', '..', 'public');

/** Bump when a shell file changes, so installed clients pick it up. */
const SHELL_VERSION = 'v3';

/**
 * BUMP THIS WHENEVER AN ICON FILE CHANGES.
 *
 * Icons are served with a long max-age, so without a version in the URL a
 * redesign is invisible to anyone who already has the old one: Safari kept
 * serving the previous apple-touch-icon from its own HTTP cache, and iOS reads
 * that cache when it builds the "Add to Home Screen" preview — so the share
 * sheet showed the new mark while the install preview still showed the old one.
 *
 * A version in the query makes every icon a NEW url, which no cache can have.
 */
const ICON_VERSION = '4';
const V = `?v=${ICON_VERSION}`;

/**
 * The mount root for this request.
 *
 * Express sets `req.baseUrl` to the path a router was mounted at, which is
 * exactly the distinction we need: '/jobup' under the path mount, '' when the
 * app is called at the root of jobup.dev or a subscriber subdomain.
 */
function basePath(req) {
  const b = String((req && req.baseUrl) || '');
  return b === '/' ? '' : b;
}

/** Substitute the base into one of the HTML shells. */
const htmlCache = new Map();
function page(file, base) {
  const key = file + '|' + base;
  const hit = htmlCache.get(key);
  if (hit) return hit;
  const out = fs.readFileSync(path.join(publicDir, file), 'utf8')
    .replace(/\{\{BASE\}\}/g, base)
    .replace(/\{\{V\}\}/g, V);
  htmlCache.set(key, out);
  return out;
}

/**
 * The web app manifest for a given root.
 *
 * `name` personalises the subscriber-subdomain install ("Manuel Stagg — JobUp"),
 * so two installed JobUp sites are distinguishable on a home screen.
 */
function manifest(base, opts) {
  const o = opts || {};
  const b = base || '';
  const owner = o.name ? `${o.name} — JobUp` : 'JobUp — your AI career platform';
  return {
    // A stable identity. Without it the install is keyed on start_url, so
    // changing start_url later would orphan every existing install.
    id: `${b}/`,
    name: owner,
    short_name: 'JobUp',
    description: 'Your own job-finding ecosystem: matches scored against your real '
      + 'resume, a public site recruiters and their AI can read, and a pipeline you '
      + 'approve before anything sends.',
    start_url: `${b}/app`,
    scope: `${b}/`,
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    // Deliberately NOT locked to portrait. This is a dashboard with tables and
    // a chart — a phone held sideways or a tablet is a legitimate way to read it.
    orientation: 'any',
    background_color: '#07080c',
    theme_color: '#07080c',
    categories: ['productivity', 'business'],
    lang: o.lang === 'es' ? 'es' : 'en',
    dir: 'ltr',
    icons: [
      // Scalable first, so an installer that can use it does.
      { src: `${b}/favicon.svg${V}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: `${b}/icon-192.png${V}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${b}/icon-192.png${V}`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: `${b}/icon-512.png${V}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${b}/icon-512.png${V}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press the home-screen icon and land straight on the tab you wanted.
    // These depend on the ?tab= deep link the dashboard reads on boot.
    shortcuts: [
      { name: 'Job Matches', short_name: 'Matches', url: `${b}/app?tab=matches` },
      { name: 'Pipeline', short_name: 'Pipeline', url: `${b}/app?tab=pipeline` },
      { name: 'Opportunities', short_name: 'Inbox', url: `${b}/app?tab=opps` },
    ],
  };
}

/**
 * The service worker for a given root.
 *
 * Read from disk with a __BASE__ token rather than assembled from strings, so it
 * stays a readable, lintable file. The cache name carries the base because
 * jobup.dev can legitimately hold BOTH a root-scoped and a /jobup-scoped
 * registration, and they must not fight over one cache.
 */
function serviceWorker(base) {
  const b = base || '';
  return fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8')
    .replace(/__BASE__/g, b)
    .replace(/__V__/g, V)
    // The icon version is part of the cache name too: a new icon set should
    // retire the cache holding the old one rather than leave it orphaned.
    .replace(/__CACHE__/g, `jobup-${SHELL_VERSION}-i${ICON_VERSION}${b ? b.replace(/\//g, '-') : '-root'}`);
}

/**
 * Serve the manifest + worker + PWA icons for a root. Returns true when the
 * request was one of them and has been answered.
 *
 * Shared by the /jobup router and the subscriber-subdomain handler so the two
 * can never drift apart — they used to carry separate copies of this rewriting,
 * and only one of them was correct.
 */
function serveAsset(req, res, base, opts) {
  const p = req.path;
  if (p === '/manifest.webmanifest') {
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('application/manifest+json').json(manifest(base, opts));
    return true;
  }
  if (p === '/sw.js') {
    // No caching: a stale worker is how an app gets stuck on an old shell.
    res.set('Cache-Control', 'no-cache');
    // Lets a worker served from /jobup/sw.js claim a wider scope if we ever
    // need it; harmless otherwise.
    res.set('Service-Worker-Allowed', `${base || ''}/`);
    res.type('application/javascript').send(serviceWorker(base));
    return true;
  }
  // favicon.svg is in this list because the manifest now advertises it — a
  // subscriber subdomain only serves what is named here, so leaving it out
  // would promise an icon that 404s.
  if (['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon-32.png',
       '/favicon.svg', '/logo-master.svg'].includes(p)) {
    // Only a VERSIONED url may be cached hard: it can never go stale, because
    // changing the icon changes the url. A bare url gets a short life so a
    // client holding one from before this change recovers on its own instead of
    // sitting on last week's mark.
    //
    // The options go to sendFile, NOT res.set('Cache-Control'): sendFile writes
    // its own Cache-Control from these and would overwrite a header set here,
    // silently serving every icon as max-age=0.
    const versioned = Boolean(req.query && req.query.v);
    res.sendFile(path.join(publicDir, p.replace(/^\//, '')), {
      maxAge: versioned ? '365d' : '10m',
      immutable: versioned,
    });
    return true;
  }
  if (p === '/offline' || p === '/offline.html') {
    res.type('html').send(page('offline.html', base));
    return true;
  }
  return false;
}

module.exports = {
  basePath, page, manifest, serviceWorker, serveAsset, publicDir, SHELL_VERSION,
};
