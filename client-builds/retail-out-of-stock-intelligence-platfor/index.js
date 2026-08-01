// =====================================================
// Retail Out-of-Stock Intelligence Platform — Express sub-app
//
// Auto-mounted by src/app.js at /retail-out-of-stock-intelligence-platfor
// (client-builds auto-mount loop).
//
//   GET  /health                  -> {status:'ok', service:'retail-oos', version}
//   GET  /                        -> store manager dashboard (static)
//   POST /api/v1/ingest           -> JWT-gated daily POS+inventory batch
//   GET  /api/v1/dashboard        -> OOS rate, lost-sales $, root-cause mix
//   GET  /api/v1/events/:store_id -> ranked classified event list
//
// "Every stockout, priced and root-caused, before you open your inbox."
//
// The whole pipeline is the four-step framework:
//   Motivation  (lib/costModel.js) -> Measurement (lib/detect.js)
//   -> Attribution (lib/classifier.js) -> Action (the per-category next step)
//
// Grounded in Gruen & Corsten, "Shelf-Confidence: A Practical Guide to Reducing
// Out-Of-Stocks and Improving Product Availability in Retail" (2022) and the
// Gruen/Corsten/Bharadwaj (2002) GMA worldwide study. See lib/ headers for the
// specific findings each module implements.
// =====================================================

'use strict';

const express = require('express');
const path = require('path');

const store = require('./lib/store');
const ingestRoutes = require('./routes/ingest');
const dashboardRoutes = require('./routes/dashboard');
const eventRoutes = require('./routes/events');

const VERSION = '1.0.0';
const SERVICE = 'retail-oos';

const app = express.Router();

// Body parsing scoped to this sub-app. text/csv is accepted raw so a POS
// extract can be piped straight in without a client-side conversion.
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.text({ type: 'text/csv', limit: '25mb' }));

// Kick the DB connection at mount time. Non-fatal by design — a failed
// handshake degrades to the in-memory store and /health says so.
store.init().then((r) => {
  console.log(`[${SERVICE}] storage backend: ${r.backend}${r.reason ? ' (' + r.reason + ')' : ''}`);
}).catch(() => { /* store.init never rejects; belt and braces */ });

// --- health ---
app.get('/health', async (req, res) => {
  const s = store.status();
  res.status(200).json({
    status: 'ok',
    service: SERVICE,
    version: VERSION,
    storage: s.backend,
    storage_error: s.error || null,
    time: new Date().toISOString()
  });
});

// --- API ---
app.use('/api/v1/ingest', ingestRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/events', eventRoutes);

// --- static dashboard ---
app.use('/', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
module.exports.VERSION = VERSION;
module.exports.SERVICE = SERVICE;
