/**
 * PLANEA — self-owned backend (auth + data) on OUR Postgres.
 *
 * Purpose: move Planea OFF the third-party Supabase project so there is no
 * dependency on a service_role key we don't control, no email-confirmation gate
 * we can't disable, and full user administration on our side. Mirrors the
 * self-contained vertical pattern (coachtrack / veritas / exec-coaching):
 * own Sequelize instance (CRM_DATABASE_URL || DATABASE_URL), cookie JWT, bcrypt.
 *
 * Mounted by server.cjs at  /planea/api/v1  (router returned by build()).
 * Tables (idempotent create on boot): planea_users, planea_profiles.
 * NO email confirmation — signups can log in immediately.
 *
 * All runtime deps already in the root package.json (sequelize, pg, bcryptjs,
 * jsonwebtoken) — no new dependency, no @supabase/supabase-js.
 */
'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Sequelize, DataTypes } = require('sequelize');
const score = require('./score.cjs');
const salud = require('./salud.cjs');
const sec = require('./security.cjs');

const SECRET = process.env.PLANEA_JWT_SECRET || process.env.JWT_SECRET || 'planea-2026-secret';
const COOKIE = 'planea_session';
const MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30d
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── DB (own instance, CRM Postgres) ─────────────────────────────────────────
const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
let sequelize = null;
let User = null;
let Profile = null;
let Item = null;
let SaludH = null;
let Uat = null;
let Audit = null;
let ready = false;
let initErr = null;

function defineModels(sq) {
  const U = sq.define('PlaneaUser', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    full_name: { type: DataTypes.STRING, allowNull: true },
    last_login_at: { type: DataTypes.DATE, allowNull: true },
    reset_token: { type: DataTypes.STRING, allowNull: true },
    reset_expires: { type: DataTypes.DATE, allowNull: true },
    failed_logins: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    locked_until: { type: DataTypes.DATE, allowNull: true },
  }, { tableName: 'planea_users', underscored: true, createdAt: 'created_at', updatedAt: 'updated_at' });

  const P = sq.define('PlaneaProfile', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    full_name: { type: DataTypes.STRING, allowNull: true },
    score_data: { type: DataTypes.JSONB, allowNull: true },
    progress_data: { type: DataTypes.JSONB, allowNull: true },
    assets_data: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
    liabilities_data: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
    goals: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
    seguros_data: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
    retiro_data: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
    ingresos_data: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
    gastos_data: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
    finance_meta: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
  }, { tableName: 'planea_profiles', underscored: true, createdAt: 'created_at', updatedAt: 'updated_at' });

  // Each financial entry is its OWN row in its OWN table — independent per module
  // (ingreso|gasto|ahorro|inversion|deuda|seguros|retiro). value = amount (monthly
  // for ingreso/gasto; balance/coverage otherwise); monthly = cuota (deuda).
  const I = sq.define('PlaneaItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: true },
    type: { type: DataTypes.STRING, allowNull: true },
    value: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    monthly: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
  }, { tableName: 'planea_items', underscored: true, createdAt: 'created_at', updatedAt: 'updated_at' });

  // Daily snapshot of the Salud Financiera score (for the over-time chart).
  const H = sq.define('PlaneaSaludHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    snap_date: { type: DataTypes.DATEONLY, allowNull: false },
    overall: { type: DataTypes.INTEGER, allowNull: true },
    net_worth: { type: DataTypes.DOUBLE, allowNull: true },
    income: { type: DataTypes.DOUBLE, allowNull: true },
    expense: { type: DataTypes.DOUBLE, allowNull: true },
    buckets: { type: DataTypes.JSONB, allowNull: true },
  }, { tableName: 'planea_salud_history', underscored: true, createdAt: 'created_at', updatedAt: 'updated_at' });

  // UAT run: one row per saved test session (public checklist at /planea/uat).
  const T = sq.define('PlaneaUatRun', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    session_key: { type: DataTypes.STRING, allowNull: true },
    tester: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    suite: { type: DataTypes.STRING, allowNull: true },
    total: { type: DataTypes.INTEGER, allowNull: true },
    passed: { type: DataTypes.INTEGER, allowNull: true },
    failed: { type: DataTypes.INTEGER, allowNull: true },
    pending: { type: DataTypes.INTEGER, allowNull: true },
    na: { type: DataTypes.INTEGER, allowNull: true },
    results: { type: DataTypes.JSONB, allowNull: true },
  }, { tableName: 'planea_uat_runs', underscored: true, createdAt: 'created_at', updatedAt: 'updated_at' });

  // Registro de eventos de seguridad (A.8.15 · SOC 2 CC7.2). Sin datos sensibles:
  // nunca contraseña, token ni cuerpo de la petición; la IP va hasheada.
  const L = sq.define('PlaneaAuditLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    event: { type: DataTypes.STRING, allowNull: false },
    outcome: { type: DataTypes.STRING, allowNull: true },
    ip_hash: { type: DataTypes.STRING, allowNull: true },
    user_agent: { type: DataTypes.STRING, allowNull: true },
    meta: { type: DataTypes.JSONB, allowNull: true },
  }, { tableName: 'planea_audit_log', underscored: true, createdAt: 'created_at', updatedAt: false });

  return { U, P, I, H, T, L };
}

async function init() {
  if (!databaseUrl) { initErr = 'no DATABASE_URL'; return; }
  try {
    sequelize = new Sequelize(databaseUrl, {
      dialect: 'postgres',
      dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
      logging: false,
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
    });
    const m = defineModels(sequelize);
    User = m.U; Profile = m.P; Item = m.I; SaludH = m.H; Uat = m.T; Audit = m.L;
    await sequelize.sync({ alter: false }); // create tables if absent (never alters existing)
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_planea_items_user_cat ON planea_items(user_id, category)').catch(function () {});
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_planea_salud_user_date ON planea_salud_history(user_id, snap_date)').catch(function () {});
    await sequelize.query('ALTER TABLE planea_salud_history ADD COLUMN IF NOT EXISTS net_worth DOUBLE PRECISION').catch(function () {});
    await sequelize.query('ALTER TABLE planea_salud_history ADD COLUMN IF NOT EXISTS income DOUBLE PRECISION').catch(function () {});
    await sequelize.query('ALTER TABLE planea_salud_history ADD COLUMN IF NOT EXISTS expense DOUBLE PRECISION').catch(function () {});
    // Idempotent add of newer columns (sync never adds columns to an existing table).
    await sequelize.query("ALTER TABLE planea_profiles ADD COLUMN IF NOT EXISTS seguros_data JSONB DEFAULT '[]'::jsonb").catch(function () {});
    await sequelize.query("ALTER TABLE planea_profiles ADD COLUMN IF NOT EXISTS retiro_data JSONB DEFAULT '[]'::jsonb").catch(function () {});
    await sequelize.query("ALTER TABLE planea_profiles ADD COLUMN IF NOT EXISTS ingresos_data JSONB DEFAULT '[]'::jsonb").catch(function () {});
    await sequelize.query("ALTER TABLE planea_profiles ADD COLUMN IF NOT EXISTS gastos_data JSONB DEFAULT '[]'::jsonb").catch(function () {});
    await sequelize.query("ALTER TABLE planea_profiles ADD COLUMN IF NOT EXISTS finance_meta JSONB DEFAULT '{}'::jsonb").catch(function () {});
    await sequelize.query('ALTER TABLE planea_uat_runs ADD COLUMN IF NOT EXISTS session_key VARCHAR(120)').catch(function () {});
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_uat_session ON planea_uat_runs(session_key) WHERE session_key IS NOT NULL').catch(function () {});
    await sequelize.query('ALTER TABLE planea_users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(80)').catch(function () {});
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_planea_audit_user ON planea_audit_log(user_id, created_at)').catch(function () {});
    await sequelize.query('ALTER TABLE planea_users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ').catch(function () {});
    await sequelize.query('ALTER TABLE planea_users ADD COLUMN IF NOT EXISTS failed_logins INTEGER DEFAULT 0').catch(function () {});
    await sequelize.query('ALTER TABLE planea_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ').catch(function () {});
    // Contador de límite de peticiones COMPARTIDO entre instancias de Render.
    await sequelize.query('CREATE TABLE IF NOT EXISTS planea_rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0, expires_at TIMESTAMPTZ NOT NULL)').catch(function () {});
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_planea_rate_exp ON planea_rate_limits(expires_at)').catch(function () {});
    await sequelize.query('DELETE FROM planea_rate_limits WHERE expires_at < NOW()').catch(function () {});
    sec.useDatabase(sequelize); // el almacén de límites deja de ser por proceso
    ready = true;
    console.log('✅ Planea self-owned backend ready (planea_users, planea_profiles on CRM Postgres)');
  } catch (e) {
    initErr = e.message;
    console.log('⚠️ Planea backend init failed:', e.message);
  }
}
init();

// ── helpers ─────────────────────────────────────────────────────────────────
// Two cookies: the HttpOnly JWT (auth) + a JS-readable identity hint so the
// portal's client scripts can detect the session synchronously (no network).
function setSession(res, user) {
  // Path MUST be '/' — on planea.vip the browser sees vanity URLs ('/', '/login',
  // '/score'); the rewrite to /planea/* happens server-side, so a Path=/planea
  // cookie was never sent on those requests (Chrome enforced this strictly while
  // Safari happened to work). SameSite=Lax is the correct first-party value.
  res.clearCookie(COOKIE, { path: '/planea' });        // drop the legacy scoped cookie
  res.clearCookie('planea_user', { path: '/planea' });
  res.cookie(COOKIE, sign(user), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: MAX_AGE, path: '/' });
  // Pass RAW JSON — Express's res.cookie URL-encodes the value itself. (Encoding
  // it here too double-encoded it, so JSON.parse threw in the browser and every
  // parse-based session check silently failed.)
  const hint = JSON.stringify({ id: user.id, email: user.email, full_name: user.full_name || '' });
  res.cookie('planea_user', hint, { httpOnly: false, secure: true, sameSite: 'lax', maxAge: MAX_AGE, path: '/' });
}
function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
  res.clearCookie('planea_user', { path: '/' });
  res.clearCookie(COOKIE, { path: '/planea' });
  res.clearCookie('planea_user', { path: '/planea' });
}
function sign(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.full_name }, SECRET, { expiresIn: '30d' });
}
function readCookie(req) {
  const h = req.headers.cookie || '';
  const m = h.match(/(?:^|;\s*)planea_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function authUser(req) {
  const tok = readCookie(req) || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!tok) return null;
  try { return jwt.verify(tok, SECRET); } catch (e) { return null; }
}
function requireReady(res) {
  if (!ready) { res.status(503).json({ error: 'backend_not_ready', detail: initErr }); return false; }
  return true;
}
function publicUser(u) { return { id: u.id, email: u.email, full_name: u.full_name || '' }; }

// ── router ────────────────────────────────────────────────────────────────
function build() {
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));
  // Never cache API responses — a stale cached GET must not mask an expired session
  // (which would then let writes silently 401). Always hit the network + auth fresh.
  router.use(function (req, res, next) { res.set('Cache-Control', 'no-store, must-revalidate'); next(); });

  router.get('/auth/status', (req, res) => res.json({ ready, error: initErr || null }));

  // ── UAT (public test-checklist results, saved to Postgres) ────────────────
  router.post('/uat/runs', async (req, res) => {
    if (!requireReady(res)) return;
    try {
      const b = req.body || {};
      const arr = Array.isArray(b.results) ? b.results : [];
      const c = function (k) { return arr.filter(function (r) { return (r && r.status) === k; }).length; };
      const run = await Uat.create({
        tester: String(b.tester || 'Anónimo').slice(0, 120),
        notes: String(b.notes || '').slice(0, 6000),
        suite: String(b.suite || 'planea-uat-v1').slice(0, 60),
        total: arr.length, passed: c('pass'), failed: c('fail'), na: c('na'),
        pending: arr.length - c('pass') - c('fail') - c('na'),
        results: arr.slice(0, 400),
      });
      res.json({ ok: true, id: run.id, created_at: run.created_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.get('/uat/runs', async (req, res) => {
    if (!requireReady(res)) return;
    try {
      const rows = await Uat.findAll({ where: { session_key: null }, order: [['created_at', 'DESC']], limit: 60, attributes: ['id', 'tester', 'suite', 'total', 'passed', 'failed', 'pending', 'na', 'created_at'] });
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // Live auto-save: one shared row per session_key (upsert). Survives cache clears.
  router.post('/uat/save', async (req, res) => {
    if (!requireReady(res)) return;
    try {
      const b = req.body || {};
      const key = String(b.session_key || 'live').slice(0, 120);
      const arr = Array.isArray(b.results) ? b.results : [];
      const c = function (k) { return arr.filter(function (r) { return (r && r.status) === k; }).length; };
      const vals = { tester: String(b.tester || 'Anónimo').slice(0, 120), notes: String(b.notes || '').slice(0, 6000), suite: 'planea-uat-v1', total: arr.length, passed: c('pass'), failed: c('fail'), na: c('na'), pending: arr.length - c('pass') - c('fail') - c('na'), results: arr.slice(0, 400) };
      let run = await Uat.findOne({ where: { session_key: key } });
      if (run) { await run.update(vals); } else { run = await Uat.create(Object.assign({ session_key: key }, vals)); }
      res.json({ ok: true, id: run.id, saved_at: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.get('/uat/state', async (req, res) => {
    if (!requireReady(res)) return;
    try {
      const key = String(req.query.key || 'live').slice(0, 120);
      const run = await Uat.findOne({ where: { session_key: key } });
      res.json(run || { results: [], tester: '', notes: '' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.get('/uat/runs/:id', async (req, res) => {
    if (!requireReady(res)) return;
    try { const r = await Uat.findByPk(req.params.id); if (!r) return res.status(404).json({ error: 'not found' }); res.json(r); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Session diagnostic — open in the SAME browser to see if THIS device is authed.
  router.get('/me/whoami', (req, res) => {
    const tok = readCookie(req);
    const u = authUser(req);
    const ok = !!u;
    res.type('html').send('<!doctype html><meta charset="utf-8"><title>Sesión Planea</title>' +
      '<body style="font-family:system-ui,sans-serif;background:#0d1f1c;color:#eaf1ec;padding:28px;line-height:1.6">' +
      '<h2>Diagnóstico de sesión</h2>' +
      '<p>Dominio: <b>' + (req.get('host') || '') + '</b></p>' +
      '<p>Cookie de sesión recibida: <b>' + (tok ? 'SÍ' : 'NO') + '</b></p>' +
      '<p>Autenticado: <b style="color:' + (ok ? '#3fc06a' : '#ff8a8a') + '">' + (ok ? 'SÍ — user_id ' + u.id + ' (' + (u.email || '') + ')' : 'NO') + '</b></p>' +
      (ok
        ? '<p style="color:#3fc06a">Tu sesión es válida en este dominio. Guardar debe funcionar. Si no guarda, es JS en caché — recarga con Cmd+Shift+R.</p>'
        : '<p style="color:#ff8a8a">No hay sesión válida en <b>' + (req.get('host') || 'este dominio') + '</b>. Por eso no guarda. <a style="color:#8fd9ac" href="/planea/login">Inicia sesión aquí</a> y vuelve a intentar.</p>') +
      '</body>');
  });

  // ── Admin: list our own users (planea_users) — no Supabase, no service_role ──
  // Gated by PLANEA_ADMIN_TOKEN (default matches the docs password). ?html=1 → table.
  const ADMIN_TOKEN = process.env.PLANEA_ADMIN_TOKEN || 'Digit2Ai@7';
  function adminAuthed(req) {
    const t = (req.query && req.query.token) || req.headers['x-planea-admin'] || '';
    return !!t && String(t) === ADMIN_TOKEN;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  // Inspect one user's full financial profile (debug). ?token=..&email=X
  router.get('/admin/profile', async (req, res) => {
    if (!requireReady(res)) return;
    if (!adminAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
    try {
      const email = String((req.query && req.query.email) || '').toLowerCase().trim();
      const u = await User.findOne({ where: { email } });
      if (!u) return res.status(404).json({ error: 'not_found', email });
      const p = await Profile.findOne({ where: { user_id: u.id } });
      const sum = (a) => (Array.isArray(a) ? a.reduce((s, x) => s + (+x.value || 0), 0) : 0);
      res.json({
        email: u.email, user_id: u.id,
        ingresos_data: (p && p.ingresos_data) || [], ingresos_total: sum(p && p.ingresos_data),
        gastos_data: (p && p.gastos_data) || [], gastos_total: sum(p && p.gastos_data),
        liabilities_data: (p && p.liabilities_data) || [],
        assets_data: (p && p.assets_data) || [],
        finance_meta: (p && p.finance_meta) || {},
        score: p && p.score_data && p.score_data.score,
        has_answers: !!(p && p.score_data && p.score_data.answers),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Clear the actual-data modules (keeps Mi Puntaje score_data + goals). Used to
  // wipe survey-injected phantom entries now that the two are separated.
  // ?token=..&email=X   (or &all=1 for every account)
  router.get('/admin/reset-data', async (req, res) => {
    if (!requireReady(res)) return;
    if (!adminAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
    try {
      const blank = { ingresos_data: [], gastos_data: [], liabilities_data: [], assets_data: [], seguros_data: [], retiro_data: [], finance_meta: {} };
      if (req.query.all === '1') {
        const [n] = await sequelize.query("UPDATE planea_profiles SET ingresos_data='[]'::jsonb, gastos_data='[]'::jsonb, liabilities_data='[]'::jsonb, assets_data='[]'::jsonb, seguros_data='[]'::jsonb, retiro_data='[]'::jsonb, finance_meta='{}'::jsonb");
        return res.json({ success: true, reset: 'all' });
      }
      const email = String((req.query && req.query.email) || '').toLowerCase().trim();
      const u = await User.findOne({ where: { email } });
      if (!u) return res.status(404).json({ error: 'not_found', email });
      const p = await Profile.findOne({ where: { user_id: u.id } });
      if (p) { Object.assign(p, blank); await p.save(); }
      res.json({ success: true, reset: email });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/admin/accounts', async (req, res) => {
    if (!requireReady(res)) return;
    if (!adminAuthed(req)) return res.status(401).json({ error: 'unauthorized', hint: 'Pass ?token=<PLANEA_ADMIN_TOKEN>' });
    try {
      const rows = await User.findAll({ order: [['created_at', 'DESC']], attributes: ['id', 'email', 'full_name', 'created_at', 'last_login_at'] });
      const users = rows.map((u) => ({
        id: u.id, email: u.email, full_name: u.full_name || '',
        created_at: u.created_at, last_login_at: u.last_login_at || null,
      }));
      if (req.query.html) {
        const trs = users.map((u) => '<tr><td>' + u.id + '</td><td>' + esc(u.email) + '</td><td>' + esc(u.full_name) +
          '</td><td>' + esc(String(u.created_at || '').slice(0, 10)) + '</td><td>' + esc(String(u.last_login_at || '').slice(0, 10) || '—') + '</td></tr>').join('');
        return res.type('html').send('<!doctype html><meta charset="utf-8"><title>Planea — Usuarios</title>' +
          '<style>body{font-family:system-ui,sans-serif;background:#0d1f1c;color:#eaf1ec;padding:24px}h1{font-size:20px}' +
          'table{border-collapse:collapse;width:100%;max-width:820px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #24413b;font-size:14px}th{color:#8fd9ac}</style>' +
          '<h1>Usuarios de Planea (nuestro backend) — ' + users.length + ' total</h1>' +
          '<table><tr><th>ID</th><th>Correo</th><th>Nombre</th><th>Creado</th><th>Últ. ingreso</th></tr>' + trs + '</table>');
      }
      res.json({ count: users.length, users });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Open free signup — NO email confirmation.
  // Trazabilidad de seguridad — nunca guarda contraseña, token ni cuerpo. IP hasheada.
  async function audit(req, event, outcome, extra) {
    try {
      if (!Audit) return;
      await Audit.create({
        user_id: (extra && extra.user_id) || null,
        email: (extra && extra.email) || null,
        event: String(event).slice(0, 60),
        outcome: String(outcome || '').slice(0, 30),
        ip_hash: sec.ipHash(req),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 250),
        meta: (extra && extra.meta) || null,
      });
    } catch (e) { /* la auditoría nunca debe tumbar la petición */ }
  }

  router.post('/auth/signup', sec.signupLimiter, async (req, res) => {
    if (!requireReady(res)) return;
    try {
      const email = String(req.body.email || '').toLowerCase().trim();
      const password = String(req.body.password || '');
      const full_name = String(req.body.full_name || req.body.name || '').trim().slice(0, 120);
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Correo inválido' });
      const pwIssue = sec.passwordIssue(password);
      if (pwIssue) return res.status(400).json({ error: pwIssue });

      const existing = await User.findOne({ where: { email } });
      if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado. Inicia sesión.' });

      const password_hash = await bcrypt.hash(password, 12);
      const user = await User.create({ email, password_hash, full_name, last_login_at: new Date() });
      await Profile.create({ user_id: user.id, full_name, assets_data: [], liabilities_data: [], goals: [] });

      setSession(res, user);
      audit(req, 'signup', 'success', { user_id: user.id, email: email });
      res.json({ success: true, user: publicUser(user) });
    } catch (e) {
      console.error('Planea signup error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/auth/login', sec.loginLimiter, async (req, res) => {
    if (!requireReady(res)) return;
    try {
      const email = String(req.body.email || '').toLowerCase().trim();
      const password = String(req.body.password || '');
      if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });

      const user = await User.findOne({ where: { email } });
      if (!user) { audit(req, 'login', 'fail_no_user', { email: email }); return res.status(401).json({ error: 'Credenciales inválidas' }); }

      // Cuenta bloqueada: se corta ANTES de comparar la contraseña, para que el
      // bloqueo no se pueda medir por el tiempo de respuesta de bcrypt.
      const mins = sec.lockRemaining(user);
      if (mins > 0) {
        audit(req, 'login', 'blocked_locked', { user_id: user.id, email: email });
        return res.status(429).json({ error: 'Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo en ' + mins + ' minuto' + (mins === 1 ? '' : 's') + ', o restablece tu contraseña.' });
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        const fails = (user.failed_logins || 0) + 1;
        user.failed_logins = fails;
        if (fails >= sec.LOCK_AFTER) {
          user.locked_until = new Date(Date.now() + sec.LOCK_MINUTES * 60000);
          user.failed_logins = 0;
          audit(req, 'account_lock', 'locked', { user_id: user.id, email: email, minutes: sec.LOCK_MINUTES });
        }
        await user.save().catch(function () {});
        audit(req, 'login', 'fail_password', { user_id: user.id, email: email, attempt: fails });
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      user.last_login_at = new Date();
      user.failed_logins = 0;
      user.locked_until = null;
      await user.save();
      setSession(res, user);
      audit(req, 'login', 'success', { user_id: user.id, email: email });
      res.json({ success: true, user: publicUser(user) });
    } catch (e) {
      console.error('Planea login error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/auth/logout', (req, res) => {
    clearSession(res);
    res.json({ success: true });
  });

  // ── Password reset (email-based, with dev fallback link) ──────────────────
  async function sendResetEmail(email, link) {
    // Mismo patrón que el resto del ecosistema: si no hay SENDGRID_FROM_EMAIL,
    // usa el remitente verificado que ya usan los demás flujos.
    const key = process.env.SENDGRID_API_KEY;
    const from = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'info@digit2ai.com';
    if (!key) return false;
    try {
      const sg = require('@sendgrid/mail'); sg.setApiKey(key);
      await sg.send({
        to: email, from: from, subject: 'Restablece tu contraseña de Planea',
        text: 'Recibimos una solicitud para restablecer tu contraseña de Planea. Abre este enlace (válido 1 hora): ' + link + '\n\nSi no lo solicitaste, ignora este correo.',
        html: '<div style="font-family:Inter,Arial,sans-serif;max-width:460px;margin:auto;color:#0f231e"><h2 style="color:#17a6a6">Planea</h2><p>Recibimos una solicitud para restablecer tu contraseña.</p><p><a href="' + link + '" style="display:inline-block;background:#17a6a6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Restablecer mi contraseña</a></p><p style="color:#607068;font-size:13px">El enlace vence en 1 hora. Si no lo solicitaste, ignora este correo.</p></div>',
      });
      return true;
    } catch (e) { console.error('Planea reset email error:', e.message); return false; }
  }
  router.post('/auth/forgot', sec.resetLimiter, async (req, res) => {
    if (!requireReady(res)) return;
    try {
      const email = String(req.body.email || '').toLowerCase().trim();
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Correo inválido' });
      const user = await User.findOne({ where: { email } });
      let devLink = null;
      if (user) {
        // Se guarda el HASH del token, nunca el token (ISO 27001 A.8.24): quien lea
        // la base de datos no puede secuestrar una cuenta.
        const token = sec.randomToken(24);
        user.reset_token = sec.hashToken(token); user.reset_expires = new Date(Date.now() + 3600000); await user.save();
        audit(req, 'password_reset_request', 'issued', { user_id: user.id, email: email });
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'planea.vip').split(',')[0].trim();
        const link = 'https://' + host + '/planea/reset?token=' + token;
        const sent = await sendResetEmail(email, link);
        if (!sent) devLink = link; // dev fallback so the flow is testable without SendGrid
      }
      // Always ok — never reveal whether the email exists.
      res.json({ ok: true, dev_link: devLink });
    } catch (e) { console.error('Planea forgot error:', e.message); res.status(500).json({ error: e.message }); }
  });
  router.post('/auth/reset', sec.resetLimiter, async (req, res) => {
    if (!requireReady(res)) return;
    try {
      const token = String(req.body.token || '').trim();
      const password = String(req.body.password || '');
      if (!token) return res.status(400).json({ error: 'Enlace inválido.' });
      const pwIssue = sec.passwordIssue(password);
      if (pwIssue) return res.status(400).json({ error: pwIssue });
      const user = await User.findOne({ where: { reset_token: sec.hashToken(token) } });
      if (!user || !user.reset_expires || new Date(user.reset_expires).getTime() < Date.now()) {
        return res.status(400).json({ error: 'El enlace no es válido o venció. Solicita uno nuevo.' });
      }
      user.password_hash = await bcrypt.hash(password, 12);
      user.reset_token = null; user.reset_expires = null; await user.save();
      audit(req, 'password_reset', 'success', { user_id: user.id, email: user.email });
      res.json({ ok: true });
    } catch (e) { console.error('Planea reset error:', e.message); res.status(500).json({ error: e.message }); }
  });

  router.get('/auth/me', async (req, res) => {
    const a = authUser(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    if (!ready) return res.json({ user: { id: a.id, email: a.email, full_name: a.name || '' } });
    try {
      const u = await User.findByPk(a.id);
      if (!u) return res.status(401).json({ error: 'unauthorized' });
      res.json({ user: publicUser(u) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Profile (the data the portal reads/writes) ──
  router.get('/me/profile', async (req, res) => {
    if (!requireReady(res)) return;
    const a = authUser(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    try {
      const u = await User.findByPk(a.id);
      if (!u) return res.status(401).json({ error: 'unauthorized' });
      let p = await Profile.findOne({ where: { user_id: u.id } });
      if (!p) p = await Profile.create({ user_id: u.id, full_name: u.full_name, goals: [] });

      // ARCHITECTURE: Mi Puntaje (score_data, the survey benchmark) lives on the
      // profile; the actual-data modules are independent ROWS in planea_items. They
      // are separate — the survey never seeds items and items never touch the score.
      const rows = await Item.findAll({ where: { user_id: u.id }, order: [['created_at', 'ASC']] });
      const items = rows.map(itemOut);

      // UN SOLO PUNTAJE: la encuesta solo siembra el puntaje inicial. En cuanto hay
      // datos reales en los módulos, Salud Financiera es la única fuente de verdad y
      // el Puntaje Planea la refleja — así nunca pueden diferir. La recomendación
      // (meta de Maya == meta de alta prioridad) se deriva de ESOS MISMOS datos.
      let sd = p.score_data || null;
      const meta = p.finance_meta || {};
      const sal = salud.computeSalud(items, meta);
      if (sal && sal.overall != null) {
        const t = salud.totalsFromItems(items);
        const rec = score.recommendation({
          ingresos: t.I, gastos: t.G, cuotas: t.C, tiene_deuda: (t.D > 0 || t.C > 0),
          meses_cobertura: t.G > 0 ? t.A / t.G : (t.A > 0 ? 99 : 0),
          tipo_ingreso: meta.tipo_ingreso || 'fijo', dependientes: meta.dependientes || 'nadie',
          nombre: String(p.full_name || u.full_name || '').trim().split(/\s+/)[0] || '',
        });
        sd = Object.assign({}, sd || {}, {
          score: sal.overall,
          rango: sal.rango,
          recommendation: rec,          // ← única fuente de la meta prioritaria
          scenario: rec.scenario,
          source: 'salud',              // el puntaje viene de los datos reales
          survey_score: (p.score_data && p.score_data.score != null) ? p.score_data.score : null,
        });
      }

      res.json({
        email: u.email,
        full_name: p.full_name || u.full_name || '',
        score_data: sd,
        goals: Array.isArray(p.goals) ? p.goals : [],
        assets_data: Array.isArray(p.assets_data) ? p.assets_data : [],
        liabilities_data: Array.isArray(p.liabilities_data) ? p.liabilities_data : [],
        items: items,
        summary: itemsSummary(items),
        salud: sal && sal.overall != null ? { overall: sal.overall, rango: sal.rango, net_worth: sal.net_worth } : null,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Patch any subset of the profile. Body may include:
  //   full_name, score_data, progress_data, assets_data, liabilities_data, goals
  router.put('/me/profile', async (req, res) => {
    if (!requireReady(res)) return;
    const a = authUser(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    try {
      const u = await User.findByPk(a.id);
      if (!u) return res.status(401).json({ error: 'unauthorized' });
      let p = await Profile.findOne({ where: { user_id: u.id } });
      if (!p) p = await Profile.create({ user_id: u.id });
      const b = req.body || {};
      if (b.full_name != null) { p.full_name = String(b.full_name).slice(0, 120); u.full_name = p.full_name; await u.save(); }
      if (b.score_data !== undefined) p.score_data = b.score_data;
      if (b.progress_data !== undefined) p.progress_data = b.progress_data;
      if (Array.isArray(b.assets_data)) p.assets_data = b.assets_data;
      if (Array.isArray(b.liabilities_data)) p.liabilities_data = b.liabilities_data;
      if (Array.isArray(b.goals)) p.goals = b.goals;
      if (Array.isArray(b.seguros_data)) p.seguros_data = b.seguros_data;
      if (Array.isArray(b.retiro_data)) p.retiro_data = b.retiro_data;
      if (Array.isArray(b.ingresos_data)) p.ingresos_data = b.ingresos_data;
      if (Array.isArray(b.gastos_data)) p.gastos_data = b.gastos_data;
      if (b.finance_meta && typeof b.finance_meta === 'object') p.finance_meta = b.finance_meta;
      // Mi Puntaje is SEPARATE from the actual-data modules: module edits just persist,
      // they do NOT recompute or touch score_data. score_data is set only by the survey.
      await p.save();
      res.json({ success: true, score_data: p.score_data || null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Financial items (own table planea_items, one row per entry) ─────────────
  const ITEM_CATS = ['ingreso', 'gasto', 'ahorro', 'inversion', 'deuda', 'seguros', 'retiro'];
  function itemOut(i) { return { id: i.id, category: i.category, name: i.name || '', type: i.type || '', value: +i.value || 0, monthly: +i.monthly || 0 }; }
  function itemsSummary(items) {
    const s = {};
    ITEM_CATS.forEach(function (c) { s[c] = items.filter(function (i) { return i.category === c; }).reduce(function (a, i) { return a + (+i.value || 0); }, 0); });
    s.deuda_cuota = items.filter(function (i) { return i.category === 'deuda'; }).reduce(function (a, i) { return a + (+i.monthly || 0); }, 0);
    s.activos = s.ahorro + s.inversion + s.retiro;          // net-worth assets
    s.patrimonio_neto = s.activos - s.deuda;                 // seguros excluded (protection)
    return s;
  }

  router.get('/me/items', async (req, res) => {
    if (!requireReady(res)) return;
    const a = authUser(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    try {
      const where = { user_id: a.id };
      if (req.query.category) where.category = String(req.query.category);
      const rows = await Item.findAll({ where, order: [['created_at', 'ASC']] });
      const items = rows.map(itemOut);
      res.json({ items: items, summary: itemsSummary(items) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Salud Financiera — full per-bucket breakdown + records a daily snapshot for
  // the over-time chart. Distinct from Mi Puntaje (survey).
  router.get('/me/salud', async (req, res) => {
    if (!requireReady(res)) return;
    const a = authUser(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    try {
      const u = await User.findByPk(a.id);
      const prof = await Profile.findOne({ where: { user_id: a.id } });
      const meta = (prof && prof.finance_meta) || {};
      const rows = await Item.findAll({ where: { user_id: a.id } });
      const result = salud.computeSalud(rows.map(itemOut), meta);
      if (result.overall != null) {
        const today = new Date().toISOString().slice(0, 10);
        const snap = result.buckets.map(function (b) { return { key: b.key, score: b.score }; });
        const vals = { overall: result.overall, net_worth: result.net_worth, income: result.inputs.I, expense: result.inputs.G, buckets: snap };
        const existing = await SaludH.findOne({ where: { user_id: a.id, snap_date: today } });
        if (existing) { Object.assign(existing, vals); await existing.save(); }
        else { await SaludH.create(Object.assign({ user_id: a.id, snap_date: today }, vals)); }
      }
      const hist = await SaludH.findAll({ where: { user_id: a.id }, order: [['snap_date', 'ASC']], limit: 120 });
      result.history = hist.map(function (h) { return { date: h.snap_date, overall: h.overall, net_worth: h.net_worth, income: h.income, expense: h.expense }; });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Neural Findings — data-derived, cross-bucket-aware insights in Maya's voice,
  // grounded on the CFP pyramid + the A–I scenario tree. Claude-backed with a
  // deterministic fallback if the model is unavailable.
  const FIND_MODEL = process.env.PLANEA_MAYA_MODEL || 'claude-haiku-4-5-20251001';
  function fallbackFindings(sal, rec) {
    const tip = function (b) {
      if (b.score >= 85) return 'Vas muy bien en ' + b.label.toLowerCase() + '. Mantén el hábito.';
      if (b.key === 'savings') return 'Tu fondo de emergencia aún es corto. Sepáralo antes de invertir; es tu escudo.';
      if (b.key === 'debt') return 'La deuda pesa sobre tu ingreso. Atácala primero: cada peso ahí rinde más que cualquier inversión.';
      if (b.key === 'expenses') return 'Tus gastos consumen buena parte del ingreso. Revisa en qué se va la plata este mes.';
      if (b.key === 'income') return 'Tu margen para ahorrar es ajustado. Sube ingresos o baja gastos para liberar flujo.';
      if (b.key === 'investments') return 'Tu patrimonio puede crecer más. Cuando tengas fondo y sin deuda cara, pon tu plata a trabajar.';
      if (b.key === 'insurance') return 'Estás poco protegido. Un imprevisto grande podría borrar tu progreso; evalúa una póliza.';
      if (b.key === 'retirement') return 'Vas corto para el retiro según tu edad. Aportes voluntarios pequeños hoy suman mucho mañana.';
      return 'Sigue registrando tus datos para afinar esta recomendación.';
    };
    const buckets = {};
    (sal.buckets || []).forEach(function (b) { buckets[b.key] = tip(b); });
    const low = (sal.buckets || []).slice().sort(function (a, b) { return a.score - b.score; })[0];
    return { source: 'fallback', featured: { bucket: low && low.key, text: (rec && rec.mayaMessage) || (low ? tip(low) : 'Registra tus datos para empezar.'), goal: rec && rec.goalText, scenario: rec && rec.scenario }, buckets: buckets };
  }
  router.get('/me/salud/findings', async (req, res) => {
    if (!requireReady(res)) return;
    const a = authUser(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    try {
      const u = await User.findByPk(a.id);
      const prof = await Profile.findOne({ where: { user_id: a.id } });
      const meta = (prof && prof.finance_meta) || {};
      const rows = await Item.findAll({ where: { user_id: a.id } });
      const items = rows.map(itemOut);
      const sal = salud.computeSalud(items, meta);
      const t = salud.totalsFromItems(items);
      // scenario (A–I) from the CFP decision tree
      const inp = {
        ingresos: t.I, gastos: t.G, cuotas: t.C, tiene_deuda: (t.D > 0 || t.C > 0),
        meses_cobertura: t.G > 0 ? t.A / t.G : (t.A > 0 ? 99 : 0),
        tipo_ingreso: meta.tipo_ingreso || 'fijo', dependientes: meta.dependientes || 'nadie',
        nombre: (u && u.full_name || '').trim().split(/\s+/)[0] || '',
      };
      const rec = (sal.overall != null) ? score.recommendation(inp) : null;

      if (sal.overall == null) return res.json({ source: 'none', featured: null, buckets: {} });

      // Try Claude; fall back on any error / missing key.
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return res.json(fallbackFindings(sal, rec));
      const bucketLines = sal.buckets.map(function (b) { return '- ' + b.label + ' (' + b.key + '): ' + b.score + '/100, meta: ' + b.target; }).join('\n');
      const sys = 'Eres Maya, la guía financiera de Planea. Analizas la salud financiera REAL del usuario a partir de sus datos, siguiendo la Pirámide de Prioridades del CFP Board (1 colchón mínimo, 2 pagar deuda cara, 3 fondo 3-6 meses, 4 metas, 5 invertir) y el árbol de 9 escenarios (A-I). Reglas: español neutro, SIN emojis, tono cálido y directo, cada hallazgo debe basarse en los NÚMEROS y ser consciente de las otras áreas (ej: ingreso alto pero ahorro bajo, o deuda creciendo mientras la inversión está quieta). Devuelve SOLO JSON válido.';
      const usr = 'Datos del usuario (COP):\n' +
        'Ingreso mensual: ' + t.I + ' | Gasto mensual: ' + t.G + ' | Cuotas de deuda: ' + t.C + '\n' +
        'Ahorro: ' + t.A + ' | Inversión: ' + t.V + ' | Retiro: ' + t.R + ' | Deuda saldo: ' + t.D + ' | Seguros: ' + t.S + '\n' +
        'Patrimonio neto: ' + sal.net_worth + ' | Edad: ' + sal.age + '\n' +
        'Puntaje Salud Financiera: ' + sal.overall + '/100 (' + sal.rango + ')\n' +
        'Sub-puntajes por área:\n' + bucketLines + '\n' +
        'Escenario CFP: ' + (rec ? rec.scenario : '?') + ' — ' + (rec ? rec.goalText : '') + '\n\n' +
        'Devuelve JSON: {"featured":{"bucket":"<key del área más débil>","text":"<recomendación principal de Maya, 2-3 frases, accionable>","goal":"<meta en pesos>"},"buckets":{"income":"<hallazgo>","expenses":"<hallazgo>","savings":"<hallazgo>","debt":"<hallazgo>","investments":"<hallazgo>","insurance":"<hallazgo>","retirement":"<hallazgo>"}}. Cada hallazgo: 1-2 frases, específico a sus números.';
      const ctrl = new AbortController();
      const to = setTimeout(function () { ctrl.abort(); }, 12000);
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: FIND_MODEL, max_tokens: 900, system: sys, messages: [{ role: 'user', content: usr }] }),
      }).catch(function () { return null; });
      clearTimeout(to);
      if (!r || !r.ok) return res.json(fallbackFindings(sal, rec));
      const data = await r.json();
      let txt = (data && data.content && data.content[0] && data.content[0].text) || '';
      let parsed = null;
      try { parsed = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); } catch (e) { parsed = null; }
      if (!parsed || !parsed.buckets) return res.json(fallbackFindings(sal, rec));
      parsed.source = 'neural';
      parsed.scenario = rec ? rec.scenario : null;
      res.json(parsed);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/me/items', async (req, res) => {
    if (!requireReady(res)) return;
    const a = authUser(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    try {
      const b = req.body || {};
      const category = String(b.category || '');
      if (ITEM_CATS.indexOf(category) < 0) return res.status(400).json({ error: 'invalid_category' });
      const item = await Item.create({
        user_id: a.id, category: category,
        name: String(b.name || '').slice(0, 160), type: String(b.type || '').slice(0, 80),
        value: +b.value || 0, monthly: +b.monthly || 0,
      });
      res.json({ success: true, item: itemOut(item) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.patch('/me/items/:id', async (req, res) => {
    if (!requireReady(res)) return;
    const a = authUser(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    try {
      const item = await Item.findOne({ where: { id: req.params.id, user_id: a.id } });
      if (!item) return res.status(404).json({ error: 'not_found' });
      const b = req.body || {};
      if (b.name != null) item.name = String(b.name).slice(0, 160);
      if (b.type != null) item.type = String(b.type).slice(0, 80);
      if (b.value != null) item.value = +b.value || 0;
      if (b.monthly != null) item.monthly = +b.monthly || 0;
      await item.save();
      res.json({ success: true, item: itemOut(item) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/me/items/:id', async (req, res) => {
    if (!requireReady(res)) return;
    const a = authUser(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    try {
      const n = await Item.destroy({ where: { id: req.params.id, user_id: a.id } });
      res.json({ success: true, deleted: n });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Append one long-term goal (used by the Metas editor).
  router.post('/me/goals', async (req, res) => {
    if (!requireReady(res)) return;
    const a = authUser(req);
    if (!a) return res.status(401).json({ error: 'unauthorized' });
    try {
      let p = await Profile.findOne({ where: { user_id: a.id } });
      if (!p) p = await Profile.create({ user_id: a.id });
      const goals = Array.isArray(p.goals) ? p.goals.slice() : [];
      const g = req.body || {};
      goals.push({
        name: String(g.name || '').slice(0, 120),
        type: g.type || null,
        target_amount: Number(g.target_amount) || 0,
        current_savings: Number(g.current_savings) || 0,
        monthly_saving: Number(g.monthly_saving) || 0,
        created_at: undefined,
      });
      p.goals = goals;
      await p.save();
      res.json({ success: true, goals });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = { build, status: () => ({ ready, error: initErr }), authUser };
