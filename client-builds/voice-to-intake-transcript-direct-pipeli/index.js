// =====================================================
// Voice-to-Intake Transcript Direct Pipeline — Express sub-app
//
// Auto-mounted by src/app.js at /voice-to-intake-transcript-direct-pipeli.
// Single-screen EN/ES voice -> transcript -> intake pipeline.
//   GET  /                  -> single-screen mic + transcript + send UI
//   GET  /health            -> public health check
//   POST /api/v1/intake     -> persist + forward (JWT required)
//   GET  /api/v1/intake     -> tenant-scoped list (JWT required)
// =====================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('./models/intake');
const I18N = require('./public/i18n');

const app = express();
app.use(express.json({ limit: '256kb' }));

// Pre-load the HTML template once; render with the requested language so a raw
// GET (no JS) already shows the correct h1 + Send button copy (acceptance #7).
const HTML_TEMPLATE = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
function renderIndex(lang) {
  const d = I18N[lang === 'es' ? 'es' : 'en'];
  return HTML_TEMPLATE
    .replace(/{{HTML_LANG}}/g, d.htmlLang)
    .replace(/{{TITLE}}/g, d.title)
    .replace(/{{H1}}/g, d.h1)
    .replace(/{{SUBTITLE}}/g, d.subtitle)
    .replace(/{{MIC_START}}/g, d.micStart)
    .replace(/{{TRANSCRIPT_LABEL}}/g, d.transcriptLabel)
    .replace(/{{TRANSCRIPT_PLACEHOLDER}}/g, d.transcriptPlaceholder)
    .replace(/{{TOKEN_PLACEHOLDER}}/g, d.tokenPlaceholder)
    .replace(/{{SEND_LABEL}}/g, d.sendLabel)
    .replace(/{{LANG_TOGGLE}}/g, d.langToggle)
    .replace(/{{NOT_SUPPORTED}}/g, d.notSupported);
}

// Kick off DB init (non-blocking; falls back to in-memory on failure).
store.init().then((r) => {
  console.log('📝 voice-to-intake store mode:', r.mode);
}).catch((e) => {
  console.error('voice-to-intake store init error:', e.message);
});

// Routes
app.use('/health', require('./routes/health'));
app.use('/api/v1/intake', require('./routes/intake'));

// Single-screen UI — render '/' with server-side language injection BEFORE the
// static middleware (so the raw HTML reflects ?lang=es), then serve app.js /
// i18n.js / assets statically with directory index disabled.
app.get('/', (req, res) => {
  res.type('html').send(renderIndex(req.query.lang === 'es' ? 'es' : 'en'));
});
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

module.exports = app;
