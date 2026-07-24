'use strict';

/**
 * LAWN CO-PILOT — the multi-tenant AI office for landscaping companies
 * Digit2AI vertical. Mounted at /lawncopilot.
 *
 * Two layers:
 *
 *   PLATFORM   /lawncopilot/            sells to landscapers, carries signup
 *              /lawncopilot/signup      company signup + provisioning
 *              /lawncopilot/platform    Digit2AI super-admin, above all tenants
 *              /lawncopilot/mcp/*       the Brain
 *              /lawncopilot/l/:code     short links (truck QR, Google, texts)
 *
 *   TENANT     /lawncopilot/:slug       THE COMPANY'S WEB PRESENCE
 *              /lawncopilot/:slug/portal   their customers
 *              /lawncopilot/:slug/admin    their office
 *
 * The slug is the whole addressing scheme. No custom domains, by design —
 * small landscapers do not own domains. The link goes on the truck and into
 * their Google Business Profile.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize } = require('./models');
const { tenantMiddleware } = require('./tenancy');
const { ensurePlatform, ensureDemoTenant } = require('./services/provision');

const SECRET = () => process.env.LAWNCOPILOT_JWT_SECRET || process.env.JWT_SECRET || 'lawncopilot-dev-secret';
const publicDir = path.join(__dirname, '..', 'public');

// ── Stripe webhook needs the RAW body for signature verification ───────────
router.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

router.use(express.json({ limit: '5mb' }));
router.use(express.urlencoded({ extended: true }));

// ── Session decoding. Never a gate by itself. ─────────────────────────────
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
router.use((req, res, next) => {
  const ct = getCookie(req, 'lawncopilot_token');
  if (ct) {
    try {
      const p = jwt.verify(ct, SECRET());
      if (p.kind === 'customer') req.customer = p;
    } catch (e) { /* expired or forged */ }
  }
  const st = getCookie(req, 'lawncopilot_staff');
  if (st) {
    try {
      const p = jwt.verify(st, SECRET());
      if (p.kind === 'staff') req.staff = p;
    } catch (e) { /* expired or forged */ }
  }
  const pt = getCookie(req, 'lawncopilot_platform');
  if (pt) {
    try {
      const p = jwt.verify(pt, SECRET());
      if (p.kind === 'platform') req.platformUser = p;
    } catch (e) { /* expired or forged */ }
  }
  next();
});

// ════════════════════════════════════════════════════════════════════════════
// PLATFORM LAYER — no tenant in context
// ════════════════════════════════════════════════════════════════════════════

/**
 * The web app manifest, rendered per host. On lawncopilot.com the app lives at
 * the root, so scope and start_url must be '/' — a manifest whose scope does
 * not cover the page silently makes the app un-installable.
 */
router.get('/app.webmanifest', (req, res) => {
  const { basePath } = require('./tenancy');
  const base = basePath(req) || '';
  res.type('application/manifest+json').json({
    name: 'Lawn Co-Pilot',
    short_name: 'Lawn Co-Pilot',
    description: 'The AI office for landscaping companies.',
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6faf8',
    theme_color: '#307f44',
    categories: ['business', 'productivity'],
    icons: [
      { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  });
});

router.get('/health', async (req, res) => {
  const { Tenant } = require('./models');
  const brain = require('./mcp/brain');
  let db = 'unknown', tenants = null;
  try {
    await sequelize.authenticate();
    db = 'ok';
    tenants = await Tenant.count();
  } catch (e) { db = 'error: ' + e.message; }

  res.json({
    status: db === 'ok' ? 'ok' : 'degraded',
    service: 'Lawn Co-Pilot',
    tagline: 'The multi-tenant AI office for landscaping companies',
    db,
    version: '2.0.0',
    tenants,
    employees: brain.listEmployees().map(e => ({ id: e.id, name: e.name })),
    tools: Object.keys(brain.REGISTRY).length,
    capabilities: {
      measurement_provider: process.env.LAWNCOPILOT_MEASURE_PROVIDER || 'heuristic',
      geocoder: !!process.env.GOOGLE_MAPS_API_KEY,
      parcel_data: !!(process.env.REGRID_API_KEY || process.env.ATTOM_API_KEY),
      payments: !!process.env.STRIPE_SECRET_KEY,
      stripe_connect: !!process.env.STRIPE_CONNECT_CLIENT_ID,
      payroll_provider: process.env.PAYROLL_PROVIDER || null,
      routing_provider: !!process.env.ROUTING_PROVIDER_KEY,
      llm: !!process.env.ANTHROPIC_API_KEY,
      typed_chat: true
    }
  });
});

router.use('/mcp', require('./routes/mcp'));
router.use('/api/v1/signup', require('./routes/signup'));
router.use('/api/v1/signin', require('./routes/signin'));
router.use('/api/v1/platform', require('./routes/platform'));
router.use('/webhooks', require('./routes/webhooks'));
router.use('/voice', require('./routes/voice'));
router.use('/l', require('./routes/shortlink'));

/**
 * Neural TTS for the on-page voice orbs (the investor teaser narration).
 *
 * The custom domain routes ALL of lawncopilot.com into this app, so the main
 * app's /api/tts/edge is unreachable there. Mounting the same route here makes
 * the orb same-origin on both hosts — no CORS, no silent fallback to the robot
 * browser voice. It is the exact route already live at aiagent.ringlypro.com;
 * we reuse it, not regenerate the engine.
 */
try { router.use('/api/tts', require('../../../src/routes/presentation-tts')); }
catch (e) { console.warn('  Lawn Co-Pilot: TTS route not mounted —', e.message); }

// Platform pages
router.get('/signup', (req, res) => res.sendFile(path.join(publicDir, 'signup.html')));

/**
 * THE ONE SIGN-IN. Company owners, crews and homeowners all land here; the
 * account decides which dashboard opens (see services/identity.js). The three
 * old role-specific logins still work so bookmarks and deep links don't break.
 */
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'signin.html')));
router.get('/reset', (req, res) => res.sendFile(path.join(publicDir, 'reset.html')));
router.get('/platform/login', (req, res) => res.sendFile(path.join(publicDir, 'platform-login.html')));
router.get('/platform/reset', (req, res) => res.sendFile(path.join(publicDir, 'platform-reset.html')));
router.get(['/platform', '/platform/'], (req, res) => {
  if (!req.platformUser) return res.redirect(require('./tenancy').basePath(req) + '/platform/login');
  res.sendFile(path.join(publicDir, 'platform.html'));
});

// ── Shared static assets MUST come before /:slug ──────────────────────────
// Otherwise `/lawncopilot/styles.css` is matched as a company named
// "styles.css", the tenant lookup fails, and every stylesheet, script and
// image 404s into the not-found page. express.static calls next() when a file
// does not exist, so real slugs still fall through. index:false keeps it from
// serving public/index.html at `/` instead of the platform home.
router.use(express.static(publicDir, { index: false }));

/**
 * The investor teaser at a clean, shareable path. MUST precede /:slug — else
 * 'investors' is read as a company slug and 404s. Prefix rewritten per host so
 * lawncopilot.com/investors pays no redirect for its own links.
 */
const investorCache = new Map();
router.get(['/investors', '/investors/'], (req, res, next) => {
  try {
    const { basePath } = require('./tenancy');
    const base = basePath(req);
    const key = base || 'root';
    if (!investorCache.has(key)) {
      let html = require('fs').readFileSync(path.join(publicDir, 'investors.html'), 'utf8');
      if (base === '') html = html.split('/lawncopilot/').join('/');
      investorCache.set(key, html);
    }
    res.type('html').send(investorCache.get(key));
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════════════════════════════════
// TENANT LAYER — everything below resolves a company from the slug
// ════════════════════════════════════════════════════════════════════════════

router.use('/:slug', tenantMiddleware(), require('./tenant-router'));

/**
 * The platform home page, rendered per host.
 *
 * Three things happen server-side rather than in the browser:
 *
 *  1. PRICING IS RENDERED INTO THE HTML. It used to arrive from a client fetch,
 *     which meant a "Loading plans..." flash, a hard dependency on JS, and —
 *     the real hazard — a service worker could hand back a stale copy and the
 *     prices would silently be wrong. Now the numbers are in the document,
 *     still read from the single source in provision.js.
 *  2. The /lawncopilot prefix is rewritten to match the host, so on
 *     lawncopilot.com nothing pays a 301 just to load a stylesheet or a link.
 *  3. The orb is pointed at a real demo tenant, so the hero demo is live.
 */
const { PLAN_LIMITS, PLAN_ORDER } = require('./services/provision');

function renderPricing(base) {
  const trial = Number(process.env.LAWNCOPILOT_TRIAL_DAYS || 7);

  const cards = PLAN_ORDER.map(id => {
    const p = PLAN_LIMITS[id];
    const crews = p.crews >= 999 ? 'Unlimited' : p.crews;
    const people = p.employees >= 999 ? 'Unlimited' : p.employees;
    return `<div class="plan${p.popular ? ' plan--popular' : ''}">`
      + (p.popular ? '<span class="plan__tag">Most chosen</span>' : '')
      + `<h3>${p.label}</h3>`
      + `<div class="plan__tagline">${p.tagline}</div>`
      + `<div class="plan__price"><b>$${Math.round(p.price_cents / 100)}</b><span>/ month</span></div>`
      + `<div class="plan__limits">${crews}${crews === 1 ? ' crew' : ' crews'}`
      + ` &middot; up to ${people} people</div>`
      + '<ul>' + p.highlights.map(h => `<li>${h}</li>`).join('') + '</ul>'
      + `<a class="btn ${p.popular ? 'btn--primary' : 'btn--ghost'}"`
      + ` href="${base}/signup?plan=${encodeURIComponent(id)}">Start free</a>`
      + '</div>';
  }).join('');

  const ROWS = [
    ['Your own booking page and QR code', () => true],
    ['Receptionist, Estimator, Dispatcher, Bookkeeper', () => true],
    ['Crew Manager and time tracking', () => true],
    ['Payroll Officer', p => p.payroll],
    ['Marketing, reviews and referrals', p => p.marketing],
    ['The Controller: job costing and margin', p => p.controller]
  ];
  const compare = '<thead><tr><th>What you get</th>'
    + PLAN_ORDER.map(id => `<th class="c">${PLAN_LIMITS[id].label}</th>`).join('')
    + '</tr></thead><tbody>'
    + ROWS.map(([label, fn]) => '<tr><td>' + label + '</td>'
        + PLAN_ORDER.map(id => '<td class="c">'
            + (fn(PLAN_LIMITS[id]) ? '<span class="yes">Yes</span>' : '<span class="no">&mdash;</span>')
            + '</td>').join('')
        + '</tr>').join('')
    + '</tbody>';

  return { cards, compare, note: `${trial}-day free trial on every plan. No card to start. Cancel any time.` };
}

const platformHomeCache = new Map();
router.get('/', async (req, res, next) => {
  try {
    const { basePath } = require('./tenancy');
    const base = basePath(req);                 // '' on lawncopilot.com
    const key = base || 'root';

    if (!platformHomeCache.has(key)) {
      const { Tenant } = require('./models');
      const demoSlug = process.env.LAWNCOPILOT_DEMO_SLUG || 'green-acres';
      const demo = await Tenant.findOne({ where: { slug: demoSlug }, raw: true });
      let html = require('fs').readFileSync(path.join(publicDir, 'platform-home.html'), 'utf8');

      // No demo tenant means no working orb — drop the attribute rather than
      // shipping a page whose orb posts nowhere.
      html = html.replace('__DEMO_SLUG__', demo ? demo.slug : '');

      const pricing = renderPricing(base);
      html = html
        .replace('<div class="empty" style="grid-column:1/-1">Loading plans...</div>', pricing.cards)
        .replace('<p class="plans__note" id="plansNote"></p>',
                 `<p class="plans__note" id="plansNote">${pricing.note}</p>`)
        .replace('<table class="compare" id="compare"></table>',
                 `<table class="compare" id="compare">${pricing.compare}</table>`);

      // Point every absolute path at the host actually serving it.
      if (base === '') html = html.split('/lawncopilot/').join('/');

      platformHomeCache.set(key, html);
    }
    res.type('html').send(platformHomeCache.get(key));
  } catch (e) { next(e); }
});

// ── Init ───────────────────────────────────────────────────────────────────
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  Lawn Co-Pilot database tables synced (lc_*)');

    // sync({alter:false}) never adds columns — new ones go here, idempotently.
    const alters = [
      `ALTER TABLE lc_properties ADD COLUMN IF NOT EXISTS approved_sqft INTEGER`,
      `ALTER TABLE lc_properties ADD COLUMN IF NOT EXISTS gate_code_enc TEXT`,
      `ALTER TABLE lc_customers ADD COLUMN IF NOT EXISTS referral_code VARCHAR(255)`,
      `ALTER TABLE lc_appointments ADD COLUMN IF NOT EXISTS tracking JSONB DEFAULT '{}'::jsonb`,
      `ALTER TABLE lc_agent_calls ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false`,
      // v2
      `ALTER TABLE lc_tenants ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(255)`,
      `ALTER TABLE lc_tenants ADD COLUMN IF NOT EXISTS counties JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE lc_tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(255) DEFAULT 'starter'`,
      `ALTER TABLE lc_tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`,
      `ALTER TABLE lc_tenants ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255)`,
      `ALTER TABLE lc_tenants ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255)`,
      `ALTER TABLE lc_tenants ADD COLUMN IF NOT EXISTS short_code VARCHAR(255)`,
      `CREATE INDEX IF NOT EXISTS lc_tenants_slug_idx ON lc_tenants (slug)`
    ];
    for (const sql of alters) {
      try { await sequelize.query(sql); } catch (e) { /* already applied */ }
    }

    await ensurePlatform();
    await ensureDemoTenant();
  } catch (err) {
    console.error('  Lawn Co-Pilot init error:', err.message);
  }
})();

module.exports = router;
