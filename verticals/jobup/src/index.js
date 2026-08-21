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
const scheduler = require('./services/scheduler');
const photos = require('./services/photos');
const pwa = require('./services/pwa');

// QR is generated on OUR server — no third-party QR service ever sees a
// subscriber's address. Cached per address; it only changes when they
// personalise it, and regenerating on every page view is pure waste.
const QRCode = require('qrcode');
const qrCache = new Map();
async function qrFor(url) {
  if (qrCache.has(url)) return qrCache.get(url);
  try {
    const d = await QRCode.toDataURL(url, { margin: 1, width: 512, errorCorrectionLevel: 'M' });
    if (qrCache.size > 500) qrCache.clear();
    qrCache.set(url, d);
    return d;
  } catch (e) {
    console.warn('[jobup] QR generation failed:', e.message);
    return null;   // the page renders fine without it
  }
}

const router = express.Router();
const publicDir = path.join(__dirname, '..', 'public');

// STRIPE SIGNS THE RAW BYTES — this must come BEFORE express.json().
//
// Stripe computes the HMAC over the exact payload it sent, which is
// pretty-printed JSON. express.json() consumes the stream, leaves a parsed
// object and sets req._body, so the express.raw() inside the billing route
// skips and the handler falls back to JSON.stringify(req.body) — a re-encoding
// that differs from the original in whitespace alone, which is enough for the
// signature to never match. Every webhook returned 400 "No signatures found
// matching the expected signature", forever: payments would clear and the
// account would never be activated, invoices never recorded, cancellations
// never torn down.
//
// The parser is bound to the exact path so nothing else sees a raw body.
router.use('/api/v1/billing/webhook', express.raw({ type: 'application/json' }));

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
  .then((r) => { ready = true; console.log(`[jobup] store ready: ${r.backend}, ${r.tables} tables (ju_ prefix)`); scheduler.start();
    // ReachUp marketing layer — same Postgres, ru_ tables. Runs after the store
    // is up so its sequelize handle is live; never fatal to JobUp boot.
    require('./reachup').init().catch((e) => console.error('[reachup] init failed:', e.message)); })
  .catch((e) => { bootError = e.message; console.error('[jobup] init failed:', e.message); });

// ---- health ---------------------------------------------------------------
router.get('/health', async (req, res) => {
  // ?probe=1 spends a fraction of a cent to find out whether the key WORKS.
  // "brain: anthropic" only ever meant a key string was present, which is how
  // four previews in a row went out on the heuristic path unnoticed.
  const brainHealth = brain.health();
  let stripeProbe = null;
  if (req.query && req.query.probe) {
    try { brainHealth.probe = await brain.probe(); }
    catch (e) { brainHealth.probe = { ok: false, reason: e.message }; }
    try { stripeProbe = await billing.probe(); }
    catch (e) { stripeProbe = { ok: false, reason: e.message }; }
  }
  res.json({
    ok: true,
    service: 'jobup',
    ready,
    error: bootError,
    db: backend(),
    table_prefix: 'ju_',
    brain: brain.enabled() ? 'anthropic' : 'heuristic (no ANTHROPIC_API_KEY)',
    brain_detail: brainHealth,
    // Always report the SHAPE of the key (free, no API call) — that alone
    // catches a value pasted from an abbreviated copy. ?probe=1 additionally
    // asks Stripe whether it accepts it.
    stripe_key: billing.keyShape(),
    stripe_webhook_secret: (function () {
      const w = billing.webhookSecret();
      return { present: Boolean(w), length: w.length,
               looks_truncated: Boolean(w) && (w.length < 24 || /[^A-Za-z0-9_]/.test(w)) };
    }()),
    stripe_probe: stripeProbe,
    // Whether webhooks are ARRIVING and VERIFYING. A signing secret from the
    // wrong endpoint is perfectly well formed and fails every signature; this
    // is the only place that shows it.
    stripe_webhooks: billing.webhookHealth(),
    // How many LIVE profiles are currently degraded because the model was
    // unreachable when they were built. This is the number that was silently
    // 1 while a paying subscriber's page sat empty.
    degraded_profiles: await (async () => {
      try { return await require('./services/self-heal').pending(); }
      catch (e) { return { error: e.message }; }
    })(),
    billing: billing.status(),
    voice: 'reuses the CRM /api/tts/edge (keyless Edge neural TTS)',
    admin: require('./routes/admin').configured() ? 'configured' : 'CLOSED — set JOBUP_ADMIN_PASSWORD',
    scheduler: scheduler.status(),
    base_domain: addresses.BASE_DOMAIN,
  });
});

// ---- API ------------------------------------------------------------------
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/api/v1/intake', require('./routes/intake'));
router.use('/api/v1/billing', require('./routes/billing'));
router.use('/api/v1/engine', require('./routes/engine'));
router.use('/api/v1/notify', require('./routes/notify'));
router.use('/teaser', require('./routes/teaser-view'));
// The subscriber fix-it bench. Mounted BEFORE the admin console so its routes
// win over the console's catch-all page, and inside /admin so it inherits the
// owner credential rather than minting yet another one.
router.use('/admin', require('./routes/admin-subscribers'));
router.use('/admin', require('./routes/admin'));
// Separate module, separate credential, separate cookie: who is subscribed,
// what they paid and when. See routes/subscribers-admin.js for why it may show
// billing identity where /admin deliberately will not.
router.use('/subscribers-admin', require('./routes/subscribers-admin'));
router.get(['/subscribers-admin', '/subscribers-admin/'], (req, res) =>
  res.type('html').send(pwa.page('subscribers-admin.html', pwa.basePath(req))));
// The growth plan dashboard. Inside the console's PWA scope on purpose, so it
// opens in the installed app rather than kicking out to a browser tab.
router.get(['/subscribers-admin/plan', '/subscribers-admin/plan/'], (req, res) =>
  res.type('html').send(pwa.page('plan.html', pwa.basePath(req))));
// Social Media Image Poster. Shares the subscribers console credential rather
// than minting a third admin password — see routes/social-admin.js.
router.use('/social-admin', require('./routes/social-admin'));
router.get(['/social-admin', '/social-admin/'], (req, res) =>
  res.type('html').send(pwa.page('social-admin.html', pwa.basePath(req))));

// ReachUp marketing layer: public capture/unsubscribe/webhook API + the
// /admin/marketing console. Shares the JobUp owner credential (no new secret).
const reachup = require('./reachup');
router.use('/api/v1/reachup', reachup.apiRouter);
router.use('/admin', reachup.adminRouter);

// ---- Referral magic link ---------------------------------------------------
// /r/CODE is the whole share mechanism: it logs the click, drops the
// attribution cookie, and sends the visitor to the landing page. It redirects
// even for an unknown code — a broken link should still show someone JobUp
// rather than an error, and an unknown code simply earns nobody anything.
router.get('/r/:code', async (req, res) => {
  const referrals = require('./services/referrals');
  const base = pwa.basePath(req);
  try {
    const hit = await referrals.recordClick(req.params.code, req);
    if (hit.ok) res.cookie(referrals.COOKIE, hit.code, referrals.cookieOptions());
  } catch (e) { /* attribution must never block the visit */ }
  res.redirect(302, `${base}/?ref=${encodeURIComponent(referrals.normalise(req.params.code))}`);
});

// ---- PWA ------------------------------------------------------------------
// The manifest and the worker are GENERATED for the root this request arrived
// on — see services/pwa.js. They sit above express.static deliberately, so the
// stale on-disk sw.js template can never be served verbatim.
// The ICONS are listed here too, not left to express.static. static serves them
// with max-age=0, so the versioned-url caching policy only ever applied on a
// subscriber subdomain — the one root that already went through serveAsset.
// All three roots must share one policy.
router.get(['/manifest.webmanifest', '/sw.js', '/offline', '/offline.html',
            '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
            '/favicon-32.png', '/favicon.svg', '/logo-master.svg'], (req, res, next) => {
  if (!pwa.serveAsset(req, res, pwa.basePath(req))) next();
});

// ---- subscriber dashboard --------------------------------------------------
// Every paying subscriber signs in here with their OWN email and password.
// No allowlist, no env var — that is only the platform owner console.
// Aliases include /cv-admin so the muscle memory from manuelstagg.com works.
router.get(['/app', '/app/', '/dashboard', '/cv-admin'], (req, res) =>
  res.type('html').send(pwa.page('app.html', pwa.basePath(req))));

// Customer Plans & Billing (pricing + upgrade/downgrade/pause). Session-scoped
// via the billing API; the page itself is public so the pricing is shareable.
router.get(['/plan', '/plan/', '/pricing', '/billing'], (req, res) =>
  res.type('html').send(pwa.page('plan-billing.html', pwa.basePath(req))));

// Step 3 of the funnel: the account form the teaser's CTA opens. Carries
// ?t=<teaser_token>, which is the authoritative record of who this person is.
/**
 * THE PUBLIC DIRECTORY — the only thing that links to a subscriber site.
 *
 * Measured: 1,353 page views and every external referrer is '(direct)'. Every
 * site is an island, which is precisely why Google has no reason to crawl one.
 *
 * OPT-IN, DEFAULT OFF. Nobody is listed because we decided it would help them.
 * Server-rendered real <a href> links — a link a crawler cannot see is not a
 * backlink — and only fields their own privacy projection already makes public.
 */
async function directoryEntries() {
  const subs = await models.subscribers.findAll({ where: { status: 'active' } });
  const billing = require('./services/billing');
  const out = [];
  for (const sub of subs) {
    if (!sub.address) continue;
    const sRow = await scoped('settings', sub.id).findOne({});
    const st = settingsSvc.sanitize((sRow && sRow.settings) || {});
    if (!st.presence.directory_opt_in) continue;          // opt-in means opt-in
    const pRow = await scoped('profiles', sub.id).findOne({});
    const profile = (pRow && pRow.resume_json) || {};
    out.push({
      // NOTHING here is a private field: a name, a headline they chose, and the
      // role titles they asked to be found for. No email, no phone, no location.
      name: profile.name || sub.name || sub.address.split('.')[0],
      headline: profile.headline || null,
      url: `https://${sub.address}`,
      roles: settingsSvc.pageRoles(st).slice(0, 4).map((r) => r.title),
      test: billing.isNonRevenue(sub.activation),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * jobup.dev had NO robots.txt and NO sitemap.xml — both 404. Subscriber sites
 * each carry their own, but the apex told crawlers nothing at all, so the one
 * page that links to every subscriber site had no machine-readable route in.
 *
 * Subscriber subdomains are served by subscriberSite, which is mounted ABOVE
 * this and answers these paths itself, so these only ever apply to the apex.
 */
router.get('/robots.txt', (req, res) => {
  const base = process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev';
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\n`
    + `Disallow: /subscribers-admin\nDisallow: /teaser/\nDisallow: /build\n`
    + `\nSitemap: ${base}/sitemap.xml\n`);
});

router.get('/sitemap.xml', async (req, res) => {
  const base = process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev';
  // Every listed subscriber, so a crawler reaching the sitemap reaches them all.
  let sites = [];
  try { sites = (await directoryEntries()).map((e) => e.url); } catch (e) { /* apex still valid */ }
  const urls = [`${base}/`, `${base}/directory`, ...sites]
    .map((u) => `<url><loc>${u}</loc></url>`).join('\n');
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

router.get(['/directory', '/directory/'], async (req, res) => {
  try {
    const rows = await directoryEntries();
    const esc = (x) => String(x == null ? '' : x)
      .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;',
                                     '"': '&quot;', "'": '&#39;' }[c]));
    const items = rows.map((r) => `<li class="e">
      <a class="n" href="${esc(r.url)}">${esc(r.name)}</a>
      ${r.headline ? `<div class="h">${esc(r.headline)}</div>` : ''}
      ${r.roles.length ? `<div class="r">${r.roles.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="u">${esc(r.url.replace(/^https:\/\//, ''))}</div></li>`).join('');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Directory — JobUp</title>
<meta name="description" content="People building their careers with JobUp. Each has a public, machine-readable profile.">
<link rel="canonical" href="https://jobup.dev/directory">
<style>:root{--bg:#07080c;--card:#11141c;--line:rgba(255,255,255,.08);--ink:#eef2f8;
--mut:#9aa3b4;--faint:#6b7385;--cy:#22d3ee}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:-.011em}
.w{max-width:820px;margin:0 auto;padding:48px 20px 80px}
h1{font-size:clamp(26px,6vw,36px);font-weight:830;letter-spacing:-.035em;margin:0 0 8px}
.lede{color:var(--mut);margin-bottom:32px}
ul{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.e{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px}
.n{font-size:18px;font-weight:760;color:var(--ink);text-decoration:none}
.n:hover{color:var(--cy)}
.h{color:var(--mut);font-size:14.5px;margin-top:2px}
.r{margin-top:9px;display:flex;flex-wrap:wrap;gap:7px}
.r span{border:1px solid var(--line);border-radius:999px;padding:4px 11px;font-size:12.5px;color:var(--mut)}
.u{color:var(--faint);font-size:12.5px;margin-top:8px;font-family:ui-monospace,Menlo,monospace}
.empty{border:1px dashed rgba(255,255,255,.15);border-radius:16px;padding:26px;color:var(--mut)}
.foot{margin-top:34px;color:var(--faint);font-size:13px}
.foot a{color:var(--cy)}</style></head><body><div class="w">
<h1>Directory</h1>
<p class="lede">People building their careers with JobUp. Every profile below is public and
machine-readable &mdash; a recruiter, a search engine or an AI assistant can read it.</p>
${rows.length ? `<ul>${items}</ul>`
  : `<div class="empty">Nobody has listed themselves yet. Subscribers choose whether to appear
     here; it is off unless they turn it on.</div>`}
<p class="foot">Listing is opt-in. <a href="https://jobup.dev/">What JobUp is</a></p>
</div></body></html>`);
  } catch (e) {
    res.status(500).type('text/plain').send('Directory unavailable.');
  }
});

router.get(['/build', '/build/'], (req, res) =>
  res.type('html').send(pwa.page('build.html', pwa.basePath(req))));

// Step 4: the account is built. Bookmark link + Manage.
// /welcome is where Stripe used to land people, so it keeps that name for the
// old links; /ready is the honest name now that nothing is being welcomed back
// from a checkout page.
router.get(['/welcome', '/welcome/', '/ready', '/ready/'], (req, res) =>
  res.type('html').send(pwa.page('welcome.html', pwa.basePath(req))));

// The password-reset page. The emailed link points here (a GET the browser can
// open), NOT at the POST /api/v1/auth/reset endpoint. The page reads ?t=<token>
// and POSTs the new password back to that endpoint.
router.get(['/reset', '/reset/'], (req, res) =>
  res.type('html').send(pwa.page('reset.html', pwa.basePath(req))));

// Legal. Public, indexable, and linked from the footer + signup. This ecosystem
// hosts people's personal data, so the policy and terms are first-class pages.
router.get(['/privacy', '/privacy/', '/privacy-policy'], (req, res) =>
  res.type('html').send(pwa.page('privacy.html', pwa.basePath(req))));
router.get(['/terms', '/terms/', '/terms-of-service'], (req, res) =>
  res.type('html').send(pwa.page('terms.html', pwa.basePath(req))));

// ---- landing --------------------------------------------------------------
// The three shells carry a {{BASE}} token, so serving them as raw static files
// would ship that token to the browser. Send people to the real routes instead.
router.get(['/index.html', '/app.html', '/welcome.html', '/build.html', '/reset.html',
            '/privacy.html', '/terms.html',
            '/subscribers-admin.html', '/social-admin.html', '/plan.html'], (req, res) => {
  const to = { '/index.html': '/', '/app.html': '/app',
               '/welcome.html': '/welcome', '/build.html': '/build', '/reset.html': '/reset',
               '/privacy.html': '/privacy', '/terms.html': '/terms',
               '/subscribers-admin.html': '/subscribers-admin',
               '/social-admin.html': '/social-admin',
               '/plan.html': '/subscribers-admin/plan' }[req.path];
  res.redirect(301, `${pwa.basePath(req)}${to}`);
});
// index:false is load-bearing. express.static serves publicDir/index.html for a
// request to '/' by default, which would hand out the RAW shell — {{BASE}}
// tokens and all — before the route below ever ran.
router.use(express.static(publicDir, { index: false }));
router.get('/', (req, res) => res.type('html').send(pwa.page('index.html', pwa.basePath(req))));

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
      //
      // The asset id is in the URL on purpose. /photo is cached for a day, so
      // a bare '/photo' would keep serving the OLD image for 24 hours after
      // someone replaced theirs — the change would look like it had failed.
      photo_url: p && p.photo_asset_id ? `/photo?v=${p.photo_asset_id}` : null,
      qr_data_uri: await qrFor(`https://${sub.address}`),
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

  // An address the subscriber used to hold still resolves — a recruiter may be
  // holding that link, so it redirects rather than 404s.
  if (!site) {
    try {
      const alias = await models.address_aliases.findOne({
        where: { address: `${label}.${addresses.BASE_DOMAIN}` } });
      if (alias) {
        const owner = await models.subscribers.findOne({ where: { id: alias.tenant_id } });
        if (owner && owner.address && owner.status === 'active') {
          return res.redirect(301, `https://${owner.address}${req.originalUrl === '/' ? '' : req.originalUrl}`);
        }
      }
    } catch (e) { /* fall through to the 404 */ }
    return res.status(404).type('text/plain').send('No JobUp site at this address.');
  }
  if (site.offline) {
    return res.status(404).type('html').send(
      '<!doctype html><meta charset="utf-8"><title>Not available</title>' +
      '<p style="font:16px system-ui;padding:40px">This JobUp site is not currently active.</p>');
  }

  // Record the visit for the subscriber's Analytics tab. Fire-and-forget:
  // traffic logging must never be able to break someone's public page.
  analytics.record(site.sub.id, req, req.path);

  const url = `https://${site.sub.address}`;
  const ctx = { name: site.profile.name || site.sub.name, url, slug: label,
                lang: site.sub.language === 'es' ? 'es' : 'en' };
  const p = req.path;

  // ---- The subscriber's OWN console, on their OWN address ----------------
  // Their dashboard belongs at manuelstagg.jobup.dev/app, not buried at
  // jobup.dev/jobup/app. Serving it here also makes the session cookie and
  // every API call same-origin with their site.
  if (['/app', '/app/', '/dashboard', '/admin', '/cv-admin', '/login'].includes(p)) {
    return res.type('html').send(pwa.page('app.html', ''));
  }
  if (p === '/welcome' || p === '/welcome/') {
    return res.type('html').send(pwa.page('welcome.html', ''));
  }
  if (p === '/reset' || p === '/reset/') {
    return res.type('html').send(pwa.page('reset.html', ''));
  }
  if (p === '/privacy' || p === '/privacy/' || p === '/privacy-policy') {
    return res.type('html').send(pwa.page('privacy.html', ''));
  }
  if (p === '/terms' || p === '/terms/' || p === '/terms-of-service') {
    return res.type('html').send(pwa.page('terms.html', ''));
  }
  // The dashboard resolves its API base to the current origin, so the API has
  // to answer here too.
  if (p.startsWith('/api/v1/') || p === '/health') {
    return router(req, res, next);
  }
  // PWA assets, so a subscriber can install their own dashboard. Generated by
  // the SAME code that serves jobup.dev and the /jobup mount — this used to be
  // a second, separate rewrite, which is exactly how the apex domain ended up
  // shipping a manifest scoped to a path it does not have.
  //
  // The subscriber's name goes on the install so two JobUp sites are told apart
  // on one home screen.
  if (pwa.serveAsset(req, res, '', { name: ctx.name, lang: ctx.lang })) return undefined;

  // Profile photo, if the subscriber uploaded one.
  if (p === '/photo' || p === '/photo.jpg') {
    const prof = await scoped('profiles', site.sub.id).findOne({});
    const assetId = prof && prof.photo_asset_id;
    if (!assetId) return res.status(404).type('text/plain').send('No photo on file.');
    const a = await scoped('assets', site.sub.id).findOne({ id: assetId });
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
