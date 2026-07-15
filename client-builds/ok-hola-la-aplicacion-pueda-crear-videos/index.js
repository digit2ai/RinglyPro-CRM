'use strict';
// =====================================================
// OK Hola — Voice-to-Video Prompt Builder — Express sub-app
//
// Auto-mounted by src/app.js at /ok-hola-la-aplicacion-pueda-crear-videos.
// Core vertical slice: voice/text -> LLM (or deterministic mock) -> structured
// video-generation prompt -> saved to the user's prompt library.
//
// Rendering + social auto-publishing are STUBBED (routes/mocks.js).
// Spanish-first; ?lang=en switches copy. Passwordless magic-link auth reusing
// the RinglyPro JWT lib. Multi-tenant: tenant_id === user id, scoped on every read.
// =====================================================
const express = require('express');
const path = require('path');
const fs = require('fs');

const { resolveLang, dict } = require('./services/i18n');

const VERSION = '1.0.1';
const SERVICE = 'ok-hola-la-aplicacion-pueda-crear-videos';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PUBLIC_DIR = path.join(__dirname, 'public');

// ---- Health (public) ----
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: SERVICE, version: VERSION });
});

// ---- API ----
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/prompts', require('./routes/prompts'));  // generate, list, get, patch
app.use('/api/v1/prompts', require('./routes/mocks'));    // :id/render, :id/publish

// ---- Static assets (app.js, i18n dicts, etc.) ----
// index:false so GET / falls through to the localized handler below (not raw index.html).
app.use(express.static(PUBLIC_DIR, { index: false }));

// ---- Privacy (Spanish notice) ----
app.get('/privacy', (req, res) => {
  const p = path.join(PUBLIC_DIR, 'privacy.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.status(200).type('html').send('<h1>Aviso de Privacidad</h1><p>Solo almacenamos tu correo para el inicio de sesión sin contraseña.</p>');
});

// Serve an HTML file with its <h1> localized from the active dict.
function serveLocalized(file, res, req) {
  const lang = resolveLang(req);
  const d = dict(lang);
  let html = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
  // Inject active lang + dict so the page renders correct copy on first paint.
  html = html
    .replace(/\{\{LANG\}\}/g, lang)
    .replace(/\{\{VERSION\}\}/g, VERSION)
    .replace(/\{\{H1\}\}/g, d.h1 || 'OK Hola')
    .replace(/\{\{TAGLINE\}\}/g, d.tagline || '')
    .replace('{{DICT_JSON}}', JSON.stringify(d));
  // Never cache the shell — ensures a fresh bundle reference on every load.
  res.set('Cache-Control', 'no-store');
  res.status(200).type('html').send(html);
}

// ---- Marketing landing (hero + What/Why/How + CTA) ----
app.get('/', (req, res) => {
  try { serveLocalized('landing.html', res, req); }
  catch (e) { res.status(500).send('boot error'); }
});

// ---- App (voice/text input tool) ----
app.get('/app', (req, res) => {
  try { serveLocalized('index.html', res, req); }
  catch (e) { res.status(500).send('boot error'); }
});

// ---- Dashboard (saved prompt library) ----
app.get('/dashboard', (req, res) => {
  try { serveLocalized('dashboard.html', res, req); }
  catch (e) { res.status(500).send('boot error'); }
});

module.exports = app;

// Allow standalone run for local smoke: `node index.js`
if (require.main === module) {
  const port = process.env.PORT || 4055;
  app.listen(port, () => console.log(`OK Hola standalone on :${port}`));
}
