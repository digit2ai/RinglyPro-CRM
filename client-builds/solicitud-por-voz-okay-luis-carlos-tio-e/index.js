// =====================================================
// Solicitud por Voz — rPPG Vital-Signs Capture · Express sub-app
//
// Auto-mounted by src/app.js at /solicitud-por-voz-okay-luis-carlos-tio-e.
// Browser-based rPPG heart-rate (BPM) demo: camera -> client-side estimate ->
// persisted reading -> history list. VIDEO NEVER LEAVES THE BROWSER; only the
// computed BPM integer + metadata are POSTed. Spanish-first, ?lang=en toggle.
//
//   GET  /health                 -> public health JSON
//   GET  /                       -> camera capture UI (ES default, ?lang=en)
//   GET  /dashboard[?lang&token] -> reading history table
//   GET  /disclaimer[?lang]      -> non-medical wellness disclaimer
//   POST /api/v1/readings        -> create (JWT + tenant, bpm 30..220)
//   GET  /api/v1/readings        -> tenant-scoped list (JWT)
// =====================================================

const express = require('express');
const path = require('path');
const store = require('./models/reading');

const app = express();
app.use(express.json({ limit: '64kb' }));

// Bring the store up (Postgres, or in-memory fallback). Fire-and-forget; the
// store also lazy-inits on first call, so requests never race a cold DB.
store.init().then((r) => {
  console.log(JSON.stringify({ svc: 'solicitud-por-voz-rppg', event: 'store_init', mode: r.mode }));
}).catch(() => {});

// Health (public)
app.use('/health', require('./routes/health'));

// API (JWT-guarded inside the router)
app.use('/api/v1/readings', require('./routes/readings'));

// Server-rendered pages (lang-aware): /, /dashboard, /disclaimer
app.use('/', require('./routes/pages'));

// Static assets (rppg.js, etc.) — no index, no-cache so updates apply on reload.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

module.exports = app;
