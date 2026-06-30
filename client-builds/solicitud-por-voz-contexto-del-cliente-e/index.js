// =====================================================
// Solicitud por Voz — Comercializadora de Palma · Express sub-app
//
// Auto-mounted by src/app.js at /solicitud-por-voz-contexto-del-cliente-e.
// Live financial-visibility slice for a Colombian palm trader: log USD
// sales/purchases (form OR voice transcript) and see real-time P&L.
//
//   GET  /health                 -> public health JSON
//   GET  /dashboard[?lang=en]    -> dark-theme dashboard (ES default)
//   GET  /privacy[?lang=en]      -> Ley 1581 de 2012 notice
//   GET  /                       -> redirect to /dashboard
//   POST /api/v1/transactions    -> create (JWT + tenant)
//   GET  /api/v1/transactions    -> tenant-scoped list (JWT)
//   GET  /api/v1/summary         -> live P&L + net USD position (JWT)
//   POST /api/v1/voice           -> parse transcript -> transaction (JWT)
// =====================================================

const express = require('express');
const path = require('path');
const store = require('./models/transaction');

const app = express();
app.use(express.json({ limit: '256kb' }));

// Bring the store up (Postgres, or in-memory fallback). Fire-and-forget; the
// store also lazy-inits on first call, so requests never race a cold DB.
store.init().then((r) => {
  console.log(JSON.stringify({ svc: 'solicitud-por-voz', event: 'store_init', mode: r.mode }));
}).catch(() => {});

// Health (public)
app.use('/health', require('./routes/health'));

// API (JWT-guarded inside each router)
app.use('/api/v1/transactions', require('./routes/transactions'));
app.use('/api/v1/summary', require('./routes/summary'));
app.use('/api/v1/voice', require('./routes/voice'));

// Server-rendered pages (lang-aware)
app.use('/', require('./routes/pages'));

// Root -> dashboard
app.get('/', (req, res) => res.redirect(302, 'dashboard'));

// Static assets (app.js, etc.) — no index, no-cache so updates apply on reload.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

module.exports = app;
