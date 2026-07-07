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

const VERSION = '1.1.0';
const SERVICE = 'roundshare';

const app = express();
app.use(express.json());

// ---------------------------------------------------------------
// Waitlist persistence (Postgres). Reuses the CRM database.
// Table rs_waitlist auto-creates on boot; failures never crash the app.
// ---------------------------------------------------------------
let Waitlist = null;
let dbReady = false;
(function initDb() {
  const url = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) { console.warn('[roundshare] no DATABASE_URL — waitlist will not persist'); return; }
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
    sequelize.authenticate()
      .then(() => Waitlist.sync({ alter: false }))
      .then(() => { dbReady = true; console.log('[roundshare] rs_waitlist ready'); })
      .catch((e) => console.error('[roundshare] db init failed:', e.message));
  } catch (e) {
    console.error('[roundshare] sequelize setup failed:', e.message);
  }
})();

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

// Static assets (logo svg, etc). Never let it serve index.html directly.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Catch-all: any other GET (e.g. roundshare.app/login from a stale redirect)
// renders the landing so the bare domain never dead-ends on a 404.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
