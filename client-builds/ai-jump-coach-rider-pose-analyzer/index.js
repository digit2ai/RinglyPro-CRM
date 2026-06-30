// =====================================================
// AI Jump Coach — Rider Pose Analyzer — Express sub-app
//
// Auto-mounted by src/app.js at /ai-jump-coach-rider-pose-analyzer.
//   GET  /health                 -> public health check
//   GET  / , /dashboard, /privacy-> server-rendered pages (lang-aware)
//   GET  /app.js , /static assets-> client bundle (browser MediaPipe + UI)
//   POST /api/v1/analyses        -> analyze keypoint frames + persist (JWT)
//   GET  /api/v1/analyses[/:id]  -> tenant-scoped reads (JWT)
//   DELETE /api/v1/analyses/:id  -> tenant-scoped delete (JWT)
//
// Browser-side MediaPipe Pose produces the keypoint frames; this backend runs
// the deterministic fault engine in Node. No Python, no ffmpeg, no GPU.
// =====================================================

'use strict';

const express = require('express');
const path = require('path');

const store = require('./models/analysis');
const pagesRouter = require('./routes/pages');
const analysesRouter = require('./routes/analyses');

const VERSION = '0.1.0';
const SERVICE = 'ai-jump-coach-rider-pose-analyzer';

const app = express();

// Body parsing. When mounted in the main CRM, the parent's 500mb express.json
// has already populated req.body; this local parser matters for `node sit.js`
// (standalone boot) and keeps the keypoint-frame payloads comfortably sized.
app.use(express.json({ limit: '24mb' }));

// Kick off the data layer once (Postgres, or in-memory fallback). Non-blocking;
// routes work either way. We don't await here so a slow DB never delays boot.
store.init()
  .then((s) => console.log(JSON.stringify({ svc: SERVICE, event: 'store_init', mode: s.mode })))
  .catch((e) => console.error(JSON.stringify({ svc: SERVICE, event: 'store_init_error', error: e.message })));

// Health (public, no auth).
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE, version: VERSION, store: store.mode() });
});

// Static client assets (app.js, css, model/wasm if vendored later). Pages are
// rendered by pagesRouter, so DO NOT let express.static serve index.html.
app.use(express.static(path.join(__dirname, 'public'), { index: false, extensions: [] }));

// JWT-guarded API.
app.use('/api/v1/analyses', analysesRouter);

// Server-rendered pages (/, /dashboard, /privacy). Mounted last so the API and
// static assets win first.
app.use('/', pagesRouter);

module.exports = app;
