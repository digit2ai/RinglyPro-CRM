/* PLANEA — módulo administrativo (versión sencilla) + rutas de medición del usuario.
 *
 * QUIÉN ENTRA: los tres administradores (Manuel Stagg, Juan Bueno, Eduardo de Lima)
 * entran con SU PROPIA CUENTA DE PLANEA, y el permiso lo da una fila en planea_admins con
 * el ID de esa cuenta (scripts/planea-admins.cjs). No hay contraseña de administrador aparte ni contraseña por
 * defecto: la cuenta ya tiene bcrypt, bloqueo por intentos y restablecimiento. El
 * permiso se vuelve a leer en CADA petición, así que quitar la fila
 * corta el acceso de inmediato. Sin secreto de firma configurado, el módulo queda CERRADO.
 *
 * QUÉ SE VE Y QUÉ NO: fecha de registro, respuestas de la encuesta, Puntaje Planea por
 * pilar y si terminó el onboarding. NUNCA saldos ni montos (se eliminan de las respuestas
 * antes de salir del servidor) y nunca conversaciones con Maya (no se guardan).
 * Cada acción del administrador queda en planea_audit_log con su correo y la hora.
 *
 * MÉTRICAS: se calculan con filas reales (planea_users, planea_profiles, planea_events,
 * planea_nps). Los administradores no cuentan como usuarios de prueba. Lo que esta
 * versión no mide (bugs críticos) lo dice. En qué pregunta se abandona y cuánto tarda el
 * onboarding salen de planea_onboarding_progress, que la encuesta llena pregunta a pregunta.
 */
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const kb = require('./kb.cjs');
// portal/ vive bajo un package.json con "type":"module", así que require() de un .js
// devuelve un módulo ESM vacío. Se evalúa el MISMO archivo que usa el navegador con un
// `module` propio: una sola fuente para la tarjeta, el aviso, el servidor y la SIT.
function loadPlaneaTax() {
  const src = fs.readFileSync(path.join(__dirname, 'portal', 'planea-tax.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'self', src)(m, {});
  if (typeof m.exports.forDigits !== 'function') throw new Error('planea-tax.js no cargó');
  return m.exports;
}
const PlaneaTax = loadPlaneaTax();

const COOKIE = 'planea_admin';
const TTL_MS = 8 * 60 * 60 * 1000;
const AUD = 'planea-admin';
const PUBLISHED = ['planea-2026-secret', 'dev-only-insecure-secret', 'Digit2Ai@7', 'Palindrome@7'];
const DATA_DIR = path.join(__dirname, 'data');
const PAGE = path.join(__dirname, 'admin-ui', 'admin.html');
let DUMMY_HASH = null;
const fingerprint = (h) => require('crypto').createHash('sha256').update(String(h || '')).digest('hex').slice(0, 16);

const tenant = () => Number(process.env.PLANEA_TENANT_ID) || 1;
// QUIÉN ES ADMIN: una fila en planea_admins con el ID de su cuenta de Planea. No una
// lista de correos (un correo en lista sin cuenta se podía registrar y abrir el admin):
// el permiso va atado a una cuenta que ya existe. Solo la cuenta del dueño se siembra,
// y solo cuando la tabla está vacía; las demás se conceden con scripts/planea-admins.cjs.
const OWNER_EMAIL = 'mstagg@digit2ai.com';
let adminCount = null;
async function adminIds(sq) {
  const [rows] = await sq.query('SELECT user_id FROM planea_admins WHERE tenant_id = :t', { replacements: { t: tenant() } });
  adminCount = rows.length;
  return new Set(rows.map((r) => r.user_id));
}
function secret() {
  const s = process.env.PLANEA_ADMIN_SECRET || process.env.PLANEA_JWT_SECRET || process.env.JWT_SECRET || '';
  return s && s.length >= 16 && PUBLISHED.indexOf(s) < 0 ? s : null;
}
const reminderDays = () => { const n = Number(process.env.PLANEA_TAX_REMINDER_DAYS); return Number.isFinite(n) && n >= 0 && n <= 120 ? n : 30; };

// ── Respuestas sin montos ────────────────────────────────────────────────────
// Las respuestas de la encuesta pueden traer montos exactos opcionales (monto_ingresos,
// monto_gastos, monto_pago, montos...). Se quita cualquier clave con "monto", "saldo" o
// "valor", y por defensa cualquier número mayor a 10.000 (un monto en pesos).
const MONEY_KEY = /monto|saldo|valor|amount|pesos|cop$/i;
function sanitizeAnswers(v) {
  if (Array.isArray(v)) return v.map(sanitizeAnswers).filter((x) => x !== undefined);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach((k) => {
      if (MONEY_KEY.test(k)) return;
      const s = sanitizeAnswers(v[k]);
      if (s !== undefined) out[k] = s;
    });
    return out;
  }
  if (typeof v === 'number' && Math.abs(v) > 10000) return undefined;
  if (typeof v === 'string' && /^\s*\$?\s*\d[\d.,]{5,}\s*$/.test(v)) return undefined;
  return v;
}

function finishInfo(sd) {
  const finished = !!(sd && sd.answers && sd.answers.edad);
  if (!finished) return { finished: false, finished_at: null };
  const hist = Array.isArray(sd.history) ? sd.history : [];
  const first = hist.find((h) => h && h.source === 'onboarding' && h.at) || hist.find((h) => h && h.at);
  return { finished: true, finished_at: (first && first.at) || sd.timestamp || null };
}
// Abandono = empezó, no terminó y lleva más de ABANDON_H horas sin avanzar.
const ABANDON_H = 24;
function median(xs) { if (!xs.length) return null; const s = xs.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function cleanTitle(t) { return String(t || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 140) || null; }
function dayColombia(iso) { return iso ? PlaneaTax.todayColombia(new Date(iso)) : null; }
function addDays(day, n) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// ── Tablas nuevas (idempotentes) ─────────────────────────────────────────────
let ensured = null;
function ensureTables(sq) {
  if (!ensured) {
    ensured = (async () => {
      await sq.query(`CREATE TABLE IF NOT EXISTS planea_events (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, user_id INTEGER NOT NULL,
        event TEXT NOT NULL, day DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await sq.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_events_once_a_day ON planea_events (tenant_id, user_id, event, day)');
      await sq.query(`CREATE TABLE IF NOT EXISTS planea_nps (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, user_id INTEGER NOT NULL,
        score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await sq.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_nps_once ON planea_nps (tenant_id, user_id)');
      await sq.query(`CREATE TABLE IF NOT EXISTS planea_onboarding_progress (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, user_id INTEGER NOT NULL,
        started_at TIMESTAMPTZ, last_step INTEGER, last_key TEXT, last_title TEXT, last_step_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await sq.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_onb_user ON planea_onboarding_progress (tenant_id, user_id)');
      await sq.query(`CREATE TABLE IF NOT EXISTS planea_admins (
        id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, user_id INTEGER NOT NULL,
        granted_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await sq.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_admins_user ON planea_admins (tenant_id, user_id)');
      await sq.query(`INSERT INTO planea_admins (tenant_id, user_id, granted_by)
        SELECT :t, u.id, 'bootstrap' FROM planea_users u
         WHERE lower(u.email) = :o AND NOT EXISTS (SELECT 1 FROM planea_admins WHERE tenant_id = :t)
        ON CONFLICT DO NOTHING`, { replacements: { t: tenant(), o: OWNER_EMAIL } });
      await kb.ensure(sq);
    })().catch((e) => { ensured = null; throw e; });
  }
  return ensured;
}

// ── Calendario DIAN (tabla que Planea entrega) ───────────────────────────────
let calCache = null;
function dianTable() {
  if (calCache && Date.now() - calCache.at < 5 * 60 * 1000) return calCache.table;
  const year = +PlaneaTax.todayColombia().slice(0, 4);
  let table = null;
  try {
    const f = path.join(DATA_DIR, 'dian-calendar-' + year + '.json');
    if (fs.existsSync(f)) {
      const t = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (PlaneaTax.validTable(t)) table = { year: t.year || year, tax_year: t.tax_year || null, source: t.source || null, ranges: t.ranges };
      else console.log('planea: ' + f + ' no es una tabla DIAN válida; se usa la ventana estimada');
    }
  } catch (e) { console.log('planea: no se pudo leer la tabla DIAN:', e.message); }
  calCache = { at: Date.now(), table };
  return table;
}

function build({ backend, sec, mayaSystem, mayaModel, fetchImpl }) {
  const db = () => (backend && backend.db ? backend.db() : null);
  const ready = () => !!(backend && backend.status && backend.status().ready && db());

  async function audit(req, email, event, outcome, meta) {
    try {
      const sq = db(); if (!sq) return;
      await sq.query(
        `INSERT INTO planea_audit_log (user_id, email, event, outcome, ip_hash, user_agent, meta, created_at)
         VALUES (:u, :e, :ev, :o, :ip, :ua, CAST(:m AS JSONB), NOW())`,
        { replacements: { u: (req.admin && req.admin.uid) || null, e: email || null, ev: String(event).slice(0, 60), o: String(outcome || '').slice(0, 30), ip: sec.ipHash(req), ua: String(req.headers['user-agent'] || '').slice(0, 250), m: JSON.stringify(meta || null) } });
    } catch (e) { /* la auditoría nunca tumba la petición */ }
  }

  function readCookie(req) {
    const m = String(req.headers.cookie || '').match(/(?:^|;\s*)planea_admin=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  async function currentAdmin(req) {
    const s = secret(); if (!s) return null;
    const tok = readCookie(req); if (!tok) return null;
    let p; try { p = jwt.verify(tok, s, { audience: AUD }); } catch (e) { return null; }
    const uid = Number(p.u) || 0;
    if (!(await adminIds(db())).has(uid)) return null;       // quitar la fila corta el acceso ya
    const [rows] = await db().query('SELECT id, email, full_name, password_hash, locked_until FROM planea_users WHERE id = :u LIMIT 1', { replacements: { u: uid } });
    const email = rows[0] ? String(rows[0].email).toLowerCase() : '';
    // Cambiar la clave o bloquear la cuenta termina la sesión admin de inmediato.
    if (rows[0] && (p.f !== fingerprint(rows[0].password_hash) || sec.lockRemaining(rows[0]) > 0)) return null;
    return rows[0] ? { uid: rows[0].id, email, name: rows[0].full_name || email } : null;
  }

  const admin = express.Router();
  const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); next(); };
  admin.use(noStore);

  admin.get(['/', ''], (req, res) => {
    if (!fs.existsSync(PAGE)) return res.status(404).send('Not found');
    res.sendFile(PAGE);
  });

  const api = express.Router();
  // Cuerpo pequeño para todo; el grande (12 MB) solo en POST /kb y DESPUÉS de verificar al admin.
  const smallJson = express.json({ limit: '8kb' });
  const bigJson = express.json({ limit: '12mb' });
  api.use((req, res, next) => (req.method === 'POST' && req.path === '/kb' ? next() : smallJson(req, res, next)));
  api.use((req, res, next) => {
    if (!secret()) return res.status(503).json({ error: 'cerrado', message: 'El módulo administrativo no está configurado (falta un secreto de firma).' });
    if (!ready()) return res.status(503).json({ error: 'backend_not_ready' });
    // Toda escritura exige la cabecera propia: un formulario de otro sitio no la puede poner.
    if (req.method !== 'GET' && req.headers['x-planea-admin'] !== '1') return res.status(404).json({ error: 'not_found' });
    ensureTables(db()).then(() => next(), (e) => { console.error('[planea-admin] tablas', e.message); res.status(500).json({ error: 'error_interno' }); });
  });

  // Correo -> bloqueo simple por cuenta además del límite por IP de security.cjs.
  // Ventana de 15 minutos que se limpia sola; solo cuenta correos que SÍ son admins, para que
  // nadie deje fuera a un admin, ni llene la memoria, con intentos a correos inventados.
  const emailFails = new Map(); // email -> { n, at }
  const FAIL_WINDOW = 15 * 60 * 1000;
  const failsOf = (e) => { const f = emailFails.get(e); if (!f || Date.now() - f.at > FAIL_WINDOW) { emailFails.delete(e); return 0; } return f.n; };
  api.post('/login', sec.loginLimiter, async (req, res) => {
    const email = String((req.body && req.body.email) || '').toLowerCase().trim();
    const password = String((req.body && req.body.password) || '');
    let isAdm = false;
    const fail = (why) => { if (isAdm) { const f = emailFails.get(email); emailFails.set(email, { n: failsOf(email) + 1, at: (f && f.at) || Date.now() }); } audit(req, email, 'admin.login', why); return res.status(401).json({ error: 'Credenciales inválidas o sin permiso de administrador.' }); };
    const f = failsOf(email);
    if (f >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    if (!email || !password) return fail('fail_empty');
    const [rows] = await db().query('SELECT id, email, full_name, password_hash, locked_until FROM planea_users WHERE lower(email) = :e LIMIT 1', { replacements: { e: email } });
    const u = rows[0];
    // bcrypt se corre siempre, para que "no existe" y "clave mala" tarden lo mismo.
    if (!DUMMY_HASH) DUMMY_HASH = await bcrypt.hash('planea-no-es-una-clave-' + Date.now(), 12);
    const ok = await bcrypt.compare(password, (u && u.password_hash) || DUMMY_HASH);
    isAdm = !!u && (await adminIds(db())).has(u.id);
    if (!u || !ok) return fail(!u ? 'fail_no_user' : 'fail_password');
    if (sec.lockRemaining(u) > 0) return fail('blocked_locked');
    if (!isAdm) return fail('fail_not_admin');
    emailFails.delete(email);
    const tok = jwt.sign({ u: u.id, e: email, f: fingerprint(u.password_hash) }, secret(), { audience: AUD, expiresIn: Math.floor(TTL_MS / 1000) });
    res.cookie(COOKIE, tok, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: TTL_MS, path: '/' });
    req.admin = { uid: u.id };
    audit(req, email, 'admin.login', 'success');
    res.json({ ok: true, admin: { email, name: u.full_name || email } });
  });

  // Todo lo demás exige administrador. Sin sesión válida: 404, no 403.
  api.use(async (req, res, next) => {
    try {
      const a = await currentAdmin(req);
      if (!a) return res.status(404).json({ error: 'not_found' });
      req.admin = a; next();
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });

  api.get('/me', (req, res) => res.json({ admin: { email: req.admin.email, name: req.admin.name } }));

  api.post('/logout', (req, res) => {
    audit(req, req.admin.email, 'admin.logout', 'success');
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  async function loadPeople() {
    const sq = db();
    const [users] = await sq.query('SELECT id, email, full_name, created_at, last_login_at FROM planea_users ORDER BY created_at ASC');
    const [profiles] = await sq.query('SELECT user_id, score_data FROM planea_profiles');
    const [events] = await sq.query("SELECT user_id, event, to_char(day, 'YYYY-MM-DD') AS day FROM planea_events WHERE tenant_id = :t", { replacements: { t: tenant() } });
    const [nps] = await sq.query('SELECT user_id, score, created_at FROM planea_nps WHERE tenant_id = :t', { replacements: { t: tenant() } });
    const prof = new Map(profiles.map((p) => [p.user_id, p.score_data]));
    const npsBy = new Map(nps.map((n) => [n.user_id, n.score]));
    const evBy = new Map();
    events.forEach((e) => { if (!evBy.has(e.user_id)) evBy.set(e.user_id, []); evBy.get(e.user_id).push(e); });
    const [prog] = await sq.query('SELECT user_id, started_at, last_step, last_key, last_title, last_step_at, completed_at FROM planea_onboarding_progress WHERE tenant_id = :t', { replacements: { t: tenant() } });
    const progBy = new Map(prog.map((p) => [p.user_id, p]));
    const admins = await adminIds(sq);
    const people = users.filter((u) => !admins.has(u.id)).map((u) => {
      const sd = prof.get(u.id) || null;
      const fin = finishInfo(sd);
      const ev = evBy.get(u.id) || [];
      return { u, sd, fin, ev, nps: npsBy.has(u.id) ? npsBy.get(u.id) : null, prog: progBy.get(u.id) || null };
    });
    return { people, admins_excluded: users.length - people.length };
  }

  // ── Usuarios de prueba ──
  api.get('/users', async (req, res) => {
    try {
      const { people, admins_excluded } = await loadPeople();
      audit(req, req.admin.email, 'admin.view_users', 'success', { count: people.length });
      res.json({
        admins_excluded,
        not_measured: ['Bugs críticos'],
        users: people.map(({ u, sd, fin, ev, nps, prog }) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name || '',
          registered_at: u.created_at,
          last_login_at: u.last_login_at || null,
          onboarding: { finished: fin.finished, finished_at: fin.finished_at,
            started_at: prog && prog.started_at || null,
            minutes: prog && prog.started_at && prog.completed_at ? Math.round((new Date(prog.completed_at) - new Date(prog.started_at)) / 6000) / 10 : null,
            stopped_at: !fin.finished && prog && prog.last_step ? { step: prog.last_step, key: prog.last_key, title: prog.last_title, at: prog.last_step_at } : null },
          score: fin.finished && sd ? { score: sd.score != null ? sd.score : null, rango: sd.rango || null, pilares: sd.pilares || null } : null,
          answers: fin.finished && sd && sd.answers ? sanitizeAnswers(sd.answers) : null,
          saw_score: ev.some((e) => e.event === 'score_view'),
          days_visited: ev.filter((e) => e.event === 'visit').length,
          nps,
        })),
      });
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });

  // ── Lista de usuarios: TODAS las cuentas, solo lectura ──────────────────────
  // Todo lo que Planea sabe de cada cuenta EXCEPTO montos: de los módulos financieros
  // se muestra cuántos registros hay por categoría, nunca los valores; de las metas, cuántas.
  // Nunca la contraseña, tokens de restablecimiento, IP ni el contenido de documentos.
  // Solo GET: esta vista no tiene ninguna ruta que escriba.
  api.get('/accounts', async (req, res) => {
    try {
      const sq = db();
      const [users] = await sq.query('SELECT id, email, full_name, created_at, updated_at, last_login_at, failed_logins, locked_until FROM planea_users ORDER BY created_at DESC');
      const [profiles] = await sq.query("SELECT user_id, score_data, finance_meta, COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(goals) = 'array' THEN goals END), 0) AS goals FROM planea_profiles");
      const [items] = await sq.query('SELECT user_id, category, COUNT(*)::int AS n, MAX(updated_at) AS last FROM planea_items GROUP BY user_id, category');
      const [docs] = await sq.query('SELECT user_id, COUNT(*)::int AS n FROM planea_tax_docs GROUP BY user_id').catch(() => [[]]);
      const [logins] = await sq.query(`SELECT user_id, COUNT(*) FILTER (WHERE outcome = 'success')::int AS ok, COUNT(*) FILTER (WHERE outcome <> 'success')::int AS bad
                                          FROM planea_audit_log WHERE event = 'login' AND user_id IS NOT NULL GROUP BY user_id`);
      const [recent] = await sq.query(`SELECT user_id, event, outcome, created_at FROM (
          SELECT user_id, event, outcome, created_at, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
            FROM planea_audit_log WHERE user_id IS NOT NULL AND event NOT LIKE 'admin.%') x WHERE rn <= 10 ORDER BY created_at DESC`);
      const [events] = await sq.query('SELECT user_id, event, day FROM planea_events WHERE tenant_id = :t', { replacements: { t: tenant() } });
      const [nps] = await sq.query('SELECT user_id, score FROM planea_nps WHERE tenant_id = :t', { replacements: { t: tenant() } });
      const admins = await adminIds(sq);
      const by = (rows) => { const m = new Map(); rows.forEach((r) => { if (!m.has(r.user_id)) m.set(r.user_id, []); m.get(r.user_id).push(r); }); return m; };
      const P = new Map(profiles.map((p) => [p.user_id, p])), I = by(items), E = by(events), R = by(recent);
      const D = new Map(docs.map((d) => [d.user_id, d.n])), L = new Map(logins.map((l) => [l.user_id, l])), N = new Map(nps.map((n) => [n.user_id, n.score]));
      const out = users.map((u) => {
        const p = P.get(u.id) || {}, sd = p.score_data || null, fin = finishInfo(sd), fm = p.finance_meta || {};
        const t = fm.tributario && typeof fm.tributario === 'object' ? fm.tributario : null;
        const ev = E.get(u.id) || [], lg = L.get(u.id) || { ok: 0, bad: 0 };
        const locked = !!(u.locked_until && new Date(u.locked_until) > new Date());
        return {
          id: u.id, email: u.email, full_name: u.full_name || '', is_admin: admins.has(u.id),
          account: { registered_at: u.created_at, updated_at: u.updated_at, last_login_at: u.last_login_at || null, logins_ok: lg.ok, logins_failed: lg.bad, failed_in_a_row: u.failed_logins || 0, locked, locked_until: locked ? u.locked_until : null },
          onboarding: fin,
          score: sd && sd.score != null ? { score: sd.score, rango: sd.rango || null, pilares: sd.pilares || null, history: Array.isArray(sd.history) ? sd.history.map((h) => ({ score: h.score, at: h.at, source: h.source || null })) : [] } : null,
          answers: sd && sd.answers ? sanitizeAnswers(sd.answers) : null,
          tributario: t ? { cumplimiento: t.cumplimiento || null, soportes: t.soportes || null, preparador: t.preparador || null, cedula2: t.cedula2 || null } : null,
          preferences: { mi_puntaje_visible: fm.mi_puntaje_visible === true, interes_producto: fm.interes_producto ? sanitizeAnswers(fm.interes_producto) : null },
          data: { modules: (I.get(u.id) || []).map((r) => ({ category: r.category, records: r.n, last_update: r.last })), goals: Number(p.goals) || 0, tax_docs: D.get(u.id) || 0 },
          activity: { days_visited: ev.filter((e) => e.event === 'visit').length, saw_score: ev.some((e) => e.event === 'score_view'), nps: N.has(u.id) ? N.get(u.id) : null,
            recent: (R.get(u.id) || []).map((r) => ({ event: r.event, outcome: r.outcome, at: r.created_at })) },
        };
      });
      audit(req, req.admin.email, 'admin.view_accounts', 'success', { count: out.length });
      res.json({ total: out.length, hidden: ['Montos y saldos de los módulos financieros', 'Montos de la encuesta', 'Contraseñas y enlaces de restablecimiento', 'IP y navegador', 'Contenido de documentos', 'Conversaciones con Maya (no se guardan)'], users: out });
    } catch (e) { console.error('[planea-admin] accounts', e.message); res.status(500).json({ error: 'error_interno' }); }
  });

  // ── Métricas del MVP ──
  api.get('/metrics', async (req, res) => {
    try {
      const { people, admins_excluded } = await loadPeople();
      const today = PlaneaTax.todayColombia();
      const registered = people.length;
      const finished = people.filter((p) => p.fin.finished);
      const sawScore = people.filter((p) => p.ev.some((e) => e.event === 'score_view')).length;
      let returned = 0, eligible = 0, pending = 0;
      finished.forEach((p) => {
        const fday = dayColombia(p.fin.finished_at);
        if (!fday) return;
        const back = p.ev.some((e) => e.event === 'visit' && e.day > fday && e.day <= addDays(fday, 7));
        if (back) { returned++; eligible++; }
        else if (addDays(fday, 7) < today) eligible++;
        else pending++;
      });
      const scores = people.map((p) => p.nps).filter((n) => n != null);
      const promoters = scores.filter((s) => s >= 9).length, detractors = scores.filter((s) => s <= 6).length;
      const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
      const npsVal = scores.length ? Math.round(((promoters - detractors) / scores.length) * 100) : null;
      const completion = pct(finished.length, registered), retention = pct(returned, eligible);
      // Dónde se quedan y cuánto tardan: solo con quienes la encuesta ya registró.
      const cutoff = Date.now() - ABANDON_H * 3600 * 1000;
      const tracked = people.filter((p) => p.prog && p.prog.started_at);
      const inProgress = tracked.filter((p) => !p.fin.finished && p.prog.last_step_at && new Date(p.prog.last_step_at).getTime() >= cutoff).length;
      const dropMap = new Map();
      tracked.filter((p) => !p.fin.finished && (!p.prog.last_step_at || new Date(p.prog.last_step_at).getTime() < cutoff)).forEach((p) => {
        const k = p.prog.last_step || 0;
        if (!dropMap.has(k)) dropMap.set(k, { step: k, key: p.prog.last_key || null, title: p.prog.last_title || null, count: 0 });
        dropMap.get(k).count++;
      });
      const dropoff = Array.from(dropMap.values()).sort((x, y) => y.count - x.count || x.step - y.step);
      const mins = tracked.filter((p) => p.prog.completed_at).map((p) => (new Date(p.prog.completed_at) - new Date(p.prog.started_at)) / 60000).filter((m) => m >= 0 && m < 7 * 24 * 60);
      const med = median(mins), avg = mins.length ? mins.reduce((s, m) => s + m, 0) / mins.length : null;
      const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
      const abandoned = dropoff.reduce((s, d) => s + d.count, 0);
      audit(req, req.admin.email, 'admin.view_metrics', 'success');
      res.json({
        as_of: today,
        admins_excluded,
        metrics: [
          { key: 'completion', label: 'Completitud de onboarding', value: completion, unit: '%', target: '> 60 %', met: completion == null ? null : completion > 60, detail: finished.length + ' de ' + registered + ' registrados terminaron la encuesta' },
          { key: 'retention_7d', label: 'Retención a 7 días', value: retention, unit: '%', target: '> 30 %', met: retention == null ? null : retention > 30, detail: returned + ' de ' + eligible + ' volvieron en los 7 días siguientes' + (pending ? ' · ' + pending + ' aún dentro de su semana' : '') },
          { key: 'nps', label: 'NPS', value: npsVal, unit: '', target: '> 30', met: npsVal == null ? null : npsVal > 30, detail: scores.length + ' respuestas · ' + promoters + ' promotores · ' + detractors + ' detractores' },
          { key: 'onboarding_time', label: 'Tiempo del onboarding (mediana)', value: r1(med), unit: ' min', target: 'informativo', met: null, detail: mins.length ? mins.length + ' encuestas medidas · promedio ' + r1(avg) + ' min' : 'Aún nadie ha terminado la encuesta desde que se empezó a medir' },
          { key: 'onboarding_dropoff', label: 'Abandonaron el onboarding', value: tracked.length ? abandoned : null, unit: '', target: 'informativo', met: null, detail: tracked.length ? abandoned + ' de ' + tracked.length + ' que la empezaron (sin avanzar en ' + ABANDON_H + ' h)' + (inProgress ? ' · ' + inProgress + ' en curso' : '') : 'Se mide desde el ' + 'despliegue de esta versión; aún no hay encuestas registradas' },
          { key: 'critical_bugs', label: 'Bugs críticos', value: null, unit: '', target: '0', met: null, detail: 'No se mide automáticamente en esta versión' },
        ],
        dropoff,
        dropoff_rule: 'Empezó la encuesta, no la terminó y no avanza hace más de ' + ABANDON_H + ' horas. Cuenta desde que existe esta medición.',
        funnel: [
          { step: 'Se registraron', count: registered },
          { step: 'Terminaron el onboarding', count: finished.length },
          { step: 'Vieron su puntaje', count: sawScore },
          { step: 'Volvieron (7 días)', count: returned },
        ],
      });
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });

  // ── Conocimiento de Maya ──
  api.get('/kb', async (req, res) => {
    try { res.json(await kb.list(db(), tenant())); } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });
  api.post('/kb', bigJson, async (req, res) => {
    try {
      const b = req.body || {};
      let data = String(b.data_b64 || '');
      if (/^data:/.test(data)) data = data.slice(data.indexOf(',') + 1);
      const buf = Buffer.from(data, 'base64');
      const r = await kb.upload(db(), { tenant: tenant(), name: b.name, filename: b.filename, buf, by: req.admin.email });
      audit(req, req.admin.email, 'admin.kb_upload', r.status === 200 ? 'success' : r.error, r.doc ? { id: r.doc.id, name: r.doc.name, version: r.doc.version } : { name: String(b.name || b.filename || '').slice(0, 120) });
      if (r.status !== 200) return res.status(r.status).json({ error: r.error, message: r.message });
      res.json({ ok: true, doc: r.doc, replaced: r.replaced });
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });
  api.post('/kb/:id/deactivate', async (req, res) => {
    try {
      const r = await kb.deactivate(db(), { tenant: tenant(), id: req.params.id, by: req.admin.email });
      audit(req, req.admin.email, 'admin.kb_deactivate', r ? 'success' : 'not_found', r || { id: req.params.id });
      if (!r) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, doc: r });
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });

  // ── Prueba de Maya: la MISMA instrucción que usa la app + los documentos activos ──
  // Así el equipo puede comprobar con una pregunta que Maya de verdad lee lo que subió.
  // Compara la respuesta con y sin documentos: si cambia, los documentos están llegando.
  // Solo admins, con tope por hora, y cada prueba queda en la auditoría.
  const testHits = new Map();
  async function askMaya(system, question) {
    const KEY = process.env.ANTHROPIC_API_KEY;
    if (!KEY) return { ok: false, reason: 'Falta la clave del modelo (ANTHROPIC_API_KEY): Maya no está respondiendo en este entorno.' };
    const f = fetchImpl || fetch;
    const r = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: mayaModel || 'claude-haiku-4-5-20251001', max_tokens: 380, system, messages: [{ role: 'user', content: question }] }),
    });
    if (!r.ok) {
      let msg = ''; try { const j = await r.json(); msg = (j && j.error && (j.error.message || j.error.type)) || ''; } catch (e) {}
      return { ok: false, reason: 'El modelo respondió con error ' + r.status + (msg ? ': ' + String(msg).slice(0, 160) : '') };
    }
    const d = await r.json();
    const text = String((d && d.content && d.content[0] && d.content[0].text) || '').replace(/<accion>[\s\S]*?<\/accion>/g, '').replace(/<propuesta>[\s\S]*?<\/propuesta>/g, '').trim();
    return { ok: true, reply: text };
  }
  api.get('/kb/sent', async (req, res) => {
    try {
      kb._cache.delete(tenant());
      const text = await kb.activeText(db(), tenant());
      const [docs] = await db().query('SELECT name, version, chars FROM planea_kb_docs WHERE tenant_id = :t AND active ORDER BY lower(name)', { replacements: { t: tenant() } });
      res.json({ docs, block: kb.promptBlock(text), chars: text.length });
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });
  api.post('/kb/test', async (req, res) => {
    try {
      const question = String((req.body && req.body.question) || '').trim().slice(0, 1000);
      if (!question) return res.status(400).json({ error: 'pregunta_vacia', message: 'Escribe una pregunta.' });
      const now = Date.now(), hits = (testHits.get(req.admin.uid) || []).filter((t) => now - t < 3600e3);
      if (hits.length >= 20) return res.status(429).json({ error: 'demasiadas', message: 'Máximo 20 pruebas por hora.' });
      hits.push(now); testHits.set(req.admin.uid, hits);
      if (typeof mayaSystem !== 'function') return res.status(503).json({ error: 'sin_maya', message: 'La prueba no está conectada a Maya en este servidor.' });
      kb._cache.delete(tenant()); // la prueba siempre ve lo último que se subió
      const text = await kb.activeText(db(), tenant());
      const [docs] = await db().query('SELECT name, version, chars FROM planea_kb_docs WHERE tenant_id = :t AND active ORDER BY lower(name)', { replacements: { t: tenant() } });
      const base = mayaSystem();
      const compare = !(req.body && req.body.compare === false) && !!text;
      const [withDocs, without] = await Promise.all([
        askMaya(base + kb.promptBlock(text), question),
        compare ? askMaya(base, question) : Promise.resolve(null),
      ]);
      audit(req, req.admin.email, 'admin.kb_test', withDocs.ok ? 'success' : 'model_error', { docs: docs.length, compare });
      res.json({ docs, chars: text.length, with_docs: withDocs, without_docs: without });
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });

  admin.use('/api', api);

  // ── Rutas del usuario (sesión normal de Planea) ─────────────────────────────
  const me = express.Router();
  me.use(express.json({ limit: '4kb' }));
  const userOf = (req) => (backend && backend.authUser ? backend.authUser(req) : null);

  me.post('/me/events', async (req, res) => {
    const a = userOf(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const ev = String((req.body && req.body.event) || '');
    if (['visit', 'score_view'].indexOf(ev) < 0) return res.status(400).json({ error: 'evento_no_admitido' });
    if (!ready()) return res.status(503).json({ error: 'backend_not_ready' });
    try {
      await ensureTables(db());
      await db().query(`INSERT INTO planea_events (tenant_id, user_id, event, day) VALUES (:t, :u, :e, :d)
                        ON CONFLICT (tenant_id, user_id, event, day) DO NOTHING`,
        { replacements: { t: tenant(), u: a.id, e: ev, d: PlaneaTax.todayColombia() } });
      res.json({ ok: true });
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });

  // Progreso del onboarding: la encuesta avisa cada pregunta que muestra y cuándo termina.
  // Solo número de pregunta, su clave y su título: nunca la respuesta. Tras terminar,
  // la fila queda cerrada (repetir la encuesta no cambia el tiempo medido).
  me.post('/me/onboarding', async (req, res) => {
    const a = userOf(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    if (!ready()) return res.status(503).json({ error: 'backend_not_ready' });
    const b = req.body || {};
    const done = b.done === true;
    const step = Number(b.step);
    const key = String(b.key || '');
    if (!done && (!Number.isInteger(step) || step < 1 || step > 40 || !/^[a-z0-9_]{1,40}$/.test(key))) return res.status(400).json({ error: 'paso_invalido' });
    try {
      await ensureTables(db());
      if (done) {
        await db().query(`INSERT INTO planea_onboarding_progress (tenant_id, user_id, completed_at) VALUES (:t, :u, NOW())
          ON CONFLICT (tenant_id, user_id) DO UPDATE SET completed_at = COALESCE(planea_onboarding_progress.completed_at, NOW())`,
          { replacements: { t: tenant(), u: a.id } });
      } else {
        await db().query(`INSERT INTO planea_onboarding_progress (tenant_id, user_id, started_at, last_step, last_key, last_title, last_step_at)
          VALUES (:t, :u, NOW(), :s, :k, :ti, NOW())
          ON CONFLICT (tenant_id, user_id) DO UPDATE SET
            started_at = COALESCE(planea_onboarding_progress.started_at, NOW()),
            last_step = :s, last_key = :k, last_title = :ti, last_step_at = NOW()
          WHERE planea_onboarding_progress.completed_at IS NULL`,
          { replacements: { t: tenant(), u: a.id, s: step, k: key, ti: cleanTitle(b.title) } });
      }
      res.json({ ok: true });
    } catch (e) { console.error('[planea-admin] onboarding', e.message); res.status(500).json({ error: 'error_interno' }); }
  });

  me.get('/me/nps', async (req, res) => {
    const a = userOf(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    if (!ready()) return res.status(503).json({ error: 'backend_not_ready' });
    try {
      await ensureTables(db());
      const [rows] = await db().query('SELECT score FROM planea_nps WHERE tenant_id = :t AND user_id = :u', { replacements: { t: tenant(), u: a.id } });
      res.json({ answered: rows.length > 0 });
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });
  me.post('/me/nps', async (req, res) => {
    const a = userOf(req); if (!a) return res.status(401).json({ error: 'unauthorized' });
    const s = Number(req.body && req.body.score);
    if (!Number.isInteger(s) || s < 0 || s > 10) return res.status(400).json({ error: 'puntaje_invalido' });
    if (!ready()) return res.status(503).json({ error: 'backend_not_ready' });
    try {
      await ensureTables(db());
      const [rows] = await db().query(`INSERT INTO planea_nps (tenant_id, user_id, score) VALUES (:t, :u, :s)
                                       ON CONFLICT (tenant_id, user_id) DO NOTHING RETURNING id`,
        { replacements: { t: tenant(), u: a.id, s } });
      if (!rows.length) return res.status(409).json({ error: 'ya_respondido' });
      res.json({ ok: true });
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
  });

  // Público: el calendario DIAN es información pública. Sin tabla -> null y la app estima.
  me.get('/tax/calendar', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ table: dianTable(), reminder_days: reminderDays() });
  });

  return { admin, me };
}

// Texto de conocimiento para Maya (tenant de producción). Nunca falla la conversación.
async function mayaKnowledge(backend) {
  try {
    const sq = backend && backend.db ? backend.db() : null;
    if (!sq || !(backend.status && backend.status().ready)) return '';
    await ensureTables(sq);
    return kb.promptBlock(await kb.activeText(sq, tenant()));
  } catch (e) { return ''; }
}

function health() {
  return { configured: !!secret(), admins: adminCount, admins_source: 'planea_admins', dian_table: !!dianTable(), kb_max_chars: kb.MAX_CHARS() };
}

module.exports = { PlaneaTax, dianTable, build, mayaKnowledge, health, sanitizeAnswers, finishInfo, _resetCalendarCache: () => { calCache = null; } };
