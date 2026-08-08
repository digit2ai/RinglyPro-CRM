// =====================================================
// AI Agent Prompt Builder for Data Writing — Express sub-app
//
// Auto-mounted by src/app.js at /ai-agent-prompt-builder-for-data-writing
// (the client-builds auto-mount loop). No edit to the main app.
//
//   GET  /health                    -> {status:'ok', service, version}
//   GET  /                          -> the wizard (live JSON preview)
//   GET  /gallery                   -> the template gallery
//   GET  /api/v1/templates          -> 6 seeded templates (public)
//   GET  /api/v1/templates/:slug    -> one template (public)
//   POST /api/v1/agents             -> save an agent definition (JWT)
//   GET  /api/v1/agents             -> list this tenant's agents (JWT)
//   POST /api/v1/agents/generate    -> assemble the JSON prompt payload
//   GET  /api/v1/i18n               -> the UI string dictionary
//
// "Configure a complete data-writing agent and export valid JSON in under ten
// minutes." Everything here serves that one number.
//
// The app ASSEMBLES prompt payloads; it does not execute them. There is no
// OpenAI/Anthropic client anywhere in this directory, and adding one would be a
// scope change, not an enhancement — the deliverable is the JSON.
// =====================================================

'use strict';

const express = require('express');
const path = require('path');

const store = require('./lib/store');
const agentRoutes = require('./routes/agents');
const templateRoutes = require('./routes/templates');
const i18n = require('./lib/i18n');

const VERSION = '1.0.0';
const SERVICE = 'ai-agent-prompt-builder-for-data-writing';

const app = express.Router();

// Body parsing scoped to this sub-app. Instructions and schemas are free text
// and can be long, so the limit is generous but bounded.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Kick the DB connection at mount time. Non-fatal by design — a failed
// handshake degrades to the in-memory store and /health says which is live.
store.init().then((r) => {
  console.log(`[${SERVICE}] storage backend: ${r.backend}${r.reason ? ' (' + r.reason + ')' : ''}`);
}).catch(() => { /* init never rejects; belt and braces */ });

// --- health -----------------------------------------------------------------
// Awaits init() before reading the backend. Without the await, a health check
// that lands during the DB handshake reports the pre-connection default
// ('memory') while Postgres is in fact coming up — a health endpoint that
// misreports the storage backend is worse than one that takes 200ms on the
// first call. init() is memoized, so every later call is free.
app.get('/health', async (req, res) => {
  try { await store.init(); } catch (e) { /* init never rejects */ }
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

// --- API --------------------------------------------------------------------
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/agents', agentRoutes);

// The string dictionary, so the browser bundle has one source of truth for copy
// and ?lang=es becomes a dictionary fill rather than a frontend rewrite.
app.get('/api/v1/i18n', (req, res) => {
  const lang = i18n.languages().indexOf(req.query.lang) !== -1 ? req.query.lang : 'en';
  res.status(200).json({ lang, available: i18n.languages(), strings: i18n.bundle(lang) });
});

// The browser gets the EXACT lib/promptBuilder.js the server runs, wrapped in a
// tiny CommonJS shim, rather than a hand-ported copy. The live preview, the
// clipboard, the download and POST /generate therefore cannot drift from each
// other — a preview that disagrees with the exported file is worse than no
// preview. Safe because promptBuilder.js is pure and has zero `require`s.
let __pbBundle = null;
app.get('/promptBuilder.js', (req, res) => {
  try {
    if (!__pbBundle) {
      const src = require('fs').readFileSync(path.join(__dirname, 'lib', 'promptBuilder.js'), 'utf8');
      __pbBundle =
        '/* generated from lib/promptBuilder.js — do not edit */\n' +
        'window.PromptBuilder = (function () {\n' +
        '  var module = { exports: {} }; var exports = module.exports;\n' +
        src + '\n' +
        '  return module.exports;\n' +
        '})();\n';
    }
    res.type('application/javascript').status(200).send(__pbBundle);
  } catch (err) {
    console.error(`[${SERVICE}] promptBuilder bundle failed:`, err.message);
    res.status(500).type('application/javascript').send('/* unavailable */');
  }
});

// --- static -----------------------------------------------------------------
// index:false so `/` is answered by the explicit handler below rather than by
// express.static, keeping one code path for the wizard page.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gallery.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
module.exports.VERSION = VERSION;
module.exports.SERVICE = SERVICE;
