/* PLANEA — módulo administrativo (versión sencilla) + rutas de medición del usuario.
 *
 * QUIÉN ENTRA: los tres administradores (Manuel Stagg, Juan Alberto Bueno, Eduardo de
 * Lima) entran con SU PROPIA CUENTA DE PLANEA, y el permiso lo da estar en
 * PLANEA_ADMIN_EMAILS. No hay contraseña de administrador aparte ni contraseña por
 * defecto: la cuenta ya tiene bcrypt, bloqueo por intentos y restablecimiento. El
 * permiso se vuelve a leer en CADA petición, así que quitar un correo de la variable
 * corta el acceso de inmediato. Sin secreto de firma configurado, el módulo queda CERRADO.
 *
 * QUÉ SE VE Y QUÉ NO: fecha de registro, respuestas de la encuesta, Puntaje Planea por
 * pilar y si terminó el onboarding. NUNCA saldos ni montos (se eliminan de las respuestas
 * antes de salir del servidor) y nunca conversaciones con Maya (no se guardan).
 * Cada acción del administrador queda en planea_audit_log con su correo y la hora.
 *
 * MÉTRICAS: se calculan con filas reales (planea_users, planea_profiles, planea_events,
 * planea_nps). Los administradores no cuentan como usuarios de prueba. Lo que esta
 * versión no mide (en qué pregunta se abandonó, cuánto tardó, bugs críticos) lo dice.
 */
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const kb = require('./kb.cjs');
const PlaneaTax = require('./portal/planea-tax.js');

const COOKIE = 'planea_admin';
const TTL_MS = 8 * 60 * 60 * 1000;
const AUD = 'planea-admin';
const PUBLISHED = ['planea-2026-secret', 'dev-only-insecure-secret', 'Digit2Ai@7', 'Palindrome@7'];
const DATA_DIR = path.join(__dirname, 'data');
const PAGE = path.join(__dirname, 'admin-ui', 'admin.html');
let DUMMY_HASH = null;

const tenant = () => Number(process.env.PLANEA_TENANT_ID) || 1;
const adminEmails = () => String(process.env.PLANEA_ADMIN_EMAILS || 'mstagg@digit2ai.com')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
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
      if (PlaneaTax.validTable(t)) table = { year: t.year || year, source: t.source || null, ranges: t.ranges };
      else console.log('planea: ' + f + ' no es una tabla DIAN válida; se usa la ventana estimada');
    }
  } catch (e) { console.log('planea: no se pudo leer la tabla DIAN:', e.message); }
  calCache = { at: Date.now(), table };
  return table;
}

function build({ backend, sec }) {
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
    const email = String(p.e || '').toLowerCase();
    if (adminEmails().indexOf(email) < 0) return null;       // quitar el correo corta el acceso ya
    const [rows] = await db().query('SELECT id, email, full_name FROM planea_users WHERE lower(email) = :e LIMIT 1', { replacements: { e: email } });
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
  api.use(express.json({ limit: '12mb' }));
  api.use((req, res, next) => {
    if (!secret()) return res.status(503).json({ error: 'cerrado', message: 'El módulo administrativo no está configurado (falta un secreto de firma).' });
    if (!ready()) return res.status(503).json({ error: 'backend_not_ready' });
    // Toda escritura exige la cabecera propia: un formulario de otro sitio no la puede poner.
    if (req.method !== 'GET' && req.headers['x-planea-admin'] !== '1') return res.status(404).json({ error: 'not_found' });
    ensureTables(db()).then(() => next(), (e) => res.status(500).json({ error: 'tablas', detail: e.message }));
  });

  // Correo -> bloqueo simple por cuenta además del límite por IP de security.cjs.
  const emailFails = new Map();
  api.post('/login', sec.loginLimiter, async (req, res) => {
    const email = String((req.body && req.body.email) || '').toLowerCase().trim();
    const password = String((req.body && req.body.password) || '');
    const fail = (why) => { emailFails.set(email, (emailFails.get(email) || 0) + 1); audit(req, email, 'admin.login', why); return res.status(401).json({ error: 'Credenciales inválidas o sin permiso de administrador.' }); };
    const f = emailFails.get(email) || 0;
    if (f >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    if (!email || !password) return fail('fail_empty');
    const [rows] = await db().query('SELECT id, email, full_name, password_hash, locked_until FROM planea_users WHERE lower(email) = :e LIMIT 1', { replacements: { e: email } });
    const u = rows[0];
    // bcrypt se corre siempre, para que "no existe" y "clave mala" tarden lo mismo.
    if (!DUMMY_HASH) DUMMY_HASH = await bcrypt.hash('planea-no-es-una-clave-' + Date.now(), 12);
    const ok = await bcrypt.compare(password, (u && u.password_hash) || DUMMY_HASH);
    if (!u || !ok) return fail(!u ? 'fail_no_user' : 'fail_password');
    if (sec.lockRemaining(u) > 0) return fail('blocked_locked');
    if (adminEmails().indexOf(email) < 0) return fail('fail_not_admin');
    emailFails.delete(email);
    const tok = jwt.sign({ e: email }, secret(), { audience: AUD, expiresIn: Math.floor(TTL_MS / 1000) });
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
    const admins = adminEmails();
    const people = users.filter((u) => admins.indexOf(String(u.email).toLowerCase()) < 0).map((u) => {
      const sd = prof.get(u.id) || null;
      const fin = finishInfo(sd);
      const ev = evBy.get(u.id) || [];
      return { u, sd, fin, ev, nps: npsBy.has(u.id) ? npsBy.get(u.id) : null };
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
        not_measured: ['En qué pregunta se quedó quien abandonó el onboarding', 'Cuánto tardó en completarlo'],
        users: people.map(({ u, sd, fin, ev, nps }) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name || '',
          registered_at: u.created_at,
          last_login_at: u.last_login_at || null,
          onboarding: { finished: fin.finished, finished_at: fin.finished_at },
          score: fin.finished && sd ? { score: sd.score != null ? sd.score : null, rango: sd.rango || null, pilares: sd.pilares || null } : null,
          answers: fin.finished && sd && sd.answers ? sanitizeAnswers(sd.answers) : null,
          saw_score: ev.some((e) => e.event === 'score_view'),
          days_visited: ev.filter((e) => e.event === 'visit').length,
          nps,
        })),
      });
    } catch (e) { (console.error('[planea-admin]', e.message), res.status(500).json({ error: 'error_interno' })); }
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
      audit(req, req.admin.email, 'admin.view_metrics', 'success');
      res.json({
        as_of: today,
        admins_excluded,
        metrics: [
          { key: 'completion', label: 'Completitud de onboarding', value: completion, unit: '%', target: '> 60 %', met: completion == null ? null : completion > 60, detail: finished.length + ' de ' + registered + ' registrados terminaron la encuesta' },
          { key: 'retention_7d', label: 'Retención a 7 días', value: retention, unit: '%', target: '> 30 %', met: retention == null ? null : retention > 30, detail: returned + ' de ' + eligible + ' volvieron en los 7 días siguientes' + (pending ? ' · ' + pending + ' aún dentro de su semana' : '') },
          { key: 'nps', label: 'NPS', value: npsVal, unit: '', target: '> 30', met: npsVal == null ? null : npsVal > 30, detail: scores.length + ' respuestas · ' + promoters + ' promotores · ' + detractors + ' detractores' },
          { key: 'critical_bugs', label: 'Bugs críticos', value: null, unit: '', target: '0', met: null, detail: 'No se mide automáticamente en esta versión' },
        ],
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
  api.post('/kb', async (req, res) => {
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
  return { configured: !!secret(), admins: adminEmails().length, dian_table: !!dianTable(), kb_max_chars: kb.MAX_CHARS() };
}

module.exports = { build, mayaKnowledge, health, sanitizeAnswers, finishInfo, _resetCalendarCache: () => { calCache = null; } };
