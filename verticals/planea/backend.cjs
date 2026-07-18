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
const { Sequelize, DataTypes } = require('sequelize');
const score = require('./score.cjs');

const SECRET = process.env.PLANEA_JWT_SECRET || process.env.JWT_SECRET || 'planea-2026-secret';
const COOKIE = 'planea_session';
const MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30d
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── DB (own instance, CRM Postgres) ─────────────────────────────────────────
const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
let sequelize = null;
let User = null;
let Profile = null;
let ready = false;
let initErr = null;

function defineModels(sq) {
  const U = sq.define('PlaneaUser', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    full_name: { type: DataTypes.STRING, allowNull: true },
    last_login_at: { type: DataTypes.DATE, allowNull: true },
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

  return { U, P };
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
    User = m.U; Profile = m.P;
    await sequelize.sync({ alter: false }); // create tables if absent (never alters existing)
    // Idempotent add of newer columns (sync never adds columns to an existing table).
    await sequelize.query("ALTER TABLE planea_profiles ADD COLUMN IF NOT EXISTS seguros_data JSONB DEFAULT '[]'::jsonb").catch(function () {});
    await sequelize.query("ALTER TABLE planea_profiles ADD COLUMN IF NOT EXISTS retiro_data JSONB DEFAULT '[]'::jsonb").catch(function () {});
    await sequelize.query("ALTER TABLE planea_profiles ADD COLUMN IF NOT EXISTS ingresos_data JSONB DEFAULT '[]'::jsonb").catch(function () {});
    await sequelize.query("ALTER TABLE planea_profiles ADD COLUMN IF NOT EXISTS gastos_data JSONB DEFAULT '[]'::jsonb").catch(function () {});
    await sequelize.query("ALTER TABLE planea_profiles ADD COLUMN IF NOT EXISTS finance_meta JSONB DEFAULT '{}'::jsonb").catch(function () {});
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
  res.cookie(COOKIE, sign(user), { httpOnly: true, secure: true, sameSite: 'none', maxAge: MAX_AGE, path: '/planea' });
  // Pass RAW JSON — Express's res.cookie URL-encodes the value itself. (Encoding
  // it here too double-encoded it, so JSON.parse threw in the browser and every
  // parse-based session check silently failed.)
  const hint = JSON.stringify({ id: user.id, email: user.email, full_name: user.full_name || '' });
  res.cookie('planea_user', hint, { httpOnly: false, secure: true, sameSite: 'none', maxAge: MAX_AGE, path: '/planea' });
}
function clearSession(res) {
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

  router.get('/auth/status', (req, res) => res.json({ ready, error: initErr || null }));

  // ── Admin: list our own users (planea_users) — no Supabase, no service_role ──
  // Gated by PLANEA_ADMIN_TOKEN (default matches the docs password). ?html=1 → table.
  const ADMIN_TOKEN = process.env.PLANEA_ADMIN_TOKEN || 'Digit2Ai@7';
  function adminAuthed(req) {
    const t = (req.query && req.query.token) || req.headers['x-planea-admin'] || '';
    return !!t && String(t) === ADMIN_TOKEN;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
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
  router.post('/auth/signup', async (req, res) => {
    if (!requireReady(res)) return;
    try {
      const email = String(req.body.email || '').toLowerCase().trim();
      const password = String(req.body.password || '');
      const full_name = String(req.body.full_name || req.body.name || '').trim().slice(0, 120);
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Correo inválido' });
      if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

      const existing = await User.findOne({ where: { email } });
      if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado. Inicia sesión.' });

      const password_hash = await bcrypt.hash(password, 12);
      const user = await User.create({ email, password_hash, full_name, last_login_at: new Date() });
      await Profile.create({ user_id: user.id, full_name, assets_data: [], liabilities_data: [], goals: [] });

      setSession(res, user);
      res.json({ success: true, user: publicUser(user) });
    } catch (e) {
      console.error('Planea signup error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/auth/login', async (req, res) => {
    if (!requireReady(res)) return;
    try {
      const email = String(req.body.email || '').toLowerCase().trim();
      const password = String(req.body.password || '');
      if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });

      const user = await User.findOne({ where: { email } });
      if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

      user.last_login_at = new Date();
      await user.save();
      setSession(res, user);
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
      if (!p) p = await Profile.create({ user_id: u.id, full_name: u.full_name, assets_data: [], liabilities_data: [], goals: [] });

      // Self-heal: legacy surveys stored only score_data.answers. Rebuild the
      // editable data arrays (income/expenses/debt/savings) from them once, so
      // the Ingresos/Gastos/Deuda/Ahorro modules aren't empty. Runs a single time
      // (finance_meta.tipo_ingreso is set afterwards, guarding re-runs).
      var emptyArr = function (a) { return !Array.isArray(a) || a.length === 0; };
      if (p.score_data && p.score_data.answers && (!p.finance_meta || !p.finance_meta.tipo_ingreso)
          && emptyArr(p.ingresos_data) && emptyArr(p.gastos_data) && emptyArr(p.liabilities_data) && emptyArr(p.assets_data)) {
        try {
          const bf = score.dataFromAnswers(p.score_data.answers);
          p.ingresos_data = bf.ingresos_data; p.gastos_data = bf.gastos_data;
          p.liabilities_data = bf.liabilities_data; p.assets_data = bf.assets_data;
          p.finance_meta = bf.finance_meta;
          const c = score.scoreFromProfile({ assets_data: p.assets_data, liabilities_data: p.liabilities_data, ingresos_data: p.ingresos_data, gastos_data: p.gastos_data, finance_meta: p.finance_meta, full_name: p.full_name });
          if (c) p.score_data = { score: c.score, rango: c.rango, scenario: c.scenario, pillars: c.pillars, recommendation: c.recommendation, answers: p.score_data.answers, source: p.score_data.source || 'survey', timestamp: new Date().toISOString() };
          await p.save();
        } catch (e) { console.log('planea backfill skipped:', e.message); }
      }
      res.json({
        email: u.email,
        full_name: p.full_name || u.full_name || '',
        score_data: p.score_data || null,
        progress_data: p.progress_data || null,
        assets_data: Array.isArray(p.assets_data) ? p.assets_data : [],
        liabilities_data: Array.isArray(p.liabilities_data) ? p.liabilities_data : [],
        goals: Array.isArray(p.goals) ? p.goals : [],
        seguros_data: Array.isArray(p.seguros_data) ? p.seguros_data : [],
        retiro_data: Array.isArray(p.retiro_data) ? p.retiro_data : [],
        ingresos_data: Array.isArray(p.ingresos_data) ? p.ingresos_data : [],
        gastos_data: Array.isArray(p.gastos_data) ? p.gastos_data : [],
        finance_meta: p.finance_meta || {},
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
      if (b.score_data !== undefined) p.score_data = b.score_data;

      // Recompute the Puntaje from the CURRENT data (income/expenses/debt/savings)
      // so the survey AND any later module edit keep the score in sync.
      var computed = score.scoreFromProfile({
        assets_data: p.assets_data, liabilities_data: p.liabilities_data,
        ingresos_data: p.ingresos_data, gastos_data: p.gastos_data,
        finance_meta: p.finance_meta, full_name: p.full_name,
      });
      if (computed) {
        var prev = p.score_data || {};
        p.score_data = {
          score: computed.score, rango: computed.rango, scenario: computed.scenario,
          pillars: computed.pillars, recommendation: computed.recommendation,
          answers: prev.answers || (b.score_data && b.score_data.answers) || undefined,
          source: (b.score_data && b.score_data.source) || prev.source || 'auto',
          timestamp: new Date().toISOString(),
        };
      }
      await p.save();
      res.json({ success: true, score_data: p.score_data || null });
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
