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
router.use('/api/v1/platform', require('./routes/platform'));
router.use('/webhooks', require('./routes/webhooks'));
router.use('/voice', require('./routes/voice'));
router.use('/l', require('./routes/shortlink'));

// Platform pages
router.get('/signup', (req, res) => res.sendFile(path.join(publicDir, 'signup.html')));
router.get('/platform/login', (req, res) => res.sendFile(path.join(publicDir, 'platform-login.html')));
router.get(['/platform', '/platform/'], (req, res) => {
  if (!req.platformUser) return res.redirect('/lawncopilot/platform/login');
  res.sendFile(path.join(publicDir, 'platform.html'));
});

// ════════════════════════════════════════════════════════════════════════════
// TENANT LAYER — everything below resolves a company from the slug
// ════════════════════════════════════════════════════════════════════════════

router.use('/:slug', tenantMiddleware(), require('./tenant-router'));

// ── Platform static + landing (last, so it never shadows a tenant slug) ────
router.use(express.static(publicDir));
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'platform-home.html')));

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
