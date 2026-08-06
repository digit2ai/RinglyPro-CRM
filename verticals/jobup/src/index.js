'use strict';

/**
 * JOBUP — an AI ecosystem dedicated to helping a person find a job.
 *
 * Mounted at /jobup, and served on the custom domain jobup.dev via the host
 * handler in src/app.js. Subscriber sites live at <name>.jobup.dev.
 *
 * DEPLOYMENT NOTE: the build spec originally required a standalone repo and a
 * separate Render service. That was reversed by the owner — jobup.dev's DNS
 * points at ringlypro-crm.onrender.com — so JobUp runs here as a vertical
 * instead. Two consequences follow, and both are handled:
 *   1. The database is SHARED, so every table carries the `ju_` prefix.
 *   2. The voice layer is NOT duplicated — this reuses the CRM's existing
 *      zero-key /api/tts/edge route (Ava in English, Dalia in Spanish).
 *
 * Multi-tenant: one subscriber = one tenant, and tenant_id comes from the
 * session only. Bilingual EN/ES, emoji-free.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');

const { init, models, scoped, backend } = require('./models');
const identity = require('./services/identity');
const settingsSvc = require('./services/settings');
const addresses = require('./services/addresses');
const billing = require('./services/billing');
const brain = require('./services/brain');
const siteRender = require('./services/site-render');
const analytics = require('./services/analytics');
const photos = require('./services/photos');

const router = express.Router();
const publicDir = path.join(__dirname, '..', 'public');

// Body parsing scoped to this router.
router.use(express.json({ limit: '2mb' }));
router.use(express.urlencoded({ extended: true }));
// Minimal cookie reader — deliberately NOT the cookie-parser package. Adding a
// dependency to a repo serving 20 products for one cookie is not worth it.
router.use((req, res, next) => {
  if (!req.cookies) {
    req.cookies = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      if (k) req.cookies[k] = decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  next();
});

// ---- boot (lazy, never fatal) ---------------------------------------------
let ready = false;
let bootError = null;
init()
  .then((r) => { ready = true; console.log(`[jobup] store ready: ${r.backend}, ${r.tables} tables (ju_ prefix)`); })
  .catch((e) => { bootError = e.message; console.error('[jobup] init failed:', e.message); });

// ---- health ---------------------------------------------------------------
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'jobup',
    ready,
    error: bootError,
    db: backend(),
    table_prefix: 'ju_',
    brain: brain.enabled() ? 'anthropic' : 'heuristic (no ANTHROPIC_API_KEY)',
    billing: billing.status(),
    voice: 'reuses the CRM /api/tts/edge (keyless Edge neural TTS)',
    admin: require('./routes/admin').configured() ? 'configured' : 'CLOSED — set JOBUP_ADMIN_PASSWORD',
    base_domain: addresses.BASE_DOMAIN,
  });
});

// ---- API ------------------------------------------------------------------
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/api/v1/intake', require('./routes/intake'));
router.use('/api/v1/billing', require('./routes/billing'));
router.use('/api/v1/engine', require('./routes/engine'));
router.use('/teaser', require('./routes/teaser-view'));
router.use('/admin', require('./routes/admin'));

// ---- subscriber dashboard --------------------------------------------------
// Every paying subscriber signs in here with their OWN email and password.
// No allowlist, no env var — that is only the platform owner console.
// Aliases include /cv-admin so the muscle memory from manuelstagg.com works.
router.get(['/app', '/app/', '/dashboard', '/cv-admin'], (req, res) =>
  res.sendFile(path.join(publicDir, 'app.html')));

// Where Stripe (or the test-mode bypass) sends someone after activation.
router.get(['/welcome', '/welcome/'], (req, res) =>
  res.sendFile(path.join(publicDir, 'welcome.html')));

// ---- landing --------------------------------------------------------------
router.use(express.static(publicDir));
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// ===========================================================================
// Subscriber-site handler for <name>.jobup.dev.
//
// Exported separately because it must run at the TOP of the main app's
// middleware stack (before the CRM's own routes), not under the /jobup mount.
// ===========================================================================
function labelFromHost(host) {
  const base = addresses.BASE_DOMAIN;
  const h = String(host || '').toLowerCase().split(':')[0];
  if (!h.endsWith('.' + base)) return null;
  const label = h.slice(0, -(base.length + 1));
  if (!label || label === 'www' || label.includes('.')) return null;
  return label;
}

async function loadSite(label) {
  const sub = await models.subscribers.findOne({ where: { address: `${label}.${addresses.BASE_DOMAIN}` } });
  if (!sub) return null;
  if (sub.status !== 'active') return { sub, offline: true };
  const p = await scoped('profiles', sub.id).findOne({});
  const s = await scoped('settings', sub.id).findOne({});
  return {
    sub, offline: false,
    profile: {
      ...((p && p.resume_json) || {}),
      // The hero renders a photo when one exists, initials when it does not.
      photo_url: p && p.photo_asset_id ? '/photo' : null,
    },
    settings: settingsSvc.sanitize((s && s.settings) || {}),
  };
}

/** Middleware for the main app: serves a subscriber's public site + surfaces. */
async function subscriberSite(req, res, next) {
  if (!ready) return next();
  const label = labelFromHost(req.get('host'));
  if (!label) return next();

  let site;
  try { site = await loadSite(label); } catch (e) { return next(); }
  if (!site) return res.status(404).type('text/plain').send('No JobUp site at this address.');
  if (site.offline) {
    return res.status(404).type('html').send(
      '<!doctype html><meta charset="utf-8"><title>Not available</title>' +
      '<p style="font:16px system-ui;padding:40px">This JobUp site is not currently active.</p>');
  }

  // Record the visit for the subscriber's Analytics tab. Fire-and-forget:
  // traffic logging must never be able to break someone's public page.
  analytics.record(site.sub.id, req, req.path);

  const url = `https://${site.sub.address}`;
  const ctx = { name: site.profile.name || site.sub.name, url, slug: label };
  const p = req.path;

  // ---- The subscriber's OWN console, on their OWN address ----------------
  // Their dashboard belongs at manuelstagg.jobup.dev/app, not buried at
  // jobup.dev/jobup/app. Serving it here also makes the session cookie and
  // every API call same-origin with their site.
  if (['/app', '/app/', '/dashboard', '/admin', '/cv-admin', '/login'].includes(p)) {
    return res.sendFile(path.join(publicDir, 'app.html'));
  }
  if (p === '/welcome' || p === '/welcome/') {
    return res.sendFile(path.join(publicDir, 'welcome.html'));
  }
  // The dashboard resolves its API base to the current origin, so the API has
  // to answer here too.
  if (p.startsWith('/api/v1/') || p === '/health') {
    return router(req, res, next);
  }
  // PWA assets, so a subscriber can install their own dashboard.
  if (['/manifest.webmanifest', '/sw.js', '/icon-192.png', '/icon-512.png',
       '/apple-touch-icon.png', '/favicon-32.png'].includes(p)) {
    return res.sendFile(path.join(publicDir, p.replace(/^\//, '')));
  }

  // Profile photo, if the subscriber uploaded one.
  if (p === '/photo' || p === '/photo.jpg') {
    const prof = await scoped('profiles', site.sub.id).findOne({});
    const assetId = prof && prof.photo_asset_id;
    if (!assetId) return res.status(404).type('text/plain').send('No photo on file.');
    const a = await scoped('assets', site.sub.id).findOne({ where: { id: assetId } });
    if (!a || !a.data) return res.status(404).type('text/plain').send('No photo on file.');
    const tag = photos.etagFor(a);
    if (req.headers['if-none-match'] === tag) return res.status(304).end();
    res.set('ETag', tag);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.type(a.mime || 'image/jpeg').send(Buffer.from(a.data, 'base64'));
  }

  if (p === '/resume.json') return res.type('application/json').json(identity.resumeJson(site.profile, site.settings, ctx));
  if (p === '/.well-known/agent.json' || p === '/agent.json') return res.type('application/json').json(identity.agentCard(site.profile, site.settings, ctx));
  if (p === '/llms.txt') return res.type('text/plain').send(identity.llmsTxt(site.profile, site.settings, ctx));
  if (p === '/robots.txt') return res.type('text/plain').send(identity.robotsTxt({ url }));
  if (p === '/sitemap.xml') return res.type('application/xml').send(identity.sitemapXml({ url, roles: settingsSvc.pageRoles(site.settings) }));
  if (p === '/' || p === '/index.html') return res.type('html').send(siteRender.page(site.profile, site.settings, ctx));

  const roleMatch = p.match(/^\/roles\/([a-z0-9-]+)\/?$/);
  if (roleMatch) {
    const role = settingsSvc.pageRoles(site.settings).find((r) => r.slug === roleMatch[1]);
    if (!role) return res.status(404).type('text/plain').send('No such role page.');
    return res.type('html').send(siteRender.rolePage(site.profile, site.settings, ctx, role));
  }
  if (p === '/roles' || p === '/roles/') return res.type('html').send(siteRender.roleIndex(site.profile, site.settings, ctx));

  return next();
}

module.exports = router;
module.exports.subscriberSite = subscriberSite;
module.exports.labelFromHost = labelFromHost;
module.exports.isReady = () => ready;
