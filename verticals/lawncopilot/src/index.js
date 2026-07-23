'use strict';

/**
 * LAWN CO-PILOT — the AI office for landscaping companies
 * Digit2AI vertical. Mounted at /lawncopilot.
 *
 * Four AI employees (Receptionist, Estimator, Dispatcher, Administrator) on one
 * Brain MCP server. A homeowner talks or types to the orb and gets a measured,
 * priced, bookable estimate without anyone driving to the property.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { sequelize, Tenant, User, Crew } = require('./models');
const { seedDefaultRules, seedDefaultPlans } = require('./services/pricing');

const SECRET = () => process.env.LAWNCOPILOT_JWT_SECRET || process.env.JWT_SECRET || 'lawncopilot-dev-secret';
const publicDir = path.join(__dirname, '..', 'public');
const TENANT = () => Number(process.env.LAWNCOPILOT_TENANT_ID || 1);

// ── Stripe webhook needs the RAW body for signature verification ───────────
// Only the parser is pre-mounted here; routing still happens in the webhooks
// router below. express.raw sets req._body, so express.json() skips it.
router.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

router.use(express.json({ limit: '5mb' }));
router.use(express.urlencoded({ extended: true }));

// ── Session decoding (never a gate by itself) ─────────────────────────────
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
  next();
});

// ── Health ─────────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  let db = 'unknown';
  try { await sequelize.authenticate(); db = 'ok'; } catch (e) { db = 'error: ' + e.message; }
  const brain = require('./mcp/brain');
  res.json({
    status: db === 'ok' ? 'ok' : 'degraded',
    service: 'Lawn Co-Pilot',
    tagline: 'The AI office for landscaping companies',
    db,
    version: '1.0.0',
    employees: brain.listEmployees().map(e => ({ id: e.id, name: e.name, enabled: e.enabled })),
    tools: Object.keys(brain.REGISTRY).length,
    capabilities: {
      measurement_provider: process.env.LAWNCOPILOT_MEASURE_PROVIDER || 'heuristic',
      geocoder: !!process.env.GOOGLE_MAPS_API_KEY,
      parcel_data: !!(process.env.REGRID_API_KEY || process.env.ATTOM_API_KEY),
      payments: !!process.env.STRIPE_SECRET_KEY,
      voice_web: !!process.env.ELEVENLABS_CONVAI_LAWNCOPILOT_EN,
      voice_phone: !!process.env.LAWNCOPILOT_VOICE_NUMBER,
      llm: !!process.env.ANTHROPIC_API_KEY,
      typed_chat: true
    }
  });
});

// ── API ────────────────────────────────────────────────────────────────────
router.use('/mcp', require('./routes/mcp'));
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/api/v1/orb', require('./routes/orb'));
router.use('/api/v1/quote', require('./routes/quote'));
router.use('/api/v1/me', require('./routes/me'));
router.use('/api/v1/admin', require('./routes/admin'));
router.use('/voice', require('./routes/voice'));
router.use('/webhooks', require('./routes/webhooks'));

// ── Pages ──────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
router.get('/admin/login', (req, res) => res.sendFile(path.join(publicDir, 'admin-login.html')));

router.get('/quote/:token', (req, res) => res.sendFile(path.join(publicDir, 'quote.html')));

// PWA + app-shell assets must serve BEFORE the auth gate, or the app cannot
// install and the service worker never registers. Anything with a file
// extension is a static asset, not a page.
const ASSET = /\.[a-z0-9]{2,16}$/i;

// Customer portal — app shell, gated.
router.get(['/portal', '/portal/'], (req, res) => {
  if (!req.customer) return res.redirect('/lawncopilot/login');
  res.sendFile(path.join(publicDir, 'portal', 'inicio.html'));
});
router.get('/portal/:page', (req, res, next) => {
  if (ASSET.test(req.params.page)) return next();          // static asset
  if (!req.customer) return res.redirect('/lawncopilot/login');
  const page = String(req.params.page).replace(/[^a-z0-9-]/gi, '');
  res.sendFile(path.join(publicDir, 'portal', `${page}.html`), (err) => { if (err) next(); });
});

// Admin portal — app shell, role-gated.
router.get(['/admin', '/admin/'], (req, res) => {
  if (!req.staff) return res.redirect('/lawncopilot/admin/login');
  res.sendFile(path.join(publicDir, 'admin', 'inicio.html'));
});
router.get('/admin/:page', (req, res, next) => {
  if (ASSET.test(req.params.page)) return next();          // static asset
  const page = String(req.params.page).replace(/[^a-z0-9-]/gi, '');
  if (page === 'login') return res.sendFile(path.join(publicDir, 'admin-login.html'));
  if (!req.staff) return res.redirect('/lawncopilot/admin/login');
  res.sendFile(path.join(publicDir, 'admin', `${page}.html`), (err) => { if (err) next(); });
});

// Static (marketing site + portal assets).
router.use(express.static(publicDir));
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

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
      `ALTER TABLE lc_agent_calls ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false`
    ];
    for (const sql of alters) {
      try { await sequelize.query(sql); } catch (e) { /* column exists */ }
    }

    const tenant_id = TENANT();
    let tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) {
      tenant = await Tenant.create({
        id: tenant_id, name: 'Lawn Co-Pilot', slug: 'lawncopilot',
        state: 'FL', timezone: 'America/New_York',
        phone: process.env.LAWNCOPILOT_VOICE_NUMBER || null
      });
      console.log('  Lawn Co-Pilot tenant created');
    }

    const rules = await seedDefaultRules(tenant_id);
    if (rules.seeded) console.log(`  Lawn Co-Pilot seeded ${rules.count} Florida pricing rules`);
    await seedDefaultPlans(tenant_id);

    const crewCount = await Crew.count({ where: { tenant_id } });
    if (crewCount === 0) {
      await Crew.bulkCreate([
        { tenant_id, name: 'Crew A', capacity_per_day: 14, active: true },
        { tenant_id, name: 'Crew B', capacity_per_day: 12, active: true }
      ]);
    }

    // Staff accounts. Password force-synced on boot so the operator is never
    // locked out; set LAWNCOPILOT_ADMIN_PASSWORD to override.
    const pw = process.env.LAWNCOPILOT_ADMIN_PASSWORD || 'lawncopilot@2026';
    const hash = await bcrypt.hash(pw, 10);
    const staff = [
      { email: 'mstagg@digit2ai.com', name: 'Manuel Stagg', role: 'owner' },
      { email: 'admin@lawncopilot.com', name: 'Lawn Co-Pilot Admin', role: 'admin' }
    ];
    for (const s of staff) {
      const [u, created] = await User.findOrCreate({
        where: { tenant_id, email: s.email },
        defaults: { tenant_id, ...s, password_hash: hash, status: 'active' }
      });
      if (!created) { u.password_hash = hash; u.role = s.role; await u.save(); }
    }
    console.log(`  Lawn Co-Pilot staff accounts ensured (${staff.length})`);

    if (process.env.LAWNCOPILOT_SEED_DEMO === '1') {
      try {
        const r = await require('./services/seed').seedDemo(tenant_id);
        console.log(`  Lawn Co-Pilot demo seeded: ${r.summary}`);
      } catch (e) {
        console.error('  Lawn Co-Pilot demo seed error:', e.message);
      }
    }
  } catch (err) {
    console.error('  Lawn Co-Pilot init error:', err.message);
  }
})();

module.exports = router;
