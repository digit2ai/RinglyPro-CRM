'use strict';

/**
 * RINGLYPRO SUPPLY — AI outbound sales for hardware stores and building-material
 * suppliers. Mounted at /supply. Multi-tenant: one tenant per supplier.
 *
 *   Product catalog -> Product Intelligence (who buys it) -> Competitive Pricing
 *   (verified comparisons only) -> Offer Engine -> Campaign (approved by a
 *   person) -> Dialer -> CommunicationProvider (GoHighLevel workflow + Voice AI)
 *   -> call logs / webhooks -> Potential Buyer + Customer Memory -> callback
 *   recognition -> transfer -> Sale -> Attribution -> Commission.
 *
 * Every page carries {{BASE}} from req.baseUrl; nothing hardcodes /supply.
 */

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const auth = require('./auth');
const util = require('./util');
const comms = require('./communications');
const { CAPABILITIES } = require('./communications/ghlCapabilities');
const { FIELDS: GHL_FIELDS, EXTRACT_KEYS } = require('./communications/GoHighLevelProvider');
const llm = require('./llm');
const C = require('./corpus');
const tenants = require('./services/tenants');
const catalog = require('./services/catalog');
const intelligence = require('./services/intelligence');
const pricing = require('./services/pricing');
const contractors = require('./services/contractors');
const compliance = require('./services/compliance');
const campaigns = require('./services/campaigns');
const dialer = require('./services/dialer');
const calls = require('./services/calls');
const memory = require('./services/memory');
const sales = require('./services/sales');
const setup = require('./services/setup');
const reports = require('./services/reports');
const webhooks = require('./services/webhooks');
const platform = require('./platform');

const router = express.Router();
const PUB = path.join(__dirname, '..', 'public');
const VERSION = 'sup-2026-09-24-5';
const upload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

router.use(express.json({ limit: '2mb' }));
// Templates carry {{BASE}}; they are served only through page(), never raw.
router.get(/\.html$/, (req, res) => res.status(404).json({ error: 'Not found' }));
router.use(express.static(PUB, { index: false, maxAge: '1h' }));

function page(req, res, file) {
  const html = fs.readFileSync(path.join(PUB, file), 'utf8').replace(/\{\{BASE\}\}/g, req.baseUrl || '').replace(/\{\{VERSION\}\}/g, VERSION);
  res.set('Cache-Control', 'no-cache').type('html').send(html);
}

// ── Session ──
router.use(async (req, res, next) => {
  try { req.user = await auth.userFromRequest(req); } catch (e) { req.user = null; }
  next();
});
function needUser(req, res, next) {
  if (!req.user) return req.path.startsWith('/api/') ? res.status(401).json({ error: 'Sign in first' }) : res.redirect((req.baseUrl || '') + '/login');
  next();
}
function sameSite(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.get('X-Supply') !== '1') return res.status(403).json({ error: 'Missing request header' });
  next();
}
/** Resolve the tenant for this request: the user's own, or — super admin only — the one named in X-Supply-Tenant. */
async function withTenant(req, res, next) {
  try {
    let tid = req.user.tenant_id;
    if (req.user.is_super_admin && req.get('X-Supply-Tenant')) {
      tid = Number(req.get('X-Supply-Tenant'));
      if (req.method !== 'GET') await util.audit(tid, req.user.id, 'superadmin.acted', 'request', null, { method: req.method, path: req.path });
    }
    if (!tid) return res.status(400).json({ error: 'Choose a company first (super admin: pick one on the Platform screen)' });
    req.tenant = await tenants.get(tid);
    req.actor = { id: req.user.id, role: req.user.is_super_admin ? 'owner' : req.user.role };
    next();
  } catch (e) { next(e); }
}
const role = (...allowed) => (req, res, next) => (allowed.includes(req.actor.role) ? next() : res.status(403).json({ error: 'Your role cannot do this' }));
const WRITE = role('owner', 'admin', 'rep');
const ADMIN = role('owner', 'admin');
const superOnly = (req, res, next) => (req.user && req.user.is_super_admin ? next() : res.status(404).json({ error: 'Not found' }));
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const provider = (req) => comms.providerFor(req.tenant);

// ── Pages ──
// The landing body is ONE block (public/landing-block.html) used twice: here, and pasted into the
// GoHighLevel page at ringlypro.com/supply (ringlypro.com is a GHL site; this app cannot serve that path).
function landingBlock(asset, app) {
  return fs.readFileSync(path.join(PUB, 'landing-block.html'), 'utf8').replace(/\{\{ASSET\}\}/g, asset).replace(/\{\{APP\}\}/g, app);
}
const PUBLIC_URL = () => (process.env.SUPPLY_PUBLIC_URL || 'https://aiagent.ringlypro.com/supply').replace(/\/$/, '');
router.get('/', (req, res) => {
  const base = req.baseUrl || '';
  const html = fs.readFileSync(path.join(PUB, 'landing.html'), 'utf8')
    .replace('{{BLOCK}}', () => landingBlock(base, base))
    .replace(/\{\{BASE\}\}/g, base).replace(/\{\{ORIGIN\}\}/g, req.protocol + '://' + req.get('host'));
  res.set('Cache-Control', 'no-cache').type('html').send(html);
});
// Paste-ready copy for a GHL Custom Code element: absolute links back to this app.
router.get('/ghl-block.txt', (req, res) => {
  res.set('Cache-Control', 'no-cache').type('text/plain').send(landingBlock(PUBLIC_URL(), PUBLIC_URL()));
});
router.get('/login', (req, res) => (req.user ? res.redirect((req.baseUrl || '') + '/app') : page(req, res, 'login.html')));
router.get('/app', needUser, (req, res) => page(req, res, 'app.html'));

router.get('/health', async (req, res) => {
  let ok = false; try { await db.ensureSchema(); ok = true; } catch (e) { /* reported */ }
  res.json({
    ok, service: 'RinglyPro Supply', version: VERSION, database: ok ? 'ok' : (db.status().error || 'unavailable'),
    communications: 'GoHighLevel via CommunicationProvider (no Twilio dependency)',
    model: llm.configured() ? llm.MODEL() : 'not configured (rules path, labelled)',
    dialer: loopState, owner_seed: global.__supOwnerSeed || 'pending',
    not_built: ['National DNC registry scrubbing (needs FTC SAN)', 'Automatic competitor price collection (no public retailer API; scraping forbidden by their terms)', 'Direct API dial without a GHL workflow (not offered by HighLevel)']
  });
});

// ── Auth ──
router.post('/api/v1/auth/signup', sameSite, h(async (req, res) => {
  const ip = String(req.headers['cf-connecting-ip'] || req.ip || '');
  if (process.env.SUPPLY_SIGNUP === 'off') return res.status(403).json({ error: 'Sign-up is closed' });
  if (auth.limited('su:' + ip, 5, 3600e3)) return res.status(429).json({ error: 'Too many sign-ups from here. Try again later.' });
  const { company, email, password, name, timezone } = req.body || {};
  const bad = auth.checkPassword(password); if (bad) return res.status(400).json({ error: bad });
  const t = await tenants.create({ name: company, timezone }, null);
  try {
    const u = await auth.createUser({ tenantId: t.id, email, password, name, role: 'owner' });
    auth.setCookie(req, res, u);
    res.json({ ok: true, user: u, tenant: tenants.view(t) });
  } catch (e) {
    await db.run('DELETE FROM sup_categories WHERE tenant_id = :t; DELETE FROM sup_competitors WHERE tenant_id = :t; DELETE FROM sup_audit WHERE tenant_id = :t; DELETE FROM sup_tenants WHERE id = :t', { t: t.id });
    throw e;
  }
}));
router.post('/api/v1/auth/login', sameSite, h(async (req, res) => {
  const ip = String(req.headers['cf-connecting-ip'] || req.ip || '');
  const email = String((req.body || {}).email || '').toLowerCase();
  if (auth.limited('li:' + ip, 20, 900e3) || auth.limited('le:' + email, 10, 900e3)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
  const u = await auth.login(req.body || {});
  auth.setCookie(req, res, u);
  res.json({ ok: true });
}));
router.post('/api/v1/auth/logout', sameSite, (req, res) => { auth.clearCookie(req, res); res.json({ ok: true }); });
router.get('/api/v1/auth/me', needUser, h(async (req, res) => {
  const t = req.user.tenant_id ? tenants.view(await tenants.get(req.user.tenant_id)) : null;
  res.json({ user: req.user, tenant: t, vocab: { outcomes: C.CALL_OUTCOMES, pipeline: C.PIPELINE, campaign_statuses: C.CAMPAIGN_STATUSES, suppression_reasons: compliance.REASONS } });
}));

// ── Webhooks (no session; tenant from the secret URL token) ──
router.post('/webhooks/ghl/:token', h(async (req, res) => {
  const tenant = await webhooks.tenantByToken(req.params.token);
  const hdr = req.get('X-Supply-Token');
  if (!tenant || (hdr && !util.safeEqual(hdr, tenant.webhook_token))) return res.status(404).json({ error: 'Not found' });
  const out = await webhooks.receive(tenant, await comms.providerFor(tenant), req.body || {});
  res.status(out.status).json(out.body);
}));
// For a Voice AI custom action: "who is calling?" -> the current context text.
router.get('/webhooks/ghl/:token/context', h(async (req, res) => {
  const tenant = await webhooks.tenantByToken(req.params.token);
  if (!tenant) return res.status(404).json({ error: 'Not found' });
  const c = await contractors.byPhone(tenant.id, req.query.phone) || await contractors.byExternalId(tenant.id, req.query.contact_id);
  if (!c) return res.json({ recognized: false, context: 'New caller: no previous conversation on record.' });
  const ctx = await memory.build(tenant.id, c.id);
  res.json({ recognized: true, context: ctx.text, assigned_rep: ctx.rep_name });
}));

// ── Everything below: signed in, tenant resolved ──
const api = express.Router();
router.use('/api/v1', (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sign in first' })), sameSite, api);

// Platform (super admin)
api.get('/platform/overview', superOnly, h(async (req, res) => res.json(await platform.overview())));
api.post('/platform/tenants', superOnly, h(async (req, res) => {
  const b = req.body || {};
  const t = await tenants.create({ name: b.company, timezone: b.timezone, isDemo: !!b.is_demo }, req.user.id);
  let owner = null;
  if (b.owner_email) owner = await auth.createUser({ tenantId: t.id, email: b.owner_email, password: b.owner_password, name: b.owner_name, role: 'owner' });
  res.json({ tenant: tenants.view(t), owner });
}));
api.post('/platform/tenants/:id/status', superOnly, h(async (req, res) => res.json(tenants.view(await tenants.setStatus(req.params.id, (req.body || {}).status, req.user.id)))));

api.use(h(withTenant));

// Tenant
api.get('/tenant', h(async (req, res) => res.json({ tenant: tenants.view(req.tenant), webhook_url: `${req.protocol}://${req.get('host')}${req.baseUrl.replace(/\/api\/v1$/, '')}/webhooks/ghl/${['owner', 'admin'].includes(req.actor.role) ? req.tenant.webhook_token : '(admins only)'}` })));
api.patch('/tenant/settings', ADMIN, h(async (req, res) => res.json(tenants.view(await tenants.updateSettings(req.tenant.id, req.body || {}, req.actor.id)))));
api.get('/onboarding', h(async (req, res) => res.json(await tenants.onboarding(req.tenant.id))));
api.post('/tenant/activate', ADMIN, h(async (req, res) => {
  const ob = await tenants.onboarding(req.tenant.id);
  const missing = ob.steps.filter((s) => !s.done && s.key !== 'activate').map((s) => s.label);
  if (missing.length && !req.user.is_super_admin) return res.status(409).json({ error: 'Finish onboarding first', missing });
  res.json(tenants.view(await tenants.setStatus(req.tenant.id, 'active', req.actor.id)));
}));
api.get('/tenant/users', ADMIN, h(async (req, res) => res.json(await db.tq(req.tenant.id, 'SELECT id, email, name, role, active, created_at FROM sup_users WHERE tenant_id = :tenant ORDER BY id'))));
api.post('/tenant/users', ADMIN, h(async (req, res) => {
  const b = req.body || {};
  if (b.role === 'owner' && req.actor.role !== 'owner') return res.status(403).json({ error: 'Only an owner can add another owner' });
  const u = await auth.createUser({ tenantId: req.tenant.id, email: b.email, password: b.password, name: b.name, role: b.role || 'rep' });
  await util.audit(req.tenant.id, req.actor.id, 'user.created', 'user', u.id, { role: u.role });
  res.json(u);
}));
api.patch('/tenant/users/:id', ADMIN, h(async (req, res) => {
  const b = req.body || {};
  if (Number(req.params.id) === req.user.id) return res.status(409).json({ error: 'You cannot change your own account here' });
  if (b.role && !auth.ROLES.includes(b.role)) return res.status(400).json({ error: 'Unknown role' });
  const [u] = await db.trun(req.tenant.id, `UPDATE sup_users SET role = COALESCE(:r, role), active = COALESCE(:a, active) WHERE tenant_id = :tenant AND id = :id RETURNING id, email, role, active`,
    { r: b.role || null, a: typeof b.active === 'boolean' ? b.active : null, id: Number(req.params.id) });
  if (!u) return res.status(404).json({ error: 'User not found' });
  await util.audit(req.tenant.id, req.actor.id, 'user.updated', 'user', u.id, { role: b.role, active: b.active });
  res.json(u);
}));

// GoHighLevel
api.get('/ghl', h(async (req, res) => {
  const p = await provider(req);
  const health = await db.tone(req.tenant.id, `SELECT ok, last_error, last_checked_at FROM sup_integration_health WHERE tenant_id = :tenant AND provider = 'gohighlevel'`);
  res.json({ provider: p.name, capabilities: CAPABILITIES, fields: GHL_FIELDS, extract_keys: EXTRACT_KEYS, health, ghl: req.tenant.ghl, token_set: !!req.tenant.ghl_secret_enc, pipeline_stages: C.PIPELINE });
}));
api.patch('/ghl', ADMIN, h(async (req, res) => res.json(tenants.view(await tenants.updateGhl(req.tenant.id, req.body || {}, { actorId: req.actor.id, isSuperAdmin: !!req.user.is_super_admin })))));
api.post('/ghl/test', ADMIN, h(async (req, res) => {
  const t = await tenants.get(req.tenant.id);
  const p = await comms.providerFor(t);
  const hres = await p.health(t);
  await comms.recordHealth(t.id, hres.ok, hres.ok ? null : new Error(hres.detail));
  let fields = null;
  if (hres.ok && p.ensureFields) {
    try { await p.ensureFields(); fields = { prompt_tags: p.fieldTags || {} }; }
    catch (e) {
      fields = /not authorized for this scope/i.test(e.message) && /customFields/.test(e.message)
        ? { error: 'Connected, but the token is missing the custom-field scopes. In GoHighLevel: Settings → Private Integrations → edit this integration → tick "View Custom Fields" and "Edit Custom Fields", save, then test again (generate a new token if it still fails).' }
        : { error: e.message };
    }
  }
  res.json({ provider: p.name, health: hres, custom_fields: fields });
}));

api.post('/ghl/auto-setup', ADMIN, h(async (req, res) => {
  const t = await tenants.get(req.tenant.id);
  const p = await comms.providerFor(t);
  if (!p.listAgents) return res.status(409).json({ error: 'Connect GoHighLevel first (GoHighLevel screen → Save connection).' });
  res.json(await require('./services/ghlSetup').run(t, p, { answerInbound: !!(req.body || {}).answer_inbound, actorId: req.actor.id }));
}));

// Categories / reps / competitors
api.get('/categories', h(async (req, res) => res.json(await setup.categories(req.tenant.id))));
api.post('/categories', ADMIN, h(async (req, res) => res.json(await setup.saveCategory(req.tenant.id, req.body || {}, req.actor.id))));
api.get('/reps', h(async (req, res) => res.json(await setup.reps(req.tenant.id))));
api.post('/reps', ADMIN, h(async (req, res) => res.json(await setup.saveRep(req.tenant.id, req.body || {}, req.actor.id))));
api.get('/competitors', h(async (req, res) => res.json(await setup.competitors(req.tenant.id))));

// Products
api.get('/products', h(async (req, res) => res.json(await catalog.list(req.tenant.id, req.query))));
api.post('/products', ADMIN, h(async (req, res) => res.json(await catalog.create(req.tenant.id, req.body || {}, req.actor.id))));
api.post('/products/import', ADMIN, upload.single('file'), h(async (req, res) => {
  const rows = req.file ? catalog.parseSheet(req.file.buffer, req.file.originalname) : (req.body && req.body.rows);
  res.json(await catalog.importRows(req.tenant.id, rows, req.actor.id));
}));
api.post('/products/analyze-all', ADMIN, h(async (req, res) => res.json(await intelligence.analyzeAll(req.tenant.id))));
api.get('/products/:id', h(async (req, res) => res.json({ product: await catalog.get(req.tenant.id, req.params.id), relevance: await intelligence.relevanceFor(req.tenant.id, req.params.id), prices: await pricing.list(req.tenant.id, { productId: req.params.id }) })));
api.patch('/products/:id', ADMIN, h(async (req, res) => res.json(await catalog.update(req.tenant.id, req.params.id, req.body || {}, req.actor.id))));
api.post('/products/:id/analyze', ADMIN, h(async (req, res) => res.json(await intelligence.analyzeProduct(req.tenant.id, req.params.id))));
api.put('/products/:id/relevance', ADMIN, h(async (req, res) => res.json(await intelligence.setManual(req.tenant.id, req.params.id, req.body.category_id, req.body.score, req.body.reason))));

// Competitive pricing
api.get('/prices', h(async (req, res) => res.json(await pricing.list(req.tenant.id, { productId: req.query.product_id }))));
api.post('/prices', WRITE, h(async (req, res) => res.json(await pricing.record(req.tenant.id, req.body || {}, req.actor.id))));
api.post('/prices/:id/confirm', ADMIN, h(async (req, res) => res.json(await pricing.confirm(req.tenant.id, req.params.id, req.actor.id))));

// Contractors
api.get('/contractors', h(async (req, res) => res.json(await contractors.list(req.tenant.id, req.query))));
api.post('/contractors', WRITE, h(async (req, res) => res.json((await contractors.create(req.tenant.id, req.body || {}, req.actor.id)).row)));
api.post('/contractors/import', ADMIN, upload.single('file'), h(async (req, res) => {
  const rows = req.file ? catalog.parseSheet(req.file.buffer, req.file.originalname) : (req.body && req.body.rows);
  res.json(await contractors.importRows(req.tenant.id, rows, req.actor.id));
}));
api.get('/contractors/:id', h(async (req, res) => res.json({ contractor: await contractors.get(req.tenant.id, req.params.id), context: await memory.build(req.tenant.id, req.params.id), calls: await calls.list(req.tenant.id, { contractorId: req.params.id, limit: 50 }) })));
api.patch('/contractors/:id', WRITE, h(async (req, res) => res.json(await contractors.update(req.tenant.id, req.params.id, req.body || {}, req.actor.id))));
api.post('/contractors/:id/sync', WRITE, h(async (req, res) => {
  const c = await contractors.get(req.tenant.id, req.params.id);
  const p = await provider(req);
  const ext = await contractors.syncToProvider(req.tenant, c, p);
  res.json({ ghl_contact_id: ext, context: await memory.push(req.tenant, c.id, p) });
}));

// Compliance
api.get('/suppression', h(async (req, res) => res.json(await compliance.list(req.tenant.id))));
api.post('/suppression', WRITE, h(async (req, res) => res.json(await compliance.suppress(req.tenant.id, req.body.phone, req.body.reason || 'do_not_call', { source: 'manual', actorId: req.actor.id }))));
api.delete('/suppression/:phone', ADMIN, h(async (req, res) => res.json(await compliance.unsuppress(req.tenant.id, req.params.phone, req.actor.id))));

// Campaigns
api.get('/campaigns', h(async (req, res) => res.json(await campaigns.list(req.tenant.id))));
api.post('/campaigns', ADMIN, h(async (req, res) => res.json(await campaigns.create(req.tenant, req.body || {}, req.actor))));
api.post('/campaigns/generate', ADMIN, h(async (req, res) => res.json(await campaigns.generate(req.tenant, req.actor, req.body || {}))));
api.get('/campaigns/:id', h(async (req, res) => res.json(await campaigns.get(req.tenant.id, req.params.id))));
api.patch('/campaigns/:id', ADMIN, h(async (req, res) => res.json(await campaigns.update(req.tenant, req.params.id, req.body || {}, req.actor))));
api.post('/campaigns/:id/status', ADMIN, h(async (req, res) => res.json(await campaigns.transition(req.tenant, req.params.id, (req.body || {}).to, req.actor))));
api.get('/campaigns/:id/preview', h(async (req, res) => res.json(await campaigns.preview(req.tenant, req.params.id))));

// Dialer (manual pass; the loop runs the same thing)
api.post('/dialer/run', ADMIN, h(async (req, res) => {
  const p = await provider(req);
  res.json({ tick: await dialer.tick(req.tenant, p), reconcile: await dialer.reconcile(req.tenant, p).catch((e) => ({ error: e.message })), webhooks: await webhooks.retryFailed(req.tenant, p) });
}));

// Calls / buyers / pipeline
api.get('/calls', h(async (req, res) => res.json(await calls.list(req.tenant.id, { contractorId: req.query.contractor_id, campaignId: req.query.campaign_id }))));
api.get('/calls/:id', h(async (req, res) => { const c = await calls.get(req.tenant.id, req.params.id); if (!c) return res.status(404).json({ error: 'Call not found' }); res.json(c); }));
api.get('/buyers', h(async (req, res) => res.json(await setup.buyers(req.tenant.id, { status: req.query.status, repId: req.query.rep_id }))));
api.patch('/buyers/:id', WRITE, h(async (req, res) => res.json(await setup.updateBuyer(req.tenant.id, req.params.id, req.body || {}, req.actor.id))));
api.get('/pipeline', h(async (req, res) => res.json(await setup.pipeline(req.tenant.id))));
api.post('/pipeline/move', WRITE, h(async (req, res) => res.json(await setup.moveStage(req.tenant.id, req.body.contractor_id, req.body.stage, req.actor.id))));

// Sales & commissions
api.get('/sales', h(async (req, res) => res.json(await sales.list(req.tenant.id))));
api.post('/sales', WRITE, h(async (req, res) => res.json(await sales.record(req.tenant, req.body || {}, req.actor))));
api.get('/sales/:id/attribution', h(async (req, res) => res.json(await sales.attribution(req.tenant.id, req.params.id))));
api.get('/commissions', h(async (req, res) => res.json(await sales.commissions(req.tenant.id, { repId: req.query.rep_id }))));
api.post('/commissions/:id/status', ADMIN, h(async (req, res) => res.json(await sales.setCommissionStatus(req.tenant.id, req.params.id, (req.body || {}).status, req.actor))));

// Reports
api.get('/dashboard', h(async (req, res) => res.json(await reports.dashboard(req.tenant))));
api.get('/reports/campaigns', h(async (req, res) => res.json(await reports.campaignReport(req.tenant.id))));
api.get('/audit', ADMIN, h(async (req, res) => res.json(await reports.auditLog(req.tenant.id))));

// Errors
router.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[supply]', err.code || '', err.message);
  res.status(status).json(Object.assign({ error: status >= 500 && !err.code ? 'Something went wrong' : err.message }, err.duplicate_id ? { duplicate_id: err.duplicate_id } : {}));
});

// ── Background loop: dialer + call-log reconcile + webhook retry ──
let loopState = 'off';
function loopEnabled() {
  if (process.env.SUPPLY_DIALER === 'off') return false;
  return process.env.NODE_ENV === 'production' || process.env.SUPPLY_DIALER === 'on';
}
const HOLDER = require('os').hostname() + ':' + process.pid;
async function loopOnce() {
  // A lease row, not a session advisory lock: pooled connections would let an unlock run on a different session.
  await db.run(`INSERT INTO sup_locks (name) VALUES ('loop') ON CONFLICT DO NOTHING`);
  const got = await db.run(`UPDATE sup_locks SET locked_until = now() + interval '5 minutes', holder = :h WHERE name = 'loop' AND (locked_until < now() OR holder = :h) RETURNING name`, { h: HOLDER });
  if (!got.length) return;
  try {
    const list = await db.q(`SELECT DISTINCT t.* FROM sup_tenants t WHERE t.status IN ('trial','active') AND (
      EXISTS (SELECT 1 FROM sup_campaigns c WHERE c.tenant_id = t.id AND c.status = 'active')
      OR EXISTS (SELECT 1 FROM sup_calls k WHERE k.tenant_id = t.id AND k.status = 'dispatched')
      OR EXISTS (SELECT 1 FROM sup_webhook_events w WHERE w.tenant_id = t.id AND w.status = 'failed' AND w.attempts < 5))`);
    for (const t of list) {
      try {
        const p = await comms.providerFor(t);
        await dialer.tick(t, p);
        await dialer.reconcile(t, p);
        await webhooks.retryFailed(t, p);
      } catch (e) { console.error('[supply] loop tenant', t.id, e.message); }
    }
  } finally { await db.run(`UPDATE sup_locks SET locked_until = now() WHERE name = 'loop' AND holder = :h`, { h: HOLDER }); }
}
if (loopEnabled() && !global.__supLoop) {
  const sec = Math.max(30, Number(process.env.SUPPLY_DIALER_INTERVAL_SEC || 60));
  global.__supLoop = setInterval(() => { loopOnce().catch((e) => console.error('[supply] loop', e.message)); }, sec * 1000);
  loopState = 'on, every ' + sec + ' s';
}

// ── Boot ──
db.ensureSchema()
  .then(() => auth.seedOwner())
  .then((r) => { global.__supOwnerSeed = r; })
  .catch((e) => { console.error('[supply] boot:', e.message); global.__supOwnerSeed = { seeded: false, reason: e.message }; });

module.exports = router;
module.exports._loopOnce = loopOnce;
