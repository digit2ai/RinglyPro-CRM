// =====================================================
// RoundShare — Ride. Improve. Share. — Express sub-app
//
// Auto-mounted by src/app.js at /roundshare (client-builds auto-mount loop).
//   GET  /health      -> public health check
//   GET  /            -> marketing landing page (What / Why / How + Lina voice AI)
//   GET  /simulator   -> interactive in-browser app mockup simulator (40 screens)
//   GET  /app         -> alias for /simulator
//
// RoundShare is the community / social layer of the EquiMind "Jump Coach"
// ecosystem: riders record a round, get AI feedback, then SHARE it with
// friends, trainers and their barn circles to improve together.
//
// Same brand DNA as EquiMind (purple identity, horse-jumper mark). The Lina
// voice orb reuses the existing zero-key /api/tts/edge route on the parent CRM
// (same origin), so this build ships NO new TTS backend.
// =====================================================

'use strict';

const express = require('express');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const crypto = require('crypto');

const fs = require('fs');

const VERSION = '1.4.0';
const SERVICE = 'roundshare';

// Admin console: waitlist/subscription management. Credentials + signing secret
// are env-overridable; defaults match the owner-provided login.
const ADMIN_EMAIL = (process.env.ROUNDSHARE_ADMIN_EMAIL || 'admin@roundshare.app').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ROUNDSHARE_ADMIN_PASSWORD || 'LCMroundshare@7';
const ADMIN_SECRET = process.env.ROUNDSHARE_ADMIN_SECRET || process.env.JWT_SECRET || ('roundshare-admin-' + ADMIN_PASSWORD);
const ADMIN_COOKIE = 'rs_admin';
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000; // 12h session

// --- signed-cookie session (HMAC, dependency-free) ---
function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function signAdminToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest());
  return body + '.' + sig;
}
function verifyAdminToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  const body = parts[0], sig = parts[1] || '';
  const expect = b64url(crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!p.exp || Date.now() > p.exp) return null;
    return p;
  } catch (e) { return null; }
}
function readCookie(req, name) {
  const h = req.headers.cookie || '';
  const hit = h.split(';').map((s) => s.trim()).find((s) => s.indexOf(name + '=') === 0);
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
}
function requireAdmin(req, res, next) {
  const p = verifyAdminToken(readCookie(req, ADMIN_COOKIE));
  if (!p || p.email !== ADMIN_EMAIL) return res.status(401).json({ ok: false, error: 'unauthorized' });
  req.admin = p; next();
}
// crude in-memory login throttle: 10 failed attempts / 15 min / IP
const _loginHits = new Map();
function loginBlocked(ip) {
  const e = _loginHits.get(ip);
  if (!e) return false;
  if (Date.now() - e.ts > 15 * 60 * 1000) { _loginHits.delete(ip); return false; }
  return e.count >= 10;
}
function noteLoginFail(ip) {
  const e = _loginHits.get(ip) || { count: 0, ts: Date.now() };
  e.count += 1; e.ts = Date.now(); _loginHits.set(ip, e);
}

// Private Operating Agreement: passcode gate + e-signatures + PDF (client print).
const AGREEMENT_VERSION = '4.0';
const AGREEMENT_PASSCODE = process.env.ROUNDSHARE_AGREEMENT_PASSCODE || 'roundshare2026';
const AGREEMENT_PARTIES = ['digit2ai', 'carrie', 'maria'];
let _agreementBody = null;
function agreementBody() {
  if (_agreementBody == null) {
    try { _agreementBody = fs.readFileSync(path.join(__dirname, 'agreement-body.html'), 'utf8'); }
    catch (e) { console.error('[roundshare] agreement body missing:', e.message); _agreementBody = ''; }
  }
  return _agreementBody;
}

// Private valuation / investor package: passcode gate.
// Defaults to the admin password so there is one credential to remember; an explicit
// ROUNDSHARE_INVESTOR_PASSCODE still overrides it when a separate passcode is preferred.
const INVESTOR_PASSCODE = process.env.ROUNDSHARE_INVESTOR_PASSCODE || process.env.ROUNDSHARE_ADMIN_PASSWORD || 'roundshare2026';
let _investorBody = null;
function investorBody() {
  if (_investorBody == null) {
    try { _investorBody = fs.readFileSync(path.join(__dirname, 'investor-body.html'), 'utf8'); }
    catch (e) { console.error('[roundshare] investor body missing:', e.message); _investorBody = ''; }
  }
  return _investorBody;
}

const app = express();
app.use(express.json());

// ---------------------------------------------------------------
// Postgres persistence (reuses the CRM database). Tables auto-create on
// boot via sync({alter:false}); failures never crash the app.
//   rs_waitlist              -> landing-page waitlist signups
//   rs_agreement_signatures  -> Operating Agreement e-signatures
// ---------------------------------------------------------------
let Waitlist = null;
let Signature = null;
let dbReady = false;
(function initDb() {
  const url = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) { console.warn('[roundshare] no DATABASE_URL — persistence disabled'); return; }
  try {
    const sequelize = new Sequelize(url, {
      dialect: 'postgres',
      dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
      logging: false,
    });
    Waitlist = sequelize.define('rs_waitlist', {
      id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      email:    { type: DataTypes.STRING, allowNull: false },
      name:     { type: DataTypes.STRING },
      phone:    { type: DataTypes.STRING },
      plan:     { type: DataTypes.STRING(32) },
      status:   { type: DataTypes.STRING(24) },
      notes:    { type: DataTypes.TEXT },
      source:   { type: DataTypes.STRING },
      tag:      { type: DataTypes.STRING },
      language: { type: DataTypes.STRING(8) },
      ip:       { type: DataTypes.STRING },
      user_agent: { type: DataTypes.TEXT },
    }, { tableName: 'rs_waitlist', underscored: true, timestamps: true });
    Signature = sequelize.define('rs_agreement_signatures', {
      id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      agreement_version: { type: DataTypes.STRING(16), allowNull: false },
      party:             { type: DataTypes.STRING(32), allowNull: false },
      signer_name:       { type: DataTypes.STRING, allowNull: false },
      signer_email:      { type: DataTypes.STRING },
      ip:                { type: DataTypes.STRING },
      user_agent:        { type: DataTypes.TEXT },
    }, { tableName: 'rs_agreement_signatures', underscored: true, timestamps: true });
    sequelize.authenticate()
      .then(() => Waitlist.sync({ alter: false }))
      // Add plan-signup columns to an already-existing table (sync alter:false won't).
      .then(() => sequelize.query(
        'ALTER TABLE rs_waitlist ' +
        'ADD COLUMN IF NOT EXISTS name VARCHAR(255), ' +
        'ADD COLUMN IF NOT EXISTS phone VARCHAR(64), ' +
        'ADD COLUMN IF NOT EXISTS plan VARCHAR(32), ' +
        'ADD COLUMN IF NOT EXISTS status VARCHAR(24), ' +
        'ADD COLUMN IF NOT EXISTS notes TEXT'
      ).catch((e) => console.warn('[roundshare] rs_waitlist alter skipped:', e.message)))
      .then(() => Signature.sync({ alter: false }))
      .then(() => { dbReady = true; console.log('[roundshare] rs_waitlist + rs_agreement_signatures ready'); })
      .catch((e) => console.error('[roundshare] db init failed:', e.message));
  } catch (e) {
    console.error('[roundshare] sequelize setup failed:', e.message);
  }
})();

async function currentSignatures() {
  if (!Signature || !dbReady) return [];
  const rows = await Signature.findAll({
    where: { agreement_version: AGREEMENT_VERSION },
    order: [['created_at', 'ASC']],
  });
  return rows.map((r) => {
    const dv = r.dataValues || {};
    // underscored:true names the timestamp attribute createdAt but the column created_at —
    // cover both so signed_at is always a valid ISO string on the client.
    const ca = dv.created_at || dv.createdAt || r.createdAt || null;
    return {
      party: r.party,
      signer_name: r.signer_name,
      signer_email: r.signer_email || '',
      signed_at: ca ? new Date(ca).toISOString() : null,
    };
  });
}
function badPass(req) {
  return String((req.body && req.body.passcode) || '') !== AGREEMENT_PASSCODE;
}

// Health (public, no auth).
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE, version: VERSION, db: dbReady, ts: new Date().toISOString() });
});

// Waitlist signup -> Postgres (rs_waitlist).
app.post('/api/waitlist', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  if (!Waitlist || !dbReady) {
    // Do not lose the lead silently in logs if DB is down.
    console.warn('[roundshare] waitlist signup (db unavailable):', email);
    return res.status(202).json({ ok: true, persisted: false });
  }
  try {
    await Waitlist.create({
      email,
      source: String((req.body && req.body.source) || 'roundshare.app').slice(0, 120),
      tag: String((req.body && req.body.tag) || 'roundshare-waitlist').slice(0, 120),
      language: String((req.body && req.body.language) || 'en').slice(0, 8),
      ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
    });
    return res.json({ ok: true, persisted: true });
  } catch (e) {
    console.error('[roundshare] waitlist insert failed:', e.message);
    return res.status(500).json({ ok: false, error: 'insert_failed' });
  }
});

// Plan / subscription waitlist signup -> Postgres (rs_waitlist).
// Name + phone required; email optional; plan = which subscription tier.
app.post('/api/plan-signup', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const plan = String(b.plan || '').trim().toLowerCase();
  const ALLOWED = ['free', 'premium', 'trainer', 'unlimited'];
  if (!name || !phone) {
    return res.status(400).json({ ok: false, error: 'name_and_phone_required' });
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  const planSafe = ALLOWED.includes(plan) ? plan : 'unknown';
  if (!Waitlist || !dbReady) {
    console.warn('[roundshare] plan signup (db unavailable):', planSafe, name, phone);
    return res.status(202).json({ ok: true, persisted: false });
  }
  try {
    await Waitlist.create({
      email: email || '',
      name: name.slice(0, 180),
      phone: phone.slice(0, 64),
      plan: planSafe,
      source: String(b.source || 'roundshare.app').slice(0, 120),
      tag: ('roundshare-plan-' + planSafe).slice(0, 120),
      language: String(b.language || 'en').slice(0, 8),
      ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
    });
    return res.json({ ok: true, persisted: true });
  } catch (e) {
    console.error('[roundshare] plan signup insert failed:', e.message);
    return res.status(500).json({ ok: false, error: 'insert_failed' });
  }
});

// ---------------------------------------------------------------
// Admin console — waitlist / subscription management (auth-gated).
// ---------------------------------------------------------------
app.get(['/admin', '/admin/'], (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/admin/login', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  if (loginBlocked(ip)) return res.status(429).json({ ok: false, error: 'too_many_attempts' });
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const okEmail = email === ADMIN_EMAIL;
  const pw = Buffer.from(password); const exp = Buffer.from(ADMIN_PASSWORD);
  const okPw = pw.length === exp.length && crypto.timingSafeEqual(pw, exp);
  if (!okEmail || !okPw) { noteLoginFail(ip); return res.status(401).json({ ok: false, error: 'invalid_credentials' }); }
  const token = signAdminToken({ email: ADMIN_EMAIL, exp: Date.now() + ADMIN_TTL_MS });
  res.set('Set-Cookie', `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(ADMIN_TTL_MS / 1000)}`);
  return res.json({ ok: true });
});

app.post('/admin/logout', (req, res) => {
  res.set('Set-Cookie', `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  return res.json({ ok: true });
});

app.get('/admin/api/me', requireAdmin, (req, res) => res.json({ ok: true, email: req.admin.email }));

// Investor package body for authenticated admins — no passcode required.
// The investor page tries this first; if the admin cookie is valid it renders
// the document directly (bypassing the public access-key gate).
app.get('/admin/api/investor-body', requireAdmin, (req, res) => {
  res.json({ ok: true, html: investorBody() });
});

app.get('/admin/api/leads', requireAdmin, async (req, res) => {
  if (!Waitlist || !dbReady) return res.json({ ok: true, db: false, leads: [] });
  try {
    const rows = await Waitlist.findAll({ order: [['created_at', 'DESC']], limit: 2000 });
    const leads = rows.map((r) => {
      const d = r.dataValues || {};
      const ca = d.created_at || d.createdAt || null;
      return {
        id: d.id, email: d.email || '', name: d.name || '', phone: d.phone || '',
        plan: d.plan || '', tag: d.tag || '', language: d.language || '',
        status: d.status || 'new', notes: d.notes || '', source: d.source || '',
        created_at: ca ? new Date(ca).toISOString() : null,
      };
    });
    return res.json({ ok: true, db: true, leads });
  } catch (e) {
    console.error('[roundshare] admin leads failed:', e.message);
    return res.status(500).json({ ok: false, error: 'query_failed' });
  }
});

app.get('/admin/api/stats', requireAdmin, async (req, res) => {
  if (!Waitlist || !dbReady) return res.json({ ok: true, db: false, total: 0, byPlan: {} });
  try {
    const rows = await Waitlist.findAll({ attributes: ['plan', 'status', 'created_at'] });
    const byPlan = {}; let contacted = 0; let today = 0;
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    rows.forEach((r) => {
      const d = r.dataValues || {};
      const plan = d.plan || 'waitlist';
      byPlan[plan] = (byPlan[plan] || 0) + 1;
      if ((d.status || 'new') === 'contacted') contacted += 1;
      const ca = d.created_at || d.createdAt; if (ca && new Date(ca) >= startOfDay) today += 1;
    });
    return res.json({ ok: true, db: true, total: rows.length, today, contacted, byPlan });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'stats_failed' });
  }
});

app.patch('/admin/api/leads/:id', requireAdmin, async (req, res) => {
  if (!Waitlist || !dbReady) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad_id' });
  const patch = {};
  if (req.body && typeof req.body.status === 'string') patch.status = req.body.status.slice(0, 24);
  if (req.body && typeof req.body.notes === 'string') patch.notes = req.body.notes.slice(0, 2000);
  try {
    const [n] = await Waitlist.update(patch, { where: { id } });
    return res.json({ ok: true, updated: n });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'update_failed' });
  }
});

app.delete('/admin/api/leads/:id', requireAdmin, async (req, res) => {
  if (!Waitlist || !dbReady) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'bad_id' });
  try {
    const n = await Waitlist.destroy({ where: { id } });
    return res.json({ ok: true, deleted: n });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'delete_failed' });
  }
});

// Landing page.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Interactive app mockup simulator.
app.get(['/simulator', '/app'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simulator.html'));
});

// Confidential valuation / investor package — passcode-gated shell (noindex).
app.get(['/investor', '/investors', '/investor-summary', '/valuation', '/pre-seed-valuation'], (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'investor.html'));
});

// Marketing strategy & angel-raise deck — self-contained print-to-PDF page (noindex).
app.get(['/marketing', '/marketing-strategy', '/gtm'], (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'marketing-strategy.html'));
});
// Gated document body — served only after the access key check.
app.post(['/investor/body', '/investors/body', '/investor-summary/body', '/valuation/body', '/pre-seed-valuation/body'], (req, res) => {
  if (String((req.body && req.body.passcode) || '') !== INVESTOR_PASSCODE) {
    return res.status(401).json({ ok: false, error: 'Incorrect key.' });
  }
  return res.json({ ok: true, html: investorBody() });
});

// ---- Private Operating Agreement (passcode-gated) ----
// GET /agreement -> the signing app shell (contains NO agreement text; the
// document body is served only after the passcode check below).
app.get(['/agreement', '/agreement/'], (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'agreement.html'));
});

// POST /agreement/body -> passcode-gated document content + current signatures.
app.post('/agreement/body', async (req, res) => {
  if (badPass(req)) return res.status(401).json({ ok: false, error: 'Incorrect passcode.' });
  let signatures = [];
  try { signatures = await currentSignatures(); } catch (e) { /* non-fatal */ }
  return res.json({ ok: true, version: AGREEMENT_VERSION, html: agreementBody(), signatures });
});

// POST /agreement/sign -> record one e-signature per party (append-only).
app.post('/agreement/sign', async (req, res) => {
  if (badPass(req)) return res.status(401).json({ ok: false, error: 'Incorrect passcode.' });
  const party = String((req.body && req.body.party) || '').trim();
  const signerName = String((req.body && req.body.signer_name) || '').trim();
  const signerEmail = String((req.body && req.body.signer_email) || '').trim();
  if (AGREEMENT_PARTIES.indexOf(party) === -1) return res.status(400).json({ ok: false, error: 'Unknown signing party.' });
  if (signerName.length < 2) return res.status(400).json({ ok: false, error: 'Please type your full legal name.' });
  if (!Signature || !dbReady) return res.status(503).json({ ok: false, error: 'Signature storage is temporarily unavailable.' });
  try {
    const existing = await Signature.findOne({ where: { agreement_version: AGREEMENT_VERSION, party } });
    if (existing) {
      const signatures = await currentSignatures();
      return res.status(409).json({ ok: false, error: 'This party has already signed.', signatures });
    }
    await Signature.create({
      agreement_version: AGREEMENT_VERSION,
      party,
      signer_name: signerName.slice(0, 200),
      signer_email: signerEmail.slice(0, 200),
      ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
    });
    const signatures = await currentSignatures();
    return res.json({ ok: true, signatures });
  } catch (e) {
    console.error('[roundshare] signature insert failed:', e.message);
    return res.status(500).json({ ok: false, error: 'Could not record signature.' });
  }
});

// POST /agreement/reset -> clear ALL signatures for the current version (passcode-gated).
app.post('/agreement/reset', async (req, res) => {
  if (badPass(req)) return res.status(401).json({ ok: false, error: 'Incorrect passcode.' });
  if (!Signature || !dbReady) return res.status(503).json({ ok: false, error: 'Signature storage is temporarily unavailable.' });
  try {
    const n = await Signature.destroy({ where: { agreement_version: AGREEMENT_VERSION } });
    console.log('[roundshare] cleared', n, 'signature(s) for v' + AGREEMENT_VERSION);
    return res.json({ ok: true, cleared: n, signatures: [] });
  } catch (e) {
    console.error('[roundshare] signature reset failed:', e.message);
    return res.status(500).json({ ok: false, error: 'Could not clear signatures.' });
  }
});

// Static assets (logo svg, etc). Never let it serve index.html directly.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Catch-all: any other GET (e.g. roundshare.app/login from a stale redirect)
// renders the landing so the bare domain never dead-ends on a 404.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
