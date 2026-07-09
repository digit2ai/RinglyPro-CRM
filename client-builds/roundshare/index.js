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

const fs = require('fs');

const VERSION = '1.3.1';
const SERVICE = 'roundshare';

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

// Private valuation / investor package: passcode gate (default same key as the agreement).
const INVESTOR_PASSCODE = process.env.ROUNDSHARE_INVESTOR_PASSCODE || 'roundshare2026';
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
