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
    base_domain: addresses.BASE_DOMAIN,
  });
});

// ---- API ------------------------------------------------------------------
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/api/v1/intake', require('./routes/intake'));
router.use('/api/v1/billing', require('./routes/billing'));
router.use('/api/v1/engine', require('./routes/engine'));
router.use('/teaser', require('./routes/teaser-view'));

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
    profile: (p && p.resume_json) || {},
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

  const url = `https://${site.sub.address}`;
  const ctx = { name: site.profile.name || site.sub.name, url, slug: label };
  const p = req.path;

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
