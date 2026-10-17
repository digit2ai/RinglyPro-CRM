'use strict';
/**
 * MaraPet — ISTC x Digit2AI canine health monitoring.
 *
 * ISTC owns the device (board, firmware, enclosure, certification, manufacture).
 * Digit2AI owns this half: the app, the cloud, the ingest contract and the AI.
 * The alliance is named "ISTC x Digit2AI" on every surface, in that order.
 *
 * DEVICE-AGNOSTIC BY CONSTRUCTION. Every reading enters through ONE contract
 * (src/ingest.js). ISTC's board, an off-the-shelf collar, a China ODM module,
 * the in-browser video breathing counter and a human typing a number are five
 * sources of the same shape, and nothing downstream knows which produced a row.
 *
 * Served at:
 *   marapet.app/           (host handler in src/app.js calls this with baseUrl '')
 *   aiagent.ringlypro.com/marapet/
 * Nothing below hardcodes the prefix: pages carry {{BASE}}, the manifest and the
 * worker are generated per root.
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const dbm = require('./db');
const auth = require('./auth');
const devices = require('./devices');
const ingest = require('./ingest');
const bands = require('./bands');
const report = require('./report');
const breathing = require('./services/breathing');
const pwa = require('./pwa');

const router = express.Router();

/**
 * EVERY ASYNC HANDLER IN THIS ROUTER IS WRAPPED, IN ONE PLACE.
 *
 * Express 4 does not catch a rejected async handler. This repo has no error
 * middleware in front of its verticals, and src/server.js escalates
 * `unhandledRejection` into a graceful shutdown — so ONE unexpected throw in
 * ONE route here takes down the whole CRM: every vertical, every tenant. A
 * malformed signup body was enough to do it.
 *
 * Patching the registration methods rather than wrapping each handler by hand
 * means a route added later is covered by default. Forgetting one is how this
 * class of bug comes back.
 */
function safe(fn) {
  if (typeof fn !== 'function' || fn.length > 3) return fn;
  const wrapped = function (req, res, next) {
    let out;
    try { out = fn(req, res, next); } catch (e) { return next(e); }
    if (out && typeof out.catch === 'function') out.catch(next);
    return out;
  };
  Object.defineProperty(wrapped, 'length', { value: fn.length });
  return wrapped;
}
for (const method of ['get', 'post', 'patch', 'put', 'delete', 'all']) {
  const original = router[method].bind(router);
  router[method] = (path, ...handlers) => original(path, ...handlers.map(safe));
}

/* ───────────────────────── limits, in memory per instance ───────────────── */
const buckets = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  if (buckets.size > 20000) {               // bounded: a key per device, per IP
    for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  }
  return b.n <= max;
}
function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown';
}
const N = (v) => (Number.isInteger(v) ? v : parseInt(String(v), 10));
function id(v) { const n = N(v); return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : null; }

/* ───────────────────────── static + body parsers ───────────────────────── */
// index:false — without it, static answers '/' with the raw shell and ships
// {{BASE}} tokens straight to the browser.
router.use(express.static(pwa.PUBLIC_DIR, {
  index: false,
  setHeaders(res, file) {
    if (/\.(woff2|png|svg)$/.test(file)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

// THESE CAPS ARE REAL ONLY WHEN THIS ROUTER PARSES THE BODY, AND ON THE CRM
// HOST IT DOES NOT. src/app.js mounts a global express.json({limit:'500mb'})
// hundreds of lines above the /marapet mount, body-parser skips when req._body
// is already set, and so a tighter cap declared here never runs — exactly the
// dead-code trap recorded for RinglyPro Lite, re-occurring in the comment that
// cites it. The parsers stay because on marapet.app this router IS the first to
// see the body; the hard ceiling below is what actually holds on both roots.
router.use('/api/v1/readings', express.json({ limit: process.env.MARAPET_INGEST_LIMIT || '256kb' }));
router.use('/api/v1/pets/:petId/breathing', express.json({ limit: '512kb' }));
router.use(express.json({ limit: '128kb' }));

const MAX_BODY = { '/api/v1/readings': 256 * 1024, breathing: 512 * 1024, default: 128 * 1024 };
router.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object') return next();
  const cap = /\/breathing$/.test(req.path) ? MAX_BODY.breathing
    : req.path.startsWith('/api/v1/readings') ? MAX_BODY['/api/v1/readings']
    : MAX_BODY.default;
  let size = 0;
  try { size = Buffer.byteLength(JSON.stringify(req.body)); } catch (_) { return next(); }
  if (size > cap) return res.status(413).json({ error: 'body_too_large', max_bytes: cap });
  next();
});

function noStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
}

/* ───────────────────────── health (open, config only) ──────────────────── */
router.get('/health', async (req, res) => {
  const out = {
    service: 'marapet',
    alliance: 'ISTC x Digit2AI',
    is_medical_device: false,
    disclaimer: 'MaraPet is a wellness aid, not a medical device. It diagnoses nothing.',
    base: pwa.base(req),
    shell_version: pwa.SHELL_VERSION,
    database_configured: dbm.configured(),
    sessions_configured: auth.configured(),
    model_configured: require('./llm').aiEnabled(),
    metrics_accepted: ingest.metricNames(),
    sources_accepted: ingest.SOURCES,
    not_built: [
      'No MaraPet device exists yet; ISTC owns the hardware half.',
      'Blood pressure is deliberately not in the data model: canine BP is a cuff measurement, not a continuous wearable reading.',
      'The video breathing estimate has NOT been validated against a vet with a stopwatch. It is labelled an estimate everywhere it appears.',
      'No accuracy, sensitivity or specificity figure is published, because no such study has been run.'
    ]
  };
  if (dbm.configured()) {
    try {
      const r = await dbm.one('SELECT COUNT(*)::int AS n FROM mp_accounts');
      out.accounts = r ? r.n : 0;
      out.database = 'ok';
    } catch (e) {
      // The MESSAGE is not published: a pg/Sequelize failure routinely carries
      // the internal host, port or role name, and this endpoint is open.
      out.database = 'error';
      console.error('[marapet] health database check failed:', e.message);
    }
  }
  noStore(res);
  res.json(out);
});

/* ───────────────────────── pages ───────────────────────── */
router.get('/', (req, res) => pwa.page(req, res, 'index.html'));
router.get('/login', (req, res) => { noStore(res); pwa.page(req, res, 'login.html'); });
router.get('/app', (req, res) => { noStore(res); pwa.page(req, res, 'app.html'); });
router.get('/offline', (req, res) => pwa.page(req, res, 'offline.html'));
router.get('/how-it-works', (req, res) => pwa.page(req, res, 'how-it-works.html'));

router.get('/manifest.webmanifest', (req, res) => {
  res.set('Content-Type', 'application/manifest+json; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.send(JSON.stringify(pwa.manifest(req), null, 2));
});
router.get('/sw.js', (req, res) => {
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.set('Service-Worker-Allowed', (pwa.base(req) || '/') + (pwa.base(req) ? '/' : ''));
  res.send(pwa.serviceWorker(req));
});

/* ───────────────────────── auth API ───────────────────────── */
router.post('/api/v1/auth/signup', async (req, res) => {
  if (!limit('signup:' + ipOf(req), 10, 60 * 60 * 1000)) return res.status(429).json({ error: 'too_many_attempts' });
  if (!auth.configured()) return res.status(503).json({ error: 'sessions_not_configured' });
  const { email, password, name, lang } = req.body || {};
  const r = await auth.signup({ email, password, name, lang });
  if (r.error) return res.status(400).json(r);
  auth.setCookie(res, r.account, pwa.base(req));
  noStore(res);
  res.status(201).json({ account: r.account });
});

router.post('/api/v1/auth/login', async (req, res) => {
  const ip = ipOf(req);
  const em = auth.normalizeEmail((req.body || {}).email);
  // Per IP AND per email: the forwarded header can be spoofed against Render.
  if (!limit('login:ip:' + ip, 20, 15 * 60 * 1000)) return res.status(429).json({ error: 'too_many_attempts' });
  if (!limit('login:em:' + em, 10, 15 * 60 * 1000)) return res.status(429).json({ error: 'too_many_attempts' });
  if (!auth.configured()) return res.status(503).json({ error: 'sessions_not_configured' });
  const r = await auth.login({ email: em, password: (req.body || {}).password });
  if (r.error) return res.status(401).json({ error: 'bad_credentials' });
  auth.setCookie(res, r.account, pwa.base(req));
  noStore(res);
  res.json({ account: r.account });
});

router.post('/api/v1/auth/logout', (req, res) => {
  auth.clearCookie(res, pwa.base(req));
  noStore(res);
  res.json({ ok: true });
});

router.get('/api/v1/auth/me', async (req, res) => {
  noStore(res);
  const acct = await auth.current(req).catch(() => null);
  if (!acct) return res.status(401).json({ error: 'not_signed_in' });
  res.json({ account: acct });
});

/* ───────────────────────── everything below needs a session ────────────── */
const signedIn = auth.required();

/** Resolve :petId within the caller's own tenant, else 404 (never 403). */
async function ownPet(req, res) {
  const petId = id(req.params.petId);
  if (!petId) { res.status(404).json({ error: 'not_found' }); return null; }
  const pet = await dbm.one(
    `SELECT id, tenant_id, account_id, name, breed, breed_size, birth_date,
            weight_kg, sex, neutered, conditions, created_at
       FROM mp_pets WHERE tenant_id = :t AND id = :id AND archived_at IS NULL`,
    { t: req.mp.tenant_id, id: petId }
  );
  if (!pet) { res.status(404).json({ error: 'not_found' }); return null; }
  return pet;
}

/* ---- pets ---- */
router.get('/api/v1/pets', signedIn, async (req, res) => {
  noStore(res);
  const rows = await dbm.q(
    `SELECT id, name, breed, breed_size, birth_date, weight_kg, sex, neutered, conditions, created_at
       FROM mp_pets WHERE tenant_id = :t AND archived_at IS NULL ORDER BY created_at`,
    { t: req.mp.tenant_id }
  );
  res.json({ pets: rows });
});

const SEXES = ['male', 'female', 'unknown'];
function petFields(body) {
  const out = {};
  const b = body || {};
  if (b.name != null) out.name = String(b.name).trim().slice(0, 80);
  if (b.breed != null) out.breed = String(b.breed).trim().slice(0, 80) || null;
  if (b.breed_size != null) {
    const v = String(b.breed_size);
    if (!bands.SIZES.includes(v)) return { error: 'breed_size_invalid', allowed: bands.SIZES };
    out.breed_size = v;
  }
  if (b.birth_date != null) {
    const v = String(b.birth_date).slice(0, 10);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: 'birth_date_invalid' };
    const t = v ? new Date(v) : null;
    if (t && (Number.isNaN(t.getTime()) || t > new Date())) return { error: 'birth_date_invalid' };
    out.birth_date = v || null;
  }
  if (b.weight_kg != null && b.weight_kg !== '') {
    const w = Number(b.weight_kg);
    if (!Number.isFinite(w) || w <= 0 || w > 150) return { error: 'weight_invalid' };
    out.weight_kg = Math.round(w * 100) / 100;
  }
  if (b.sex != null) {
    const v = String(b.sex);
    if (!SEXES.includes(v)) return { error: 'sex_invalid', allowed: SEXES };
    out.sex = v;
  }
  // An unanswered yes/no stays NULL. Defaulting it to false reads as answered,
  // which is how a new profile reported 13% complete in JobMD.
  if (b.neutered !== undefined) {
    out.neutered = b.neutered === null || b.neutered === '' ? null : Boolean(b.neutered);
  }
  if (b.conditions != null) out.conditions = String(b.conditions).trim().slice(0, 1000) || null;
  return out;
}

router.post('/api/v1/pets', signedIn, async (req, res) => {
  noStore(res);
  const f = petFields(req.body);
  if (f.error) return res.status(400).json(f);
  if (!f.name) return res.status(400).json({ error: 'name_required' });
  const count = await dbm.one(
    'SELECT COUNT(*)::int AS n FROM mp_pets WHERE tenant_id = :t AND archived_at IS NULL',
    { t: req.mp.tenant_id }
  );
  if (count && count.n >= 25) return res.status(400).json({ error: 'too_many_pets' });
  const rows = await dbm.run(
    `INSERT INTO mp_pets (tenant_id, account_id, name, breed, breed_size, birth_date, weight_kg, sex, neutered, conditions)
     VALUES (:t, :a, :name, :breed, :breed_size, CAST(:birth_date AS DATE), :weight_kg, :sex, :neutered, :conditions)
     RETURNING id, name, breed, breed_size, birth_date, weight_kg, sex, neutered, conditions, created_at`,
    {
      t: req.mp.tenant_id, a: req.mp.id,
      name: f.name, breed: f.breed || null, breed_size: f.breed_size || null,
      birth_date: f.birth_date || null, weight_kg: f.weight_kg == null ? null : f.weight_kg,
      sex: f.sex || null, neutered: f.neutered === undefined ? null : f.neutered,
      conditions: f.conditions || null
    }
  );
  await dbm.event(req.mp.tenant_id, req.mp.id, 'pet.created', { pet_id: rows[0].id });
  res.status(201).json({ pet: rows[0] });
});

router.patch('/api/v1/pets/:petId', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  const f = petFields(req.body);
  if (f.error) return res.status(400).json(f);
  const keys = Object.keys(f);
  if (!keys.length) return res.json({ pet });
  const sets = keys.map((k) => (k === 'birth_date' ? `${k} = CAST(:${k} AS DATE)` : `${k} = :${k}`));
  const rows = await dbm.run(
    `UPDATE mp_pets SET ${sets.join(', ')}
      WHERE tenant_id = :t AND id = :id
      RETURNING id, name, breed, breed_size, birth_date, weight_kg, sex, neutered, conditions, created_at`,
    Object.assign({ t: req.mp.tenant_id, id: pet.id }, f)
  );
  res.json({ pet: rows[0] });
});

/* ---- today ---- */
router.get('/api/v1/pets/:petId/today', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  const b = bands.forPet(pet);
  const latest = await dbm.q(
    `SELECT DISTINCT ON (metric) metric, value, source, confidence, recorded_at
       FROM mp_readings
      WHERE tenant_id = :t AND pet_id = :p AND recorded_at > NOW() - INTERVAL '36 hours'
      ORDER BY metric, recorded_at DESC`,
    { t: req.mp.tenant_id, p: pet.id }
  );
  const metrics = latest.map((r) => ({
    metric: r.metric,
    value: Number(r.value),
    source: r.source,
    confidence: r.confidence,
    recorded_at: r.recorded_at,
    unit: (ingest.METRICS[r.metric] || {}).unit || null,
    band: b[r.metric] || null,
    status: bands.classify(r.metric, r.value, b)
  }));
  // metrics is EMPTY when nothing has been recorded. The screen then says
  // "not connected" — it never shows a sample number.
  res.json({
    pet, metrics, bands: b,
    has_data: metrics.length > 0,
    disclaimer_key: 'not_a_medical_device'
  });
});

/* ---- trends ---- */
const WINDOWS = {
  hour: { interval: '1 hour',  bucket: '1 minute' },
  day:  { interval: '1 day',   bucket: '15 minutes' },
  week: { interval: '7 days',  bucket: '3 hours' }
};
router.get('/api/v1/pets/:petId/trends', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  const key = String(req.query.window || 'day');
  // hasOwnProperty, not truthiness: window=constructor inherits from the
  // prototype and would otherwise reach the query with undefined replacements.
  if (!Object.prototype.hasOwnProperty.call(WINDOWS, key)) {
    return res.status(400).json({ error: 'unknown_window', allowed: Object.keys(WINDOWS) });
  }
  const w = WINDOWS[key];
  const metric = String(req.query.metric || '');
  if (!Object.prototype.hasOwnProperty.call(ingest.METRICS, metric)) {
    return res.status(400).json({ error: 'unknown_metric', allowed: ingest.metricNames() });
  }
  const rows = await dbm.q(
    `SELECT date_bin(CAST(:bucket AS INTERVAL), recorded_at, TIMESTAMPTZ '2000-01-01') AS t,
            AVG(value)::numeric(10,2) AS value, COUNT(*)::int AS samples,
            MIN(source) AS source, MIN(confidence) AS confidence
       FROM mp_readings
      WHERE tenant_id = :t AND pet_id = :p AND metric = :metric
        AND recorded_at > NOW() - CAST(:interval AS INTERVAL)
      GROUP BY 1 ORDER BY 1`,
    { t: req.mp.tenant_id, p: pet.id, metric, bucket: w.bucket, interval: w.interval }
  ).catch(async () => dbm.q(
    // date_bin needs Postgres 14+. Fall back rather than failing the screen.
    `SELECT recorded_at AS t, value, 1 AS samples, source, confidence
       FROM mp_readings
      WHERE tenant_id = :t AND pet_id = :p AND metric = :metric
        AND recorded_at > NOW() - CAST(:interval AS INTERVAL)
      ORDER BY recorded_at`,
    { t: req.mp.tenant_id, p: pet.id, metric, interval: w.interval }
  ));
  const b = bands.forPet(pet);
  res.json({
    metric, window: key,
    unit: (ingest.METRICS[metric] || {}).unit || null,
    band: b[metric] || null,
    points: rows.map((r) => ({
      t: r.t, value: Number(r.value), samples: Number(r.samples),
      source: r.source, confidence: r.confidence
    }))
  });
});

/* ---- alert rules ---- */
router.get('/api/v1/pets/:petId/alert-rules', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  const rows = await dbm.q(
    `SELECT id, metric, min_value, max_value, enabled FROM mp_alert_rules
      WHERE tenant_id = :t AND pet_id = :p ORDER BY metric`,
    { t: req.mp.tenant_id, p: pet.id }
  );
  res.json({
    rules: rows,
    note: 'An alert is evaluated when a reading arrives, which is at the device storage interval, not in real time.'
  });
});

router.post('/api/v1/pets/:petId/alert-rules', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  const { metric, min_value, max_value, enabled } = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(ingest.METRICS, String(metric))) {
    return res.status(400).json({ error: 'unknown_metric', allowed: ingest.metricNames() });
  }
  const lo = min_value === null || min_value === '' || min_value === undefined ? null : Number(min_value);
  const hi = max_value === null || max_value === '' || max_value === undefined ? null : Number(max_value);
  if (lo !== null && !Number.isFinite(lo)) return res.status(400).json({ error: 'min_invalid' });
  if (hi !== null && !Number.isFinite(hi)) return res.status(400).json({ error: 'max_invalid' });
  if (lo === null && hi === null) return res.status(400).json({ error: 'need_a_limit' });
  if (lo !== null && hi !== null && lo >= hi) return res.status(400).json({ error: 'min_above_max' });
  const rows = await dbm.run(
    `INSERT INTO mp_alert_rules (tenant_id, pet_id, metric, min_value, max_value, enabled)
     VALUES (:t, :p, :metric, :lo, :hi, :en)
     ON CONFLICT (tenant_id, pet_id, metric) DO UPDATE
       SET min_value = EXCLUDED.min_value, max_value = EXCLUDED.max_value, enabled = EXCLUDED.enabled
     RETURNING id, metric, min_value, max_value, enabled`,
    { t: req.mp.tenant_id, p: pet.id, metric: String(metric), lo, hi, en: enabled === false ? false : true }
  );
  res.json({ rule: rows[0] });
});

router.get('/api/v1/pets/:petId/alerts', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  const rows = await dbm.q(
    `SELECT id, metric, value, direction, fired_at, read_at FROM mp_alerts
      WHERE tenant_id = :t AND pet_id = :p ORDER BY fired_at DESC LIMIT 100`,
    { t: req.mp.tenant_id, p: pet.id }
  );
  res.json({ alerts: rows, unread: rows.filter((r) => !r.read_at).length });
});

router.post('/api/v1/alerts/read', signedIn, async (req, res) => {
  noStore(res);
  await dbm.run(
    'UPDATE mp_alerts SET read_at = NOW() WHERE tenant_id = :t AND read_at IS NULL',
    { t: req.mp.tenant_id }
  );
  res.json({ ok: true });
});

/* ---- report ---- */
router.get('/api/v1/pets/:petId/report', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  if (!limit('report:' + req.mp.tenant_id, 60, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too_many_requests' });
  }
  const lang = String(req.query.lang || req.mp.lang || 'en') === 'es' ? 'es' : 'en';
  // The shape check is not enough: 9999-99-99 matches it and then throws in the
  // database. Parse it and require it to be a real calendar date.
  const rawDate = String(req.query.date || '');
  let date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const d = new Date(rawDate + 'T00:00:00Z');
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === rawDate) date = rawDate;
    else return res.status(400).json({ error: 'date_invalid' });
  }
  const r = await report.build({
    tenant_id: req.mp.tenant_id, pet_id: pet.id, lang, date,
    force: String(req.query.refresh || '') === '1'
  });
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json(r);
});

/* ---- manual reading ---- */
router.post('/api/v1/pets/:petId/readings', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  if (!limit('manual:' + req.mp.tenant_id, 300, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too_many_requests' });
  }
  const raw = Array.isArray((req.body || {}).samples) ? req.body.samples : [req.body || {}];
  const samples = raw.slice(0, 50).map((s) => Object.assign({}, s, { source: 'manual', confidence: null }));
  const r = await ingest.accept({ tenant_id: req.mp.tenant_id, pet_id: pet.id, device_id: null, samples });
  // THE ACCEPTED ROWS, NOT THE RAW SAMPLES. Feeding the request body straight to
  // the alert engine let a value the ingest contract had just REFUSED as
  // physically impossible still fire and persist an alert that no stored
  // reading supports.
  const fired = await ingest.evaluateAlerts({ tenant_id: req.mp.tenant_id, pet_id: pet.id, samples: r.stored_rows });
  res.json(Object.assign(r, { alerts_fired: fired.length, stored_rows: undefined }));
});

/* ---- breathing from video ---- */
router.post('/api/v1/pets/:petId/breathing', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  if (!limit('breathing:' + req.mp.tenant_id, 120, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too_many_requests' });
  }
  const body = req.body || {};
  const series = Array.isArray(body.series) ? body.series.map(Number) : null;
  const fps = Number(body.fps);
  if (!series || !series.length) return res.status(400).json({ error: 'series_required' });
  if (series.length > 20000) return res.status(400).json({ error: 'series_too_long' });
  if (!Number.isFinite(fps) || fps < 5 || fps > 120) return res.status(400).json({ error: 'fps_invalid' });
  if (series.some((v) => !Number.isFinite(v))) return res.status(400).json({ error: 'series_not_numeric' });

  // The VIDEO never reaches this server — only the brightness series the phone
  // extracted on-device. A recording of the inside of someone's home is not
  // ours to hold.
  const est = breathing.estimate(series, fps);
  if (!est.ok) {
    // No number, and the reason said out loud. A plausible wrong breathing rate
    // is worse than none: the owner would act on it.
    return res.status(200).json({
      measured: false, reason: est.reason, detail: est,
      message_key: 'breathing_could_not_measure'
    });
  }
  const sample = {
    metric: 'resp_rate_bpm', value: est.bpm, source: 'video',
    confidence: est.confidence, recorded_at: new Date().toISOString()
  };
  const stored = await ingest.accept({
    tenant_id: req.mp.tenant_id, pet_id: pet.id, device_id: null, samples: [sample]
  });
  const fired = await ingest.evaluateAlerts({ tenant_id: req.mp.tenant_id, pet_id: pet.id, samples: [sample] });
  const b = bands.forPet(pet);
  res.json({
    measured: true,
    bpm: est.bpm,
    confidence: est.confidence,
    seconds: est.seconds,
    status: bands.classify('resp_rate_bpm', est.bpm, b),
    band: b.resp_rate_bpm || null,
    source: 'video',
    label_key: 'estimate_from_video',
    stored: stored.stored,
    alerts_fired: fired.length
  });
});

/* ---- devices ---- */
router.get('/api/v1/devices', signedIn, async (req, res) => {
  noStore(res);
  res.json({
    devices: await devices.list({ tenant_id: req.mp.tenant_id }),
    ingest_url: (process.env.MARAPET_INGEST_URL
      || ((process.env.MARAPET_PUBLIC_URL || 'https://marapet.app') + '/api/v1/readings')),
    note: 'A device key may write readings and read nothing back. It is shown once, at creation.'
  });
});

router.post('/api/v1/devices', signedIn, async (req, res) => {
  noStore(res);
  const { label, pet_id, hardware_id } = req.body || {};
  let petId = null;
  if (pet_id != null && pet_id !== '') {
    petId = id(pet_id);
    if (!petId) return res.status(400).json({ error: 'pet_invalid' });
    const owned = await dbm.one(
      'SELECT id FROM mp_pets WHERE tenant_id = :t AND id = :p AND archived_at IS NULL',
      { t: req.mp.tenant_id, p: petId }
    );
    if (!owned) return res.status(404).json({ error: 'not_found' });
  }
  const count = await dbm.one(
    'SELECT COUNT(*)::int AS n FROM mp_devices WHERE tenant_id = :t AND revoked_at IS NULL',
    { t: req.mp.tenant_id }
  );
  if (count && count.n >= 50) return res.status(400).json({ error: 'too_many_devices' });
  const r = await devices.create({
    tenant_id: req.mp.tenant_id, account_id: req.mp.id,
    pet_id: petId, label, hardware_id
  });
  res.status(201).json({
    device: r.device,
    key: r.key,
    key_shown_once: true,
    note: 'Store this key in the device now. It is hashed here and cannot be shown again.'
  });
});

router.delete('/api/v1/devices/:id', signedIn, async (req, res) => {
  noStore(res);
  const devId = id(req.params.id);
  if (!devId) return res.status(404).json({ error: 'not_found' });
  const ok = await devices.revoke({ tenant_id: req.mp.tenant_id, id: devId });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  await dbm.event(req.mp.tenant_id, req.mp.id, 'device.revoked', { device_id: devId });
  res.json({ ok: true });
});

/* ───────────────────── THE INGEST CONTRACT (device key) ────────────────── */
/**
 * The one door every reading enters by. Authenticated by a DEVICE key, never a
 * session, so the credential on fifty collars can write and read nothing.
 */
function presentedKey(req) {
  const h = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
  const x = req.headers['x-marapet-key'];
  return x ? String(x).trim() : null;
}

router.get('/api/v1/ingest/ping', async (req, res) => {
  noStore(res);
  const dev = await devices.authenticate(presentedKey(req)).catch(() => null);
  if (!dev) return res.status(401).json({ error: 'bad_device_key' });
  await devices.touch(dev.id);
  res.json({
    ok: true, device: dev.label, pet_bound: dev.pet_id != null,
    server_time: new Date().toISOString(),
    metrics_accepted: ingest.metricNames()
  });
});

async function ingestHandler(req, res) {
  noStore(res);
  const key = presentedKey(req);
  if (!key) return res.status(401).json({ error: 'device_key_required' });
  if (!limit('ingest:' + require('crypto').createHash('sha256').update(key).digest('hex').slice(0, 16),
             Number(process.env.MARAPET_INGEST_PER_MIN || 120), 60 * 1000)) {
    return res.status(429).json({ error: 'too_many_requests' });
  }
  const dev = await devices.authenticate(key);
  if (!dev) return res.status(401).json({ error: 'bad_device_key' });

  // pet_id comes from the DEVICE binding, or from the body only when the device
  // is unbound — and then it must be a pet in the device's OWN tenant.
  let petId = dev.pet_id;
  if (petId == null) {
    petId = id((req.body || {}).pet_id);
    if (!petId) return res.status(400).json({ error: 'pet_id_required', detail: 'This device is not bound to a pet.' });
    const owned = await dbm.one(
      'SELECT id FROM mp_pets WHERE tenant_id = :t AND id = :p AND archived_at IS NULL',
      { t: dev.tenant_id, p: petId }
    );
    if (!owned) return res.status(404).json({ error: 'not_found' });
  }

  const body = req.body || {};
  let samples = [];
  if (Array.isArray(body.samples)) samples = body.samples;
  else if (body.metrics && typeof body.metrics === 'object') {
    // Convenience shape for firmware: {recorded_at, metrics:{heart_rate_bpm: 78}}
    samples = Object.keys(body.metrics).map((metric) => ({
      metric, value: body.metrics[metric],
      source: 'device', confidence: body.confidence || null,
      recorded_at: body.recorded_at
    }));
  }
  if (!samples.length) return res.status(400).json({ error: 'no_samples' });
  if (samples.length > 500) return res.status(400).json({ error: 'too_many_samples', max: 500 });

  // A device may only claim source 'device'. It cannot label its own reading as
  // a human-entered figure or a video estimate.
  samples = samples.map((s) => Object.assign({}, s, { source: 'device' }));

  const r = await ingest.accept({ tenant_id: dev.tenant_id, pet_id: petId, device_id: dev.id, samples });
  await devices.touch(dev.id);
  if (body.firmware) {
    await dbm.run('UPDATE mp_devices SET firmware = :f WHERE id = :id',
      { f: String(body.firmware).slice(0, 60), id: dev.id }).catch(() => {});
  }
  // The accepted rows, never the raw body: a refused value must not be able to
  // fire an alert that no stored reading supports.
  const fired = await ingest.evaluateAlerts({ tenant_id: dev.tenant_id, pet_id: petId, samples: r.stored_rows });
  // Every sample gets an answer, accepted or rejected with the reason: a silent
  // drop means the device never learns which of its readings vanished.
  res.status(r.stored ? 201 : 200).json(Object.assign(r, { alerts_fired: fired.length, stored_rows: undefined }));
}
router.post('/api/v1/readings', ingestHandler);
router.post('/api/v1/readings/batch', ingestHandler);

/* ───────────────────────── vet share link ───────────────────────── */
router.post('/api/v1/pets/:petId/share', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  const days = Math.min(90, Math.max(1, N((req.body || {}).days) || 14));
  const token = crypto.randomBytes(24).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const rows = await dbm.run(
    `INSERT INTO mp_share_links (tenant_id, pet_id, token_hash, from_date, to_date, expires_at)
     VALUES (:t, :p, :h, CURRENT_DATE - CAST(:days AS INT), CURRENT_DATE, NOW() + INTERVAL '30 days')
     RETURNING id, from_date, to_date, expires_at`,
    { t: req.mp.tenant_id, p: pet.id, h: hash, days }
  );
  const b = pwa.base(req);
  const origin = process.env.MARAPET_PUBLIC_URL || 'https://marapet.app';
  res.status(201).json({
    link: rows[0],
    // The token is returned to THIS response only; the row stores a hash.
    url: `${origin}${b}/r/${token}`,
    note: 'Anyone holding this link can read the range. It carries no owner name, email or phone.'
  });
});

router.get('/api/v1/public/share/:token', async (req, res) => {
  noStore(res);
  if (!limit('share:' + ipOf(req), 60, 60 * 1000)) return res.status(429).json({ error: 'too_many_requests' });
  const raw = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(raw)) return res.status(404).json({ error: 'not_found' });
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const link = await dbm.one(
    `SELECT tenant_id, pet_id, from_date, to_date FROM mp_share_links
      WHERE token_hash = :h AND revoked_at IS NULL AND expires_at > NOW()`,
    { h: hash }
  );
  if (!link) return res.status(404).json({ error: 'not_found' });
  const pet = await dbm.one(
    `SELECT name, breed, breed_size, birth_date, weight_kg, sex FROM mp_pets
      WHERE tenant_id = :t AND id = :p`,
    { t: link.tenant_id, p: link.pet_id }
  );
  const rows = await dbm.q(
    `SELECT metric, COUNT(*)::int AS samples,
            AVG(value)::numeric(10,2) AS avg, MIN(value)::numeric(10,2) AS min,
            MAX(value)::numeric(10,2) AS max, MIN(source) AS source
       FROM mp_readings
      WHERE tenant_id = :t AND pet_id = :p
        AND recorded_at >= :from AND recorded_at < CAST(:to AS DATE) + INTERVAL '1 day'
      GROUP BY metric ORDER BY metric`,
    { t: link.tenant_id, p: link.pet_id, from: link.from_date, to: link.to_date }
  );
  // Deliberately NOT included: the owner's name, email, phone or account id. A
  // link that travels reaches more inboxes than whoever minted it expects.
  res.json({
    pet, from: link.from_date, to: link.to_date,
    summary: rows.map((r) => ({
      metric: r.metric, samples: Number(r.samples),
      avg: Number(r.avg), min: Number(r.min), max: Number(r.max), source: r.source,
      unit: (ingest.METRICS[r.metric] || {}).unit || null
    })),
    disclaimer: 'MaraPet is a wellness aid, not a medical device. These figures are not a diagnosis.'
  });
});

/** The share page tells a vet a link may have been revoked, so revoking has to
 *  be something the owner can actually do. */
router.get('/api/v1/pets/:petId/share', signedIn, async (req, res) => {
  noStore(res);
  const pet = await ownPet(req, res); if (!pet) return;
  const rows = await dbm.q(
    `SELECT id, from_date, to_date, created_at, expires_at, revoked_at
       FROM mp_share_links WHERE tenant_id = :t AND pet_id = :p
      ORDER BY created_at DESC, id DESC LIMIT 50`,
    { t: req.mp.tenant_id, p: pet.id }
  );
  // The tokens themselves are never returned — they are hashed at rest and a
  // capability URL that a read endpoint hands back is no longer a capability.
  res.json({ links: rows });
});

router.delete('/api/v1/share/:id', signedIn, async (req, res) => {
  noStore(res);
  const linkId = id(req.params.id);
  if (!linkId) return res.status(404).json({ error: 'not_found' });
  const rows = await dbm.run(
    `UPDATE mp_share_links SET revoked_at = NOW()
      WHERE tenant_id = :t AND id = :id AND revoked_at IS NULL
      RETURNING id`,
    { t: req.mp.tenant_id, id: linkId }
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  await dbm.event(req.mp.tenant_id, req.mp.id, 'share.revoked', { link_id: linkId });
  res.json({ ok: true });
});

router.get('/r/:token', (req, res) => { noStore(res); pwa.page(req, res, 'share.html'); });

/* ───────────────────────── errors stop here ───────────────────────── */
// Without this an unexpected throw reaches src/server.js's unhandledRejection
// handler, which shuts the whole CRM down. The detail is logged, never sent.
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // body-parser throws its own size error before our ceiling can see the body.
  // That is a 413 with a reason, not an opaque 500 — a device needs to know its
  // batch was too big, not that something unspecified went wrong.
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'body_too_large' });
  }
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    return res.status(400).json({ error: 'malformed_json' });
  }
  console.error('[marapet] unhandled error on', req.method, req.originalUrl, '-', err && err.message);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'server_error' });
  res.status(500).type('text').send('MaraPet hit an error handling that request.');
});

/* ───────────────────────── branded 404, never the CRM ──────────────────── */
router.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
  res.status(404);
  pwa.page(req, res, '404.html');
});

module.exports = router;
module.exports.router = router;
