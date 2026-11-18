'use strict';
/**
 * Forzza — control de capital para una empresa que vende materiales a crédito
 * (Rafael Marroquín, Monterrey). Montado en /forzza/app (la presentación sigue
 * en /forzza/). Responde: ¿cuánto efectivo hay hoy, cuánto me deben, cuánto
 * debo, y en qué fecha me quedo corto?
 *
 * REGLAS QUE NO SE NEGOCIAN (la SIT las ataca):
 *  - Toda cifra la calcula engine.js en centavos. Ningún saldo se guarda: el de
 *    un documento es total − abonos y el de una cuenta, saldo de corte + movimientos.
 *  - El tenant sale de la sesión, nunca del cuerpo. Un id de otro tenant = 404.
 *  - Un abono o pago no puede ser mayor que lo pendiente.
 *  - Un pago a proveedor solo se registra si está APROBADO por quien aprueba
 *    (o lo registra esa persona). Programar no es aprobar.
 *  - Importar es todo o nada, cada renglón recibe un resultado y nada se duplica:
 *    un movimiento del banco que ya está (mismo archivo otra vez) se salta, y uno
 *    que coincide con un cobro/pago capturado en la app lo CONCILIA en vez de duplicarlo.
 *  - La reserva mínima vacía no se inventa. No hay transporte de mensajes: los
 *    recordatorios de cobranza son enlaces wa.me que cada quien envía desde su teléfono.
 *
 * ROLES: owner (Digit2AI, contraseña del CRM) · director (Rafael) ·
 * capturista · contador (solo lectura).
 */
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { QueryTypes } = require('sequelize');
const db = require('./db');
const schema = require('./schema');
const E = require('./engine');
const S = require('./sicar');
const SI = require('./sicar-import');
const H = require('./hallazgos');

const router = express.Router();
const BASE = '/forzza/app';
const OWNER_EMAIL = String(process.env.FORZZA_OWNER_EMAIL || 'mstagg@digit2ai.com').toLowerCase();
const SECRET = process.env.FORZZA_JWT_SECRET || process.env.JWT_SECRET || '';
const COOKIE = 'fz_token';
const AUD = 'forzza';
const ROLES = ['director', 'capturista', 'contador'];
const CATEGORIAS = ['sin_categoria', 'cliente', 'proveedor', 'nomina', 'imss', 'impuestos', 'renta', 'combustible', 'vehiculo', 'financiamiento',
  'retiro_socios', 'aportacion_socios', 'prestamo', 'factoraje', 'comision_bancaria', 'traspaso', 'servicios', 'otro'];
const CATEG_FIJO = ['nomina', 'imss', 'renta', 'financiamiento', 'vehiculo', 'servicios', 'impuestos', 'otro'];

let TENANT_SEED = null;
const ready = schema.init(db).then((id) => { TENANT_SEED = id; }).catch((e) => { console.error('[forzza] schema init failed:', e.message); throw e; });
ready.catch(() => {});

/* ── helpers ─────────────────────────────────────────────────────────── */
const sel = (sql, replacements = {}, t) => db.query(sql, { replacements, type: QueryTypes.SELECT, transaction: t });
const one = async (sql, r, t) => (await sel(sql, r, t))[0] || null;
const exec = (sql, replacements = {}, t) => db.query(sql, { replacements, transaction: t });
const str = (v, max) => (v == null ? '' : String(v)).trim().slice(0, max);
const strOrNull = (v, max) => str(v, max) || null;
const date = (v) => { const s = str(v, 10); return E.valid(s) ? s : null; };
const intId = (v) => (/^\d{1,9}$/.test(String(v == null ? '' : v)) ? Number(v) : null);
const num = (v) => {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim(), neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$\s]/g, '').replace(/,/g, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s); return neg ? -n : n;
};
const moneyIn = (v) => { const n = num(v); return n == null || n <= 0 || n > 1e10 ? null : Math.round(n * 100) / 100; };
const dias = (v) => { const n = num(v); return n == null || n < 0 || n > 365 ? null : Math.round(n); };
const hoyMx = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10); // Monterrey, UTC-6
const pesos = (c) => (c < 0 ? '-$' : '$') + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function audit(req, action, detail) {
  exec('INSERT INTO fz_activity (tenant_id,user_id,user_email,action,detail) VALUES (:t,:u,:e,:a,:d)',
    { t: req.tenant, u: req.user ? req.user.id : null, e: req.user ? req.user.email : null, a: action, d: str(detail, 500) || null })
    .catch((e) => console.error('[forzza] audit:', e.message));
}
function tempPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const b = crypto.randomBytes(14); let s = '';
  for (let i = 0; i < 14; i++) s += abc[b[i] % abc.length];
  return s;
}
function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setCookie(res, value, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=${BASE}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}
const fp = (hash) => crypto.createHmac('sha256', SECRET).update(String(hash || 'crm')).digest('hex').slice(0, 16);
const attempts = new Map();
function tooMany(key, max = 10) {
  const now = Date.now(); const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (a.length) attempts.set(key, a); else attempts.delete(key);
  return a.length >= max;
}
function noteAttempt(key) {
  if (attempts.size > 5000) attempts.clear();
  const a = attempts.get(key) || []; a.push(Date.now()); attempts.set(key, a);
}
/** Teléfono para wa.me: 10 dígitos = México (+52); otro país con +lada. Igual que NeoHaul. */
function waNumero(tel) {
  const raw = String(tel || '').trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (raw.startsWith('+') || raw.startsWith('00')) { d = d.replace(/^00/, ''); if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3); return d.length >= 11 && d.length <= 15 ? d : null; }
  if (d.length === 10) return '52' + d;
  if (d.length === 12 && d.startsWith('52')) return d;
  if (d.length === 13 && d.startsWith('521')) return '52' + d.slice(3);
  if (d.length === 11 && d.startsWith('1')) return d;
  return null;
}

/* ── shell ───────────────────────────────────────────────────────────── */
router.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
router.get('/health', async (req, res) => {
  let dbOk = false; try { await ready; await sel('SELECT 1 AS ok'); dbOk = true; } catch (_) {}
  res.json({ service: 'forzza', ok: dbOk && !!SECRET, database: dbOk, signing_secret: !!SECRET });
});
router.use(express.static(path.join(__dirname, '..', 'public'), { index: false, redirect: false }));
/* ── pago de las facturas de Digit2AI con Stripe (igual que NeoHaul) ──
 * Una Checkout Session por clic con la marca de Digit2AI. Los montos viven aquí, nunca en la petición.
 * La mensualidad cobra el día que se paga y se repite cada mes en esa fecha. Sin IVA (Digit2AI LLC, EE. UU.). */
const PAGOS = Object.freeze({
  onboarding: { mode: 'payment', cents: 99400, name: 'Digit2AI · Forzza Capital - Onboarding y consolidación de datos (pago único)', factura: 'D2-FZ-2026-001' },
  mensualidad: { mode: 'subscription', cents: 49700, name: 'Digit2AI · Forzza Capital - Plataforma SaaS (mensual)', factura: 'D2-FZ-2026-002' }
});
const STRIPE_BRAND = {
  display_name: 'Digit2AI',
  logo: { type: 'url', url: 'https://aiagent.ringlypro.com/stripe/digit2ai-wordmark-white.png' },
  icon: { type: 'url', url: 'https://aiagent.ringlypro.com/stripe/digit2ai-icon.png' },
  background_color: '#0B1630', button_color: '#0057F0', border_style: 'rounded', font_family: 'inter'
};
const pagoHits = new Map();
router.get('/pagar/:item', async (req, res) => {
  const item = Object.prototype.hasOwnProperty.call(PAGOS, req.params.item) ? PAGOS[req.params.item] : null;
  if (!item) return res.status(404).send('No existe.');
  const ip = req.ip || ''; const now = Date.now();
  const l = (pagoHits.get(ip) || []).filter((t) => now - t < 600000); l.push(now); pagoHits.set(ip, l);
  if (pagoHits.size > 5000) pagoHits.clear();
  if (l.length > 20) return res.status(429).send('Demasiados intentos. Espera unos minutos.');
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(503).send('Pagos no configurados.');
  try {
    const stripe = module.exports._stripe || require('stripe')(key);
    const back = PUBLIC_URL + '/pago';
    const meta = { cliente: 'Materiales Forzza', factura: item.factura, item: req.params.item };
    const session = await stripe.checkout.sessions.create({
      mode: item.mode,
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: item.cents, product_data: { name: item.name, images: ['https://aiagent.ringlypro.com/stripe/digit2ai-round.png'] }, ...(item.mode === 'subscription' ? { recurring: { interval: 'month' } } : {}) } }],
      metadata: meta,
      ...(item.mode === 'subscription'
        ? { subscription_data: { metadata: meta, description: 'Plataforma Forzza Capital — cargo mensual' } }
        : { payment_intent_data: { metadata: meta, statement_descriptor_suffix: 'DIGIT2AI' }, invoice_creation: { enabled: true } }),
      branding_settings: STRIPE_BRAND,
      locale: 'es',
      success_url: back + '?estado=ok&f=' + item.factura,
      cancel_url: back + '?estado=cancelado'
    }, { apiVersion: '2025-09-30.clover' });
    res.redirect(303, session.url);
  } catch (e) {
    console.error('[forzza] pagar:', e.message);
    res.status(502).send('No se pudo abrir el pago. Inténtalo de nuevo o usa la transferencia.');
  }
});
router.get('/pago', (req, res) => {
  const ok = req.query.estado === 'ok';
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }).type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Digit2AI · Pago</title>' +
    '<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:#0b1630;color:#fff;text-align:center"><div style="max-width:440px;padding:24px">' +
    '<img src="https://aiagent.ringlypro.com/stripe/digit2ai-wordmark-white.png" alt="Digit2AI" style="height:44px;margin-bottom:22px">' +
    (ok ? '<h1 style="font-size:24px">Gracias</h1><p style="opacity:.8">Stripe está confirmando tu pago y te enviará el recibo por correo.</p>'
      : '<h1 style="font-size:24px">Pago no completado</h1><p style="opacity:.8">No se hizo ningún cargo. Puedes volver a la factura e intentarlo de nuevo, o pagar por transferencia.</p>') +
    '<a href="' + BASE + '/" style="display:inline-block;margin-top:14px;padding:12px 20px;border-radius:10px;background:#0057F0;color:#fff;text-decoration:none;font-weight:700">Ir a Forzza Capital</a></div></body></html>');
});
router.get('/', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(__dirname, '..', 'public', 'app.html')); });

/* ── api ─────────────────────────────────────────────────────────────── */
const api = express.Router();
// Express 4 no atrapa errores de handlers async: un rechazo sin atrapar tumbaría todo el CRM.
const safe = (fn) => (typeof fn === 'function' && fn.length <= 3 ? (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next) : fn);
for (const m of ['get', 'post', 'patch', 'put', 'delete', 'use']) {
  const orig = api[m].bind(api);
  api[m] = (...args) => orig(...args.map(safe));
}
router.use('/api/v1', api);
// El parser global de src/app.js corre antes que este; el tope real es este chequeo.
api.use((req, res, next) => (/json/.test(req.get('content-type') || '') && Number(req.get('content-length') || 0) > 300 * 1024 ? res.status(413).json({ error: 'archivo_muy_grande' }) : next()));
api.use(express.json({ limit: '300kb' }));
/* ── puente SICAR: la computadora de Forzza sube reportes con una llave (sin sesión, sin cabecera de navegador) ── */
api.post('/ingest/sicar', (req, res, next) => sicarUpload.single('archivo')(req, res, next), async (req, res) => {
  if (!SECRET) return res.status(503).json({ error: 'not_configured' });
  try { await ready; } catch (_) { return res.status(503).json({ error: 'database_unavailable' }); }
  const m = String(req.get('authorization') || '').match(/^Bearer\s+(fzk_[A-Za-z0-9_-]{20,80})$/);
  if (!m) return res.status(401).json({ error: 'llave_invalida' });
  const k = await one('SELECT id, tenant_id FROM fz_api_keys WHERE hash=:h AND revoked_at IS NULL AND scope=\'sicar\'', { h: hashKey(m[1]) });
  if (!k) return res.status(401).json({ error: 'llave_invalida' });
  if (tooMany('key|' + k.id, 120)) return res.status(429).json({ error: 'too_many_attempts' });
  noteAttempt('key|' + k.id);
  exec('UPDATE fz_api_keys SET last_used_at=NOW() WHERE id=:id', { id: k.id }).catch(() => {});
  req.tenant = k.tenant_id; req.user = { id: null, email: 'puente-sicar#' + k.id, role: 'capturista' };
  return importarSicar(req, res, { aplicar: true, origen: 'puente' });
});
api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
api.use(async (req, res, next) => {
  if (!SECRET) return res.status(503).json({ error: 'not_configured' });
  try { await ready; } catch (_) { return res.status(503).json({ error: 'database_unavailable' }); }
  if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Forzza') !== '1') return res.status(403).json({ error: 'missing_header' });
  next();
});

async function ownerCrmHash(email) {
  if (module.exports._verifyOwner) return 'test-owner';
  try { const u = await one('SELECT password_hash FROM users WHERE LOWER(email)=:e LIMIT 1', { e: email }); return u ? u.password_hash : null; } catch (_) { return null; }
}
async function verifyOwnerAgainstCrm(email, password) {
  if (module.exports._verifyOwner) return module.exports._verifyOwner(email, password);
  try {
    const u = await one('SELECT password_hash FROM users WHERE LOWER(email)=:e LIMIT 1', { e: email });
    return !!(u && u.password_hash && (await bcrypt.compare(password, u.password_hash)));
  } catch (_) { return false; }
}

api.post('/auth/login', async (req, res) => {
  const email = str(req.body && req.body.email, 200).toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const key = (req.ip || '') + '|' + email;
  if (tooMany(key) || tooMany('email|' + email, 25)) return res.status(429).json({ error: 'too_many_attempts' });
  if (!email || !password) return res.status(400).json({ error: 'missing_credentials' });
  let user = await one('SELECT * FROM fz_users WHERE LOWER(email)=:e', { e: email });
  let ok = false;
  if (user && user.password_hash) ok = await bcrypt.compare(password, user.password_hash);
  else if (email === OWNER_EMAIL && (!user || user.role === 'owner')) {
    ok = await verifyOwnerAgainstCrm(email, password);
    if (ok && !user) {
      const tid = TENANT_SEED || ((await one('SELECT id FROM fz_tenants ORDER BY id LIMIT 1')) || {}).id;
      if (!tid) return res.status(503).json({ error: 'sin_empresa' });
      await exec("INSERT INTO fz_users (tenant_id,email,name,role,must_change) VALUES (:t,:e,'Digit2AI','owner',FALSE) ON CONFLICT DO NOTHING", { t: tid, e: email });
      user = await one('SELECT * FROM fz_users WHERE LOWER(email)=:e', { e: email });
    }
  } else await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuuJcB6W6fK3k0n1i3m3e0YcJ9mL0pQkS.');
  if (!ok || !user || !user.active) { noteAttempt(key); noteAttempt('email|' + email); return res.status(401).json({ error: 'invalid_credentials' }); }
  await exec('UPDATE fz_users SET last_login=NOW() WHERE id=:id', { id: user.id });
  const hashForFp = user.role === 'owner' ? await ownerCrmHash(email) : user.password_hash;
  setCookie(res, jwt.sign({ uid: user.id, fp: fp(hashForFp) }, SECRET, { audience: AUD, expiresIn: '12h' }), 12 * 3600);
  res.json({ ok: true, must_change: !!user.must_change });
});
api.post('/auth/logout', (req, res) => { setCookie(res, '', 0); res.json({ ok: true }); });

// Desde aquí, sesión obligatoria. El usuario se relee en cada petición.
api.use(async (req, res, next) => {
  const t = readCookie(req, COOKIE);
  if (!t) return res.status(401).json({ error: 'not_signed_in' });
  let p; try { p = jwt.verify(t, SECRET, { audience: AUD }); } catch (_) { return res.status(401).json({ error: 'not_signed_in' }); }
  const u = await one('SELECT id,tenant_id,email,name,phone,role,must_change,active,password_hash FROM fz_users WHERE id=:id', { id: p.uid });
  if (!u || !u.active) return res.status(401).json({ error: 'not_signed_in' });
  const hashForFp = u.role === 'owner' ? await ownerCrmHash(u.email) : u.password_hash;
  if (!hashForFp || fp(hashForFp) !== p.fp) return res.status(401).json({ error: 'not_signed_in' });
  delete u.password_hash;
  req.user = u; req.tenant = u.tenant_id;
  next();
});
api.get('/auth/me', async (req, res) => {
  const t = await one('SELECT id,name FROM fz_tenants WHERE id=:t', { t: req.tenant });
  const cfg = await config(req.tenant);
  res.json({ user: req.user, tenant: t, puede_aprobar: puedeAprobar(req, cfg), categorias: CATEGORIAS, categorias_fijo: CATEG_FIJO });
});
api.post('/auth/password', async (req, res) => {
  const cur = String((req.body && req.body.current) || ''), nw = String((req.body && req.body.new) || '');
  if (req.user.role === 'owner') return res.status(400).json({ error: 'owner_uses_crm_password' });
  if (nw.length < 10) return res.status(400).json({ error: 'password_too_short' });
  const row = await one('SELECT password_hash FROM fz_users WHERE id=:id', { id: req.user.id });
  if (!row || !(await bcrypt.compare(cur, row.password_hash))) return res.status(401).json({ error: 'wrong_current_password' });
  const hash = await bcrypt.hash(nw, 12);
  await exec('UPDATE fz_users SET password_hash=:h, must_change=FALSE WHERE id=:id', { h: hash, id: req.user.id });
  setCookie(res, jwt.sign({ uid: req.user.id, fp: fp(hash) }, SECRET, { audience: AUD, expiresIn: '12h' }), 12 * 3600);
  audit(req, 'password_changed', null);
  res.json({ ok: true });
});
api.use((req, res, next) => (req.user.must_change ? res.status(403).json({ error: 'must_change_password' }) : next()));

const canEdit = (req) => ['owner', 'director', 'capturista'].includes(req.user.role);
const canAdmin = (req) => ['owner', 'director'].includes(req.user.role);
// Simular no guarda nada: el contador (solo lectura) también puede.
const SOLO_CALCULO = ['/simulador', '/simular-venta', '/dalia/chat'];
api.use((req, res, next) => (['GET', 'HEAD'].includes(req.method) || canEdit(req) || (req.method === 'POST' && SOLO_CALCULO.includes(req.path)) ? next() : res.status(403).json({ error: 'read_only' })));
const adminOnly = (req, res, next) => (canAdmin(req) ? next() : res.status(404).json({ error: 'not_found' }));
const own = (table, id, t, tx) => one(`SELECT * FROM ${table} WHERE id=:id AND tenant_id=:t`, { id, t }, tx);

async function config(tenant) {
  return (await one('SELECT * FROM fz_config WHERE tenant_id=:t', { t: tenant })) || { reserva_minima: null, aprobador_user_id: null, dias_credito_clientes: 30, dias_credito_proveedores: 30, horizonte_dias: 60 };
}
/** Quién aprueba pagos: el dueño de la plataforma siempre; si hay aprobador elegido, solo esa persona; si no, el director. */
function puedeAprobar(req, cfg) {
  if (req.user.role === 'owner') return true;
  if (cfg.aprobador_user_id) return req.user.id === cfg.aprobador_user_id;
  return req.user.role === 'director';
}

/* ── catálogos ───────────────────────────────────────────────────────── */
const BAD = Symbol('invalido');
const tel = (v) => { if (v === '' || v == null) return null; const w = waNumero(v); return w ? '+' + w : BAD; };
const CAT = {
  clientes: { table: 'fz_clientes', order: 'nombre',
    fields: { nombre: (v) => str(v, 200) || undefined, rfc: (v) => strOrNull(v, 20), telefono: tel, dias_credito: (v) => (v === '' || v == null ? null : dias(v) ?? undefined),
      limite_credito: (v) => (v === '' || v == null ? null : moneyIn(v) ?? undefined), notas: (v) => strOrNull(v, 500), active: (v) => !!v },
    required: ['nombre'] },
  proveedores: { table: 'fz_proveedores', order: 'nombre',
    fields: { nombre: (v) => str(v, 200) || undefined, rfc: (v) => strOrNull(v, 20), telefono: tel, dias_credito: (v) => (v === '' || v == null ? null : dias(v) ?? undefined),
      notas: (v) => strOrNull(v, 500), active: (v) => !!v },
    required: ['nombre'] },
  cuentas: { table: 'fz_cuentas', order: 'incluir DESC, nombre', admin: true,
    fields: { nombre: (v) => str(v, 120) || undefined, banco: (v) => strOrNull(v, 60), terminacion: (v) => (v === '' || v == null ? null : /^\d{4}$/.test(String(v).trim()) ? String(v).trim() : BAD),
      tipo: (v) => (['cheques', 'tarjeta', 'efectivo', 'inversion'].includes(v) ? v : undefined), uso: (v) => (['cobranza', 'operacion', 'personal', 'otro'].includes(v) ? v : undefined),
      incluir: (v) => !!v, notas: (v) => strOrNull(v, 500), active: (v) => !!v },
    required: ['nombre'] }
};
function pick(spec, body, partial) {
  const out = {};
  for (const [k, fn] of Object.entries(spec.fields)) {
    if (!body || !(k in body)) continue;
    const v = fn(body[k]);
    if (v === BAD) return { error: k === 'terminacion' ? 'terminacion_invalida' : 'telefono_invalido' };
    if (v !== undefined) out[k] = v;
  }
  if (!partial) for (const k of spec.required) if (out[k] == null) return { error: 'missing_' + k };
  return { row: out };
}
for (const [name, spec] of Object.entries(CAT)) {
  api.get('/' + name, async (req, res) => {
    const rows = await sel(`SELECT * FROM ${spec.table} WHERE tenant_id=:t ORDER BY ${spec.order}`, { t: req.tenant });
    if (name === 'clientes' || name === 'proveedores') {
      // Saldo y vencido según la última foto de SICAR (por nombre), para verlos en el catálogo.
      const f = await fotoSicar(req.tenant, name === 'clientes' ? 'cxc' : 'cxp');
      const mapa = async (id) => new Map(id ? (await sel('SELECT LOWER(parte) AS n, saldo FROM fz_sicar_saldos WHERE tenant_id=:t AND import_id=:i', { t: req.tenant, i: id })).map((x) => [x.n, E.toC(x.saldo)]) : []);
      const [ms, mv] = f ? await Promise.all([mapa(f.import_id), mapa(f.vencidos_import_id)]) : [new Map(), new Map()];
      for (const r of rows) { const k = String(r.nombre).toLowerCase(); r.saldo_sicar = ms.has(k) ? ms.get(k) : null; r.vencido_sicar = mv.has(k) ? mv.get(k) : (f && f.vencidos_import_id && ms.has(k) ? 0 : null); }
    }
    res.json(rows);
  });
  api.post('/' + name, async (req, res) => {
    if (spec.admin && !canAdmin(req)) return res.status(403).json({ error: 'solo_director' });
    const { row, error } = pick(spec, req.body, false);
    if (error) return res.status(400).json({ error });
    const cols = Object.keys(row);
    const [r] = await exec(`INSERT INTO ${spec.table} (tenant_id,${cols.join(',')}) VALUES (:tenant_id,${cols.map((c) => ':' + c).join(',')})
      ON CONFLICT DO NOTHING RETURNING *`, { ...row, tenant_id: req.tenant });
    if (!r.length) return res.status(409).json({ error: 'ya_existe' });
    audit(req, name + '_created', r[0].id);
    res.status(201).json(r[0]);
  });
  api.patch('/' + name + '/:id', async (req, res) => {
    if (spec.admin && !canAdmin(req)) return res.status(403).json({ error: 'solo_director' });
    const id = intId(req.params.id);
    const before = id && (await own(spec.table, id, req.tenant));
    if (!before) return res.status(404).json({ error: 'not_found' });
    const body = { ...(req.body || {}) };
    if ('telefono' in body && String(body.telefono || '') === String(before.telefono || '')) delete body.telefono;
    const { row, error } = pick(spec, body, true);
    if (error) return res.status(400).json({ error });
    if (!Object.keys(row).length) return res.status(400).json({ error: 'nothing_to_update' });
    try {
      const [r] = await exec(`UPDATE ${spec.table} SET ${Object.keys(row).map((c) => `${c}=:${c}`).join(',')} WHERE id=:id AND tenant_id=:tenant_id RETURNING *`, { ...row, id, tenant_id: req.tenant });
      audit(req, name + '_updated', id);
      res.json(r[0]);
    } catch (e) { if (/unique/i.test(e.message)) return res.status(409).json({ error: 'ya_existe' }); throw e; }
  });
}
/** Saldo de corte de una cuenta (lo que dice el banco hoy o en el último estado de cuenta). */
api.post('/cuentas/:id/saldo', async (req, res) => {
  const id = intId(req.params.id), c = id && (await own('fz_cuentas', id, req.tenant));
  if (!c) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const saldo = num(b.saldo), fecha = date(b.fecha) || hoyMx();
  if (saldo == null || Math.abs(saldo) > 1e10) return res.status(400).json({ error: 'saldo_invalido' });
  if (fecha > hoyMx()) return res.status(400).json({ error: 'fecha_futura' });
  await exec('UPDATE fz_cuentas SET saldo_inicial=:s, fecha_saldo=:f WHERE id=:id AND tenant_id=:t', { s: Math.round(saldo * 100) / 100, f: fecha, id, t: req.tenant });
  audit(req, 'saldo_cuenta', `${c.nombre}: ${saldo} al ${fecha}`);
  res.json({ ok: true });
});

/* ── configuración ───────────────────────────────────────────────────── */
api.get('/config', async (req, res) => res.json(await config(req.tenant)));
api.put('/config', adminOnly, async (req, res) => {
  const b = req.body || {}, cur = await config(req.tenant);
  const reserva = b.reserva_minima === '' || b.reserva_minima == null ? null : moneyIn(b.reserva_minima);
  if (b.reserva_minima !== '' && b.reserva_minima != null && reserva == null) return res.status(400).json({ error: 'reserva_invalida' });
  let aprob = b.aprobador_user_id === '' || b.aprobador_user_id == null ? null : intId(b.aprobador_user_id);
  if (aprob) {
    const u = await own('fz_users', aprob, req.tenant);
    if (!u || !u.active || u.role === 'contador') return res.status(400).json({ error: 'aprobador_invalido' });
  }
  const dc = dias(b.dias_credito_clientes) ?? cur.dias_credito_clientes, dp = dias(b.dias_credito_proveedores) ?? cur.dias_credito_proveedores;
  const hz = [30, 60, 90, 120, 180].includes(Number(b.horizonte_dias)) ? Number(b.horizonte_dias) : cur.horizonte_dias;
  await exec(`INSERT INTO fz_config (tenant_id,reserva_minima,aprobador_user_id,dias_credito_clientes,dias_credito_proveedores,horizonte_dias,updated_at)
    VALUES (:t,:r,:a,:dc,:dp,:h,NOW()) ON CONFLICT (tenant_id) DO UPDATE SET reserva_minima=:r, aprobador_user_id=:a,
    dias_credito_clientes=:dc, dias_credito_proveedores=:dp, horizonte_dias=:h, updated_at=NOW()`, { t: req.tenant, r: reserva, a: aprob, dc, dp, h: hz });
  audit(req, 'config_updated', `reserva ${reserva} aprobador ${aprob}`);
  res.json(await config(req.tenant));
});

/* ── estado de capital (lo que alimenta al motor) ────────────────────── */
async function cargarEstado(tenant, hoy) {
  const cfg = await config(tenant);
  const cuentas = await sel('SELECT * FROM fz_cuentas WHERE tenant_id=:t AND active ORDER BY incluir DESC, nombre', { t: tenant });
  const movs = await sel(`SELECT m.cuenta_id, m.fecha::text AS fecha, m.monto FROM fz_movimientos m JOIN fz_cuentas c ON c.id=m.cuenta_id AND c.tenant_id=m.tenant_id
    WHERE m.tenant_id=:t AND m.fecha > COALESCE(c.fecha_saldo, DATE '1900-01-01')`, { t: tenant });
  let efectivo = 0;
  for (const c of cuentas) { c.saldo = E.saldoCuenta(c, movs, hoy); if (c.incluir) efectivo += c.saldo; }
  const cxc = (await sel(`SELECT x.id, x.folio, x.vencimiento::text AS vencimiento, x.compromiso_fecha::text AS compromiso_fecha, x.total, k.nombre AS cliente,
      COALESCE((SELECT SUM(a.monto) FROM fz_cxc_abonos a WHERE a.cxc_id=x.id AND a.tenant_id=x.tenant_id),0) AS abonado
    FROM fz_cxc x JOIN fz_clientes k ON k.id=x.cliente_id AND k.tenant_id=x.tenant_id WHERE x.tenant_id=:t AND x.estado='abierta'`, { t: tenant }))
    .map((x) => ({ ...x, pendiente: E.pendiente(x.total, [{ monto: x.abonado }]) }));
  const cxp = (await sel(`SELECT x.id, x.folio, x.vencimiento::text AS vencimiento, x.fecha_programada::text AS fecha_programada, x.estado, x.total, p.nombre AS proveedor,
      COALESCE((SELECT SUM(a.monto) FROM fz_cxp_pagos a WHERE a.cxp_id=x.id AND a.tenant_id=x.tenant_id),0) AS pagado
    FROM fz_cxp x JOIN fz_proveedores p ON p.id=x.proveedor_id AND p.tenant_id=x.tenant_id WHERE x.tenant_id=:t AND x.estado IN ('abierta','programada','aprobada')`, { t: tenant }))
    .map((x) => ({ ...x, pendiente: E.pendiente(x.total, [{ monto: x.pagado }]) }));
  const fijos = await sel(`SELECT id, concepto, categoria, monto, frecuencia, dia, desde::text AS desde, hasta::text AS hasta, pagado_hasta::text AS pagado_hasta, active
    FROM fz_fijos WHERE tenant_id=:t AND active`, { t: tenant });
  return { cfg, cuentas, efectivo, cxc, cxp, fijos };
}
function opcionesDe(q, cfg) {
  const h = Number(q.horizonte);
  return {
    horizonte: [30, 60, 90, 120, 180].includes(h) ? h : cfg.horizonte_dias,
    opciones: { vencido: q.vencido === 'hoy' ? 'hoy' : 'excluir', retraso: dias(q.retraso) || 0 }
  };
}
function entradaMotor(st, hoy, o) {
  return { hoy, horizonte: o.horizonte, reserva: st.cfg.reserva_minima, efectivo: st.efectivo, cxc: st.cxc, cxp: st.cxp, fijos: st.fijos, opciones: o.opciones };
}

async function tableroDe(tenant, query) {
  const req = { tenant, query: query || {} };
  const hoy = hoyMx(), st = await cargarEstado(req.tenant, hoy), o = opcionesDe(req.query, st.cfg);
  const p = E.proyectar(entradaMotor(st, hoy, o));
  const cartera = E.antiguedad(st.cxc, hoy);
  const cxpVencido = st.cxp.filter((x) => String(x.fecha_programada || x.vencimiento) < hoy).reduce((a, x) => a + x.pendiente, 0);
  const en30 = E.addDays(hoy, 30);
  const porPagar30 = st.cxp.filter((x) => String(x.fecha_programada || x.vencimiento) <= en30).reduce((a, x) => a + x.pendiente, 0);
  const porPagarTotal = st.cxp.reduce((a, x) => a + x.pendiente, 0);
  const mes = hoy.slice(0, 7) + '-01';
  const porCategoria = await sel(`SELECT m.categoria, SUM(CASE WHEN m.monto>0 THEN m.monto ELSE 0 END) AS entradas, SUM(CASE WHEN m.monto<0 THEN -m.monto ELSE 0 END) AS salidas, COUNT(*)::int AS n
    FROM fz_movimientos m JOIN fz_cuentas c ON c.id=m.cuenta_id AND c.tenant_id=m.tenant_id WHERE m.tenant_id=:t AND c.incluir AND m.fecha>=:d AND m.fecha<=:h
    GROUP BY m.categoria ORDER BY m.categoria`, { t: req.tenant, d: mes, h: hoy });
  const proximos = p.eventos.filter((e) => e.fecha <= E.addDays(hoy, 14));
  return ({
    hoy, efectivo: st.efectivo, cuentas: st.cuentas.map((c) => ({ id: c.id, nombre: c.nombre, banco: c.banco, terminacion: c.terminacion, incluir: c.incluir, uso: c.uso, saldo: c.saldo, fecha_saldo: c.fecha_saldo })),
    reserva: p.reserva, minimo: p.minimo, final: p.final, hasta: p.hasta, horizonte: p.horizonte, primero_bajo_reserva: p.primero_bajo_reserva, primero_negativo: p.primero_negativo,
    falta_para_reserva: p.falta_para_reserva, falta_para_cero: p.falta_para_cero,
    cartera, por_pagar_30: porPagar30, por_pagar_total: porPagarTotal, cxp_vencido: cxpVencido,
    serie: p.serie.map((d) => ({ fecha: d.fecha, saldo: d.saldo })), proximos,
    alertas: E.alertas(p, cartera, cxpVencido),
    mes: { desde: mes, por_categoria: porCategoria.map((r) => ({ categoria: r.categoria, entradas: E.toC(r.entradas), salidas: E.toC(r.salidas), n: r.n })) },
    sicar_ultima: ((await one('SELECT MAX(created_at) AS u FROM fz_sicar_imports WHERE tenant_id=:t', { t: req.tenant })) || {}).u || null,
    sin_datos: !st.cxc.length && !st.cxp.length && !st.fijos.length && st.cuentas.every((c) => !c.fecha_saldo)
  });
}
api.get('/tablero', async (req, res) => res.json(await tableroDe(req.tenant, req.query)));
api.get('/proyeccion', async (req, res) => {
  const hoy = hoyMx(), st = await cargarEstado(req.tenant, hoy), o = opcionesDe(req.query, st.cfg);
  res.json(E.proyectar(entradaMotor(st, hoy, o)));
});
/** Simula una venta a crédito sobre los datos reales. No guarda nada. */
api.post('/simular-venta', async (req, res) => {
  const hoy = hoyMx(), st = await cargarEstado(req.tenant, hoy), o = opcionesDe(req.body || {}, st.cfg);
  const r = E.simularVenta(entradaMotor(st, hoy, o), req.body || {});
  if (r.error) return res.status(400).json(r);
  res.json(r);
});


/* ── Simulador con datos reales ──────────────────────────────────────── */
/**
 * Base del simulador: la proyección real + el patrón de los bancos. La cobertura histórica es
 * el tramo en que TODAS las cuentas que suman al efectivo tienen movimientos (si una empieza en
 * julio, el patrón empieza en julio): mezclar meses con una cuenta sin datos inventaría un mes flojo.
 */
async function baseSimulador(tenant, hoy) {
  const st = await cargarEstado(tenant, hoy);
  const cob = await sel(`SELECT c.id, c.nombre, c.fecha_saldo::text AS fs, MIN(m.fecha)::text AS primero, MAX(m.fecha)::text AS ultimo, COUNT(m.id)::int AS n
    FROM fz_cuentas c LEFT JOIN fz_movimientos m ON m.cuenta_id=c.id AND m.tenant_id=c.tenant_id WHERE c.tenant_id=:t AND c.incluir AND c.active GROUP BY c.id`, { t: tenant });
  const conDatos = cob.filter((c) => c.n > 0);
  let cobertura = null, datosHasta = null;
  if (conDatos.length) {
    const ini = conDatos.map((c) => (c.fs ? E.addDays(c.fs, 1) : c.primero)).sort().pop();
    const fin = conDatos.map((c) => c.ultimo).sort()[0];
    datosHasta = conDatos.map((c) => c.ultimo).sort().pop();
    if (ini <= fin) cobertura = { desde: ini, hasta: fin };
  }
  let patron = null, historia = null;
  if (cobertura) {
    const movs = await sel(`SELECT m.fecha::text AS fecha, m.monto, m.categoria FROM fz_movimientos m JOIN fz_cuentas c ON c.id=m.cuenta_id AND c.tenant_id=m.tenant_id
      WHERE m.tenant_id=:t AND c.incluir AND c.active AND m.categoria <> 'traspaso' AND m.fecha BETWEEN :d AND :h`, { t: tenant, d: cobertura.desde, h: cobertura.hasta });
    patron = E.patronHistorico(movs, cobertura);
    if (patron) historia = E.historiaDiaria(movs, patron.meses.map((m) => m.mes));
  }
  return { st, patron, historia, cobertura, datosHasta, sinCuentasConDatos: cob.filter((c) => !c.n).length, cuentasSinDatos: cob.filter((c) => !c.n).map((c) => c.nombre) };
}
/**
 * Salud financiera para el tablero: calificación 0–100, Monte Carlo a 90 días, días de efectivo,
 * concentración de clientes (Gini), meses, mapa de calor y a dónde se va el dinero. Solo lectura.
 * Todo sale de los bancos y documentos reales; lo que es estimación lo dice.
 */
// Un reporte filtrado a "Vencidos" no es el saldo total: el total sale del último que no lo es,
// y lo vencido del último de vencidos.
async function fotoSicar(tenant, lado) {
  const req = { tenant };
  const ult = (cond) => one(`SELECT i.id, i.tipo, i.created_at, i.hasta::text AS hasta FROM fz_sicar_imports i WHERE i.tenant_id=:t AND EXISTS (SELECT 1 FROM fz_sicar_saldos s WHERE s.import_id=i.id AND s.lado=:l AND s.tenant_id=i.tenant_id AND ${cond}) ORDER BY i.id DESC LIMIT 1`, { t: req.tenant, l: lado });
  const [i, iv] = await Promise.all([ult("COALESCE(s.vista,'') <> 'vencidos'"), ult("s.vista = 'vencidos'")]);
  if (!i && !iv) return null;
  const suma = async (x) => (await sel('SELECT COALESCE(SUM(saldo),0) AS s, COUNT(*)::int AS n FROM fz_sicar_saldos WHERE tenant_id=:t AND import_id=:i AND lado=:l', { t: req.tenant, i: x.id, l: lado }))[0];
  const s = i ? await suma(i) : null, v = iv ? await suma(iv) : null;
  return { import_id: i ? i.id : null, tipo: i ? i.tipo : iv.tipo, fecha: (i || iv).created_at, corte: i ? i.hasta : null,
    saldo_sicar: s ? E.toC(s.s) : null, personas: s ? s.n : null,
    vencido_sicar: v ? E.toC(v.s) : null, personas_vencidas: v ? v.n : null, fecha_vencidos: iv ? iv.created_at : null, vencidos_import_id: iv ? iv.id : null };
}
const OPERATIVA_FUERA = ['traspaso', 'prestamo', 'aportacion_socios'];
async function saludDe(tenant) {
  const req = { tenant };
  const hoy = hoyMx();
  const { st, patron, historia, cobertura, datosHasta, cuentasSinDatos } = await baseSimulador(req.tenant, hoy);
  const base = entradaMotor(st, hoy, { horizonte: 90, opciones: { vencido: 'excluir', retraso: 0 } });
  const p = E.proyectar(base);
  const cartera = E.antiguedad(st.cxc, hoy);
  const reserva = st.cfg.reserva_minima;
  const mc = historia ? E.monteCarlo({ hoy, efectivo: st.efectivo, historia, eventos: p.eventos, horizonte: 90, caminos: 2000, reserva, semilla: Number(hoy.replace(/-/g, '')) + req.tenant }) : null;
  const pm = patron ? patron.promedio_mes : null;
  const cats = patron ? patron.por_categoria : {};
  const sum = (k, filtro) => Object.entries(cats).filter(([c]) => filtro(c)).reduce((a, [, v]) => a + v[k], 0);
  const entOp = patron ? sum('entradas', (c) => !OPERATIVA_FUERA.includes(c)) : null;
  const salOp = patron ? sum('salidas', (c) => !OPERATIVA_FUERA.includes(c) && c !== 'retiro_socios') : null;
  // Concentración: depósitos de clientes con nombre del pagador, últimos 6 meses.
  const desde6 = E.addDays(hoy, -183);
  const dep = await sel(`SELECT UPPER(REGEXP_REPLACE(TRIM(m.contraparte), '\\s+', ' ', 'g')) AS nombre, SUM(m.monto) AS monto FROM fz_movimientos m JOIN fz_cuentas c ON c.id=m.cuenta_id AND c.tenant_id=m.tenant_id
    WHERE m.tenant_id=:t AND c.incluir AND m.monto>0 AND m.categoria IN ('cliente','sin_categoria') AND m.fecha>=:d AND m.contraparte IS NOT NULL AND TRIM(m.contraparte)<>'' GROUP BY 1`, { t: req.tenant, d: desde6 });
  const tot = await one(`SELECT COALESCE(SUM(m.monto),0) AS m FROM fz_movimientos m JOIN fz_cuentas c ON c.id=m.cuenta_id AND c.tenant_id=m.tenant_id
    WHERE m.tenant_id=:t AND c.incluir AND m.monto>0 AND m.categoria IN ('cliente','sin_categoria') AND m.fecha>=:d`, { t: req.tenant, d: desde6 });
  const conc = E.concentracion(dep.map((r) => ({ nombre: r.nombre, monto: E.toC(r.monto) })));
  if (conc) conc.cobertura = E.toC(tot.m) ? conc.total / E.toC(tot.m) : null;
  const cxpTotal = st.cxp.reduce((a, x) => a + x.pendiente, 0);
  // Mientras la app no tenga las facturas de clientes, la cartera sale de la foto de saldos de SICAR
  // (total "Por Pagar" y lo "Vencido"). No entra a la proyección: no trae fechas de vencimiento.
  const fotoCxc = await fotoSicar(req.tenant, 'cxc');
  const carteraSicar = !cartera.total && fotoCxc && fotoCxc.saldo_sicar ? { total: fotoCxc.saldo_sicar, vencido: fotoCxc.vencido_sicar || 0,
    personas: fotoCxc.personas, personas_vencidas: fotoCxc.personas_vencidas, importado: fotoCxc.fecha, fuente: 'sicar' } : null;
  const cartTot = cartera.total || (carteraSicar ? carteraSicar.total : 0);
  const cartVen = cartera.total ? cartera.vencido : (carteraSicar && fotoCxc.vencido_sicar != null ? carteraSicar.vencido : null);
  const diasEf = pm && pm.salidas ? st.efectivo / (pm.salidas / 30.4) : null;
  const cal = E.calificacion({
    dias_efectivo: diasEf, prob_negativo_60: mc ? mc.prob_negativo_en[60] : null,
    margen_flujo: pm && pm.salidas ? (pm.entradas - pm.salidas) / pm.salidas : null,
    vencido_pct: cartTot && cartVen != null ? cartVen / cartTot : null, top5: conc && conc.n >= 5 ? conc.top5 : null
  });
  // Neural Findings: reglas fijas sobre las mismas cifras de esta pantalla (src/hallazgos.js).
  let topVencidos = [];
  if (fotoCxc && fotoCxc.vencidos_import_id) topVencidos = (await sel('SELECT parte, saldo FROM fz_sicar_saldos WHERE tenant_id=:t AND import_id=:i ORDER BY saldo DESC LIMIT 5', { t: req.tenant, i: fotoCxc.vencidos_import_id })).map((x) => ({ parte: x.parte, saldo: E.toC(x.saldo) }));
  else if (cartera.total) topVencidos = Object.values(st.cxc.filter((x) => x.vencimiento < hoy).reduce((a, x) => { const k = x.parte || x.cliente || '—'; (a[k] = a[k] || { parte: k, saldo: 0 }).saldo += x.pendiente; return a; }, {})).sort((a, b) => b.saldo - a.saldo).slice(0, 5);
  const fotoCxp = await fotoSicar(req.tenant, 'cxp');
  const totCat = Object.values(cats).reduce((a, v) => a + v.entradas + v.salidas, 0);
  const sinCat = cats.sin_categoria ? cats.sin_categoria.entradas + cats.sin_categoria.salidas : 0;
  const hallazgos = H.hallazgos({ hoy, efectivo: st.efectivo, dias_efectivo: diasEf, salida_diaria: pm ? Math.round(pm.salidas / 30.4) : null,
    prob60: mc ? mc.prob_negativo_en[60] : null, prob90: mc ? mc.prob_negativo_en[90] : null, minimo_p50: mc ? mc.minimo.p50 : null, reserva,
    cartera: cartTot ? { total: cartTot, vencido: cartVen, fuente: cartera.total ? 'app' : 'sicar' } : null, top_vencidos: topVencidos,
    top5: conc ? conc.top5 : null, clientes_n: conc ? conc.n : 0, sin_categoria_pct: totCat ? sinCat / totCat : null,
    meses: patron ? patron.meses : [], datos_hasta: datosHasta, cuentas_sin_datos: cuentasSinDatos || [], por_pagar: cxpTotal, hay_cxp_sicar: !!(fotoCxp && fotoCxp.saldo_sicar) });
  return ({
    hoy, efectivo: st.efectivo, reserva, datos_hasta: datosHasta, cobertura, hallazgos,
    calificacion: cal, monte_carlo: mc,
    dias_efectivo: diasEf, salida_diaria: pm ? Math.round(pm.salidas / 30.4) : null,
    promedio_mes: pm, entradas_operativas_mes: entOp, salidas_operativas_mes: salOp,
    meses: patron ? patron.meses : [], meses_n: patron ? patron.n : 0, peor_mes: patron ? patron.peor_mes : null, mejor_mes: patron ? patron.mejor_mes : null,
    calor: patron ? Array.from({ length: 31 }, (_, i) => patron.dias.promedio.ent[i + 1] - patron.dias.promedio.sal[i + 1]) : [],
    categorias: Object.entries(cats).map(([k, v]) => ({ categoria: k, ...v })).sort((a, b) => (b.entradas + b.salidas) - (a.entradas + a.salidas)),
    concentracion: conc,
    cartera, cartera_sicar: carteraSicar,
    financiamientos: st.fijos.filter((f) => f.categoria === 'financiamiento').map((f) => ({ concepto: f.concepto, monto: E.toC(f.monto), frecuencia: f.frecuencia, dia: f.dia, hasta: f.hasta })),
    dso: cartTot && entOp ? cartTot / (entOp / 30.4) : null,
    dpo: cxpTotal && salOp ? cxpTotal / (salOp / 30.4) : null,
    por_pagar: cxpTotal
  });
}
api.get('/salud', async (req, res) => res.json(await saludDe(req.tenant)));
/* ── Dalia: asistente financiera (orbe de Digit2AI). Solo lee; la empresa sale de la sesión. ── */
const dalia = require('./dalia');
const daliaDeps = () => ({ E, hoyMx, sel, one, tableroDe, saludDe, sicarResumenDe, cargarEstado, entradaMotor, baseSimulador, config, CATEGORIAS });
api.post('/dalia/chat', async (req, res) => {
  const k = 'dalia|' + req.user.id;
  if (tooMany(k, 40)) return res.status(429).json({ reply: 'Me hiciste muchas preguntas seguidas. Espera unos minutos y seguimos.', error: 'too_many' });
  noteAttempt(k);
  const t = await one('SELECT name FROM fz_tenants WHERE id=:t', { t: req.tenant });
  const r = await dalia.responder((req.body || {}).messages, {
    tenant: req.tenant, empresa: t && t.name, usuario: req.user.name || null, rol: req.user.role,
    D: daliaDeps()
  });
  audit(req, 'dalia', (r.composed_by || '') + (r.herramientas && r.herramientas.length ? ': ' + r.herramientas.join(',') : ''));
  res.json({ reply: r.reply, source: r.source, composed_by: r.composed_by });
});
api.post('/simulador', async (req, res) => {
  const hoy = hoyMx(), b = req.body || {};
  const { st, patron, datosHasta, sinCuentasConDatos } = await baseSimulador(req.tenant, hoy);
  const H = [30, 60, 90, 120, 180].includes(Number(b.horizonte)) ? Number(b.horizonte) : st.cfg.horizonte_dias;
  const efectivo = b.efectivo === '' || b.efectivo == null ? st.efectivo : (num(b.efectivo) != null && Math.abs(num(b.efectivo)) < 1e10 ? Math.round(num(b.efectivo) * 100) : st.efectivo);
  const reserva = b.reserva === '' ? null : b.reserva == null ? st.cfg.reserva_minima : moneyIn(b.reserva);
  const documentos = st.cxc.length + st.cxp.length + st.fijos.length;
  const historico = ['no', 'promedio', 'peor', 'mejor'].includes(b.historico) ? b.historico : (patron && !documentos ? 'promedio' : 'no');
  const base = { hoy, horizonte: H, reserva, efectivo, cxc: st.cxc, cxp: st.cxp, fijos: st.fijos, patron };
  const hasta = E.addDays(hoy, H);
  const enRango = (f) => date(f) && f >= hoy && f <= hasta;
  const cambios = {
    historico, entradas_pct: num(b.entradas_pct) || 0, salidas_pct: num(b.salidas_pct) || 0,
    retraso: dias(b.retraso) || 0, vencido: b.vencido === 'hoy' ? 'hoy' : 'excluir',
    // Solo pagos de ESTA empresa: un id ajeno o inventado no mueve nada.
    mover: (Array.isArray(b.mover) ? b.mover : []).slice(0, 200).filter((m) => m && enRango(m.fecha) && st.cxp.some((x) => String(x.id) === String(m.cxp_id))),
    venta: b.venta && typeof b.venta === 'object' ? b.venta : null,
    puntuales: (Array.isArray(b.puntuales) ? b.puntuales : []).slice(0, 30).filter((p) => p && enRango(p.fecha) && num(p.monto))
      .map((p) => ({ fecha: p.fecha, monto: (p.tipo === 'entrada' ? 1 : -1) * Math.abs(num(p.monto)), concepto: str(p.concepto, 120) }))
  };
  const ini = E.escenario(base, { historico, vencido: 'excluir' });
  const mod = E.escenario(base, cambios);
  const avisos = [];
  if (datosHasta && datosHasta < E.addDays(hoy, -3)) avisos.push({ nivel: 'medio', texto: `Los bancos están cargados hasta el ${E.fechaLarga(datosHasta)}: el efectivo de hoy es el de esa fecha. Importa los movimientos más recientes para que el punto de partida sea exacto.` });
  if (historico !== 'no' && documentos) avisos.push({ nivel: 'info', texto: 'Estás sumando el patrón de los bancos y también documentos reales (por cobrar, por pagar o gastos fijos): un mismo pago puede contarse dos veces. Úsalo como escenario aproximado.' });
  if (historico === 'no' && !documentos) avisos.push({ nivel: 'info', texto: 'Sin por cobrar, por pagar ni gastos fijos cargados, la proyección queda plana. Usa la base histórica o importa los créditos de SICAR.' });
  if (sinCuentasConDatos) avisos.push({ nivel: 'info', texto: `${sinCuentasConDatos} cuenta(s) que suman al efectivo no tienen movimientos cargados (por ejemplo Banorte): el patrón no las incluye.` });
  const lim = (p) => p.eventos.slice(0, 600).map((e) => ({ fecha: e.fecha, concepto: e.concepto, monto: e.monto, tipo: e.tipo, vencido: !!e.vencido }));
  res.json({
    hoy, horizonte: H, datos_hasta: datosHasta, historico, documentos,
    // El efectivo del tablero (suma de las cuentas incluidas): el simulador lo muestra como punto de partida.
    efectivo_bancos: st.efectivo, efectivo_usado: efectivo,
    inicial: { serie: ini.serie.map((d) => d.saldo), indicadores: E.indicadores(base, ini, b.eval_dia) },
    modificado: { serie: mod.serie.map((d) => ({ fecha: d.fecha, saldo: d.saldo })), indicadores: E.indicadores(base, mod, b.eval_dia), eventos: lim(mod), vencido_no_contado: mod.vencido_no_contado.slice(0, 200).map((e) => ({ concepto: e.concepto, vencimiento: e.vencimiento, dias_vencido: e.dias_vencido, monto: e.monto })),
      fuera: (mod.fuera || []).slice(0, 100).map((e) => ({ fecha: e.fecha, concepto: e.concepto, monto: e.monto })), venta: mod.venta },
    patron: patron && { meses: patron.meses, n: patron.n, desde: patron.desde, hasta: patron.hasta, promedio_mes: patron.promedio_mes, peor_mes: patron.peor_mes, mejor_mes: patron.mejor_mes,
      por_categoria: Object.entries(patron.por_categoria).map(([k, v]) => ({ categoria: k, ...v })).sort((a, z) => (z.entradas + z.salidas) - (a.entradas + a.salidas)) },
    pagos: st.cxp.filter((x) => x.pendiente > 0).map((x) => ({ id: x.id, proveedor: x.proveedor, folio: x.folio, vencimiento: x.vencimiento, fecha_programada: x.fecha_programada, pendiente: x.pendiente })),
    avisos
  });
});

/* ── documentos (por cobrar / por pagar) ─────────────────────────────── */
const DOC = {
  cxc: { table: 'fz_cxc', pagos: 'fz_cxc_abonos', fk: 'cxc_id', parte: 'cliente_id', partes: 'fz_clientes', nombre: 'cliente', diasCfg: 'dias_credito_clientes', signo: 1, categoria: 'cliente', origenMov: 'cobro' },
  cxp: { table: 'fz_cxp', pagos: 'fz_cxp_pagos', fk: 'cxp_id', parte: 'proveedor_id', partes: 'fz_proveedores', nombre: 'proveedor', diasCfg: 'dias_credito_proveedores', signo: -1, categoria: 'proveedor', origenMov: 'pago' }
};
async function listarDocs(d, tenant, q) {
  const hoy = hoyMx();
  const where = q.estado === 'todas' ? '' : q.estado === 'cerradas' ? "AND x.estado IN ('pagada','cancelada')" : "AND x.estado NOT IN ('pagada','cancelada')";
  const rows = await sel(`SELECT x.*, x.fecha::text AS fecha, x.vencimiento::text AS vencimiento, ${d === DOC.cxc ? 'x.compromiso_fecha::text AS compromiso_fecha,' : 'x.fecha_programada::text AS fecha_programada,'}
      p.nombre AS ${d.nombre}, p.telefono, COALESCE((SELECT SUM(a.monto) FROM ${d.pagos} a WHERE a.${d.fk}=x.id AND a.tenant_id=x.tenant_id),0) AS pagado
    FROM ${d.table} x JOIN ${d.partes} p ON p.id=x.${d.parte} AND p.tenant_id=x.tenant_id WHERE x.tenant_id=:t ${where} ORDER BY x.vencimiento, x.id`, { t: tenant });
  return rows.map((x) => ({ ...x, pendiente: E.pendiente(x.total, [{ monto: x.pagado }]), dias_vencido: Math.max(0, E.diffDays(x.vencimiento, hoy)) }));
}
async function parteId(d, tenant, b, t) {
  if (b[d.parte]) { const id = intId(b[d.parte]); return id && (await own(d.partes, id, tenant, t)) ? id : null; }
  const nombre = str(b[d.nombre], 200);
  if (!nombre) return null;
  await exec(`INSERT INTO ${d.partes} (tenant_id,nombre) VALUES (:t,:n) ON CONFLICT DO NOTHING`, { t: tenant, n: nombre }, t);
  return (await one(`SELECT id FROM ${d.partes} WHERE tenant_id=:t AND LOWER(nombre)=LOWER(:n)`, { t: tenant, n: nombre }, t)).id;
}
/** Vencimiento: el escrito; si no, fecha + días (del documento, de la persona o los de Ajustes). */
async function venceDe(d, tenant, b, fecha, pid, t) {
  const v = date(b.vencimiento);
  if (v) return v < fecha ? { error: 'vence_antes_de_fecha' } : { v };
  let n = dias(b.dias_credito);
  if (n == null) { const p = await own(d.partes, pid, tenant, t); n = p && p.dias_credito != null ? p.dias_credito : (await config(tenant))[d.diasCfg]; }
  return { v: E.vencimiento(fecha, n) };
}
async function crearDoc(d, req, b, t, origen) {
  const fecha = date(b.fecha) || hoyMx(), total = moneyIn(b.total);
  if (!total) return { status: 400, error: 'total_invalido' };
  const pid = await parteId(d, req.tenant, b, t);
  if (!pid) return { status: 400, error: 'falta_' + d.nombre };
  const ve = await venceDe(d, req.tenant, b, fecha, pid, t);
  if (ve.error) return { status: 400, error: ve.error };
  const folio = strOrNull(b.folio, 60);
  const extra = d === DOC.cxc ? { tipo_doc: b.tipo_doc === 'remision' ? 'remision' : 'factura' } : {};
  const cols = ['tenant_id', d.parte, 'folio', 'fecha', 'vencimiento', 'total', 'notas', 'origen', 'created_by', ...Object.keys(extra)];
  const [r] = await exec(`INSERT INTO ${d.table} (${cols.join(',')}) VALUES (${cols.map((c) => ':' + c).join(',')}) ON CONFLICT DO NOTHING RETURNING *`,
    { tenant_id: req.tenant, [d.parte]: pid, folio, fecha, vencimiento: ve.v, total, notas: strOrNull(b.notas, 500), origen: origen || 'manual', created_by: req.user.id, ...extra }, t);
  if (!r.length) return { status: 409, error: 'folio_duplicado' };
  return { row: r[0] };
}
async function pendienteDe(d, id, tenant, t) {
  const doc = await own(d.table, id, tenant, t);
  if (!doc) return null;
  const [s] = await sel(`SELECT COALESCE(SUM(monto),0) AS s FROM ${d.pagos} WHERE ${d.fk}=:id AND tenant_id=:t`, { id, t: tenant }, t);
  return { doc, pendiente: E.pendiente(doc.total, [{ monto: s.s }]), pagado: E.toC(s.s) };
}

for (const [key, d] of Object.entries(DOC)) {
  api.get('/' + key, async (req, res) => res.json(await listarDocs(d, req.tenant, req.query)));
  api.get('/' + key + '/:id', async (req, res) => {
    const id = intId(req.params.id), p = id && (await pendienteDe(d, id, req.tenant));
    if (!p) return res.status(404).json({ error: 'not_found' });
    const pagos = await sel(`SELECT a.*, a.fecha::text AS fecha, c.nombre AS cuenta FROM ${d.pagos} a LEFT JOIN fz_movimientos m ON m.id=a.movimiento_id AND m.tenant_id=a.tenant_id
      LEFT JOIN fz_cuentas c ON c.id=m.cuenta_id AND c.tenant_id=a.tenant_id WHERE a.${d.fk}=:id AND a.tenant_id=:t ORDER BY a.fecha, a.id`, { id, t: req.tenant });
    res.json({ ...p.doc, pendiente: p.pendiente, pagado: p.pagado, pagos });
  });
  api.post('/' + key, async (req, res) => {
    const r = await db.transaction((t) => crearDoc(d, req, req.body || {}, t));
    if (r.error) return res.status(r.status).json({ error: r.error });
    audit(req, key + '_created', `${r.row.id} ${r.row.total}`);
    res.status(201).json(r.row);
  });
  api.patch('/' + key + '/:id', async (req, res) => {
    const id = intId(req.params.id), p = id && (await pendienteDe(d, id, req.tenant));
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (['pagada', 'cancelada'].includes(p.doc.estado)) return res.status(409).json({ error: 'documento_cerrado' });
    const b = req.body || {}, set = {};
    if ('folio' in b) set.folio = strOrNull(b.folio, 60);
    if ('notas' in b) set.notas = strOrNull(b.notas, 500);
    if ('fecha' in b) { set.fecha = date(b.fecha); if (!set.fecha) return res.status(400).json({ error: 'fecha_invalida' }); }
    if ('vencimiento' in b) { set.vencimiento = date(b.vencimiento); if (!set.vencimiento) return res.status(400).json({ error: 'fecha_invalida' }); }
    if ((set.vencimiento || String(p.doc.vencimiento).slice(0, 10)) < (set.fecha || String(p.doc.fecha).slice(0, 10))) return res.status(400).json({ error: 'vence_antes_de_fecha' });
    if ('total' in b) {
      set.total = moneyIn(b.total);
      if (!set.total) return res.status(400).json({ error: 'total_invalido' });
      if (E.toC(set.total) < p.pagado) return res.status(400).json({ error: 'total_menor_que_pagado' });
    }
    if (key === 'cxc' && 'compromiso_fecha' in b) set.compromiso_fecha = b.compromiso_fecha ? date(b.compromiso_fecha) : null;
    if (key === 'cxc' && b.tipo_doc) set.tipo_doc = b.tipo_doc === 'remision' ? 'remision' : 'factura';
    if (!Object.keys(set).length) return res.status(400).json({ error: 'nothing_to_update' });
    try {
      const [r] = await exec(`UPDATE ${d.table} SET ${Object.keys(set).map((c) => `${c}=:${c}`).join(',')} WHERE id=:id AND tenant_id=:tenant RETURNING *`, { ...set, id, tenant: req.tenant });
      // La aprobación es de un monto: cambiar el total de un pago aprobado lo regresa a "programada" (se aprueba de nuevo).
      if (key === 'cxp' && set.total && p.doc.estado === 'aprobada' && E.toC(set.total) !== E.toC(p.doc.total)) {
        await exec("UPDATE fz_cxp SET estado='programada', aprobado_por=NULL, aprobado_at=NULL WHERE id=:id AND tenant_id=:t", { id, t: req.tenant });
      }
      if (set.total && E.pendiente(set.total, [{ monto: p.pagado / 100 }]) === 0) await exec(`UPDATE ${d.table} SET estado='pagada' WHERE id=:id AND tenant_id=:t`, { id, t: req.tenant });
      audit(req, key + '_updated', `${id} ${Object.keys(set).join(',')}${set.total ? ' total ' + p.doc.total + ' -> ' + set.total : ''}`);
      res.json(r[0]);
    } catch (e) { if (/unique/i.test(e.message)) return res.status(409).json({ error: 'folio_duplicado' }); throw e; }
  });
  /** Cancelar (no se borra): queda en el historial y sale de la proyección. */
  api.post('/' + key + '/:id/cancelar', async (req, res) => {
    const id = intId(req.params.id), p = id && (await pendienteDe(d, id, req.tenant));
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (p.doc.estado === 'pagada') return res.status(409).json({ error: 'documento_cerrado' });
    await exec(`UPDATE ${d.table} SET estado='cancelada' WHERE id=:id AND tenant_id=:t`, { id, t: req.tenant });
    audit(req, key + '_cancelada', id);
    res.json({ ok: true });
  });
  /**
   * Cobro (cxc) o pago (cxp). Nunca mayor que lo pendiente. Con cuenta_id también anota
   * el movimiento en esa cuenta (cuando llegue el estado de cuenta, se concilia, no se duplica).
   */
  api.post('/' + key + '/:id/pagos', async (req, res) => {
    const id = intId(req.params.id), b = req.body || {};
    const cfg = await config(req.tenant);
    const out = await db.transaction(async (t) => {
      await exec(`SELECT id FROM ${d.table} WHERE id=:id AND tenant_id=:t FOR UPDATE`, { id: id || 0, t: req.tenant }, t);
      const p = id && (await pendienteDe(d, id, req.tenant, t));
      if (!p) return { status: 404, error: 'not_found' };
      if (['pagada', 'cancelada'].includes(p.doc.estado)) return { status: 409, error: 'documento_cerrado' };
      if (key === 'cxp' && p.doc.estado !== 'aprobada' && !puedeAprobar(req, cfg)) return { status: 403, error: 'pago_no_aprobado' };
      const monto = moneyIn(b.monto), fecha = date(b.fecha) || hoyMx();
      if (!monto) return { status: 400, error: 'monto_invalido' };
      if (E.toC(monto) > p.pendiente) return { status: 400, error: 'monto_mayor_al_saldo' };
      if (fecha > hoyMx()) return { status: 400, error: 'fecha_futura' };
      let movId = null;
      if (b.cuenta_id) {
        const c = await own('fz_cuentas', intId(b.cuenta_id) || 0, req.tenant, t);
        if (!c) return { status: 404, error: 'cuenta_not_found' };
        const parte = await own(d.partes, p.doc[d.parte], req.tenant, t);
        const [m] = await exec(`INSERT INTO fz_movimientos (tenant_id,cuenta_id,fecha,concepto,contraparte,monto,categoria,origen,created_by)
          VALUES (:t,:c,:f,:co,:cp,:m,:cat,:o,:u) RETURNING id`, { t: req.tenant, c: c.id, f: fecha, co: `${key === 'cxc' ? 'Cobro' : 'Pago'} ${p.doc.folio || '#' + p.doc.id}`,
          cp: parte.nombre, m: d.signo * monto, cat: d.categoria, o: d.origenMov, u: req.user.id }, t);
        movId = m[0].id;
      }
      await exec(`INSERT INTO ${d.pagos} (tenant_id,${d.fk},fecha,monto,movimiento_id,nota,created_by) VALUES (:t,:id,:f,:m,:mv,:n,:u)`,
        { t: req.tenant, id, f: fecha, m: monto, mv: movId, n: strOrNull(b.nota, 300), u: req.user.id }, t);
      const queda = p.pendiente - E.toC(monto);
      if (queda === 0) await exec(`UPDATE ${d.table} SET estado='pagada' WHERE id=:id AND tenant_id=:t`, { id, t: req.tenant }, t);
      return { ok: true, pendiente: queda, movimiento_id: movId };
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    audit(req, key + '_pago', `${id} ${b.monto}`);
    res.status(201).json(out);
  });
  /** Deshacer un cobro/pago: reabre el documento y quita el movimiento que creó (si aún no se concilió con el banco). */
  api.delete('/' + key + '/:id/pagos/:pid', async (req, res) => {
    const id = intId(req.params.id), pid = intId(req.params.pid);
    const out = await db.transaction(async (t) => {
      const a = pid && (await one(`SELECT * FROM ${d.pagos} WHERE id=:pid AND ${d.fk}=:id AND tenant_id=:t`, { pid, id: id || 0, t: req.tenant }, t));
      if (!a) return { status: 404, error: 'not_found' };
      const doc = await own(d.table, id, req.tenant, t);
      if (doc.estado === 'cancelada') return { status: 409, error: 'documento_cerrado' };
      await exec(`DELETE FROM ${d.pagos} WHERE id=:pid AND tenant_id=:t`, { pid, t: req.tenant }, t);
      if (a.movimiento_id) await exec("DELETE FROM fz_movimientos WHERE id=:m AND tenant_id=:t AND NOT conciliado AND origen IN ('cobro','pago')", { m: a.movimiento_id, t: req.tenant }, t);
      const reabrir = key === 'cxp' ? (doc.aprobado_por ? 'aprobada' : doc.fecha_programada ? 'programada' : 'abierta') : 'abierta';
      if (doc.estado === 'pagada') await exec(`UPDATE ${d.table} SET estado=:e WHERE id=:id AND tenant_id=:t`, { e: reabrir, id, t: req.tenant }, t);
      return { ok: true };
    });
    if (out.error) return res.status(out.status).json({ error: out.error });
    audit(req, key + '_pago_borrado', `${id}/${pid}`);
    res.json(out);
  });
}

/* ── flujo de pagos a proveedores: programar → aprobar ───────────────── */
api.post('/cxp/:id/programar', async (req, res) => {
  const id = intId(req.params.id), x = id && (await own('fz_cxp', id, req.tenant));
  if (!x) return res.status(404).json({ error: 'not_found' });
  if (['pagada', 'cancelada'].includes(x.estado)) return res.status(409).json({ error: 'documento_cerrado' });
  const b = req.body || {};
  if (b.quitar) {
    await exec("UPDATE fz_cxp SET estado='abierta', fecha_programada=NULL, programado_por=NULL, aprobado_por=NULL, aprobado_at=NULL WHERE id=:id AND tenant_id=:t", { id, t: req.tenant });
    audit(req, 'cxp_desprogramada', id);
    return res.json({ ok: true });
  }
  const f = date(b.fecha);
  if (!f) return res.status(400).json({ error: 'fecha_invalida' });
  if (f < hoyMx()) return res.status(400).json({ error: 'fecha_pasada' });
  // Cambiar la fecha de algo ya aprobado lo regresa a "programada": se aprueba de nuevo.
  await exec("UPDATE fz_cxp SET estado='programada', fecha_programada=:f, programado_por=:u, aprobado_por=NULL, aprobado_at=NULL WHERE id=:id AND tenant_id=:t",
    { f, u: req.user.id, id, t: req.tenant });
  audit(req, 'cxp_programada', `${id} ${f}`);
  res.json({ ok: true });
});
api.post('/cxp/:id/aprobar', async (req, res) => {
  const cfg = await config(req.tenant);
  if (!puedeAprobar(req, cfg)) return res.status(403).json({ error: 'no_aprueba' });
  const id = intId(req.params.id), x = id && (await own('fz_cxp', id, req.tenant));
  if (!x) return res.status(404).json({ error: 'not_found' });
  if (x.estado !== 'programada') return res.status(409).json({ error: 'primero_programar' });
  await exec("UPDATE fz_cxp SET estado='aprobada', aprobado_por=:u, aprobado_at=NOW() WHERE id=:id AND tenant_id=:t AND estado='programada'", { u: req.user.id, id, t: req.tenant });
  audit(req, 'cxp_aprobada', `${id} ${x.total} para ${x.fecha_programada}`);
  res.json({ ok: true });
});

/* ── movimientos de banco ────────────────────────────────────────────── */
api.get('/movimientos', async (req, res) => {
  const hoy = hoyMx();
  const desde = date(req.query.desde) || hoy.slice(0, 7) + '-01', hasta = date(req.query.hasta) || hoy;
  const cuenta = req.query.cuenta_id ? intId(req.query.cuenta_id) : null;
  const rows = await sel(`SELECT m.*, m.fecha::text AS fecha, c.nombre AS cuenta FROM fz_movimientos m JOIN fz_cuentas c ON c.id=m.cuenta_id AND c.tenant_id=m.tenant_id
    WHERE m.tenant_id=:t AND m.fecha BETWEEN :d AND :h ${cuenta ? 'AND m.cuenta_id=:c' : ''} ${req.query.categoria && CATEGORIAS.includes(req.query.categoria) ? 'AND m.categoria=:cat' : ''}
    ORDER BY m.fecha DESC, m.id DESC LIMIT 2000`, { t: req.tenant, d: desde, h: hasta, c: cuenta, cat: req.query.categoria });
  res.json(rows);
});
api.post('/movimientos', async (req, res) => {
  const b = req.body || {};
  const c = await own('fz_cuentas', intId(b.cuenta_id) || 0, req.tenant);
  if (!c) return res.status(404).json({ error: 'cuenta_not_found' });
  const monto = moneyIn(b.monto), fecha = date(b.fecha) || hoyMx();
  if (!monto) return res.status(400).json({ error: 'monto_invalido' });
  if (fecha > hoyMx()) return res.status(400).json({ error: 'fecha_futura' });
  const concepto = str(b.concepto, 300);
  if (!concepto) return res.status(400).json({ error: 'falta_concepto' });
  const [r] = await exec(`INSERT INTO fz_movimientos (tenant_id,cuenta_id,fecha,concepto,referencia,contraparte,monto,categoria,origen,created_by)
    VALUES (:t,:c,:f,:co,:re,:cp,:m,:cat,'manual',:u) RETURNING *`, { t: req.tenant, c: c.id, f: fecha, co: concepto, re: strOrNull(b.referencia, 120),
    cp: strOrNull(b.contraparte, 200), m: (b.tipo === 'entrada' ? 1 : -1) * monto, cat: CATEGORIAS.includes(b.categoria) ? b.categoria : 'sin_categoria', u: req.user.id });
  audit(req, 'movimiento_manual', `${r[0].id} ${r[0].monto}`);
  res.status(201).json(r[0]);
});
api.patch('/movimientos/:id', async (req, res) => {
  const id = intId(req.params.id), m = id && (await own('fz_movimientos', id, req.tenant));
  if (!m) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {}, set = {};
  if ('categoria' in b) { if (!CATEGORIAS.includes(b.categoria)) return res.status(400).json({ error: 'categoria_invalida' }); set.categoria = b.categoria; }
  if ('contraparte' in b) set.contraparte = strOrNull(b.contraparte, 200);
  if (!Object.keys(set).length) return res.status(400).json({ error: 'nothing_to_update' });
  // Una categoría para todos los movimientos con la misma contraparte (p. ej. "esta cuenta = retiro de socios").
  if (b.aplicar_a_todos && set.categoria && m.contraparte) {
    const [r] = await exec('UPDATE fz_movimientos SET categoria=:c WHERE tenant_id=:t AND contraparte=:cp RETURNING id', { c: set.categoria, t: req.tenant, cp: m.contraparte });
    audit(req, 'categoria_masiva', `${m.contraparte} -> ${set.categoria} (${r.length})`);
    return res.json({ ok: true, actualizados: r.length });
  }
  await exec(`UPDATE fz_movimientos SET ${Object.keys(set).map((k) => `${k}=:${k}`).join(',')} WHERE id=:id AND tenant_id=:t`, { ...set, id, t: req.tenant });
  res.json({ ok: true });
});
/** Solo se borra lo capturado a mano. Lo importado del banco y lo ligado a un cobro/pago, no. */
api.delete('/movimientos/:id', async (req, res) => {
  const id = intId(req.params.id), m = id && (await own('fz_movimientos', id, req.tenant));
  if (!m) return res.status(404).json({ error: 'not_found' });
  if (m.origen !== 'manual' || m.conciliado) return res.status(409).json({ error: 'no_se_borra' });
  await exec('DELETE FROM fz_movimientos WHERE id=:id AND tenant_id=:t', { id, t: req.tenant });
  audit(req, 'movimiento_borrado', `${id} ${m.monto}`);
  res.json({ ok: true });
});

/* ── gastos fijos ────────────────────────────────────────────────────── */
function fijoRow(b, partial) {
  const out = {};
  if (!partial || 'concepto' in b) { out.concepto = str(b.concepto, 200); if (!out.concepto) return { error: 'falta_concepto' }; }
  if (!partial || 'categoria' in b) out.categoria = CATEG_FIJO.includes(b.categoria) ? b.categoria : 'otro';
  if (!partial || 'monto' in b) { out.monto = moneyIn(b.monto); if (!out.monto) return { error: 'monto_invalido' }; }
  if (!partial || 'frecuencia' in b) { if (!['semanal', 'quincenal', 'mensual'].includes(b.frecuencia)) return { error: 'frecuencia_invalida' }; out.frecuencia = b.frecuencia; }
  if (!partial || 'dia' in b) {
    const n = b.dia === '' || b.dia == null ? null : Math.round(Number(b.dia));
    if (n != null && !(n >= 1 && n <= 31)) return { error: 'dia_invalido' };
    out.dia = n;
  }
  for (const k of ['desde', 'hasta']) if (!partial || k in b) { out[k] = b[k] ? date(b[k]) : null; if (b[k] && !out[k]) return { error: 'fecha_invalida' }; }
  if ('notas' in b) out.notas = strOrNull(b.notas, 500);
  if ('active' in b) out.active = !!b.active;
  if (out.desde && out.hasta && out.hasta < out.desde) return { error: 'hasta_antes_de_desde' };
  return { row: out };
}
api.get('/fijos', async (req, res) => {
  const hoy = hoyMx();
  const rows = await sel("SELECT *, desde::text AS desde, hasta::text AS hasta, pagado_hasta::text AS pagado_hasta FROM fz_fijos WHERE tenant_id=:t ORDER BY active DESC, categoria, concepto", { t: req.tenant });
  res.json(rows.map((f) => {
    const prox = E.ocurrencias(f, E.addDays(hoy, -40), E.addDays(hoy, 400));
    return { ...f, proximo: prox[0] || null, pendientes_vencidos: prox.filter((x) => x < hoy).length };
  }));
});
api.post('/fijos', async (req, res) => {
  const { row, error } = fijoRow(req.body || {}, false);
  if (error) return res.status(400).json({ error });
  const cols = Object.keys(row);
  const [r] = await exec(`INSERT INTO fz_fijos (tenant_id,${cols.join(',')}) VALUES (:tenant_id,${cols.map((c) => ':' + c).join(',')}) RETURNING *`, { ...row, tenant_id: req.tenant });
  audit(req, 'fijo_created', `${r[0].id} ${r[0].concepto} ${r[0].monto}`);
  res.status(201).json(r[0]);
});
api.patch('/fijos/:id', async (req, res) => {
  const id = intId(req.params.id), f = id && (await own('fz_fijos', id, req.tenant));
  if (!f) return res.status(404).json({ error: 'not_found' });
  const { row, error } = fijoRow(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  if (!Object.keys(row).length) return res.status(400).json({ error: 'nothing_to_update' });
  const [r] = await exec(`UPDATE fz_fijos SET ${Object.keys(row).map((c) => `${c}=:${c}`).join(',')} WHERE id=:id AND tenant_id=:tenant_id RETURNING *`, { ...row, id, tenant_id: req.tenant });
  audit(req, 'fijo_updated', id);
  res.json(r[0]);
});
/** Marca pagada la ocurrencia de una fecha (y las anteriores). Opcional: anotarlo en una cuenta. */
api.post('/fijos/:id/pagado', async (req, res) => {
  const id = intId(req.params.id), f = id && (await own('fz_fijos', id, req.tenant));
  if (!f) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {}, fecha = date(b.fecha);
  if (!fecha) return res.status(400).json({ error: 'fecha_invalida' });
  const pagado = f.pagado_hasta || null; // DATE llega como texto YYYY-MM-DD
  if (pagado && fecha <= pagado) return res.status(409).json({ error: 'ya_pagado' });
  if (!E.ocurrencias({ ...f, pagado_hasta: pagado }, fecha, fecha).length) return res.status(400).json({ error: 'no_toca_ese_dia' });
  await db.transaction(async (t) => {
    if (b.cuenta_id) {
      const c = await own('fz_cuentas', intId(b.cuenta_id) || 0, req.tenant, t);
      if (!c) throw Object.assign(new Error('cuenta'), { status: 404 });
      await exec(`INSERT INTO fz_movimientos (tenant_id,cuenta_id,fecha,concepto,monto,categoria,origen,created_by) VALUES (:t,:c,:f,:co,:m,:cat,'fijo',:u)`,
        { t: req.tenant, c: c.id, f: fecha > hoyMx() ? hoyMx() : fecha, co: f.concepto, m: -Number(f.monto), cat: CATEGORIAS.includes(f.categoria) ? f.categoria : 'otro', u: req.user.id }, t);
    }
    await exec('UPDATE fz_fijos SET pagado_hasta=:f WHERE id=:id AND tenant_id=:t', { f: fecha, id, t: req.tenant }, t);
  }).catch((e) => { if (e.status) return res.status(e.status).json({ error: 'cuenta_not_found' }); throw e; });
  if (res.headersSent) return;
  audit(req, 'fijo_pagado', `${id} ${fecha}`);
  res.json({ ok: true });
});

/* ── importar de Excel/CSV ───────────────────────────────────────────── */
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
function parseSheet(buf, opts) {
  return new Promise((resolve) => {
    const { Worker } = require('worker_threads');
    const w = new Worker(path.join(__dirname, 'xlsx-worker.js'), { workerData: { buf, todas: !!(opts && opts.todas), max: opts && opts.max }, env: {}, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    const done = (r) => { clearTimeout(timer); w.terminate().catch(() => {}); resolve(r); };
    const timer = setTimeout(() => done({ error: 'archivo_muy_lento' }), 10000);
    w.once('message', (m) => done(m && Array.isArray(m.rows) ? { rows: m.rows } : { error: (m && m.error) || 'archivo_ilegible' }));
    w.once('error', () => done({ error: 'archivo_ilegible' }));
  });
}
function excelDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(v == null ? '' : v).trim();
  if (E.valid(s.slice(0, 10)) && /^\d{4}-/.test(s)) return s.slice(0, 10);
  const meses = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
  let m = s.match(/^(\d{1,2})[/\-.\s]([A-Za-z]{3})[a-z]*[/\-.\s](\d{2,4})$/);
  if (m && meses[m[2].toLowerCase()]) m = [null, m[1], String(meses[m[2].toLowerCase()]), m[3]];
  else m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); // México: día/mes/año
  if (!m) return null;
  const f = `${m[3].length === 2 ? '20' + m[3] : m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return E.valid(f) ? f : null;
}
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
/** Busca el renglón de encabezados (entre los primeros 30) que tenga las columnas requeridas. */
function encabezados(rows, campos, requeridos) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const head = (rows[i] || []).map(norm), map = {};
    for (const [k, re] of Object.entries(campos)) { const j = head.findIndex((h) => h && re.test(h)); if (j >= 0 && !Object.values(map).includes(j)) map[k] = j; }
    if (requeridos.every((grupo) => grupo.some((k) => map[k] != null))) return { fila: i, map };
  }
  return null;
}
async function recibirArchivo(req, res) {
  if (!req.file) { res.status(400).json({ error: 'falta_archivo' }); return null; }
  const b = req.file.buffer;
  const zip = b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
  const isText = !zip && !b.slice(0, 4096).includes(0);
  if (b.slice(0, 5).toString() === '%PDF-') { res.status(415).json({ error: 'pdf_no', ayuda: 'Por ahora el estado de cuenta en PDF no se lee: exporta el Excel o CSV desde la banca en línea o desde SICAR.' }); return null; }
  if (!zip && !isText) { res.status(415).json({ error: 'usa_excel_o_csv' }); return null; }
  const parsed = await parseSheet(b);
  if (parsed.error) { res.status(415).json({ error: parsed.error }); return null; }
  return parsed.rows;
}

/**
 * Estado de cuenta: Fecha, Concepto/Descripción, Referencia, Cargo/Retiro, Abono/Depósito
 * (o una sola columna Monto con signo) y, si viene, Saldo.
 * Duplicado (mismo archivo otra vez, o un estado que se traslapa) = se salta.
 * Coincide con un cobro/pago capturado en la app (misma cuenta, mismo monto, ±3 días) = lo concilia.
 */
api.post('/movimientos/importar', importUpload.single('archivo'), async (req, res) => {
  const c = await own('fz_cuentas', intId(req.body && req.body.cuenta_id) || 0, req.tenant);
  if (!c) return res.status(404).json({ error: 'cuenta_not_found' });
  const rows = await recibirArchivo(req, res); if (!rows) return;
  const H = encabezados(rows, {
    fecha: /^fecha|^fechaoper|^dia$/, concepto: /concepto|descripcion|detalle|movimiento/, referencia: /referencia|^ref|folio|autorizacion/,
    cargo: /cargo|retiro|debito|salida/, abono: /abono|deposito|credito|entrada/, monto: /^monto|^importe/, saldo: /^saldo/
  }, [['fecha'], ['concepto'], ['cargo', 'abono', 'monto']]);
  if (!H) return res.status(400).json({ error: 'sin_encabezados', ayuda: 'El archivo debe tener columnas Fecha, Concepto y Cargo/Abono (o Monto).' });
  const { fila, map } = H, cell = (r, k) => (map[k] != null ? r[map[k]] : '');
  const resultados = [], nuevos = [], vistos = new Map();
  let ultimoSaldo = null;
  for (let i = fila + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((x) => String(x).trim() === '')) continue;
    const fecha = excelDate(cell(r, 'fecha'));
    const concepto = str(cell(r, 'concepto'), 300);
    let monto = null;
    if (map.cargo != null || map.abono != null) {
      const ca = num(cell(r, 'cargo')), ab = num(cell(r, 'abono'));
      if (ab && Math.abs(ab) > 0) monto = Math.abs(ab); else if (ca && Math.abs(ca) > 0) monto = -Math.abs(ca);
    } else monto = num(cell(r, 'monto'));
    if (!fecha) { if (/saldo|total/i.test(String(r.join(' ')))) continue; resultados.push({ renglon: i + 1, ok: false, motivo: 'fecha' }); continue; }
    if (!monto) { resultados.push({ renglon: i + 1, ok: false, motivo: 'monto' }); continue; }
    if (Math.abs(monto) > 1e10) { resultados.push({ renglon: i + 1, ok: false, motivo: 'monto' }); continue; }
    const referencia = strOrNull(cell(r, 'referencia'), 120);
    const base = [fecha, concepto, referencia || '', monto.toFixed(2)].join('|');
    const k = vistos.get(base) || 0; vistos.set(base, k + 1); // dos movimientos idénticos el mismo día son dos movimientos
    const hash = crypto.createHash('sha256').update(base + '|' + k).digest('hex').slice(0, 32);
    const saldo = num(cell(r, 'saldo'));
    if (saldo != null && (!ultimoSaldo || fecha >= ultimoSaldo.fecha)) ultimoSaldo = { fecha, saldo };
    nuevos.push({ renglon: i + 1, fecha, concepto: concepto || '(sin concepto)', referencia, monto: Math.round(monto * 100) / 100, hash });
  }
  const actualizar = req.body.actualizar_saldo === '1' || req.body.actualizar_saldo === 'true';
  let creados = 0, duplicados = 0, conciliados = 0;
  await db.transaction(async (t) => {
    await exec('SELECT id FROM fz_cuentas WHERE id=:c AND tenant_id=:t FOR UPDATE', { c: c.id, t: req.tenant }, t);
    const ya = new Set((await sel('SELECT hash FROM fz_movimientos WHERE tenant_id=:t AND cuenta_id=:c AND hash IS NOT NULL', { t: req.tenant, c: c.id }, t)).map((x) => x.hash));
    const app = await sel(`SELECT id, fecha::text AS fecha, monto FROM fz_movimientos WHERE tenant_id=:t AND cuenta_id=:c AND NOT conciliado AND hash IS NULL AND origen IN ('manual','cobro','pago','fijo')`, { t: req.tenant, c: c.id }, t);
    for (const n of nuevos) {
      if (ya.has(n.hash)) { duplicados++; resultados.push({ renglon: n.renglon, ok: false, motivo: 'ya_estaba' }); continue; }
      ya.add(n.hash);
      const cand = app.filter((a) => !a.usado && E.toC(a.monto) === E.toC(n.monto) && Math.abs(E.diffDays(a.fecha, n.fecha)) <= 3)
        .sort((a, b) => Math.abs(E.diffDays(a.fecha, n.fecha)) - Math.abs(E.diffDays(b.fecha, n.fecha)))[0];
      if (cand) {
        cand.usado = true;
        await exec('UPDATE fz_movimientos SET fecha=:f, concepto=:co, referencia=:re, hash=:h, conciliado=TRUE WHERE id=:id AND tenant_id=:t',
          { f: n.fecha, co: n.concepto, re: n.referencia, h: n.hash, id: cand.id, t: req.tenant }, t);
        conciliados++; resultados.push({ renglon: n.renglon, ok: true, conciliado: true, monto: n.monto });
        continue;
      }
      await exec(`INSERT INTO fz_movimientos (tenant_id,cuenta_id,fecha,concepto,referencia,monto,origen,conciliado,hash,created_by)
        VALUES (:t,:c,:f,:co,:re,:m,'importado',TRUE,:h,:u)`, { t: req.tenant, c: c.id, f: n.fecha, co: n.concepto, re: n.referencia, m: n.monto, h: n.hash, u: req.user.id }, t);
      creados++; resultados.push({ renglon: n.renglon, ok: true, monto: n.monto });
    }
    if (actualizar && ultimoSaldo) await exec('UPDATE fz_cuentas SET saldo_inicial=:s, fecha_saldo=:f WHERE id=:c AND tenant_id=:t', { s: ultimoSaldo.saldo, f: ultimoSaldo.fecha, c: c.id, t: req.tenant }, t);
  });
  audit(req, 'movimientos_importados', `${c.nombre}: ${creados} nuevos, ${conciliados} conciliados, ${duplicados} repetidos`);
  res.json({ creados, conciliados, duplicados, saldo_actualizado: actualizar && ultimoSaldo ? ultimoSaldo : null, resultados: resultados.sort((a, b) => a.renglon - b.renglon) });
});

/**
 * Cuentas por cobrar / por pagar desde Excel (p. ej. el reporte de SICAR):
 * Cliente|Proveedor, Folio, Fecha, Vencimiento o Días de crédito, Total y, si viene, Saldo.
 * Quien no existe se crea por nombre. Un folio repetido para la misma persona se salta.
 * Si el Saldo es menor que el Total, la diferencia entra como abono "saldo inicial".
 */
for (const [key, d] of Object.entries(DOC)) {
  api.post('/' + key + '/importar', importUpload.single('archivo'), async (req, res) => {
    const rows = await recibirArchivo(req, res); if (!rows) return;
    const parte = key === 'cxc' ? /^cliente|nombre|razonsocial/ : /^proveedor|nombre|razonsocial/;
    const H = encabezados(rows, {
      parte, folio: /folio|factura|documento|^doc|remision|^num/, fecha: /^fecha(?!.*venc)|^emision|^fechadoc/, vencimiento: /venc/,
      dias: /^dias|credito|plazo/, total: /^total|^importe|^monto/, saldo: /^saldo|pendiente|porpagar|porcobrar|adeudo/
    }, [['parte'], ['total', 'saldo']]);
    if (!H) return res.status(400).json({ error: 'sin_encabezados', ayuda: `El archivo debe tener columnas ${d.nombre === 'cliente' ? 'Cliente' : 'Proveedor'} y Total (y de preferencia Folio, Fecha y Vencimiento).` });
    const { fila, map } = H, cell = (r, k) => (map[k] != null ? r[map[k]] : '');
    const resultados = []; let creados = 0;
    const hoy = hoyMx();
    await db.transaction(async (t) => {
      for (let i = fila + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.every((x) => String(x).trim() === '')) continue;
        const nombre = str(cell(r, 'parte'), 200);
        if (!nombre || /^total/i.test(nombre)) continue;
        let total = num(cell(r, 'total')), saldo = map.saldo != null ? num(cell(r, 'saldo')) : null;
        if (total == null && saldo != null) total = saldo;
        if (!(total > 0)) { resultados.push({ renglon: i + 1, ok: false, motivo: 'total' }); continue; }
        if (saldo != null && (saldo < 0 || saldo > total)) { resultados.push({ renglon: i + 1, ok: false, motivo: 'saldo' }); continue; }
        if (saldo === 0) { resultados.push({ renglon: i + 1, ok: false, motivo: 'ya_pagado' }); continue; }
        const fecha = excelDate(cell(r, 'fecha')) || hoy;
        const body = { [d.nombre]: nombre, folio: cell(r, 'folio') === '' ? null : String(cell(r, 'folio')), fecha, total,
          vencimiento: excelDate(cell(r, 'vencimiento')) || undefined, dias_credito: map.dias != null && cell(r, 'dias') !== '' ? cell(r, 'dias') : undefined };
        await exec('SAVEPOINT fila', {}, t);
        const out = await crearDoc(d, req, body, t, 'importado').catch((e) => ({ status: 400, error: 'renglon_invalido', detalle: e.message }));
        if (out.error) { await exec('ROLLBACK TO SAVEPOINT fila', {}, t); resultados.push({ renglon: i + 1, ok: false, motivo: out.error }); continue; }
        if (saldo != null && saldo < total) {
          await exec(`INSERT INTO ${d.pagos} (tenant_id,${d.fk},fecha,monto,nota,created_by) VALUES (:t,:id,:f,:m,'Saldo inicial importado',:u)`,
            { t: req.tenant, id: out.row.id, f: fecha, m: Math.round((total - saldo) * 100) / 100, u: req.user.id }, t);
        }
        creados++; resultados.push({ renglon: i + 1, ok: true, [d.nombre]: nombre, folio: out.row.folio, pendiente: saldo != null ? saldo : total });
      }
    });
    audit(req, key + '_importadas', `${creados} de ${resultados.length}`);
    res.json({ creados, resultados });
  });
}


/* ── SICAR: importar sus reportes (PDF o Excel), historial, análisis y puente ── */
const sicarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const PUBLIC_URL = String(process.env.FORZZA_PUBLIC_URL || 'https://aiagent.ringlypro.com/forzza/app').replace(/\/+$/, '');
function hashKey(k) { return crypto.createHash('sha256').update(String(k)).digest('hex'); }
/** PDF en un proceso aparte (ver pdf-child.js): renglones de celdas con su posición. */
function parsePdfRows(buf) {
  if (module.exports._pdfRows) return module.exports._pdfRows(buf);
  return new Promise((resolve) => {
    const { fork } = require('child_process');
    const c = fork(path.join(__dirname, 'pdf-child.js'), [], { env: {}, execArgv: ['--disallow-code-generation-from-strings', '--max-old-space-size=256'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let fin = false;
    const done = (r) => { if (fin) return; fin = true; clearTimeout(timer); try { c.kill('SIGKILL'); } catch (_) {} resolve(r); };
    const timer = setTimeout(() => done({ error: 'archivo_muy_lento' }), 25000);
    c.once('message', (m) => done(m && Array.isArray(m.pages) ? { pages: m.pages } : { error: (m && m.error) || 'pdf_ilegible' }));
    c.once('error', () => done({ error: 'pdf_ilegible' }));
    c.once('exit', () => done({ error: 'pdf_ilegible' }));
    c.send({ buf: buf.toString('base64') });
  });
}
/** Cualquier formato en que SICAR guarda un reporte -> páginas de celdas. Tipo por los primeros bytes. */
async function leerArchivoSicar(buf) {
  if (!buf || buf.length < 8) return { error: 'archivo_vacio' };
  if (buf.slice(0, 5).toString() === '%PDF-') return parsePdfRows(buf);
  const zip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const ole = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0; // .xls de Excel 97-2003
  const texto = !zip && !ole && !buf.slice(0, 4096).includes(0);
  if (!zip && !ole && !texto) return { error: 'formato_no_soportado' };
  const r = await parseSheet(buf, { todas: true, max: 30000 });
  if (r.error) return r;
  return { pages: S.desdeHoja(r.rows) };
}
const SICAR_AYUDA = {
  no_es_reporte_sicar: 'No reconocí el reporte. Sube uno de estos, tal como lo guarda SICAR: Créditos de Proveedores, Créditos a Clientes, Créditos por Periodo, General de Compras, General de Ventas o Abonos.',
  sin_detalle: 'En SICAR genera el reporte de créditos con "Tipo: Sí" (detalle de documentos) para importar folio por folio.',
  sin_columnas: 'Reconocí el reporte pero no encontré sus columnas. ¿Se editó el archivo? Súbelo tal como lo guarda SICAR.',
  formato_no_soportado: 'Sube el reporte en PDF o Excel, tal como lo guarda SICAR.',
  demasiados_renglones: 'El reporte es muy grande. Genéralo por periodos más cortos (por ejemplo, un trimestre).'
};
/** Un solo camino para revisar y aplicar: la revisión corre lo mismo y se deshace al final. */
async function importarSicar(req, res, { aplicar, origen }) {
  if (!req.file) return res.status(400).json({ error: 'falta_archivo' });
  const leido = await leerArchivoSicar(req.file.buffer);
  if (leido.error) return res.status(415).json({ error: leido.error, ayuda: SICAR_AYUDA[leido.error] });
  const rep = S.leer(leido.pages);
  if (rep.error) return res.status(400).json({ error: rep.error, tipo: rep.tipo || null, ayuda: SICAR_AYUDA[rep.error] || rep.ayuda });
  const meta = { archivo: str(req.file.originalname, 200) || null, sha256: crypto.createHash('sha256').update(req.file.buffer).digest('hex'), origen, hoy: hoyMx() };
  const ctx = { exec, sel, one, tenant: req.tenant, user: req.user, waNumero, config };
  const ya = await one('SELECT id, created_at FROM fz_sicar_imports WHERE tenant_id=:t AND sha256=:h ORDER BY id DESC LIMIT 1', { t: req.tenant, h: meta.sha256 });
  const PREVIA = Symbol('previa');
  let out;
  try {
    out = await db.transaction(async (t) => {
      await exec('SELECT pg_advisory_xact_lock(hashtext(:k))', { k: 'forzza_sicar_' + req.tenant }, t); // una importación a la vez por empresa
      const r = await SI.aplicar(ctx, rep, meta, t);
      if (!aplicar) throw Object.assign(new Error('previa'), { [PREVIA]: r });
      return r;
    });
  } catch (e) { if (e && e[PREVIA]) out = { ...e[PREVIA], import_id: null }; else throw e; }
  out.aplicado = !!aplicar;
  out.archivo_ya_importado = ya ? ya.created_at : null;
  if (aplicar) audit(req, 'sicar_importado', `${rep.tipo} ${meta.archivo || ''} ${JSON.stringify(out.conteo)}`);
  res.json(out);
}
api.post('/sicar/importar', (req, res, next) => sicarUpload.single('archivo')(req, res, next), async (req, res) => {
  const aplicar = req.body && (req.body.aplicar === '1' || req.body.aplicar === 'true');
  return importarSicar(req, res, { aplicar, origen: 'manual' });
});
api.get('/sicar/importaciones', async (req, res) => {
  res.json(await sel(`SELECT i.id, i.tipo, i.archivo, i.origen, i.desde::text AS desde, i.hasta::text AS hasta, i.filas, i.cuadra, i.total_impreso, i.total_leido, i.resumen, i.created_at,
    u.email AS por FROM fz_sicar_imports i LEFT JOIN fz_users u ON u.id=i.created_by AND u.tenant_id=i.tenant_id WHERE i.tenant_id=:t ORDER BY i.id DESC LIMIT 100`, { t: req.tenant }));
});
/** Análisis de lo importado de SICAR. Solo documentos vigentes (V); las devoluciones restan. */
async function sicarResumenDe(tenant, query) {
  const req = { tenant, query: query || {} };
  const hoy = hoyMx();
  const desde = date(req.query.desde) || (Number(hoy.slice(0, 4)) - 1) + hoy.slice(4, 7) + '-01', hasta = date(req.query.hasta) || hoy;
  const vig = "(est='V' OR doc='DEV' OR tipo IN ('abono_cliente','abono_proveedor'))";
  const signo = "CASE WHEN doc='DEV' THEN -total ELSE total END";
  const meses = await sel(`SELECT to_char(fecha,'YYYY-MM') AS mes,
      SUM(CASE WHEN tipo='compra' AND (doc<>'GAS' OR doc IS NULL) THEN ${signo} ELSE 0 END) AS compras,
      SUM(CASE WHEN tipo='compra' AND doc='GAS' THEN total ELSE 0 END) AS gastos,
      SUM(CASE WHEN tipo='venta' THEN ${signo} ELSE 0 END) AS ventas,
      SUM(CASE WHEN tipo='abono_cliente' THEN total ELSE 0 END) AS cobrado
    FROM fz_sicar_docs WHERE tenant_id=:t AND fecha BETWEEN :d AND :h AND ${vig} GROUP BY 1 ORDER BY 1`, { t: req.tenant, d: desde, h: hasta });
  const top = (tipo, extra) => sel(`SELECT parte, SUM(${signo}) AS total, COUNT(*)::int AS n FROM fz_sicar_docs WHERE tenant_id=:t AND tipo=:ti AND fecha BETWEEN :d AND :h AND ${vig} ${extra || ''}
    GROUP BY parte ORDER BY 2 DESC LIMIT 15`, { t: req.tenant, ti: tipo, d: desde, h: hasta });
  const [proveedores, gastos, clientes] = await Promise.all([top('compra', "AND (doc<>'GAS' OR doc IS NULL)"), top('compra', "AND doc='GAS'"), top('venta')]);
  // La última foto de saldos de SICAR contra lo que dice la app.
  const st = await cargarEstado(req.tenant, hoy);
  const [fc, fp] = await Promise.all([fotoSicar(req.tenant, 'cxc'), fotoSicar(req.tenant, 'cxp')]);
  if (fc) fc.saldo_app = st.cxc.reduce((a, x) => a + x.pendiente, 0);
  if (fp) fp.saldo_app = st.cxp.reduce((a, x) => a + x.pendiente, 0);
  const c = (rows, keys) => rows.map((r) => { const o = { ...r }; for (const k of keys) o[k] = E.toC(r[k]); return o; });
  const [ult] = await sel('SELECT MAX(created_at) AS u FROM fz_sicar_imports WHERE tenant_id=:t', { t: req.tenant });
  return ({ desde, hasta, meses: c(meses, ['compras', 'gastos', 'ventas', 'cobrado']), proveedores: c(proveedores, ['total']), gastos: c(gastos, ['total']), clientes: c(clientes, ['total']),
    conciliacion: { cxc: fc, cxp: fp }, ultima_importacion: ult.u });
}
api.get('/sicar/resumen', async (req, res) => res.json(await sicarResumenDe(req.tenant, req.query)));
/* Llaves del puente SICAR (solo director/dueño). */
api.get('/llaves', adminOnly, async (req, res) => {
  res.json(await sel('SELECT id, nombre, prefijo, created_at, last_used_at, revoked_at FROM fz_api_keys WHERE tenant_id=:t ORDER BY id DESC', { t: req.tenant }));
});
api.post('/llaves', adminOnly, async (req, res) => {
  const nombre = str(req.body && req.body.nombre, 80) || 'Puente SICAR';
  const llave = 'fzk_' + crypto.randomBytes(24).toString('base64url');
  const [r] = await exec(`INSERT INTO fz_api_keys (tenant_id,nombre,prefijo,hash,created_by) VALUES (:t,:n,:p,:h,:u) RETURNING id, nombre, prefijo, created_at`,
    { t: req.tenant, n: nombre, p: llave.slice(0, 10), h: hashKey(llave), u: req.user.id });
  audit(req, 'llave_creada', `${r[0].id} ${nombre}`);
  res.status(201).json({ ...r[0], llave }); // se muestra UNA vez
});
api.delete('/llaves/:id', adminOnly, async (req, res) => {
  const id = intId(req.params.id);
  const [r] = await exec('UPDATE fz_api_keys SET revoked_at=NOW() WHERE id=:id AND tenant_id=:t AND revoked_at IS NULL RETURNING id', { id: id || 0, t: req.tenant });
  if (!r.length) return res.status(404).json({ error: 'not_found' });
  audit(req, 'llave_revocada', id);
  res.json({ ok: true });
});
/** Script del puente (Windows): sube cada reporte que SICAR guarde en Documentos\SICAR-Forzza. */
function puenteScript(llave) {
  return [
    '# Puente SICAR -> Forzza Capital',
    '# Sube cada reporte de SICAR (Excel o PDF) que se guarde en la carpeta Documentos\\SICAR-Forzza.',
    '# Lo normal es instalarlo con el instalador de la app (Importar de SICAR > Puente); no hay que editar nada.',
    `$Llave = "${llave || 'PEGA_AQUI_LA_LLAVE'}"`,
    `$Url = "${PUBLIC_URL}/api/v1/ingest/sicar"`,
    '$Docs = [Environment]::GetFolderPath("MyDocuments")', // también cuando Documentos está en OneDrive
    '$Carpeta = Join-Path $Docs "SICAR-Forzza"',
    '$Enviados = Join-Path $Carpeta "enviados"',
    '$Bitacora = Join-Path $Carpeta "bitacora.txt"',
    'New-Item -ItemType Directory -Force -Path $Carpeta, $Enviados | Out-Null',
    'if ($Llave -eq "PEGA_AQUI_LA_LLAVE") { Add-Content $Bitacora "$(Get-Date -Format s) Falta pegar la llave en el script"; exit 1 }',
    'Get-ChildItem $Carpeta -File | Where-Object { @(".pdf", ".xls", ".xlsx", ".csv") -contains $_.Extension.ToLower() } | ForEach-Object {',
    '  $salida = & curl.exe -s -w "`n%{http_code}" -H "Authorization: Bearer $Llave" -F "archivo=@$($_.FullName)" $Url',
    '  $codigo = ($salida -split "`n")[-1]',
    '  if ($codigo -eq "200") {',
    '    Move-Item -Force $_.FullName (Join-Path $Enviados ("{0:yyyyMMdd-HHmmss}-{1}" -f (Get-Date), $_.Name))',
    '    Add-Content $Bitacora "$(Get-Date -Format s) OK $($_.Name)"',
    '  } else {',
    '    Add-Content $Bitacora "$(Get-Date -Format s) ERROR $codigo $($_.Name) $salida"',
    '  }',
    '}',
    ''
  ].join('\r\n');
}
/** Instalador de un clic (.cmd): escribe el script con la llave, crea la carpeta y programa la tarea cada 15 min
 *  para el usuario actual (no pide permisos de administrador). Solo ASCII para que la consola no se descomponga. */
function puenteInstalador(llave) {
  const b64 = Buffer.from(puenteScript(llave), 'utf8').toString('base64');
  return [
    '@echo off',
    'echo Instalando el puente SICAR - Forzza Capital...',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText(\'%~f0\'); $i=$s.IndexOf(\'#\'+\'PSSTART\'); iex $s.Substring($i)"',
    'echo.',
    'pause',
    'exit /b',
    '#PSSTART',
    'try {',
    '  $docs = [Environment]::GetFolderPath("MyDocuments")',
    '  $ps = Join-Path $docs "puente-sicar.ps1"',
    `  $b64 = "${b64}"`,
    '  [IO.File]::WriteAllText($ps, [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)), (New-Object Text.UTF8Encoding $true))',
    '  $carpeta = Join-Path $docs "SICAR-Forzza"',
    '  New-Item -ItemType Directory -Force -Path $carpeta, (Join-Path $carpeta "enviados") | Out-Null',
    '  $a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (\'-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "\' + $ps + \'"\')',
    '  $t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)',
    '  Register-ScheduledTask -TaskName "Puente SICAR Forzza" -Action $a -Trigger $t -Force -ErrorAction Stop | Out-Null',
    '  Write-Host ""',
    '  Write-Host "LISTO. El puente quedo instalado."',
    '  Write-Host ("Guarda los reportes de SICAR en esta carpeta: " + $carpeta)',
    '  Write-Host "Cada 15 minutos se suben solos a Forzza Capital."',
    '  Start-Process explorer.exe $carpeta',
    '} catch {',
    '  Write-Host ""',
    '  Write-Host ("NO se pudo instalar: " + $_.Exception.Message)',
    '  Write-Host "Toma una foto de esta ventana y mandala a Digit2AI."',
    '}',
    ''
  ].join('\r\n');
}
api.get('/sicar/puente.ps1', adminOnly, (req, res) => {
  res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="puente-sicar.ps1"' });
  res.send(puenteScript(null));
});
/** Crea una llave NUEVA y la entrega dentro del instalador. Es la única vez que se ve (igual que "Crear llave"). */
api.post('/sicar/instalador', adminOnly, async (req, res) => {
  const llave = 'fzk_' + crypto.randomBytes(24).toString('base64url');
  const [r] = await exec(`INSERT INTO fz_api_keys (tenant_id,nombre,prefijo,hash,created_by) VALUES (:t,'Puente SICAR (instalador)',:p,:h,:u) RETURNING id, prefijo`,
    { t: req.tenant, p: llave.slice(0, 10), h: hashKey(llave), u: req.user.id });
  audit(req, 'llave_creada', `${r[0].id} instalador`);
  res.status(201).json({ archivo: 'instalar-puente-sicar.cmd', contenido: puenteInstalador(llave), prefijo: r[0].prefijo });
});

/* ── usuarios ────────────────────────────────────────────────────────── */
api.get('/usuarios', async (req, res) => {
  // Todos ven la lista (para elegir aprobador en Ajustes); solo admin la edita.
  res.json(await sel('SELECT id,email,name,phone,role,must_change,active,last_login FROM fz_users WHERE tenant_id=:t ORDER BY role, email', { t: req.tenant }));
});
api.post('/usuarios', adminOnly, async (req, res) => {
  const b = req.body || {};
  const email = str(b.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'email_invalido' });
  if (!ROLES.includes(b.role)) return res.status(400).json({ error: 'rol_invalido' });
  if (b.role === 'director' && req.user.role !== 'owner') return res.status(403).json({ error: 'solo_dueno' });
  if (email === OWNER_EMAIL) return res.status(409).json({ error: 'reservado' });
  const pw = tempPassword();
  const [r] = await exec(`INSERT INTO fz_users (tenant_id,email,name,phone,role,password_hash,must_change) VALUES (:t,:e,:n,:p,:r,:h,TRUE)
    ON CONFLICT DO NOTHING RETURNING id,email,name,role`, { t: req.tenant, e: email, n: strOrNull(b.name, 160), p: strOrNull(b.phone, 40), r: b.role, h: await bcrypt.hash(pw, 12) });
  if (!r.length) return res.status(409).json({ error: 'ya_existe' });
  audit(req, 'usuario_created', email);
  res.status(201).json({ ...r[0], password_temporal: pw });
});
api.patch('/usuarios/:id', adminOnly, async (req, res) => {
  const id = intId(req.params.id), u = id && (await own('fz_users', id, req.tenant));
  if (!u || u.role === 'owner' || u.id === req.user.id) return res.status(404).json({ error: 'not_found' });
  if (u.role === 'director' && req.user.role !== 'owner') return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  if (b.reset) {
    const pw = tempPassword();
    await exec('UPDATE fz_users SET password_hash=:h, must_change=TRUE WHERE id=:id AND tenant_id=:t', { h: await bcrypt.hash(pw, 12), id, t: req.tenant });
    audit(req, 'usuario_reset', u.email);
    return res.json({ ok: true, password_temporal: pw });
  }
  const role = ROLES.includes(b.role) && (b.role !== 'director' || req.user.role === 'owner') ? b.role : u.role;
  const active = b.active === undefined ? u.active : !!b.active;
  await exec('UPDATE fz_users SET role=:r, active=:a WHERE id=:id AND tenant_id=:t', { r: role, a: active, id, t: req.tenant });
  // Quien deja de poder aprobar deja de ser el aprobador.
  if (!active || role === 'contador') await exec('UPDATE fz_config SET aprobador_user_id=NULL WHERE tenant_id=:t AND aprobador_user_id=:id', { t: req.tenant, id });
  // Quien sale ya no deja llaves del puente vivas.
  if (!active || role === 'contador') await exec('UPDATE fz_api_keys SET revoked_at=NOW() WHERE tenant_id=:t AND created_by=:id AND revoked_at IS NULL', { t: req.tenant, id });
  audit(req, 'usuario_updated', u.email);
  res.json({ ok: true });
});
api.get('/actividad', adminOnly, async (req, res) => {
  res.json(await sel('SELECT action,detail,user_email,created_at FROM fz_activity WHERE tenant_id=:t ORDER BY id DESC LIMIT 200', { t: req.tenant }));
});

router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'archivo_muy_grande' });
  console.error('[forzza]', err && err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal' });
});

module.exports = router;
module.exports.ready = ready;
module.exports._verifyOwner = null; // la SIT inyecta aquí la verificación del dueño
module.exports._db = db;
module.exports._waNumero = waNumero;
module.exports._excelDate = excelDate;
module.exports._pdfRows = null;
module.exports._puente = { puenteScript, puenteInstalador };
module.exports._daliaDeps = daliaDeps; // la SIT puede inyectar aquí un lector de PDF
