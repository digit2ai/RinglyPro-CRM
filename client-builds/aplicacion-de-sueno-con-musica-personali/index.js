// =====================================================
// Aplicación de Sueño con Música Personalizada — Express sub-app
//
// Auto-mounted by src/app.js at /aplicacion-de-sueno-con-musica-personali
// (the client-builds auto-mount loop).
//
//   GET  /health                  -> liveness JSON
//   GET  /api/v1/tracks           -> curated library (public, no auth)
//   GET  /api/v1/tracks/meta      -> library version + licensing note
//   POST /api/v1/sessions         -> log a session (x-anon-token required)
//   GET  /api/v1/sessions         -> this token's history only
//   GET  /api/v1/sessions/favourites -> aggregated favourite tracks
//   GET  /                        -> the bedtime player (?lang=es default | en)
//   GET  /history                 -> session history page
//   GET  /audio/*.mp3             -> the self-hosted royalty-free library
//
// The whole point: two taps to a self-terminating sleep session. Pick a track,
// set a timer, hit Iniciar — the volume fades over the final five minutes and
// playback stops on its own.
// =====================================================

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const models = require('./models');
const { makeStore } = require('./models/session');
const healthRoutes = require('./routes/health');
const trackRoutes = require('./routes/tracks');
const sessionRoutes = require('./routes/sessions');

const VERSION = '1.1.0';
const SERVICE = 'aplicacion-de-sueno-con-musica-personali';
const MOUNT = '/' + SERVICE;

const app = express();
app.set('etag', false);
app.use(express.json({ limit: '32kb' }));

// Kick off the DB connection without blocking the mount. Routes work either way.
const store = makeStore(models.state, null);
const ready = models.init().then(() => {
  // Re-bind the store to the live Sequelize instance once authentication landed.
  const seq = models.getSequelize();
  if (models.state.ready && seq) {
    const live = makeStore(models.state, seq);
    store.create = live.create.bind(live);
    store.listByToken = live.listByToken.bind(live);
    store.favourites = live.favourites.bind(live);
    store.backend = live.backend.bind(live);
  }
  return models.state;
}).catch((err) => {
  console.error(`[${SERVICE}] init error:`, err.message);
  return models.state;
});

// --- API + health ---
app.use(healthRoutes({ version: VERSION, service: SERVICE, store, dbState: models.state }));
app.use(trackRoutes());
app.use(sessionRoutes({ store }));

// --- static assets (audio library, player script, manifest) ---
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  maxAge: '7d',
  setHeaders(res, filePath) {
    // The loops are immutable once generated; the HTML is rendered per request.
    if (filePath.endsWith('.mp3')) res.set('Cache-Control', 'public, max-age=604800, immutable');
  },
}));

// =====================================================
// Server-side i18n for the shell copy.
// Acceptance criterion 6 requires the <h1> to be Spanish by default and
// English under ?lang=en in the SERVED HTML, so these strings are substituted
// on the server rather than swapped by client JS after paint.
// =====================================================
const SHELL = {
  es: {
    lang: 'es',
    html_title: 'Modo Noche · Música para dormir',
    h1: 'Modo Noche',
    tagline: 'Dos toques y a dormir. El audio se desvanece y se apaga solo.',
    label_track: 'Pista',
    label_timer: 'Apagado automático (minutos)',
    hint_timer: 'La música baja de volumen durante los últimos 5 minutos y se detiene sola.',
    start: 'Iniciar noche',
    pause: 'Pausar',
    stop: 'Detener',
    status_idle: 'Elige una pista y pulsa Iniciar noche.',
    nav_history: 'Historial',
    nav_player: 'Reproductor',
    history_h1: 'Tu historial de noches',
    history_sub: 'Guardado en este dispositivo mediante un identificador anónimo. No pedimos nombre, correo ni teléfono.',
    footer_privacy: 'Sin cuentas, sin datos personales. El identificador anónimo vive solo en este dispositivo.',
    headphones: 'Requiere audífonos',
    remaining: 'Restante',
    fading: 'Bajando volumen',
    finished: 'Noche completada. Buenas noches.',
  },
  en: {
    lang: 'en',
    html_title: 'Night Mode · Sleep music',
    h1: 'Night Mode',
    tagline: 'Two taps and you are asleep. The audio fades and shuts itself off.',
    label_track: 'Track',
    label_timer: 'Auto-off (minutes)',
    hint_timer: 'Volume fades over the final 5 minutes, then playback stops on its own.',
    start: 'Start the night',
    pause: 'Pause',
    stop: 'Stop',
    status_idle: 'Pick a track and press Start the night.',
    nav_history: 'History',
    nav_player: 'Player',
    history_h1: 'Your night history',
    history_sub: 'Stored against an anonymous identifier on this device. We never ask for a name, email or phone number.',
    footer_privacy: 'No accounts, no personal data. The anonymous identifier never leaves this device.',
    headphones: 'Headphones required',
    remaining: 'Remaining',
    fading: 'Fading out',
    finished: 'Night complete. Sleep well.',
  },
};

function pickLang(req) {
  if (req.query.lang === 'en') return 'en';
  if (req.query.lang === 'es') return 'es';
  return 'es'; // Spanish is the default UI
}

const pageCache = new Map();
function readPage(file) {
  if (!pageCache.has(file) || process.env.NODE_ENV !== 'production') {
    pageCache.set(file, fs.readFileSync(path.join(__dirname, 'public', file), 'utf8'));
  }
  return pageCache.get(file);
}

function render(file, lang) {
  const subs = Object.assign({}, SHELL[lang], {
    MOUNT: MOUNT,
    VERSION: VERSION,
    DICT_JSON: JSON.stringify(SHELL),
  });
  // Function replacement, so a `$` inside the copy is never read as a
  // replacement pattern. An unknown placeholder is left as-is (visible bug,
  // rather than silently blank UI text).
  return readPage(file).replace(/\{\{(\w+)\}\}/g, (m, key) => (
    Object.prototype.hasOwnProperty.call(subs, key) ? String(subs[key]) : m
  ));
}

app.get('/', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').type('html').send(render('index.html', pickLang(req)));
  } catch (err) {
    console.error(`[${SERVICE}] player render failed:`, err.message);
    res.status(500).type('text').send('player unavailable');
  }
});

app.get(['/history', '/historial'], (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').type('html').send(render('history.html', pickLang(req)));
  } catch (err) {
    console.error(`[${SERVICE}] history render failed:`, err.message);
    res.status(500).type('text').send('history unavailable');
  }
});

app.use((req, res) => res.status(404).json({ error: 'not found', service: SERVICE }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${SERVICE}] unhandled:`, err.message);
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'malformed JSON body' });
  }
  res.status(500).json({ error: 'internal error', service: SERVICE });
});

module.exports = app;
// Resolves once the session store has settled on a backend. Nothing waits on
// this to serve traffic — it exists so SIT can assert the Postgres path rather
// than racing it and silently testing the memory fallback.
module.exports.ready = ready;
module.exports.VERSION = VERSION;
module.exports.SERVICE = SERVICE;
module.exports.SHELL = SHELL;
