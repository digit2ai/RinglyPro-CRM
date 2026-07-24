'use strict';

/**
 * Lawn Co-Pilot — tenancy
 *
 * THE KEYSTONE. v1 read the tenant from LAWNCOPILOT_TENANT_ID in seven files.
 * v2 resolves it from the URL slug and nowhere else.
 *
 * The slug IS the company's web address — lawncopilot.com/lawn_moster — the way
 * vagaro.com/<salon> is a salon's. It is printed on trucks and linked from
 * Google Business Profile, so it is immutable after launch and old slugs keep
 * resolving through lc_tenant_aliases.
 *
 * Hard rule: no route may read a tenant from an env var or a request body.
 * Everything downstream reads req.tenant / req.tenant_id.
 */

const { Tenant, TenantAlias } = require('./models');

// Paths under /lawncopilot that belong to the PLATFORM, never to a tenant.
// A company can never claim one of these as their slug.
const RESERVED = new Set([
  'platform', 'admin', 'portal', 'api', 'mcp', 'signup', 'login', 'logout',
  'health', 'webhooks', 'voice', 'assets', 'static', 'quote', 'www', 'l',
  'about', 'pricing', 'terms', 'privacy', 'support', 'help', 'blog', 'docs',
  'app', 'dashboard', 'account', 'settings', 'billing', 'checkout', 'demo',
  'lawncopilot', 'digit2ai', 'null', 'undefined', 'favicon.ico', 'robots.txt',
  'sitemap.xml', 'manifest.webmanifest', 'sw.js'
]);

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,38}[a-z0-9]$/;

// Small in-process cache. A tenant lookup on every request would be wasteful,
// and slugs change essentially never.
const cache = new Map();
const CACHE_MS = 60000;

function cacheGet(slug) {
  const hit = cache.get(slug);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) { cache.delete(slug); return null; }
  return hit.tenant;
}
function cacheSet(slug, tenant) {
  cache.set(slug, { tenant, at: Date.now() });
}
function cacheBust(slug) {
  if (slug) cache.delete(slug);
  else cache.clear();
}

function normalizeSlug(raw) {
  return String(raw || '').trim().toLowerCase();
}

/**
 * Is this slug shaped correctly and not reserved? Used at signup.
 */
function validateSlug(raw) {
  const slug = normalizeSlug(raw);
  if (!slug) return { ok: false, error: 'Pick a web address for your company.' };
  if (RESERVED.has(slug)) return { ok: false, error: 'That name is reserved. Try another.' };
  if (slug.length < 3) return { ok: false, error: 'Too short — use at least 3 characters.' };
  if (slug.length > 40) return { ok: false, error: 'Too long — 40 characters maximum.' };
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: 'Use lowercase letters, numbers, dashes and underscores only.' };
  }
  return { ok: true, slug };
}

function suggestSlug(companyName) {
  const base = String(companyName || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 34);
  return base || 'my_company';
}

async function isSlugAvailable(raw) {
  const v = validateSlug(raw);
  if (!v.ok) return v;
  const taken = await Tenant.findOne({ where: { slug: v.slug }, raw: true });
  if (taken) return { ok: false, slug: v.slug, error: 'That address is already taken.' };
  const alias = await TenantAlias.findOne({ where: { slug: v.slug }, raw: true });
  if (alias) return { ok: false, slug: v.slug, error: 'That address is already taken.' };
  return { ok: true, slug: v.slug };
}

/**
 * Resolve a slug to a live tenant, following aliases.
 */
async function resolveTenant(raw) {
  const slug = normalizeSlug(raw);
  if (!slug || RESERVED.has(slug)) return null;

  const cached = cacheGet(slug);
  if (cached) return cached;

  let tenant = await Tenant.findOne({ where: { slug }, raw: true });
  if (!tenant) {
    const alias = await TenantAlias.findOne({ where: { slug }, raw: true });
    if (alias) tenant = await Tenant.findOne({ where: { id: alias.tenant_id }, raw: true });
  }
  if (!tenant) return null;
  if (tenant.status === 'deleted') return null;

  cacheSet(slug, tenant);
  return tenant;
}

/**
 * Express middleware for the tenant router, mounted at /:slug.
 *
 * Attaches req.tenant and req.tenant_id, or 404s. It NEVER falls back to a
 * default tenant — a typo must not silently serve another company's page.
 */
function tenantMiddleware() {
  return async function (req, res, next) {
    const slug = normalizeSlug(req.params.slug);
    let tenant;
    try {
      tenant = await resolveTenant(slug);
    } catch (e) {
      return next(e);
    }

    if (!tenant) {
      if (req.path.startsWith('/api/') || req.path.startsWith('/mcp')) {
        return res.status(404).json({ success: false, error: 'No such company', slug });
      }
      return res.status(404).send(notFoundPage(slug));
    }

    // A suspended tenant's page goes quiet rather than serving a broken
    // experience to their customers.
    if (tenant.status === 'suspended') {
      if (req.path.startsWith('/api/')) {
        return res.status(503).json({ success: false, error: 'This account is temporarily unavailable.' });
      }
      return res.status(503).send(suspendedPage(tenant));
    }

    // If they arrived on an old alias, send them to the canonical slug.
    if (tenant.slug !== slug && req.method === 'GET') {
      // Works under both mounts: /lawncopilot/<old> and /<old> on the custom domain.
      const rest = req.originalUrl.replace(`/${slug}`, `/${tenant.slug}`);
      return res.redirect(301, rest);
    }

    req.tenant = tenant;
    req.tenant_id = tenant.id;
    req.tenantSlug = tenant.slug;
    next();
  };
}

/**
 * Guard for platform-only surfaces: there must be NO tenant in context.
 */
function requireNoTenant(req, res, next) {
  if (req.tenant) return res.status(404).json({ success: false, error: 'Not found' });
  next();
}

/**
 * The canonical public home. lawncopilot.com serves the app at its root, so a
 * company's address is lawncopilot.com/<slug> with no path prefix. Everything
 * that leaves the building — QR codes, short links, emails, og:url, the Google
 * Business Profile instructions — must use that form.
 */
const CANONICAL = () => (process.env.LAWNCOPILOT_BASE_DOMAIN || 'https://lawncopilot.com')
  .replace(/\/+$/, '');

/**
 * Path prefix for THIS request. Empty on the custom domain, '/lawncopilot'
 * when served under aiagent.ringlypro.com.
 */
function basePath(req) {
  return (req && req.lawncopilotRoot) ? '' : '/lawncopilot';
}

function publicRoot(req) {
  const canonical = CANONICAL();
  if (canonical) return { root: canonical, prefix: '' };
  const host = req ? `${req.protocol}://${req.get('host')}` : 'https://aiagent.ringlypro.com';
  return { root: host, prefix: basePath(req) };
}

function tenantBaseUrl(tenant, req) {
  const { root, prefix } = publicRoot(req);
  return `${root}${prefix}/${tenant.slug}`;
}

/** Canonical short link, e.g. https://lawncopilot.com/l/ab12cd */
function shortLinkUrl(code, req) {
  const { root, prefix } = publicRoot(req);
  return `${root}${prefix}/l/${code}`;
}

function notFoundPage(slug) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Company not found — Lawn Co-Pilot</title>
<link rel="stylesheet" href="/lawncopilot/styles.css"></head>
<body style="display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center">
<div style="max-width:420px">
<img src="/lawncopilot/logo.png" alt="Lawn Co-Pilot" width="190" height="72" style="margin:0 auto 24px">
<h1 style="font-size:1.5rem">No company at that address</h1>
<p class="mut">We could not find a lawn care company at <b>/${escapeHtml(slug)}</b>. Check the link or the QR code you scanned.</p>
<a class="btn btn--primary" href="/lawncopilot/">Go to Lawn Co-Pilot</a>
</div></body></html>`;
}

function suspendedPage(tenant) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(tenant.name)}</title>
<link rel="stylesheet" href="/lawncopilot/styles.css"></head>
<body style="display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center">
<div style="max-width:440px">
<h1 style="font-size:1.4rem">${escapeHtml(tenant.name)}</h1>
<p class="mut">Online booking is temporarily unavailable. Please call
${tenant.owner_phone || tenant.phone ? `<a href="tel:${escapeHtml(tenant.owner_phone || tenant.phone)}">${escapeHtml(tenant.owner_phone || tenant.phone)}</a>` : 'the company'} directly.</p>
</div></body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

module.exports = {
  tenantMiddleware, requireNoTenant, resolveTenant,
  basePath, publicRoot, shortLinkUrl, CANONICAL,
  validateSlug, isSlugAvailable, suggestSlug, normalizeSlug,
  tenantBaseUrl, cacheBust, escapeHtml, RESERVED, SLUG_RE
};
