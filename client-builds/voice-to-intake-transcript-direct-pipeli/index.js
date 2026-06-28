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
const attachStore = require('./models/attachment');
const I18N = require('./public/i18n');

const app = express();
// Intercom voice notes arrive as base64 JSON — too big for the 256kb global
// limit. Parse those specific endpoints first with a larger cap so the global
// parser below skips them (express.json no-ops once the body is parsed).
const audioJsonParser = express.json({ limit: '6mb' });
app.use(function (req, res, next) {
  if (req.method === 'POST' && /^\/api\/v1\/intercom\/.*\/audio$/.test(req.path)) return audioJsonParser(req, res, next);
  next();
});
app.use(express.json({ limit: '256kb' }));

// Pre-load the HTML template once; render with the requested language so a raw
// GET (no JS) already shows the correct h1 + Send button copy (acceptance #7).
const MOUNT_BASE = '/voice-to-intake-transcript-direct-pipeli/';
const HTML_TEMPLATE = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
// A champion's installed PWA gets ISOLATED storage (separate from Safari), so
// the magic-link code can't ride along in localStorage. Point the manifest at a
// per-champion start_url (?c=<code>) so "Add to Home Screen" installs a launch
// URL that carries the code — every cold start re-seeds the PWA's own storage.
const ICONS = [
  { src: 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6a3feadac408020f97ca4060.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  { src: 'https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6a3feadac408020f97ca4060.png', sizes: '192x192', type: 'image/png' }
];
function buildManifest(championCode) {
  const c = championCode ? String(championCode) : '';
  return {
    name: 'Digit2Ai Voice to Intake',
    short_name: 'Digit2Ai',
    start_url: MOUNT_BASE + (c ? ('?c=' + encodeURIComponent(c)) : ''),
    scope: MOUNT_BASE,
    display: 'standalone',
    background_color: '#0b0f1a',
    theme_color: '#0b0f1a',
    icons: ICONS
  };
}

function renderIndex(lang, championCode) {
  const d = I18N[lang === 'es' ? 'es' : 'en'];
  const manifestHref = MOUNT_BASE + 'manifest.json' + (championCode ? ('?c=' + encodeURIComponent(String(championCode))) : '');
  return HTML_TEMPLATE
    .replace(/{{BASE}}/g, MOUNT_BASE)
    .replace(/{{MANIFEST_HREF}}/g, manifestHref)
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
    .replace(/{{NOT_SUPPORTED}}/g, d.notSupported)
    .replace(/{{INBOX_TAB}}/g, d.inboxTab)
    .replace(/{{INBOX_TITLE}}/g, d.inboxTitle)
    .replace(/{{INBOX_SUB}}/g, d.inboxSub)
    .replace(/{{INTERCOM_PLACEHOLDER}}/g, d.intercomPlaceholder)
    .replace(/{{INTERCOM_SEND}}/g, d.intercomSend)
    .replace(/{{INTERCOM_MIC}}/g, d.intercomMic || 'Record voice message')
    .replace(/{{POC_HEADING}}/g, d.pocHeading)
    .replace(/{{ENABLE_NOTIF}}/g, d.enableNotif)
    .replace(/{{ATTACH_LABEL}}/g, d.attachLabel)
    .replace(/{{ATTACH_HINT}}/g, d.attachHint);
}

// Kick off DB init (non-blocking; falls back to in-memory on failure).
store.init().then((r) => {
  console.log('📝 voice-to-intake store mode:', r.mode);
}).catch((e) => {
  console.error('voice-to-intake store init error:', e.message);
});
attachStore.init().then((r) => {
  console.log('📎 voice-to-intake attachment store mode:', r.mode);
}).catch((e) => {
  console.error('voice-to-intake attachment store init error:', e.message);
});

// Routes
app.use('/health', require('./routes/health'));
app.use('/api/v1/intake', require('./routes/intake'));
app.use('/api/v1/inbox', require('./routes/inbox'));
app.use('/api/v1/champion-links', require('./routes/champion'));
app.use('/api/v1/intercom', require('./routes/intercom'));

// Single-screen UI — render '/' with server-side language injection BEFORE the
// static middleware (so the raw HTML reflects ?lang=es), then serve app.js /
// i18n.js / assets statically with directory index disabled.
app.get('/', (req, res) => {
  // Canonicalize to a trailing slash so relative asset URLs + the client BASE
  // resolve correctly (home-screen shortcuts often open the no-slash URL).
  const pathOnly = req.originalUrl.split('?')[0];
  if (!pathOnly.endsWith('/')) {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(302, MOUNT_BASE + qs);
  }
  // no-cache: always serve the freshest HTML (revalidates via ETag) so champions
  // never get stuck on a stale build.
  res.set('Cache-Control', 'no-cache');
  // Default to Spanish; English only when explicitly requested (?lang=en).
  res.type('html').send(renderIndex(req.query.lang === 'en' ? 'en' : 'es', req.query.c));
});

// Dynamic web app manifest — per-champion start_url when ?c=<code> is present.
// Registered BEFORE express.static so it overrides the static manifest.json.
app.get('/manifest.json', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json').send(JSON.stringify(buildManifest(req.query.c)));
});

// no-cache on JS/HTML/assets too — updates take effect on next load, no hard refresh.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

module.exports = app;
