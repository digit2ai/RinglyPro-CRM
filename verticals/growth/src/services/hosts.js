'use strict';

/**
 * Digit2AI Growth — brand-host cache.
 *
 * A synchronous, 60s-refreshed map of domain -> brand so the SEO middleware
 * (blog-link injector, sitemap, robots) can decide instantly whether a request
 * belongs to a managed brand WITHOUT a per-request DB hit. Non-brand hosts (the
 * whole main CRM) fall through untouched.
 */

const { Brand } = require('../models');

let HOSTS = new Map();   // host -> brand plain object
let lastRefresh = 0;

// Shared hosts that must NEVER be treated as a single brand's domain — the SEO
// middleware would otherwise inject a blog pill / sitemap onto the whole CRM.
const EXCLUDED = new Set([
  'aiagent.ringlypro.com',
  (process.env.APP_HOST || '').toLowerCase().replace(/^www\./, '')
].filter(Boolean));

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

async function refresh() {
  try {
    const brands = await Brand.findAll({ raw: true });
    // Count brands per host: a host is "managed" ONLY if exactly one brand owns
    // it (a dedicated custom domain) and it isn't a shared/excluded host. Path-
    // based brands on the shared CRM host are handled by the audit, not injected.
    const counts = new Map();
    for (const b of brands) { const h = hostOf(b.url); if (h) counts.set(h, (counts.get(h) || 0) + 1); }
    const m = new Map();
    for (const b of brands) {
      const h = hostOf(b.url);
      if (!h || EXCLUDED.has(h) || counts.get(h) !== 1) continue;
      m.set(h, b);
    }
    HOSTS = m; lastRefresh = Date.now();
  } catch (e) { /* keep the stale cache on error */ }
}

function ensureFresh() { if (Date.now() - lastRefresh > 60000) refresh(); } // fire-and-forget

function brandForHostSync(host) {
  if (!host) return null;
  ensureFresh();
  return HOSTS.get(String(host).toLowerCase().replace(/^www\./, '')) || null;
}

module.exports = { refresh, brandForHostSync, hostOf };
