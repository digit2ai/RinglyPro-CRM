// =====================================================
// RoboNegotiate — Express sub-app
// "Insider intelligence that turns robotic surgery contracts into savings"
//
// Auto-mounted by src/app.js at /surgical-robotics-contract-advisory-firm
// (the client-builds auto-mount loop).
//
//   GET  /health                              -> liveness + which storage backend won
//   GET  /api/v1/benchmarks                   -> defaults, provenance, watchouts (public)
//   GET|POST /api/v1/calculate                -> the model (public, stateless)
//   POST /api/v1/auth/sso                     -> exchanges a Projects Hub token
//   GET  /login                               -> the Projects handoff page
//   GET|POST /api/v1/scenarios                -> saved scenarios (JWT, tenant-scoped)
//   GET  /api/v1/scenarios/:id/export.csv     -> the model + its assumptions
//   GET  /                                    -> the five-tab app
//
// BASE-PATH INDEPENDENCE: nothing user-facing hardcodes the mount path. The
// shell carries a {{BASE}} token substituted from req.baseUrl at request time,
// so the same files serve correctly here and on robonegotiate.app later.
//
// STATIC IS MOUNTED WITH index:false ON PURPOSE. Left at the default, express
// .static answers GET / with the raw index.html and ships the {{BASE}} token to
// the browser before the substituting route ever runs.
// =====================================================

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const models = require('./models');
const { makeStore } = require('./models/store');
const model = require('./lib/model');
const access = require('./lib/access');
const authLib = require('./lib/auth');

const healthRoutes = require('./routes/health');
const benchmarkRoutes = require('./routes/benchmarks');
const calculateRoutes = require('./routes/calculate');
const authRoutes = require('./routes/auth');
const scenarioRoutes = require('./routes/scenarios');

const VERSION = '1.0.0';
const SERVICE = 'surgical-robotics-contract-advisory-firm';
const BRAND = 'RoboNegotiate';

const app = express();
app.set('etag', false);
app.use(express.json({ limit: '256kb' }));

// Connect without blocking the mount. Every route works either way.
const store = makeStore(models.state, models.models);
models.init().catch((err) => {
  console.error(`[${SERVICE}] init error:`, err.message);
});

// The mount path, discovered rather than assumed. Falls back to the known slug
// for the rare caller (the SIT harness driving the router directly) that has no
// baseUrl to read.
let discoveredBase = `/${SERVICE}`;
app.use((req, _res, next) => {
  if (req.baseUrl) discoveredBase = req.baseUrl;
  next();
});
const mountPath = () => discoveredBase;

app.use(access.securityHeaders);

// =====================================================
// THE GATE.
//
// At the `private` level (the default) nothing is reachable without a session
// except liveness, the sign-in flow, and the two assets the sign-in page needs
// to render. The model, the benchmarks, the saved scenarios and the whole
// five-tab shell are all behind it.
//
// This sits ABOVE every route and above express.static deliberately. A gate
// applied per-route is a gate somebody forgets to apply to the next route;
// a gate applied to static separately is a gate that misses the file someone
// drops into public/ next month. One chokepoint, allow-listed.
//
// A browser navigation gets a redirect to the sign-in page. An API call gets
// 401 JSON. Telling the two apart by Accept header keeps fetch() callers from
// receiving an HTML login page where they expected data.
// =====================================================
app.use((req, res, next) => {
  if (!access.isPrivate()) return next();
  if (access.isOpenPath(req.path)) return next();

  const token = authLib.bearerFrom(req);
  if (token && authLib.verifySession(token)) return next();

  const wantsJson = req.path.startsWith('/api/')
    || String(req.headers.accept || '').includes('application/json')
    || String(req.headers['x-requested-with'] || '') === 'XMLHttpRequest';

  if (wantsJson) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  return res.redirect(302, `${req.baseUrl || ''}/login`);
});

app.use(healthRoutes({
  version: VERSION,
  service: SERVICE,
  store,
  dbState: models.state,
  modelVersion: model.MODEL_VERSION,
}));
app.use(benchmarkRoutes());
app.use(calculateRoutes());
app.use(authRoutes({ store, mountPath }));
app.use(scenarioRoutes({ store }));

// Static assets. index:false — see the header note.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
}));

const pageCache = new Map();
function readPage(file) {
  if (!pageCache.has(file) || process.env.NODE_ENV !== 'production') {
    pageCache.set(file, fs.readFileSync(path.join(__dirname, 'public', file), 'utf8'));
  }
  return pageCache.get(file);
}

function renderShell(req, file) {
  const base = req.baseUrl || `/${SERVICE}`;
  return readPage(file)
    .split('{{BASE}}').join(base)
    .split('{{BRAND}}').join(BRAND)
    .split('{{VERSION}}').join(VERSION)
    .split('{{MODEL_VERSION}}').join(model.MODEL_VERSION);
}

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderShell(req, 'index.html'));
});

app.get('/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  // Already signed in: skip the gate page rather than inviting a second session.
  const token = authLib.bearerFrom(req);
  if (access.isPrivate() && token && authLib.verifySession(token)) {
    return res.redirect(302, `${req.baseUrl || ''}/`);
  }
  return res.type('html').send(renderShell(req, 'login.html'));
});

// Trailing-slash and direct-file variants land on the same rendered shell
// rather than on the un-substituted static file.
app.get('/index.html', (req, res) => res.redirect(302, `${req.baseUrl || ''}/`));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  return res.redirect(302, `${req.baseUrl || ''}/`);
});

module.exports = app;
module.exports.VERSION = VERSION;
module.exports.SERVICE = SERVICE;
module.exports.BRAND = BRAND;
