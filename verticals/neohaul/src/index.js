'use strict';
/**
 * NeoHaul — plataforma de operación para Grupo NeoHaul (acarreo para HTR).
 * Montado en /neohaul. Construido con lo que NeoHaul nos contó (reunión del
 * 23-oct, mapa del proceso del 27-oct, presentación del 5-nov).
 *
 * El flujo, una sola captura por viaje:
 *   pedido -> asignación -> viaje (foto del ticket, Andrés confirma)
 *   -> estimación semanal por obra -> requisición FOR-FYC-01 (IVA 16%, ret. 4%)
 *   -> folio CFDI -> cobro; en paralelo gastos por camión, diésel repartido por
 *   km, nómina con comisión sobre viajes confirmados, taller; y el tablero del jueves.
 *
 * REGLAS QUE NO SE NEGOCIAN (la SIT las ataca):
 *  - Todo importe lo calcula money.js en el servidor. Ninguna petición puede
 *    fijar un importe, un subtotal ni un total; el precio sale de la tarifa.
 *  - El tenant sale de la sesión, nunca del cuerpo. Un id de otro tenant = 404.
 *  - Un viaje solo entra a una estimación si está CONFIRMADO, y una vez en una
 *    estimación ya no se edita ni se borra (se libera borrando la estimación en borrador).
 *  - La lectura del ticket es una PROPUESTA; nada se guarda hasta que Andrés confirma.
 *  - Nada se envía por WhatsApp desde el servidor: la app arma el mensaje y cada
 *    quien lo envía desde su propio WhatsApp. No hay transporte en este vertical.
 *  - El tablero solo muestra cifras de filas reales; un camión sin costos
 *    capturados dice "sin costos capturados", nunca una ganancia.
 *
 * ROLES: owner (Digit2AI, contraseña del CRM) · director (Osbaldo) ·
 * capturista (Andrés) · contador (solo lectura).
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
const M = require('./money');
const llm = require('./llm');
const D = require('./docs');

const router = express.Router();
const OWNER_EMAIL = String(process.env.NEOHAUL_OWNER_EMAIL || 'mstagg@digit2ai.com').toLowerCase();
const SECRET = process.env.NEOHAUL_JWT_SECRET || process.env.JWT_SECRET || '';
const COOKIE = 'nh_token';
const AUD = 'neohaul';
const MAX_FILE = Number(process.env.NEOHAUL_MAX_FILE_MB || 10) * 1024 * 1024;
const ROLES = ['director', 'capturista', 'contador'];
const EMPRESAS = ['NeoHaul', 'TTS', 'SEMAQSA', 'Externo'];
const UNIDADES = ['tonelada', 'dia', 'viaje'];
const CATEG_GASTO = ['diesel', 'refacciones', 'taller', 'llantas', 'casetas', 'nomina', 'otros'];
const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
const INCIDENCIAS = ['asistio', 'falto', 'incapacidad', 'vacaciones', 'descanso'];

let TENANT_SEED = null;
const ready = schema.init(db).then((id) => { TENANT_SEED = id; }).catch((e) => { console.error('[neohaul] schema init failed:', e.message); throw e; });
ready.catch(() => {});

/* ── helpers ─────────────────────────────────────────────────────────── */
const sel = (sql, replacements = {}, t) => db.query(sql, { replacements, type: QueryTypes.SELECT, transaction: t });
const one = async (sql, r, t) => (await sel(sql, r, t))[0] || null;
const exec = (sql, replacements = {}, t) => db.query(sql, { replacements, transaction: t });
const str = (v, max) => (v == null ? '' : String(v)).trim().slice(0, max);
const strOrNull = (v, max) => str(v, max) || null;
const date = (v) => (M.lunes(v) ? String(v) : null); // valida fecha real YYYY-MM-DD
const intId = (v) => (/^\d{1,9}$/.test(String(v == null ? '' : v)) ? Number(v) : null);
const num = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const moneyIn = (v) => { const n = num(v); return n == null || n < 0 || n > 1e9 ? null : Math.round(n * 100) / 100; };
const hoyMx = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10); // Monterrey, UTC-6
function audit(req, action, detail) {
  exec('INSERT INTO nh_activity (tenant_id,user_id,user_email,action,detail) VALUES (:t,:u,:e,:a,:d)',
    { t: req.tenant, u: req.user ? req.user.id : null, e: req.user ? req.user.email : null, a: action, d: str(detail, 500) || null })
    .catch((e) => console.error('[neohaul] audit:', e.message));
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
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/neohaul; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}
const fp = (hash) => crypto.createHmac('sha256', SECRET).update(String(hash || 'crm')).digest('hex').slice(0, 16);
const attempts = new Map();
function tooMany(key, max = 10) {
  const now = Date.now(); const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (a.length) attempts.set(key, a); else attempts.delete(key);
  return a.length >= max;
}
function noteAttempt(key) {
  if (attempts.size > 5000) attempts.clear(); // tope de memoria
  const a = attempts.get(key) || []; a.push(Date.now()); attempts.set(key, a);
}

/** Tipo por los primeros bytes, nunca por el nombre. */
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buf.slice(4, 12).toString() === 'ftypheic' || buf.slice(4, 12).toString() === 'ftypheix' || buf.slice(4, 12).toString() === 'ftypmif1') return 'image/heic';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'application/zip';
  return null;
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: 1 } });

/* ── shell ───────────────────────────────────────────────────────────── */
router.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
router.get('/health', async (req, res) => {
  let dbOk = false; try { await ready; await sel('SELECT 1 AS ok'); dbOk = true; } catch (_) {}
  res.json({ service: 'neohaul', ok: dbOk && !!SECRET, database: dbOk, signing_secret: !!SECRET, ticket_reader: llm.aiEnabled() ? 'modelo' : 'captura_manual' });
});
router.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));
router.get('/', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(__dirname, '..', 'public', 'app.html')); });
// Guía narrada (Dalia). Pública como la pantalla de ingreso: solo muestra capturas con datos de ejemplo.
router.get(['/presentacion', '/guia'], (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(__dirname, '..', 'public', 'presentacion.html')); });

/* ── api ─────────────────────────────────────────────────────────────── */
const api = express.Router();
// Express 4 no atrapa errores de handlers async: un rechazo sin atrapar tumbaría
// todo el CRM. Cada handler registrado en `api` pasa por aquí.
const safe = (fn) => (typeof fn === 'function' && fn.length <= 3 ? (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next) : fn);
for (const m of ['get', 'post', 'patch', 'put', 'delete', 'use']) {
  const orig = api[m].bind(api);
  api[m] = (...args) => orig(...args.map(safe));
}
router.use('/api/v1', api);
// El parser global de src/app.js (500mb) corre antes que este; el tope real es este chequeo.
api.use((req, res, next) => (/json/.test(req.get('content-type') || '') && Number(req.get('content-length') || 0) > 300 * 1024 ? res.status(413).json({ error: 'archivo_muy_grande' }) : next()));
api.use(express.json({ limit: '300kb' }));
api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
api.use(async (req, res, next) => {
  if (!SECRET) return res.status(503).json({ error: 'not_configured' });
  try { await ready; } catch (_) { return res.status(503).json({ error: 'database_unavailable' }); }
  if (!['GET', 'HEAD'].includes(req.method) && req.get('X-NeoHaul') !== '1') return res.status(403).json({ error: 'missing_header' });
  next();
});

/** Huella del dueño: el hash de su contraseña del CRM, para que cambiarla cierre sus sesiones aquí. */
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
  let user = await one('SELECT * FROM nh_users WHERE LOWER(email)=:e', { e: email });
  let ok = false;
  if (user && user.password_hash) ok = await bcrypt.compare(password, user.password_hash);
  else if (email === OWNER_EMAIL && (!user || user.role === 'owner')) {
    ok = await verifyOwnerAgainstCrm(email, password);
    if (ok && !user) {
      const tid = TENANT_SEED || ((await one('SELECT id FROM nh_tenants ORDER BY id LIMIT 1')) || {}).id;
      if (!tid) return res.status(503).json({ error: 'sin_empresa' });
      await exec("INSERT INTO nh_users (tenant_id,email,name,role,must_change) VALUES (:t,:e,'Digit2AI','owner',FALSE) ON CONFLICT DO NOTHING", { t: tid, e: email });
      user = await one('SELECT * FROM nh_users WHERE LOWER(email)=:e', { e: email });
    }
  } else await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuuJcB6W6fK3k0n1i3m3e0YcJ9mL0pQkS.');
  if (!ok || !user || !user.active) { noteAttempt(key); noteAttempt('email|' + email); return res.status(401).json({ error: 'invalid_credentials' }); }
  await exec('UPDATE nh_users SET last_login=NOW() WHERE id=:id', { id: user.id });
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
  const u = await one('SELECT id,tenant_id,email,name,phone,role,must_change,active,password_hash FROM nh_users WHERE id=:id', { id: p.uid });
  if (!u || !u.active) return res.status(401).json({ error: 'not_signed_in' });
  const hashForFp = u.role === 'owner' ? await ownerCrmHash(u.email) : u.password_hash;
  if (!hashForFp && u.role === 'owner') return res.status(401).json({ error: 'not_signed_in' });
  if (fp(hashForFp) !== p.fp) return res.status(401).json({ error: 'not_signed_in' });
  delete u.password_hash;
  req.user = u; req.tenant = u.tenant_id;
  next();
});
api.get('/auth/me', async (req, res) => {
  const t = await one('SELECT id,name FROM nh_tenants WHERE id=:t', { t: req.tenant });
  res.json({ user: req.user, tenant: t, ticket_reader: llm.aiEnabled() });
});
api.post('/auth/password', async (req, res) => {
  const cur = String((req.body && req.body.current) || ''), nw = String((req.body && req.body.new) || '');
  if (req.user.role === 'owner') return res.status(400).json({ error: 'owner_uses_crm_password' });
  if (nw.length < 10) return res.status(400).json({ error: 'password_too_short' });
  const row = await one('SELECT password_hash FROM nh_users WHERE id=:id', { id: req.user.id });
  if (!row || !(await bcrypt.compare(cur, row.password_hash))) return res.status(401).json({ error: 'wrong_current_password' });
  const hash = await bcrypt.hash(nw, 12);
  await exec('UPDATE nh_users SET password_hash=:h, must_change=FALSE WHERE id=:id', { h: hash, id: req.user.id });
  setCookie(res, jwt.sign({ uid: req.user.id, fp: fp(hash) }, SECRET, { audience: AUD, expiresIn: '12h' }), 12 * 3600);
  audit(req, 'password_changed', null);
  res.json({ ok: true });
});
api.use((req, res, next) => (req.user.must_change ? res.status(403).json({ error: 'must_change_password' }) : next()));

const canEdit = (req) => ['owner', 'director', 'capturista'].includes(req.user.role);
const canAdmin = (req) => ['owner', 'director'].includes(req.user.role);
api.use((req, res, next) => (['GET', 'HEAD'].includes(req.method) || canEdit(req) ? next() : res.status(403).json({ error: 'read_only' })));
const adminOnly = (req, res, next) => (canAdmin(req) ? next() : res.status(404).json({ error: 'not_found' }));

/** Fila del tenant o null. Toda lectura por id pasa por aquí. */
const own = (table, id, t) => one(`SELECT * FROM ${table} WHERE id=:id AND tenant_id=:t`, { id, t: t }, undefined);

/* ── catálogos (camiones, choferes, clientes, obras, tarifas) ────────── */
const BAD = Symbol('invalido');
const tel = (v) => { if (v === '' || v == null) return null; const w = D.waNumero(v); return w ? '+' + w : BAD; };
const CAT = {
  trucks: { table: 'nh_trucks', order: "CASE empresa WHEN 'NeoHaul' THEN 0 WHEN 'TTS' THEN 1 WHEN 'SEMAQSA' THEN 2 ELSE 3 END, unidad",
    fields: { empresa: (v) => (EMPRESAS.includes(v) ? v : undefined), unidad: (v) => str(v, 60) || undefined, tipo: (v) => strOrNull(v, 60),
      capacidad_m3: (v) => num(v), placas: (v) => strOrNull(v, 30), chofer_id: (v) => intId(v), notas: (v) => strOrNull(v, 500), active: (v) => !!v },
    required: ['empresa', 'unidad'], derive: (r) => { if (r.empresa) r.propio = r.empresa === 'NeoHaul'; } },
  drivers: { table: 'nh_drivers', order: 'nombre',
    fields: { nombre: (v) => str(v, 160) || undefined, telefono: tel, empresa: (v) => (EMPRESAS.includes(v) ? v : undefined),
      puesto: (v) => (['chofer', 'mecanico'].includes(v) ? v : undefined), salario_semanal: (v) => moneyIn(v), active: (v) => !!v },
    required: ['nombre'] },
  clients: { table: 'nh_clients', order: 'nombre', fields: { nombre: (v) => str(v, 200) || undefined, rfc: (v) => strOrNull(v, 20), active: (v) => !!v }, required: ['nombre'] },
  obras: { table: 'nh_obras', order: 'nombre',
    fields: { client_id: (v) => intId(v), nombre: (v) => str(v, 200) || undefined, clave: (v) => strOrNull(v, 40), ingeniero: (v) => strOrNull(v, 160),
      ingeniero_tel: tel, active: (v) => !!v },
    required: ['client_id', 'nombre'], refs: { client_id: 'nh_clients' } },
  tarifas: { table: 'nh_tarifas', order: 'nombre',
    fields: { nombre: (v) => str(v, 200) || undefined, material: (v) => strOrNull(v, 60), origen: (v) => strOrNull(v, 120), destino: (v) => strOrNull(v, 120),
      unidad: (v) => (UNIDADES.includes(v) ? v : undefined), precio: (v) => moneyIn(v), por_confirmar: (v) => !!v, nota: (v) => strOrNull(v, 300), active: (v) => !!v },
    required: ['nombre', 'unidad', 'precio'] }
};
function pick(spec, body, partial) {
  const out = {};
  for (const [k, fn] of Object.entries(spec.fields)) {
    if (!body || !(k in body)) continue;
    const v = fn(body[k]);
    if (v === BAD) return { error: 'telefono_invalido' };
    if (v !== undefined) out[k] = v;
  }
  if (!partial) for (const k of spec.required) if (out[k] == null) return { error: 'missing_' + k };
  if (spec.derive) spec.derive(out);
  return { row: out };
}
async function refsOk(spec, row, t) {
  for (const [k, table] of Object.entries(spec.refs || {})) if (row[k] != null && !(await own(table, row[k], t))) return false;
  if (row.chofer_id != null && !(await own('nh_drivers', row.chofer_id, t))) return false;
  return true;
}
// Las tarifas fijan cada importe: solo director/dueño las cambian, y el cambio queda con precio anterior y nuevo.
api.use(['/tarifas', '/tarifas/:id'], (req, res, next) => (['GET', 'HEAD'].includes(req.method) || canAdmin(req) ? next() : res.status(403).json({ error: 'solo_director' })));
for (const [name, spec] of Object.entries(CAT)) {
  api.get('/' + name, async (req, res) => res.json(await sel(`SELECT * FROM ${spec.table} WHERE tenant_id=:t ORDER BY ${spec.order}`, { t: req.tenant })));
  api.post('/' + name, async (req, res) => {
    const { row, error } = pick(spec, req.body, false);
    if (error) return res.status(400).json({ error });
    if (!(await refsOk(spec, row, req.tenant))) return res.status(404).json({ error: 'not_found' });
    const cols = Object.keys(row);
    const [r] = await exec(`INSERT INTO ${spec.table} (tenant_id,${cols.join(',')}) VALUES (:tenant_id,${cols.map((c) => ':' + c).join(',')}) RETURNING *`, { ...row, tenant_id: req.tenant });
    audit(req, name + '_created', r[0].id);
    res.status(201).json(r[0]);
  });
  api.patch('/' + name + '/:id', async (req, res) => {
    const id = intId(req.params.id);
    if (!id || !(await own(spec.table, id, req.tenant))) return res.status(404).json({ error: 'not_found' });
    const before0 = await own(spec.table, id, req.tenant);
    const body = { ...(req.body || {}) };
    for (const k of ['telefono', 'ingeniero_tel']) if (k in body && String(body[k] || '') === String(before0[k] || '')) delete body[k]; // un teléfono viejo sin tocar no bloquea editar lo demás
    const { row, error } = pick(spec, body, true);
    if (error) return res.status(400).json({ error });
    if (!Object.keys(row).length) return res.status(400).json({ error: 'nothing_to_update' });
    if (!(await refsOk(spec, row, req.tenant))) return res.status(404).json({ error: 'not_found' });
    const before = await own(spec.table, id, req.tenant);
    const [r] = await exec(`UPDATE ${spec.table} SET ${Object.keys(row).map((c) => `${c}=:${c}`).join(',')} WHERE id=:id AND tenant_id=:tenant_id RETURNING *`, { ...row, id, tenant_id: req.tenant });
    audit(req, name + '_updated', name === 'tarifas' && 'precio' in row ? `${id} precio ${M.pesos(before.precio)} -> ${M.pesos(row.precio)}` : id);
    res.json(r[0]);
  });
}

/* ── pedidos y asignación ────────────────────────────────────────────── */
api.get('/pedidos', async (req, res) => {
  const desde = date(req.query.desde) || M.sumarDias(hoyMx(), -14);
  const rows = await sel(`SELECT p.*, o.nombre AS obra, o.ingeniero, o.ingeniero_tel FROM nh_pedidos p JOIN nh_obras o ON o.id=p.obra_id AND o.tenant_id=p.tenant_id
    WHERE p.tenant_id=:t AND p.fecha>=:d ORDER BY p.fecha DESC, p.id DESC`, { t: req.tenant, d: desde });
  const asig = await sel(`SELECT a.*, k.unidad, k.empresa, d.nombre AS chofer, d.telefono FROM nh_asignaciones a
    JOIN nh_trucks k ON k.id=a.truck_id AND k.tenant_id=a.tenant_id LEFT JOIN nh_drivers d ON d.id=a.driver_id AND d.tenant_id=a.tenant_id
    WHERE a.tenant_id=:t`, { t: req.tenant });
  rows.forEach((p) => { p.asignaciones = asig.filter((a) => a.pedido_id === p.id); });
  res.json(rows);
});
api.post('/pedidos', async (req, res) => {
  const b = req.body || {};
  const fecha = date(b.fecha) || hoyMx(), obra = intId(b.obra_id), tarifa = b.tarifa_id ? intId(b.tarifa_id) : null;
  const camiones = Math.max(1, Math.min(60, Math.round(num(b.camiones) || 1)));
  if (!obra || !(await own('nh_obras', obra, req.tenant))) return res.status(404).json({ error: 'obra_not_found' });
  if (tarifa && !(await own('nh_tarifas', tarifa, req.tenant))) return res.status(404).json({ error: 'tarifa_not_found' });
  const [r] = await exec(`INSERT INTO nh_pedidos (tenant_id,fecha,obra_id,tarifa_id,material,camiones,solicitante,notas,created_by)
    VALUES (:t,:f,:o,:ta,:m,:c,:s,:n,:u) RETURNING *`,
    { t: req.tenant, f: fecha, o: obra, ta: tarifa, m: strOrNull(b.material, 60), c: camiones, s: strOrNull(b.solicitante, 160), n: strOrNull(b.notas, 500), u: req.user.id });
  audit(req, 'pedido_created', r[0].id);
  res.status(201).json(r[0]);
});
api.patch('/pedidos/:id', async (req, res) => {
  const id = intId(req.params.id), p = id && (await own('nh_pedidos', id, req.tenant));
  if (!p) return res.status(404).json({ error: 'not_found' });
  const estado = ['abierto', 'asignado', 'cerrado', 'cancelado'].includes(req.body && req.body.estado) ? req.body.estado : p.estado;
  const camiones = req.body && req.body.camiones != null ? Math.max(1, Math.min(60, Math.round(num(req.body.camiones) || 1))) : p.camiones;
  const [r] = await exec('UPDATE nh_pedidos SET estado=:e, camiones=:c WHERE id=:id AND tenant_id=:t RETURNING *', { e: estado, c: camiones, id, t: req.tenant });
  res.json(r[0]);
});
/** Camiones libres en una fecha: activos y sin asignación en un pedido abierto o asignado ese día. Prioridad: propios, hermanas, externos. */
api.get('/disponibles', async (req, res) => {
  const fecha = date(req.query.fecha) || hoyMx();
  res.json(await sel(`SELECT k.*, d.nombre AS chofer, d.telefono FROM nh_trucks k LEFT JOIN nh_drivers d ON d.id=k.chofer_id AND d.tenant_id=k.tenant_id
    WHERE k.tenant_id=:t AND k.active AND NOT EXISTS (SELECT 1 FROM nh_asignaciones a JOIN nh_pedidos p ON p.id=a.pedido_id AND p.tenant_id=a.tenant_id
      WHERE a.truck_id=k.id AND a.tenant_id=:t AND p.fecha=:f AND p.estado IN ('abierto','asignado'))
    ORDER BY ${CAT.trucks.order.replace(/\bempresa\b/, 'k.empresa').replace(/\bunidad\b/, 'k.unidad')}`, { t: req.tenant, f: fecha })); // nh_drivers también tiene empresa: sin prefijo, Postgres la rechaza por ambigua
});
api.post('/pedidos/:id/asignar', async (req, res) => {
  const id = intId(req.params.id), p = id && (await own('nh_pedidos', id, req.tenant));
  const truck = intId(req.body && req.body.truck_id), driver = req.body && req.body.driver_id ? intId(req.body.driver_id) : null;
  if (!p || !truck || !(await own('nh_trucks', truck, req.tenant))) return res.status(404).json({ error: 'not_found' });
  if (driver && !(await own('nh_drivers', driver, req.tenant))) return res.status(404).json({ error: 'not_found' });
  const busy = await one(`SELECT p.id FROM nh_asignaciones a JOIN nh_pedidos p ON p.id=a.pedido_id AND p.tenant_id=a.tenant_id
    WHERE a.tenant_id=:t AND a.truck_id=:k AND p.fecha=:f AND p.estado IN ('abierto','asignado') AND p.id<>:id`, { t: req.tenant, k: truck, f: p.fecha, id });
  if (busy) return res.status(409).json({ error: 'truck_busy', pedido_id: busy.id });
  await exec('INSERT INTO nh_asignaciones (tenant_id,pedido_id,truck_id,driver_id) VALUES (:t,:p,:k,:d) ON CONFLICT (pedido_id,truck_id) DO UPDATE SET driver_id=EXCLUDED.driver_id',
    { t: req.tenant, p: id, k: truck, d: driver });
  const [[c]] = await exec('SELECT COUNT(*)::int AS n FROM nh_asignaciones WHERE pedido_id=:p AND tenant_id=:t', { p: id, t: req.tenant });
  if (c.n >= p.camiones && p.estado === 'abierto') await exec("UPDATE nh_pedidos SET estado='asignado' WHERE id=:p AND tenant_id=:t", { p: id, t: req.tenant });
  audit(req, 'asignado', `pedido ${id} camión ${truck}`);
  res.json({ ok: true });
});
api.delete('/pedidos/:id/asignar/:truck', async (req, res) => {
  const id = intId(req.params.id), truck = intId(req.params.truck);
  if (!id || !(await own('nh_pedidos', id, req.tenant))) return res.status(404).json({ error: 'not_found' });
  await exec('DELETE FROM nh_asignaciones WHERE pedido_id=:p AND truck_id=:k AND tenant_id=:t', { p: id, k: truck, t: req.tenant });
  await exec("UPDATE nh_pedidos SET estado='abierto' WHERE id=:p AND tenant_id=:t AND estado='asignado'", { p: id, t: req.tenant });
  res.json({ ok: true });
});
api.post('/pedidos/:id/avisado', async (req, res) => {
  const id = intId(req.params.id), truck = intId(req.body && req.body.truck_id);
  if (!id || !(await own('nh_pedidos', id, req.tenant))) return res.status(404).json({ error: 'not_found' });
  await exec('UPDATE nh_asignaciones SET avisado_at=NOW() WHERE pedido_id=:p AND truck_id=:k AND tenant_id=:t', { p: id, k: truck, t: req.tenant });
  res.json({ ok: true });
});

/* ── archivos (fotos de ticket, vale, factura) ───────────────────────── */
async function storeFile(req, kind, file) {
  const type = sniff(file.buffer);
  if (type === 'image/heic') return { error: 'heic', status: 415 };
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(type)) return { error: 'tipo_no_permitido', status: 415 };
  let data = file.buffer, mime = type;
  if (type.startsWith('image/')) {
    try {
      const sharp = require('sharp');
      data = await sharp(file.buffer, { limitInputPixels: 40e6 }).rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      mime = 'image/jpeg';
    } catch (_) { return { error: 'imagen_ilegible', status: 415 }; }
  }
  const [r] = await exec('INSERT INTO nh_files (tenant_id,kind,filename,mime,size,data,uploaded_by) VALUES (:t,:k,:f,:m,:s,:d,:u) RETURNING id',
    { t: req.tenant, k: kind, f: str(file.originalname, 200) || null, m: mime, s: data.length, d: data, u: req.user.id });
  return { id: r[0].id, buffer: data, mime };
}
api.get('/files/:id', async (req, res) => {
  const id = intId(req.params.id);
  const f = id && (await one('SELECT id,mime,filename,data FROM nh_files WHERE id=:id AND tenant_id=:t', { id, t: req.tenant }));
  if (!f) return res.status(404).json({ error: 'not_found' });
  res.set({ 'Content-Type': f.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox", 'Cache-Control': 'private, max-age=300' });
  res.set('Content-Disposition', (f.mime === 'application/pdf' || f.mime.startsWith('image/') ? 'inline' : 'attachment') + `; filename="archivo-${f.id}"`);
  res.send(f.data);
});

const cleanOcr = D.cleanOcr; // ver docs.js: escrito sobre el vale real de HTR
/** Camión por placas, obra por destino, chofer por nombre y la tarifa que más se ha usado en esa obra. Solo propone. */
async function sugerencias(req, p) {
  const t = { t: req.tenant };
  const s = D.sugerir(p, { trucks: await sel('SELECT id,placas,active FROM nh_trucks WHERE tenant_id=:t', t),
    obras: await sel('SELECT id,nombre,clave,active FROM nh_obras WHERE tenant_id=:t', t), drivers: await sel('SELECT id,nombre,active FROM nh_drivers WHERE tenant_id=:t', t) });
  s.tarifa_id = null;
  if (s.obra_id) {
    const ta = await one(`SELECT v.tarifa_id FROM nh_viajes v JOIN nh_tarifas ta ON ta.id=v.tarifa_id AND ta.tenant_id=v.tenant_id AND ta.active
      WHERE v.tenant_id=:t AND v.obra_id=:o GROUP BY v.tarifa_id ORDER BY COUNT(*) DESC LIMIT 1`, { t: req.tenant, o: s.obra_id });
    if (ta) s.tarifa_id = ta.tarifa_id;
  }
  if (s.truck_id && !s.driver_id) { const k = await one('SELECT chofer_id FROM nh_trucks WHERE id=:id AND tenant_id=:t', { id: s.truck_id, t: req.tenant }); if (k && k.chofer_id) s.driver_id = k.chofer_id; }
  return s;
}
/** Sube la foto del ticket y devuelve una PROPUESTA. No crea ningún viaje. */
api.post('/viajes/leer-ticket', upload.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta_foto' });
  const f = await storeFile(req, 'ticket', req.file);
  if (f.error) return res.status(f.status).json({ error: f.error });
  const raw = f.mime === 'image/jpeg' ? await llm.leerTicket(f.buffer) : null;
  const propuesta = cleanOcr(raw);
  res.json({ file_id: f.id, propuesta, sugerencias: propuesta ? await sugerencias(req, propuesta) : null, leido_por: raw ? 'modelo' : (llm.aiEnabled() ? 'sin_lectura' : 'captura_manual') });
});
api.post('/archivos', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta_archivo' });
  const kind = ['ticket', 'vale', 'factura', 'otro'].includes(req.body && req.body.kind) ? req.body.kind : 'otro';
  const f = await storeFile(req, kind, req.file);
  if (f.error) return res.status(f.status).json({ error: f.error });
  res.status(201).json({ file_id: f.id });
});

/* ── viajes ──────────────────────────────────────────────────────────── */
const VIAJE_SQL = `SELECT v.*, o.nombre AS obra, ta.nombre AS tarifa, k.unidad AS camion, k.empresa, d.nombre AS chofer
  FROM nh_viajes v JOIN nh_obras o ON o.id=v.obra_id AND o.tenant_id=v.tenant_id JOIN nh_tarifas ta ON ta.id=v.tarifa_id AND ta.tenant_id=v.tenant_id
  LEFT JOIN nh_trucks k ON k.id=v.truck_id AND k.tenant_id=v.tenant_id LEFT JOIN nh_drivers d ON d.id=v.driver_id AND d.tenant_id=v.tenant_id`;
api.get('/viajes', async (req, res) => {
  const desde = date(req.query.desde) || M.lunes(hoyMx()), hasta = date(req.query.hasta) || M.sumarDias(desde, 6);
  const where = ['v.tenant_id=:t', 'v.fecha BETWEEN :d AND :h'], r = { t: req.tenant, d: desde, h: hasta };
  if (intId(req.query.obra_id)) { where.push('v.obra_id=:o'); r.o = intId(req.query.obra_id); }
  if (['capturado', 'confirmado'].includes(req.query.estado)) { where.push('v.estado=:e'); r.e = req.query.estado; }
  res.json(await sel(`${VIAJE_SQL} WHERE ${where.join(' AND ')} ORDER BY v.fecha DESC, v.id DESC LIMIT 1000`, r));
});

/** Valida y calcula un viaje. El precio sale SIEMPRE de la tarifa y el importe de money.js. */
async function buildViaje(req, b, prev) {
  const v = {
    fecha: b.fecha !== undefined ? date(b.fecha) : prev && prev.fecha,
    obra_id: b.obra_id !== undefined ? intId(b.obra_id) : prev && prev.obra_id,
    tarifa_id: b.tarifa_id !== undefined ? intId(b.tarifa_id) : prev && prev.tarifa_id,
    truck_id: b.truck_id !== undefined ? (b.truck_id ? intId(b.truck_id) : null) : prev ? prev.truck_id : null,
    driver_id: b.driver_id !== undefined ? (b.driver_id ? intId(b.driver_id) : null) : prev ? prev.driver_id : null,
    pedido_id: b.pedido_id !== undefined ? (b.pedido_id ? intId(b.pedido_id) : null) : prev ? prev.pedido_id : null,
    ticket_no: b.ticket_no !== undefined ? strOrNull(b.ticket_no, 60) : prev ? prev.ticket_no : null,
    vale_no: b.vale_no !== undefined ? strOrNull(b.vale_no, 60) : prev ? prev.vale_no : null,
    cantidad: b.cantidad !== undefined ? num(b.cantidad) : prev && Number(prev.cantidad),
    ticket_file_id: b.ticket_file_id !== undefined ? (b.ticket_file_id ? intId(b.ticket_file_id) : null) : prev ? prev.ticket_file_id : null,
    vale_file_id: b.vale_file_id !== undefined ? (b.vale_file_id ? intId(b.vale_file_id) : null) : prev ? prev.vale_file_id : null,
    notas: b.notas !== undefined ? strOrNull(b.notas, 500) : prev ? prev.notas : null
  };
  if (!v.fecha) return { error: 'fecha_invalida' };
  if (v.cantidad == null || v.cantidad <= 0 || v.cantidad > 10000) return { error: 'cantidad_invalida' };
  if (!v.obra_id || !(await own('nh_obras', v.obra_id, req.tenant))) return { error: 'obra_not_found', status: 404 };
  const tarifa = v.tarifa_id && (await own('nh_tarifas', v.tarifa_id, req.tenant));
  if (!tarifa) return { error: 'tarifa_not_found', status: 404 };
  for (const [k, table] of [['truck_id', 'nh_trucks'], ['driver_id', 'nh_drivers'], ['pedido_id', 'nh_pedidos']]) {
    if (v[k] && !(await own(table, v[k], req.tenant))) return { error: k.replace('_id', '') + '_not_found', status: 404 };
  }
  for (const k of ['ticket_file_id', 'vale_file_id']) {
    if (v[k] && !(await one('SELECT id FROM nh_files WHERE id=:id AND tenant_id=:t', { id: v[k], t: req.tenant }))) return { error: 'file_not_found', status: 404 };
  }
  // El precio es una FOTO tomada al capturar: editar notas o camión no re-cotiza un viaje viejo con la
  // tarifa de hoy (un escombro de 20 t a $250 se volvería 20 × $4,500). Solo cambiar la tarifa re-cotiza.
  const mismaTarifa = prev && Number(prev.tarifa_id) === Number(v.tarifa_id);
  v.unidad = mismaTarifa ? prev.unidad : tarifa.unidad;
  v.precio_unitario = mismaTarifa ? Number(prev.precio_unitario) : Number(tarifa.precio);
  v.importe = M.importe(v.cantidad, v.precio_unitario);
  if (v.importe == null) return { error: 'importe_invalido' };
  return { v, tarifa };
}
api.post('/viajes', async (req, res) => {
  const b = req.body || {};
  const { v, error, status } = await buildViaje(req, b, null);
  if (error) return res.status(status || 400).json({ error });
  if (v.ticket_no) {
    const dup = await one('SELECT id FROM nh_viajes WHERE tenant_id=:t AND ticket_no=:n AND tarifa_id=:ta', { t: req.tenant, n: v.ticket_no, ta: v.tarifa_id });
    if (dup && !b.permitir_duplicado) return res.status(409).json({ error: 'ticket_duplicado', viaje_id: dup.id });
  }
  if (v.vale_no) { // el número impreso del vale es único: el mismo vale dos veces es el mismo viaje cobrado dos veces
    const dup = await one('SELECT id FROM nh_viajes WHERE tenant_id=:t AND vale_no=:n', { t: req.tenant, n: v.vale_no });
    if (dup && !b.permitir_duplicado) return res.status(409).json({ error: 'vale_duplicado', viaje_id: dup.id });
  }
  const ocr = b.ocr && typeof b.ocr === 'object' ? JSON.stringify(cleanOcr(b.ocr)) : null;
  const confirmar = !!b.confirmar;
  const [r] = await exec(`INSERT INTO nh_viajes (tenant_id,fecha,pedido_id,obra_id,tarifa_id,truck_id,driver_id,ticket_no,vale_no,cantidad,unidad,precio_unitario,importe,
      ticket_file_id,vale_file_id,ocr,estado,notas,created_by,confirmed_by,confirmed_at)
    VALUES (:t,:fecha,:pedido_id,:obra_id,:tarifa_id,:truck_id,:driver_id,:ticket_no,:vale_no,:cantidad,:unidad,:precio_unitario,:importe,
      :ticket_file_id,:vale_file_id,:ocr,:estado,:notas,:u,:cb,:ca) RETURNING *`,
    { ...v, t: req.tenant, ocr, estado: confirmar ? 'confirmado' : 'capturado', u: req.user.id, cb: confirmar ? req.user.id : null, ca: confirmar ? new Date() : null });
  audit(req, 'viaje_created', `${r[0].id} ${M.pesos(v.importe)}`);
  res.status(201).json(r[0]);
});
api.patch('/viajes/:id', async (req, res) => {
  const id = intId(req.params.id), prev = id && (await own('nh_viajes', id, req.tenant));
  if (!prev) return res.status(404).json({ error: 'not_found' });
  if (prev.estimacion_id) return res.status(409).json({ error: 'en_estimacion' });
  const { v, error, status } = await buildViaje(req, req.body || {}, prev);
  if (error) return res.status(status || 400).json({ error });
  const [r] = await exec(`UPDATE nh_viajes SET fecha=:fecha,pedido_id=:pedido_id,obra_id=:obra_id,tarifa_id=:tarifa_id,truck_id=:truck_id,driver_id=:driver_id,
    ticket_no=:ticket_no,vale_no=:vale_no,cantidad=:cantidad,unidad=:unidad,precio_unitario=:precio_unitario,importe=:importe,ticket_file_id=:ticket_file_id,
    vale_file_id=:vale_file_id,notas=:notas WHERE id=:id AND tenant_id=:t AND estimacion_id IS NULL RETURNING *`, { ...v, id, t: req.tenant });
  if (!r.length) return res.status(409).json({ error: 'en_estimacion' });
  audit(req, 'viaje_updated', id);
  res.json(r[0]);
});
api.post('/viajes/confirmar', async (req, res) => {
  const ids = (Array.isArray(req.body && req.body.ids) ? req.body.ids : []).map(intId).filter(Boolean).slice(0, 500);
  if (!ids.length) return res.status(400).json({ error: 'sin_viajes' });
  const [r] = await exec(`UPDATE nh_viajes SET estado='confirmado', confirmed_by=:u, confirmed_at=NOW()
    WHERE tenant_id=:t AND id IN (:ids) AND estado='capturado' RETURNING id`, { t: req.tenant, ids, u: req.user.id });
  audit(req, 'viajes_confirmados', r.length);
  res.json({ confirmados: r.length });
});
api.delete('/viajes/:id', async (req, res) => {
  const id = intId(req.params.id), prev = id && (await own('nh_viajes', id, req.tenant));
  if (!prev) return res.status(404).json({ error: 'not_found' });
  const [r] = await exec('DELETE FROM nh_viajes WHERE id=:id AND tenant_id=:t AND estimacion_id IS NULL RETURNING id', { id, t: req.tenant });
  if (!r.length) return res.status(409).json({ error: 'en_estimacion' });
  audit(req, 'viaje_deleted', id);
  res.json({ ok: true });
});

/**
 * Importar tickets desde el Excel de planta (o CSV): columnas fecha, ticket,
 * toneladas (también acepta peso/cantidad). Todos van a una obra y tarifa
 * elegidas, quedan CAPTURADOS (no confirmados) y cada renglón recibe un resultado.
 */
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
/** Corre el parser en un Worker con tiempo límite (ver xlsx-worker.js). */
function parsePdf(buf) {
  return new Promise((resolve) => {
    const { fork } = require('child_process');
    const c = fork(path.join(__dirname, 'pdf-child.js'), [], { env: {}, execArgv: ['--disallow-code-generation-from-strings', '--max-old-space-size=256'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let fin = false;
    const done = (r) => { if (fin) return; fin = true; clearTimeout(timer); try { c.kill('SIGKILL'); } catch (_) {} resolve(r); };
    const timer = setTimeout(() => done({ error: 'archivo_muy_lento' }), 10000);
    c.once('message', (m) => done(m && typeof m.text === 'string' ? { text: m.text } : { error: (m && m.error) || 'pdf_ilegible' }));
    c.once('error', () => done({ error: 'pdf_ilegible' }));
    c.once('exit', () => done({ error: 'pdf_ilegible' }));
    c.send({ buf: buf.toString('base64') });
  });
}
function parseSheet(buf, kind) {
  return new Promise((resolve) => {
    const { Worker } = require('worker_threads');
    const w = new Worker(path.join(__dirname, 'xlsx-worker.js'), { workerData: { buf, kind: kind || 'sheet' }, env: {}, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    const done = (r) => { clearTimeout(timer); w.terminate().catch(() => {}); resolve(r); };
    const timer = setTimeout(() => done({ error: 'archivo_muy_lento' }), 10000);
    w.once('message', (m) => done(m && Array.isArray(m.rows) ? { rows: m.rows } : m && typeof m.text === 'string' ? { text: m.text } : { error: (m && m.error) || 'archivo_ilegible' }));
    w.once('error', () => done({ error: 'archivo_ilegible' }));
  });
}
function excelDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(v == null ? '' : v).trim();
  if (date(s)) return s;
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) return date(`${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  return null;
}
api.post('/viajes/importar', importUpload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta_archivo' });
  const type = sniff(req.file.buffer);
  // Solo .xlsx (zip) o texto plano (CSV). .xls/.ods binarios y cualquier otra cosa, fuera.
  const isText = !type && !req.file.buffer.slice(0, 4096).includes(0);
  if (type !== 'application/zip' && !isText) return res.status(415).json({ error: 'usa_excel_o_csv' });
  const b = req.body || {};
  const obra = intId(b.obra_id), tarifaId = intId(b.tarifa_id);
  const tarifa = tarifaId && (await own('nh_tarifas', tarifaId, req.tenant));
  if (!obra || !(await own('nh_obras', obra, req.tenant)) || !tarifa) return res.status(404).json({ error: 'obra_o_tarifa_not_found' });
  const truck = b.truck_id ? intId(b.truck_id) : null;
  if (truck && !(await own('nh_trucks', truck, req.tenant))) return res.status(404).json({ error: 'truck_not_found' });
  const parsed = await parseSheet(req.file.buffer);
  if (parsed.error) return res.status(415).json({ error: parsed.error });
  const rows = parsed.rows;
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  const hi = rows.findIndex((r) => r.some((c) => /fecha/.test(norm(c))) && r.some((c) => /ticket|boleta|folio/.test(norm(c))));
  if (hi < 0) return res.status(400).json({ error: 'sin_encabezados', ayuda: 'El archivo debe tener columnas Fecha, Ticket y Toneladas.' });
  const head = rows[hi].map(norm);
  const col = (re) => head.findIndex((h) => re.test(h));
  const cF = col(/fecha/), cT = col(/ticket|boleta|folio/), cQ = col(/tonelada|^ton|peso|neto|cantidad/);
  if (cQ < 0) return res.status(400).json({ error: 'sin_columna_toneladas' });
  const resultados = []; let creados = 0;
  const vistos = new Set((await sel('SELECT ticket_no FROM nh_viajes WHERE tenant_id=:t AND tarifa_id=:ta AND ticket_no IS NOT NULL', { t: req.tenant, ta: tarifa.id })).map((x) => x.ticket_no));
  const nuevos = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => String(c).trim() === '')) continue;
    const fecha = excelDate(r[cF]), ticket = strOrNull(r[cT], 60), q = num(r[cQ]);
    if (!fecha || q == null || q <= 0 || q > 10000) { resultados.push({ renglon: i + 1, ok: false, motivo: !fecha ? 'fecha' : 'cantidad' }); continue; }
    if (ticket && vistos.has(ticket)) { resultados.push({ renglon: i + 1, ok: false, motivo: 'ticket_duplicado', ticket }); continue; }
    if (ticket) vistos.add(ticket);
    const importe = M.importe(q, tarifa.precio);
    nuevos.push({ f: fecha, n: ticket, q, imp: importe });
    creados++; resultados.push({ renglon: i + 1, ok: true, ticket, importe });
  }
  // Todo o nada: un corte a la mitad no deja una importación parcial.
  await db.transaction(async (tx) => {
    for (const r of nuevos) {
      await exec(`INSERT INTO nh_viajes (tenant_id,fecha,obra_id,tarifa_id,truck_id,ticket_no,cantidad,unidad,precio_unitario,importe,estado,notas,created_by)
        VALUES (:t,:f,:o,:ta,:k,:n,:q,:un,:p,:imp,'capturado','Importado de Excel',:u)`,
        { t: req.tenant, o: obra, ta: tarifa.id, k: truck, un: tarifa.unidad, p: tarifa.precio, u: req.user.id, ...r }, tx);
    }
  });
  audit(req, 'viajes_importados', creados);
  res.json({ creados, rechazados: resultados.filter((r) => !r.ok).length, resultados });
});

/* ── estimaciones ────────────────────────────────────────────────────── */
api.get('/estimaciones', async (req, res) => {
  res.json(await sel(`SELECT e.*, o.nombre AS obra, o.ingeniero, o.ingeniero_tel, f.id AS factura_id, f.estado AS factura_estado
    FROM nh_estimaciones e JOIN nh_obras o ON o.id=e.obra_id AND o.tenant_id=e.tenant_id
    LEFT JOIN nh_facturas f ON f.estimacion_id=e.id AND f.tenant_id=e.tenant_id AND f.estado<>'cancelada'
    WHERE e.tenant_id=:t ORDER BY e.desde DESC, e.id DESC LIMIT 200`, { t: req.tenant }));
});
/** Arma la estimación con los viajes CONFIRMADOS de la obra en el rango que aún no están en otra. */
api.post('/estimaciones', async (req, res) => {
  const obra = intId(req.body && req.body.obra_id);
  const desde = date(req.body && req.body.desde) || M.sumarDias(M.lunes(hoyMx()), -7);
  const hasta = date(req.body && req.body.hasta) || M.sumarDias(desde, 6);
  if (hasta < desde) return res.status(400).json({ error: 'rango_invalido' });
  if (!obra || !(await own('nh_obras', obra, req.tenant))) return res.status(404).json({ error: 'not_found' });
  const out = await db.transaction(async (t) => {
    const viajes = await sel(`SELECT id, importe FROM nh_viajes WHERE tenant_id=:tn AND obra_id=:o AND fecha BETWEEN :d AND :h
      AND estado='confirmado' AND estimacion_id IS NULL FOR UPDATE`, { tn: req.tenant, o: obra, d: desde, h: hasta }, t);
    if (!viajes.length) return null;
    const subtotal = M.sum(viajes.map((v) => v.importe));
    const [[e]] = await exec(`INSERT INTO nh_estimaciones (tenant_id,obra_id,desde,hasta,subtotal,viajes,created_by) VALUES (:tn,:o,:d,:h,:s,:n,:u) RETURNING *`,
      { tn: req.tenant, o: obra, d: desde, h: hasta, s: subtotal, n: viajes.length, u: req.user.id }, t);
    await exec('UPDATE nh_viajes SET estimacion_id=:e WHERE tenant_id=:tn AND id IN (:ids)', { e: e.id, tn: req.tenant, ids: viajes.map((v) => v.id) }, t);
    return e;
  });
  if (!out) {
    const pend = await one(`SELECT COUNT(*)::int AS n FROM nh_viajes WHERE tenant_id=:t AND obra_id=:o AND fecha BETWEEN :d AND :h AND estado='capturado'`, { t: req.tenant, o: obra, d: desde, h: hasta });
    return res.status(409).json({ error: 'sin_viajes_confirmados', capturados_sin_confirmar: pend.n });
  }
  audit(req, 'estimacion_created', `${out.id} ${M.pesos(out.subtotal)}`);
  res.status(201).json(out);
});
api.get('/estimaciones/:id', async (req, res) => {
  const id = intId(req.params.id);
  const e = id && (await one(`SELECT e.*, o.nombre AS obra, o.clave, o.ingeniero, o.ingeniero_tel, c.nombre AS cliente FROM nh_estimaciones e
    JOIN nh_obras o ON o.id=e.obra_id AND o.tenant_id=e.tenant_id JOIN nh_clients c ON c.id=o.client_id AND c.tenant_id=o.tenant_id
    WHERE e.id=:id AND e.tenant_id=:t`, { id, t: req.tenant }));
  if (!e) return res.status(404).json({ error: 'not_found' });
  e.viajes = await sel(`${VIAJE_SQL} WHERE v.tenant_id=:t AND v.estimacion_id=:e ORDER BY v.fecha, v.id`, { t: req.tenant, e: id });
  res.json(e);
});
api.patch('/estimaciones/:id', async (req, res) => {
  const id = intId(req.params.id), e = id && (await own('nh_estimaciones', id, req.tenant));
  if (!e) return res.status(404).json({ error: 'not_found' });
  const estado = req.body && req.body.estado;
  const next = { borrador: ['enviada'], enviada: ['aprobada', 'borrador'], aprobada: ['enviada'] }[e.estado] || [];
  if (!next.includes(estado)) return res.status(409).json({ error: 'transicion_invalida', de: e.estado });
  // Con una requisición viva la estimación no regresa: liberar sus viajes permitiría facturarlos dos veces.
  if (e.estado === 'aprobada' && (await one("SELECT id FROM nh_facturas WHERE estimacion_id=:e AND tenant_id=:t AND estado<>'cancelada'", { e: id, t: req.tenant }))) {
    return res.status(409).json({ error: 'tiene_requisicion' });
  }
  const extra = estado === 'enviada' ? ', enviada_at=NOW()' : estado === 'aprobada' ? ', aprobada_at=NOW()' : '';
  const [r] = await exec(`UPDATE nh_estimaciones SET estado=:s${extra} WHERE id=:id AND tenant_id=:t RETURNING *`, { s: estado, id, t: req.tenant });
  audit(req, 'estimacion_' + estado, id);
  res.json(r[0]);
});
api.delete('/estimaciones/:id', async (req, res) => {
  const id = intId(req.params.id), e = id && (await own('nh_estimaciones', id, req.tenant));
  if (!e) return res.status(404).json({ error: 'not_found' });
  if (e.estado !== 'borrador') return res.status(409).json({ error: 'solo_borrador' });
  if (await one("SELECT id FROM nh_facturas WHERE estimacion_id=:e AND tenant_id=:t AND estado<>'cancelada'", { e: id, t: req.tenant })) return res.status(409).json({ error: 'tiene_requisicion' });
  await db.transaction(async (t) => {
    await exec('UPDATE nh_viajes SET estimacion_id=NULL WHERE estimacion_id=:id AND tenant_id=:tn', { id, tn: req.tenant }, t);
    await exec('DELETE FROM nh_estimaciones WHERE id=:id AND tenant_id=:tn', { id, tn: req.tenant }, t);
  });
  audit(req, 'estimacion_deleted', id);
  res.json({ ok: true });
});
api.get('/estimaciones/:id/excel', async (req, res) => {
  const id = intId(req.params.id);
  const e = id && (await one(`SELECT e.*, o.nombre AS obra, c.nombre AS cliente FROM nh_estimaciones e JOIN nh_obras o ON o.id=e.obra_id AND o.tenant_id=e.tenant_id
    JOIN nh_clients c ON c.id=o.client_id AND c.tenant_id=o.tenant_id WHERE e.id=:id AND e.tenant_id=:t`, { id, t: req.tenant }));
  if (!e) return res.status(404).json({ error: 'not_found' });
  const vs = await sel(`${VIAJE_SQL} WHERE v.tenant_id=:t AND v.estimacion_id=:e ORDER BY v.fecha, v.id`, { t: req.tenant, e: id });
  const XLSX = require('xlsx');
  const aoa = [['Grupo NeoHaul · Estimación'], ['Cliente', e.cliente], ['Obra', e.obra], ['Periodo', `${e.desde} a ${e.hasta}`], [],
    ['Fecha', 'Ticket', 'Vale', 'Camión', 'Chofer', 'Concepto', 'Cantidad', 'Unidad', 'Precio unitario', 'Importe']];
  vs.forEach((v) => aoa.push([v.fecha, v.ticket_no || '', v.vale_no || '', v.camion || '', v.chofer || '', v.tarifa, Number(v.cantidad), v.unidad, Number(v.precio_unitario), Number(v.importe)]));
  aoa.push([], ['', '', '', '', '', '', '', '', 'Subtotal', Number(e.subtotal)]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Estimación');
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="estimacion-${e.id}.xlsx"` });
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});

/* ── facturas (requisición FOR-FYC-01 -> folio -> cobro) ─────────────── */
api.get('/facturas', async (req, res) => {
  res.json(await sel(`SELECT f.*, c.nombre AS cliente, o.nombre AS obra, o.clave FROM nh_facturas f JOIN nh_clients c ON c.id=f.client_id AND c.tenant_id=f.tenant_id
    LEFT JOIN nh_obras o ON o.id=f.obra_id AND o.tenant_id=f.tenant_id WHERE f.tenant_id=:t ORDER BY f.fecha_requisicion DESC, f.id DESC LIMIT 300`, { t: req.tenant }));
});
async function insertFactura(req, f) {
  const tot = M.facturaTotals(f.subtotal, f.aplica_retencion);
  const [r] = await exec(`INSERT INTO nh_facturas (tenant_id,client_id,obra_id,estimacion_id,concepto,cantidad,unidad,precio_unitario,subtotal,iva,retencion,total,
      aplica_retencion,solicitante,departamento,fecha_requisicion,created_by)
    VALUES (:t,:c,:o,:e,:concepto,:cantidad,:unidad,:pu,:subtotal,:iva,:retencion,:total,:ar,:sol,:dep,:fr,:u) RETURNING *`,
    { t: req.tenant, c: f.client_id, o: f.obra_id || null, e: f.estimacion_id || null, concepto: f.concepto, cantidad: f.cantidad, unidad: f.unidad, pu: f.precio_unitario,
      ...tot, ar: f.aplica_retencion, sol: f.solicitante, dep: f.departamento, fr: f.fecha_requisicion, u: req.user.id });
  return r[0];
}
api.post('/estimaciones/:id/requisicion', async (req, res) => {
  const id = intId(req.params.id), e = id && (await own('nh_estimaciones', id, req.tenant));
  if (!e) return res.status(404).json({ error: 'not_found' });
  if (e.estado !== 'aprobada') return res.status(409).json({ error: 'estimacion_no_aprobada' });
  if (await one("SELECT id FROM nh_facturas WHERE estimacion_id=:e AND tenant_id=:t AND estado<>'cancelada'", { e: id, t: req.tenant })) return res.status(409).json({ error: 'ya_tiene_requisicion' });
  const o = await own('nh_obras', e.obra_id, req.tenant);
  const f = await insertFactura(req, {
    client_id: o.client_id, obra_id: o.id, estimacion_id: id,
    concepto: `Acarreo de materiales · ${o.nombre} · ${e.desde} a ${e.hasta}`, cantidad: 1, unidad: 'servicio', precio_unitario: Number(e.subtotal), subtotal: Number(e.subtotal),
    aplica_retencion: req.body && req.body.aplica_retencion === false ? false : true,
    solicitante: strOrNull((req.body && req.body.solicitante) || o.ingeniero, 160), departamento: strOrNull(req.body && req.body.departamento, 120), fecha_requisicion: hoyMx()
  });
  audit(req, 'requisicion_created', `${f.id} ${M.pesos(f.total)}`);
  res.status(201).json(f);
});
/** Requisición suelta (renta diaria, servicio de taller a empresa hermana...). Subtotal = cantidad x precio. */
api.post('/facturas', async (req, res) => {
  const b = req.body || {};
  const client = intId(b.client_id), obra = b.obra_id ? intId(b.obra_id) : null;
  if (!client || !(await own('nh_clients', client, req.tenant))) return res.status(404).json({ error: 'client_not_found' });
  if (obra && !(await own('nh_obras', obra, req.tenant))) return res.status(404).json({ error: 'obra_not_found' });
  const cantidad = num(b.cantidad), pu = moneyIn(b.precio_unitario), concepto = str(b.concepto, 300);
  if (!concepto) return res.status(400).json({ error: 'missing_concepto' });
  if (cantidad == null || cantidad <= 0 || pu == null) return res.status(400).json({ error: 'cantidad_o_precio_invalido' });
  const f = await insertFactura(req, { client_id: client, obra_id: obra, concepto, cantidad, unidad: strOrNull(b.unidad, 30), precio_unitario: pu,
    subtotal: M.importe(cantidad, pu), aplica_retencion: b.aplica_retencion !== false, solicitante: strOrNull(b.solicitante, 160),
    departamento: strOrNull(b.departamento, 120), fecha_requisicion: date(b.fecha_requisicion) || hoyMx() });
  audit(req, 'requisicion_created', `${f.id} ${M.pesos(f.total)}`);
  res.status(201).json(f);
});
api.patch('/facturas/:id', async (req, res) => {
  const id = intId(req.params.id), f = id && (await own('nh_facturas', id, req.tenant));
  if (!f) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  if (b.estado === 'emitida') {
    const folio = str(b.folio, 60);
    if (!folio) return res.status(400).json({ error: 'falta_folio' });
    if (f.estado !== 'requisicion') return res.status(409).json({ error: 'transicion_invalida' });
    await exec("UPDATE nh_facturas SET estado='emitida', folio=:fo, fecha_emision=:d WHERE id=:id AND tenant_id=:t", { fo: folio, d: date(b.fecha_emision) || hoyMx(), id, t: req.tenant });
    if (f.estimacion_id) await exec("UPDATE nh_estimaciones SET estado='facturada' WHERE id=:e AND tenant_id=:t", { e: f.estimacion_id, t: req.tenant });
  } else if (b.estado === 'cobrada') {
    if (f.estado !== 'emitida') return res.status(409).json({ error: 'transicion_invalida' });
    await exec("UPDATE nh_facturas SET estado='cobrada', fecha_cobro=:d WHERE id=:id AND tenant_id=:t", { d: date(b.fecha_cobro) || hoyMx(), id, t: req.tenant });
  } else if (b.estado === 'cancelada') {
    if (f.estado === 'cobrada') return res.status(409).json({ error: 'transicion_invalida' });
    await exec("UPDATE nh_facturas SET estado='cancelada' WHERE id=:id AND tenant_id=:t", { id, t: req.tenant });
    if (f.estimacion_id) await exec("UPDATE nh_estimaciones SET estado='aprobada' WHERE id=:e AND tenant_id=:t", { e: f.estimacion_id, t: req.tenant });
  } else if (b.solicitante !== undefined || b.departamento !== undefined) {
    if (f.estado !== 'requisicion') return res.status(409).json({ error: 'transicion_invalida' });
    await exec('UPDATE nh_facturas SET solicitante=:s, departamento=:d WHERE id=:id AND tenant_id=:t',
      { s: b.solicitante !== undefined ? strOrNull(b.solicitante, 160) : f.solicitante, d: b.departamento !== undefined ? strOrNull(b.departamento, 120) : f.departamento, id, t: req.tenant });
  } else return res.status(400).json({ error: 'nada_que_hacer' });
  audit(req, 'factura_' + (b.estado || 'editada'), id);
  res.json(await own('nh_facturas', id, req.tenant));
});

/* ── gastos / cuentas por pagar y reparto de diésel ──────────────────── */
api.get('/gastos', async (req, res) => {
  const where = ['g.tenant_id=:t'], r = { t: req.tenant };
  if (['pendiente', 'programado', 'pagado'].includes(req.query.estado)) { where.push('g.estado=:e'); r.e = req.query.estado; }
  const rows = await sel(`SELECT g.*, k.unidad AS camion, o.nombre AS obra,
    (SELECT COUNT(*)::int FROM nh_diesel_cargas c WHERE c.tenant_id=g.tenant_id AND c.gasto_id=g.id) AS cargas,
    (SELECT COUNT(*)::int FROM nh_diesel_cargas c WHERE c.tenant_id=g.tenant_id AND c.gasto_id=g.id AND c.truck_id IS NULL) AS cargas_sin_camion FROM nh_gastos g LEFT JOIN nh_trucks k ON k.id=g.truck_id AND k.tenant_id=g.tenant_id
    LEFT JOIN nh_obras o ON o.id=g.obra_id AND o.tenant_id=g.tenant_id WHERE ${where.join(' AND ')} ORDER BY g.fecha DESC, g.id DESC LIMIT 500`, r);
  const rep = await sel(`SELECT r.*, k.unidad FROM nh_gasto_reparto r JOIN nh_trucks k ON k.id=r.truck_id AND k.tenant_id=r.tenant_id WHERE r.tenant_id=:t`, { t: req.tenant });
  rows.forEach((g) => { g.reparto = rep.filter((x) => x.gasto_id === g.id); });
  res.json(rows);
});
const GASTO_FIELDS = {
  fecha: (v) => date(v) || undefined, proveedor: (v) => str(v, 200) || undefined, folio: (v) => strOrNull(v, 60), concepto: (v) => strOrNull(v, 300),
  categoria: (v) => (CATEG_GASTO.includes(v) ? v : undefined), truck_id: (v) => (v ? intId(v) : null), obra_id: (v) => (v ? intId(v) : null),
  prioridad: (v) => (['alta', 'media', 'baja', ''].includes(v) ? v || null : undefined), file_id: (v) => (v ? intId(v) : null)
};
async function gastoRefs(req, g) {
  if (g.truck_id && !(await own('nh_trucks', g.truck_id, req.tenant))) return false;
  if (g.obra_id && !(await own('nh_obras', g.obra_id, req.tenant))) return false;
  if (g.file_id && !(await one('SELECT id FROM nh_files WHERE id=:id AND tenant_id=:t', { id: g.file_id, t: req.tenant }))) return false;
  return true;
}
api.post('/gastos', async (req, res) => {
  const b = req.body || {}, g = {};
  for (const [k, fn] of Object.entries(GASTO_FIELDS)) if (k in b) { const v = fn(b[k]); if (v !== undefined) g[k] = v; }
  const total = moneyIn(b.total);
  if (!g.fecha || !g.proveedor || total == null || total <= 0) return res.status(400).json({ error: 'faltan_datos' });
  const saldo = b.saldo != null && b.saldo !== '' ? moneyIn(b.saldo) : total;
  if (saldo == null || saldo > total) return res.status(400).json({ error: 'saldo_invalido' });
  if (!(await gastoRefs(req, g))) return res.status(404).json({ error: 'not_found' });
  const row = { categoria: 'otros', ...g, total, saldo };
  const cols = Object.keys(row);
  const [r] = await exec(`INSERT INTO nh_gastos (tenant_id,created_by,${cols.join(',')}) VALUES (:tenant_id,:created_by,${cols.map((c) => ':' + c).join(',')}) RETURNING *`,
    { ...row, tenant_id: req.tenant, created_by: req.user.id });
  audit(req, 'gasto_created', `${r[0].id} ${M.pesos(total)}`);
  res.status(201).json(r[0]);
});
api.patch('/gastos/:id', async (req, res) => {
  const id = intId(req.params.id), prev = id && (await own('nh_gastos', id, req.tenant));
  if (!prev) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {}, g = {};
  for (const [k, fn] of Object.entries(GASTO_FIELDS)) if (k in b) { const v = fn(b[k]); if (v !== undefined) g[k] = v; }
  if (!(await gastoRefs(req, g))) return res.status(404).json({ error: 'not_found' });
  if (g.truck_id && (await one('SELECT id FROM nh_gasto_reparto WHERE gasto_id=:g AND tenant_id=:t LIMIT 1', { g: id, t: req.tenant }))) {
    return res.status(409).json({ error: 'ya_repartido' }); // contarlo en un camión y además repartido lo duplicaría en el tablero
  }
  if (g.truck_id && (await one('SELECT id FROM nh_diesel_cargas WHERE gasto_id=:g AND tenant_id=:t LIMIT 1', { g: id, t: req.tenant }))) return res.status(409).json({ error: 'tiene_cargas' });
  if (b.estado === 'programado') {
    const monto = b.monto_propuesto != null ? moneyIn(b.monto_propuesto) : Number(prev.saldo);
    if (monto == null || monto <= 0 || monto > Number(prev.saldo)) return res.status(400).json({ error: 'monto_invalido' });
    Object.assign(g, { estado: 'programado', monto_propuesto: monto, semana_pago: M.lunes(date(b.semana_pago) || hoyMx()) });
  } else if (b.estado === 'pagado') {
    const pagado = prev.monto_propuesto != null ? Number(prev.monto_propuesto) : Number(prev.saldo);
    const saldo = M.fromCents(M.toCents(prev.saldo) - M.toCents(pagado));
    Object.assign(g, { saldo: Math.max(0, saldo), estado: saldo > 0 ? 'pendiente' : 'pagado', fecha_pago: date(b.fecha_pago) || hoyMx(), monto_propuesto: null, semana_pago: null });
  } else if (b.estado === 'pendiente') Object.assign(g, { estado: 'pendiente', monto_propuesto: null, semana_pago: null });
  if (!Object.keys(g).length) return res.status(400).json({ error: 'nada_que_hacer' });
  const [r] = await exec(`UPDATE nh_gastos SET ${Object.keys(g).map((c) => `${c}=:${c}`).join(',')} WHERE id=:id AND tenant_id=:tenant_id RETURNING *`, { ...g, id, tenant_id: req.tenant });
  audit(req, 'gasto_updated', id);
  res.json(r[0]);
});
/** Reparte un gasto (normalmente la factura única del diésel) entre camiones por km. Reemplaza el reparto anterior. */
api.put('/gastos/:id/reparto', async (req, res) => {
  const id = intId(req.params.id), g = id && (await own('nh_gastos', id, req.tenant));
  if (!g) return res.status(404).json({ error: 'not_found' });
  if (g.truck_id) return res.status(409).json({ error: 'ya_asignado_a_un_camion' });
  if (await one('SELECT id FROM nh_diesel_cargas WHERE tenant_id=:t AND gasto_id=:g LIMIT 1', { t: req.tenant, g: id })) return res.status(409).json({ error: 'tiene_cargas' });
  const porCamion = new Map();
  for (const f of (Array.isArray(req.body && req.body.filas) ? req.body.filas : []).slice(0, 100)) { const k = intId(f.truck_id); if (k) porCamion.set(k, num(f.km)); }
  const filas = [...porCamion].map(([truck_id, km]) => ({ truck_id, km }));
  for (const f of filas) if (f.truck_id && !(await own('nh_trucks', f.truck_id, req.tenant))) return res.status(404).json({ error: 'not_found' });
  const partes = M.reparto(g.total, filas);
  if (!partes) return res.status(400).json({ error: 'sin_km' });
  await db.transaction(async (t) => {
    await exec('DELETE FROM nh_gasto_reparto WHERE gasto_id=:g AND tenant_id=:tn', { g: id, tn: req.tenant }, t);
    for (const p of partes) await exec('INSERT INTO nh_gasto_reparto (tenant_id,gasto_id,truck_id,km,monto) VALUES (:tn,:g,:k,:km,:m)', { tn: req.tenant, g: id, k: p.truck_id, km: p.km, m: p.monto }, t);
  });
  audit(req, 'reparto', `${id} ${partes.length} camiones`);
  res.json({ reparto: partes, total: M.sum(partes.map((p) => p.monto)) });
});

/* ── diésel por carga: el CFDI de la gasolinera ──────────────────────── */
// La factura de la estación (J6) trae cada carga con su folio de despacho, fecha, hora y litros,
// pero NO dice qué camión cargó (la tarjeta 946 es de toda la empresa). Andrés asigna cada carga;
// el costo cuenta en la semana de la carga. Las cargas deben sumar exactamente el total de la factura.
const folioKey = (f) => String(f == null ? '' : f).toUpperCase().replace(/[^A-Z0-9]/g, '');
const FOLIO_SQL = "regexp_replace(upper(COALESCE(folio,'')),'[^A-Z0-9]','','g')";
const provKey = (p) => String(p || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
const mismoProveedor = (a, b) => { const x = provKey(a), y = provKey(b); return !!x && !!y && (x.startsWith(y.slice(0, 12)) || y.startsWith(x.slice(0, 12))); };
/** Una importación a la vez por empresa: las comprobaciones de duplicado se repiten con el candado tomado. */
const lockImport = (req, tx) => exec("SELECT pg_advisory_xact_lock(hashtext('nh_import_' || :t))", { t: String(req.tenant) }, tx);
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });
const cent = (v) => M.toCents(v);
api.post('/diesel/importar', docUpload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta_archivo' });
  const buf = req.file.buffer, type = sniff(buf);
  let doc;
  if (type === 'application/pdf') {
    const p = await parsePdf(buf);
    if (p.error || typeof p.text !== 'string') return res.status(415).json({ error: p.error || 'pdf_ilegible' });
    doc = D.dieselFromPdfText(p.text);
  } else if (!type && !buf.slice(0, 4096).includes(0) && /<\s*(\w+:)?Comprobante\b/.test(buf.slice(0, 20000).toString('utf8'))) {
    if (/<!DOCTYPE|<!ENTITY/i.test(buf.toString('utf8'))) return res.status(415).json({ error: 'xml_con_doctype' }); // un CFDI nunca trae DOCTYPE
    doc = D.dieselFromXml(buf.toString('utf8'));
  } else return res.status(415).json({ error: 'usa_pdf_o_xml_del_cfdi' });
  if (doc.error) return res.status(400).json({ error: doc.error });
  if (doc.repetidas.length) return res.status(422).json({ error: 'cargas_repetidas', folios: doc.repetidas.slice(0, 20) });
  if (!doc.cuadra) return res.status(422).json({ error: 'no_cuadra', factura: { subtotal: doc.subtotal, iva: doc.iva, total: doc.total }, calculado: doc.calculado });
  if (!doc.folio && !doc.uuid) return res.status(400).json({ error: 'sin_folio' });
  if (doc.uuid) {
    const ya = await one('SELECT id FROM nh_gastos WHERE tenant_id=:t AND uuid=:u', { t: req.tenant, u: doc.uuid });
    if (ya) return res.status(409).json({ error: 'factura_ya_importada', gasto_id: ya.id });
  }
  // Si la factura ya entró como cuenta por pagar (por ejemplo desde el PPS), se le agregan las cargas en vez de duplicarla.
  const nf = folioKey(doc.folio);
  const mismos = nf ? (await sel(`SELECT * FROM nh_gastos WHERE tenant_id=:t AND ${FOLIO_SQL}=:f`, { t: req.tenant, f: nf }))
    .filter((g) => g.categoria === 'diesel' || mismoProveedor(g.proveedor, doc.proveedor)) : [];
  const iguales = mismos.filter((g) => cent(g.total) === cent(doc.total));
  if (mismos.length && !iguales.length) return res.status(409).json({ error: 'folio_con_otro_total', folio: doc.folio, total_factura: doc.total, total_en_app: Number(mismos[0].total) });
  if (iguales.length > 1) return res.status(409).json({ error: 'folio_ambiguo', folio: doc.folio });
  const prev = iguales[0] || null;
  if (prev && prev.truck_id) return res.status(409).json({ error: 'ya_asignado_a_un_camion', gasto_id: prev.id });
  if (prev && (await one('SELECT id FROM nh_diesel_cargas WHERE tenant_id=:t AND gasto_id=:g LIMIT 1', { t: req.tenant, g: prev.id }))) return res.status(409).json({ error: 'factura_ya_importada', gasto_id: prev.id });
  let gastoId, repartoReemplazado = false;
  try {
  await db.transaction(async (tx) => {
    await lockImport(req, tx);
    // Se vuelve a comprobar con el candado tomado: dos subidas a la vez no crean dos facturas.
    if (doc.uuid && (await one('SELECT id FROM nh_gastos WHERE tenant_id=:t AND uuid=:u', { t: req.tenant, u: doc.uuid }, tx))) throw Object.assign(new Error('dup'), { http: 409, body: { error: 'factura_ya_importada' } });
    if (prev) {
      const now = await one('SELECT truck_id, (SELECT COUNT(*)::int FROM nh_diesel_cargas c WHERE c.tenant_id=g.tenant_id AND c.gasto_id=g.id) AS n FROM nh_gastos g WHERE id=:id AND tenant_id=:t FOR UPDATE', { id: prev.id, t: req.tenant }, tx);
      if (!now || now.truck_id || now.n) throw Object.assign(new Error('dup'), { http: 409, body: { error: now && now.truck_id ? 'ya_asignado_a_un_camion' : 'factura_ya_importada', gasto_id: prev.id } });
    } else if (!doc.uuid && nf && (await one(`SELECT id FROM nh_gastos WHERE tenant_id=:t AND ${FOLIO_SQL}=:f`, { t: req.tenant, f: nf }, tx))) {
      throw Object.assign(new Error('dup'), { http: 409, body: { error: 'factura_ya_importada' } });
    }
    if (prev) {
      const [r] = await exec('DELETE FROM nh_gasto_reparto WHERE tenant_id=:t AND gasto_id=:g RETURNING id', { t: req.tenant, g: prev.id }, tx);
      repartoReemplazado = r.length > 0;
      await exec(`UPDATE nh_gastos SET uuid=:u, categoria='diesel' WHERE id=:id AND tenant_id=:t`, { u: doc.uuid, id: prev.id, t: req.tenant }, tx);
      gastoId = prev.id;
    } else {
      const [r] = await exec(`INSERT INTO nh_gastos (tenant_id,fecha,proveedor,folio,concepto,categoria,total,saldo,uuid,origen,file_id,created_by)
        VALUES (:t,:fecha,:p,:folio,:c,'diesel',:tot,:tot,:u,'cfdi',:f,:by) RETURNING id`,
        { t: req.tenant, fecha: doc.fecha || hoyMx(), p: str(doc.proveedor, 200) || 'Gasolinera', folio: strOrNull(doc.folio, 60), c: str(`Combustible ${doc.litros} L${doc.tarjeta ? ' · tarjeta ' + doc.tarjeta : ''}`, 300),
          tot: doc.total, u: doc.uuid, f: null, by: req.user.id }, tx);
      gastoId = r[0].id;
    }
    for (const c of doc.cargas) {
      await exec(`INSERT INTO nh_diesel_cargas (tenant_id,gasto_id,folio_despacho,fecha,hora,producto,litros,precio,importe,iva,total)
        VALUES (:t,:g,:fd,:f,:h,:p,:l,:pr,:i,:iva,:tot)`,
        { t: req.tenant, g: gastoId, fd: str(c.folio_despacho, 40), f: c.fecha, h: c.hora, p: str(c.producto, 30), l: c.litros, pr: c.precio, i: c.importe, iva: c.iva, tot: c.total }, tx);
    }
  });
  } catch (e) { if (e.http) return res.status(e.http).json(e.body); throw e; }
  // El PDF se guarda al final: una importación rechazada no deja archivos huérfanos.
  if (type === 'application/pdf') {
    const file = await storeFile(req, 'factura', req.file);
    if (file && file.id) await exec('UPDATE nh_gastos SET file_id=COALESCE(file_id,:f) WHERE id=:id AND tenant_id=:t', { f: file.id, id: gastoId, t: req.tenant });
  }
  audit(req, 'diesel_importado', `${doc.folio || doc.uuid} ${doc.cargas.length} cargas ${M.pesos(doc.total)}`);
  res.status(201).json({ gasto_id: gastoId, adjuntado_a_existente: !!prev, reparto_km_reemplazado: repartoReemplazado, folio: doc.folio, proveedor: doc.proveedor, fecha: doc.fecha,
    cargas: doc.cargas.length, litros: doc.litros, por_producto: doc.por_producto, total: doc.total, tarjeta: doc.tarjeta, placas_tarjeta: doc.placas_tarjeta, formato: doc.formato });
});
async function dieselResumen(req, gastoId) {
  const g = await own('nh_gastos', gastoId, req.tenant);
  if (!g) return null;
  const cargas = await sel(`SELECT c.*, k.unidad AS camion FROM nh_diesel_cargas c LEFT JOIN nh_trucks k ON k.id=c.truck_id AND k.tenant_id=c.tenant_id
    WHERE c.tenant_id=:t AND c.gasto_id=:g ORDER BY c.fecha, c.hora, c.id`, { t: req.tenant, g: gastoId });
  const porCamion = {};
  for (const c of cargas) {
    const k = c.truck_id ? c.camion : 'Sin asignar';
    porCamion[k] = porCamion[k] || { cargas: 0, litros: 0, total: 0 };
    porCamion[k].cargas++; porCamion[k].litros = Math.round((porCamion[k].litros + Number(c.litros)) * 1000) / 1000;
    porCamion[k].total = M.fromCents(cent(porCamion[k].total) + cent(c.total));
  }
  const sin = cargas.filter((c) => !c.truck_id);
  return { gasto: g, cargas, por_camion: porCamion, sin_asignar: { cargas: sin.length, total: M.sum(sin.map((c) => c.total)) }, total: M.sum(cargas.map((c) => c.total)) };
}
api.get('/diesel/:gastoId', async (req, res) => {
  const r = intId(req.params.gastoId) && (await dieselResumen(req, intId(req.params.gastoId)));
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json(r);
});
api.put('/diesel/:gastoId/cargas', async (req, res) => {
  const gid = intId(req.params.gastoId), g = gid && (await own('nh_gastos', gid, req.tenant));
  if (!g) return res.status(404).json({ error: 'not_found' });
  const lista = Array.isArray(req.body && req.body.asignaciones) ? req.body.asignaciones : [];
  if (!lista.length) return res.status(400).json({ error: 'nada_que_hacer' });
  if (lista.length > 2000) return res.status(400).json({ error: 'demasiadas_cargas' });
  const cargas = new Set((await sel('SELECT id FROM nh_diesel_cargas WHERE tenant_id=:t AND gasto_id=:g', { t: req.tenant, g: gid })).map((c) => c.id));
  const trucks = new Set((await sel('SELECT id FROM nh_trucks WHERE tenant_id=:t', { t: req.tenant })).map((k) => k.id));
  const cambios = [];
  for (const a of lista) {
    const id = intId(a && a.id), k = a && a.truck_id ? intId(a.truck_id) : null;
    if (!id || !cargas.has(id) || (a.truck_id && (!k || !trucks.has(k)))) return res.status(404).json({ error: 'not_found' });
    cambios.push({ id, k });
  }
  await db.transaction(async (tx) => {
    for (const c of cambios) await exec('UPDATE nh_diesel_cargas SET truck_id=:k WHERE id=:id AND tenant_id=:t AND gasto_id=:g', { k: c.k, id: c.id, t: req.tenant, g: gid }, tx);
  });
  audit(req, 'diesel_asignado', `${gid} ${cambios.length} cargas`);
  res.json(await dieselResumen(req, gid));
});

/* ── PPS: la propuesta de pagos semanal de NeoHaul, de ida y vuelta ──── */
const kpps = (p, f) => [p, f].map((x) => String(x == null ? '' : x).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()).join('|');
const ccKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
api.post('/gastos/importar-pps', importUpload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'falta_archivo' });
  const type = sniff(req.file.buffer), isText = !type && !req.file.buffer.slice(0, 4096).includes(0);
  if (type !== 'application/zip' && !isText) return res.status(415).json({ error: 'usa_excel_o_csv' });
  const parsed = await parseSheet(req.file.buffer);
  if (parsed.error) return res.status(415).json({ error: parsed.error });
  const pps = D.parsePps(parsed.rows);
  if (pps.error) return res.status(400).json(pps);
  const obras = await sel('SELECT id,nombre,clave FROM nh_obras WHERE tenant_id=:t', { t: req.tenant });
  const trucks = await sel('SELECT id,unidad,placas FROM nh_trucks WHERE tenant_id=:t', { t: req.tenant });
  const destino = (cc) => {
    const k = ccKey(cc); if (!k || k === 'GENERAL') return {};
    const o = obras.filter((x) => (x.clave && ccKey(x.clave) === k) || ccKey(x.nombre) === k);
    if (o.length === 1) return { obra_id: o[0].id };
    const tr = trucks.filter((x) => ccKey(x.unidad) === k || (x.placas && D.placaKey(x.placas) === D.placaKey(cc)));
    return tr.length === 1 ? { truck_id: tr[0].id } : {};
  };
  const semana = M.lunes(hoyMx());
  let creadas = 0, actualizadas = 0, actuales = []; const enArchivo = new Set(), avisos = [];
  await db.transaction(async (tx) => {
    await lockImport(req, tx);
    // Leído con el candado tomado: dos cargas del PPS a la vez no duplican facturas.
    actuales = await sel(`SELECT g.id,g.proveedor,g.folio,g.estado,g.origen,g.total,g.saldo,
        EXISTS (SELECT 1 FROM nh_diesel_cargas c WHERE c.tenant_id=g.tenant_id AND c.gasto_id=g.id)
        OR EXISTS (SELECT 1 FROM nh_gasto_reparto r WHERE r.tenant_id=g.tenant_id AND r.gasto_id=g.id) AS detallado
      FROM nh_gastos g WHERE g.tenant_id=:t`, { t: req.tenant }, tx);
    const porClave = new Map(actuales.map((g) => [kpps(g.proveedor, g.folio), g]));
    // Misma regla que el CFDI: folio normalizado + mismo total, para que el orden de carga no duplique.
    const porFolioTotal = new Map();
    for (const g of actuales) { const k = folioKey(g.folio) + '|' + cent(g.total); if (folioKey(g.folio)) porFolioTotal.set(k, porFolioTotal.has(k) ? null : g); }
    for (const f of pps.filas) {
      const key = kpps(f.proveedor, f.folio); enArchivo.add(key);
      const prev = porClave.get(key) || porFolioTotal.get(folioKey(f.folio) + '|' + cent(f.total)) || null;
      if (prev) enArchivo.add(kpps(prev.proveedor, prev.folio));
      const prop = f.propuesta != null ? Math.min(f.propuesta, f.saldo) : null;
      if (f.propuesta != null && f.propuesta > f.saldo) avisos.push({ renglon: f.renglon, folio: f.folio, aviso: 'propuesta_mayor_que_saldo' });
      if (prev) {
        // Lo que la app ya sabe gana: una factura pagada no se reabre y un saldo no sube con un PPS viejo.
        if (prev.estado === 'pagado') { if (cent(f.saldo) > 0) avisos.push({ renglon: f.renglon, folio: f.folio, aviso: 'ya_pagada_en_la_app' }); continue; }
        let saldo = f.saldo;
        if (cent(f.saldo) > cent(prev.saldo)) { avisos.push({ renglon: f.renglon, folio: f.folio, aviso: 'saldo_mayor_que_en_la_app' }); saldo = Number(prev.saldo); }
        let total = f.total;
        if (cent(f.total) !== cent(prev.total) && prev.detallado) { avisos.push({ renglon: f.renglon, folio: f.folio, aviso: 'total_distinto_con_cargas' }); total = Number(prev.total); }
        if (cent(saldo) > cent(total)) saldo = total;
        const estado = cent(saldo) === 0 ? 'pagado' : prop ? 'programado' : null;
        await exec(`UPDATE nh_gastos SET fecha=:fecha, total=:total, saldo=:saldo, empresa=:emp, cc=:cc, desc_cc=:dcc, explicacion=COALESCE(:ex,explicacion), orden_pps=:ord,
            prioridad=COALESCE(:pri,prioridad), origen=COALESCE(origen,'pps'),
            estado=COALESCE(:st::text, estado),
            fecha_pago=CASE WHEN :st::text='pagado' THEN CAST(:hoy AS DATE) ELSE fecha_pago END,
            monto_propuesto=CASE WHEN :st::text='programado' THEN :mp WHEN :st::text='pagado' THEN NULL ELSE monto_propuesto END,
            semana_pago=CASE WHEN :st::text='programado' THEN CAST(:sp AS DATE) WHEN :st::text='pagado' THEN NULL ELSE semana_pago END
          WHERE id=:id AND tenant_id=:t AND estado<>'pagado'`,
          { t: req.tenant, fecha: f.fecha, total, saldo, emp: f.empresa, cc: f.cc, dcc: f.desc_cc, ex: f.explicacion, ord: f.orden, pri: f.prioridad,
            st: estado, hoy: hoyMx(), mp: estado === 'programado' ? Math.min(prop, saldo) : null, sp: estado === 'programado' ? semana : null, id: prev.id }, tx);
        actualizadas++;
      } else {
        const dest = destino(f.cc);
        const estado = cent(f.saldo) === 0 ? 'pagado' : prop ? 'programado' : 'pendiente';
        await exec(`INSERT INTO nh_gastos (tenant_id,fecha,proveedor,folio,concepto,categoria,total,saldo,truck_id,obra_id,prioridad,semana_pago,monto_propuesto,estado,fecha_pago,
            empresa,cc,desc_cc,explicacion,orden_pps,origen,created_by)
          VALUES (:t,:fecha,:p,:folio,:c,:cat,:total,:saldo,:k,:o,:pri,CAST(:sp AS DATE),:mp,:st,CAST(:fp AS DATE),:emp,:cc,:dcc,:ex,:ord,'pps',:by)`,
          { t: req.tenant, fecha: f.fecha, p: f.proveedor, folio: f.folio, c: f.concepto, cat: f.categoria, total: f.total, saldo: f.saldo, k: dest.truck_id || null, o: dest.obra_id || null,
            pri: f.prioridad, sp: estado === 'programado' ? semana : null, mp: estado === 'programado' ? prop : null, st: estado, fp: estado === 'pagado' ? hoyMx() : null,
            emp: f.empresa, cc: f.cc, dcc: f.desc_cc, ex: f.explicacion, ord: f.orden, by: req.user.id }, tx);
        creadas++;
      }
    }
  });
  // Lo que venía del PPS anterior y ya no viene suele estar pagado: se avisa, no se marca solo.
  const noVienen = actuales.filter((g) => g.origen === 'pps' && g.estado !== 'pagado' && !enArchivo.has(kpps(g.proveedor, g.folio)))
    .map((g) => ({ id: g.id, proveedor: g.proveedor, folio: g.folio }));
  audit(req, 'pps_importado', `${creadas} nuevas ${actualizadas} actualizadas ${pps.errores.length} rechazadas`);
  res.json({ creadas, actualizadas, rechazadas: pps.errores, avisos, resumen: pps.resumen, control: pps.control, no_vienen: noVienen });
});
function isoSemana(f) {
  const d = new Date(f + 'T00:00:00Z'); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const y1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - y1) / 86400000 - 3 + ((y1.getUTCDay() + 6) % 7)) / 7);
}
api.get('/gastos/pps.xlsx', async (req, res) => {
  const semana = M.lunes(date(req.query.semana) || hoyMx());
  const gs = await sel(`SELECT g.*, k.unidad AS camion, o.clave AS obra_clave, o.nombre AS obra FROM nh_gastos g LEFT JOIN nh_trucks k ON k.id=g.truck_id AND k.tenant_id=g.tenant_id
    LEFT JOIN nh_obras o ON o.id=g.obra_id AND o.tenant_id=g.tenant_id WHERE g.tenant_id=:t AND g.estado<>'pagado' AND g.saldo>0
    ORDER BY g.orden_pps NULLS LAST, g.fecha, g.id`, { t: req.tenant });
  const serial = (f) => Math.round((Date.parse(String(f).slice(0, 10) + 'T00:00:00Z') / 86400000) + 25569);
  const filas = gs.map((g, i) => {
    const prog = g.estado === 'programado' && String(g.semana_pago).slice(0, 10) === semana;
    const parcial = prog && cent(g.monto_propuesto) < cent(g.saldo);
    return [g.orden_pps || i + 1, g.empresa || 'NEOHAUL', g.folio || '', serial(g.fecha), '', Number(g.saldo), g.proveedor, Number(g.total), g.concepto || 'Factura',
      g.cc || g.camion || g.obra_clave || g.obra || 'GENERAL', g.desc_cc || 'NEOHAUL', g.explicacion || '', g.prioridad || '', parcial ? 'SI' : '',
      parcial ? Number(g.monto_propuesto) : '', prog ? Number(g.monto_propuesto) : 0];
  });
  const sumCol = (c) => M.sum(filas.map((r) => (typeof r[c] === 'number' ? r[c] : 0)));
  const aoa = [[filas.length, '', '', '', '', sumCol(5), '', sumCol(7), '', '', '', '', '', '', sumCol(14), sumCol(15)], D.PPS_COLS, ...filas];
  const XLSX = require('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 2; r < aoa.length; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 3 })]; if (c) c.z = 'dd/mm/yyyy'; }
  ws['!cols'] = [6, 10, 14, 11, 6, 13, 40, 13, 10, 10, 10, 24, 10, 8, 12, 12].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'NEOHAUL');
  const [y, m, d] = semana.split('-');
  audit(req, 'pps_exportado', `${semana} ${filas.length}`);
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="PPS S${isoSemana(semana)} NEOHAUL ${d}-${m}-${y.slice(2)}.xlsx"` });
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});

/* ── nómina semanal ──────────────────────────────────────────────────── */
async function nominaSemana(req, semana) {
  const hasta = M.sumarDias(semana, 6);
  const staff = await sel("SELECT * FROM nh_drivers WHERE tenant_id=:t AND active AND empresa='NeoHaul' ORDER BY puesto, nombre", { t: req.tenant });
  const rows = await sel('SELECT * FROM nh_nomina WHERE tenant_id=:t AND semana=:s', { t: req.tenant, s: semana });
  const bases = await sel(`SELECT driver_id, SUM(importe) AS base, COUNT(*)::int AS viajes FROM nh_viajes WHERE tenant_id=:t AND estado='confirmado'
    AND fecha BETWEEN :d AND :h AND driver_id IS NOT NULL GROUP BY driver_id`, { t: req.tenant, d: semana, h: hasta });
  return staff.map((d) => {
    const r = rows.find((x) => x.driver_id === d.id);
    const b = bases.find((x) => x.driver_id === d.id);
    const base = b ? Number(b.base) : 0;
    if (r) return { ...r, nombre: d.nombre, puesto: d.puesto, viajes: b ? b.viajes : 0, base_actual: base };
    return { driver_id: d.id, nombre: d.nombre, puesto: d.puesto, semana, dias: {}, salario: d.salario_semanal, bonos: 0, comision_pct: 8,
      base_comision: base, comision: d.puesto === 'chofer' ? M.comision(base, 8) : 0, viajes: b ? b.viajes : 0, base_actual: base, cerrada: false, nuevo: true,
      total: M.sum([d.salario_semanal || 0, d.puesto === 'chofer' ? M.comision(base, 8) : 0]) };
  });
}
api.get('/nomina', async (req, res) => {
  const semana = M.lunes(date(req.query.semana) || hoyMx());
  res.json({ semana, hasta: M.sumarDias(semana, 6), filas: await nominaSemana(req, semana) });
});
api.put('/nomina', async (req, res) => {
  const b = req.body || {};
  const semana = M.lunes(date(b.semana)), driver = intId(b.driver_id);
  const d = driver && (await own('nh_drivers', driver, req.tenant));
  if (!semana || !d) return res.status(404).json({ error: 'not_found' });
  const prev = await one('SELECT * FROM nh_nomina WHERE tenant_id=:t AND driver_id=:d AND semana=:s', { t: req.tenant, d: driver, s: semana });
  if (prev && prev.cerrada) return res.status(409).json({ error: 'semana_cerrada' });
  const dias = {};
  for (const k of DIAS) if (b.dias && INCIDENCIAS.includes(b.dias[k])) dias[k] = b.dias[k];
  const pct = num(b.comision_pct) == null ? 8 : num(b.comision_pct);
  if (pct < 8 || pct > 10) return res.status(400).json({ error: 'comision_fuera_de_rango' }); // regla de NeoHaul: 8% a 10%
  const salario = b.salario === '' || b.salario == null ? null : moneyIn(b.salario);
  const bonos = moneyIn(b.bonos) || 0;
  if (bonos > 50000 || (salario != null && salario > 100000)) return res.status(400).json({ error: 'monto_fuera_de_rango' });
  const [[base]] = await exec(`SELECT COALESCE(SUM(importe),0) AS s FROM nh_viajes WHERE tenant_id=:t AND driver_id=:d AND estado='confirmado' AND fecha BETWEEN :a AND :z`,
    { t: req.tenant, d: driver, a: semana, z: M.sumarDias(semana, 6) });
  const comision = d.puesto === 'chofer' ? M.comision(base.s, pct) : 0;
  const total = M.sum([salario || 0, bonos, comision]);
  const [r] = await exec(`INSERT INTO nh_nomina (tenant_id,driver_id,semana,dias,salario,bonos,bonos_nota,comision_pct,base_comision,comision,total)
    VALUES (:t,:d,:s,:dias,:sal,:bon,:bn,:pct,:base,:com,:tot)
    ON CONFLICT (tenant_id,driver_id,semana) DO UPDATE SET dias=EXCLUDED.dias, salario=EXCLUDED.salario, bonos=EXCLUDED.bonos, bonos_nota=EXCLUDED.bonos_nota,
      comision_pct=EXCLUDED.comision_pct, base_comision=EXCLUDED.base_comision, comision=EXCLUDED.comision, total=EXCLUDED.total RETURNING *`,
    { t: req.tenant, d: driver, s: semana, dias: JSON.stringify(dias), sal: salario, bon: bonos, bn: strOrNull(b.bonos_nota, 200), pct, base: Number(base.s), com: comision, tot: total });
  audit(req, 'nomina_guardada', `${d.nombre} ${semana} salario ${M.pesos(salario || 0)} bonos ${M.pesos(bonos)} comision ${pct}% total ${M.pesos(total)}`);
  res.json(r[0]);
});
api.post('/nomina/cerrar', async (req, res) => {
  const semana = M.lunes(date(req.body && req.body.semana));
  if (!semana) return res.status(400).json({ error: 'semana_invalida' });
  const [r] = await exec('UPDATE nh_nomina SET cerrada=TRUE WHERE tenant_id=:t AND semana=:s AND NOT cerrada RETURNING id', { t: req.tenant, s: semana });
  audit(req, 'nomina_cerrada', `${semana} ${r.length}`);
  res.json({ cerradas: r.length });
});

/* ── taller ──────────────────────────────────────────────────────────── */
api.get('/taller', async (req, res) => {
  res.json(await sel(`SELECT s.*, k.unidad AS camion FROM nh_taller s LEFT JOIN nh_trucks k ON k.id=s.truck_id AND k.tenant_id=s.tenant_id
    WHERE s.tenant_id=:t ORDER BY s.fecha DESC, s.id DESC LIMIT 300`, { t: req.tenant }));
});
async function tallerRow(req, b, prev) {
  const s = {
    fecha: b.fecha !== undefined ? date(b.fecha) : prev && prev.fecha,
    cliente: b.cliente !== undefined ? str(b.cliente, 160) || 'NeoHaul' : prev ? prev.cliente : 'NeoHaul',
    truck_id: b.truck_id !== undefined ? (b.truck_id ? intId(b.truck_id) : null) : prev ? prev.truck_id : null,
    unidad_externa: b.unidad_externa !== undefined ? strOrNull(b.unidad_externa, 80) : prev ? prev.unidad_externa : null,
    supervisor: b.supervisor !== undefined ? strOrNull(b.supervisor, 160) : prev ? prev.supervisor : null,
    mecanico: b.mecanico !== undefined ? strOrNull(b.mecanico, 160) : prev ? prev.mecanico : null,
    trabajos: b.trabajos !== undefined ? str(b.trabajos, 1000) : prev && prev.trabajos,
    horas: b.horas !== undefined ? num(b.horas) : prev ? prev.horas : null,
    km: b.km !== undefined ? num(b.km) : prev ? prev.km : null,
    refacciones: b.refacciones !== undefined ? moneyIn(b.refacciones) || 0 : prev ? Number(prev.refacciones) : 0,
    mano_obra: b.mano_obra !== undefined ? moneyIn(b.mano_obra) || 0 : prev ? Number(prev.mano_obra) : 0
  };
  if (!s.fecha || !s.trabajos) return { error: 'faltan_datos' };
  if (s.truck_id && !(await own('nh_trucks', s.truck_id, req.tenant))) return { error: 'not_found', status: 404 };
  s.total = M.sum([s.refacciones, s.mano_obra]);
  s.cobrable = s.cliente.toLowerCase() !== 'neohaul';
  return { s };
}
api.post('/taller', async (req, res) => {
  const { s, error, status } = await tallerRow(req, req.body || {}, null);
  if (error) return res.status(status || 400).json({ error });
  s.estado = s.cobrable ? 'por_cobrar' : 'registrado';
  const cols = Object.keys(s);
  const [r] = await exec(`INSERT INTO nh_taller (tenant_id,created_by,${cols.join(',')}) VALUES (:tenant_id,:created_by,${cols.map((c) => ':' + c).join(',')}) RETURNING *`,
    { ...s, tenant_id: req.tenant, created_by: req.user.id });
  audit(req, 'taller_created', r[0].id);
  res.status(201).json(r[0]);
});
api.patch('/taller/:id', async (req, res) => {
  const id = intId(req.params.id), prev = id && (await own('nh_taller', id, req.tenant));
  if (!prev) return res.status(404).json({ error: 'not_found' });
  const { s, error, status } = await tallerRow(req, req.body || {}, prev);
  if (error) return res.status(status || 400).json({ error });
  s.estado = req.body && req.body.estado === 'cobrado' && s.cobrable ? 'cobrado' : s.cobrable ? (prev.estado === 'cobrado' ? 'cobrado' : 'por_cobrar') : 'registrado';
  const [r] = await exec(`UPDATE nh_taller SET ${Object.keys(s).map((c) => `${c}=:${c}`).join(',')} WHERE id=:id AND tenant_id=:tenant_id RETURNING *`, { ...s, id, tenant_id: req.tenant });
  res.json(r[0]);
});

/* ── tablero del jueves ──────────────────────────────────────────────── */
api.get('/tablero', async (req, res) => {
  const desde = M.lunes(date(req.query.desde) || hoyMx()), hasta = M.sumarDias(desde, 6);
  const r = { t: req.tenant, d: desde, h: hasta };
  const q1 = async (sql) => (await one(sql, r)) || {};
  const viajes = await q1("SELECT COUNT(*)::int AS n, COALESCE(SUM(importe),0) AS s, COUNT(*) FILTER (WHERE estado='capturado')::int AS sin_confirmar FROM nh_viajes WHERE tenant_id=:t AND fecha BETWEEN :d AND :h");
  const facturado = await q1("SELECT COALESCE(SUM(total),0) AS s, COUNT(*)::int AS n FROM nh_facturas WHERE tenant_id=:t AND estado IN ('emitida','cobrada') AND fecha_emision BETWEEN :d AND :h");
  const cobrado = await q1("SELECT COALESCE(SUM(total),0) AS s, COUNT(*)::int AS n FROM nh_facturas WHERE tenant_id=:t AND estado='cobrada' AND fecha_cobro BETWEEN :d AND :h");
  const porCobrar = await sel(`SELECT c.nombre AS cliente, COUNT(*)::int AS n, SUM(f.total) AS s, MIN(f.fecha_emision) AS mas_antigua FROM nh_facturas f
    JOIN nh_clients c ON c.id=f.client_id AND c.tenant_id=f.tenant_id WHERE f.tenant_id=:t AND f.estado='emitida' GROUP BY c.nombre ORDER BY s DESC`, r);
  const sinFacturar = await q1(`SELECT COUNT(*)::int AS n, COALESCE(SUM(e.subtotal),0) AS s FROM nh_estimaciones e WHERE e.tenant_id=:t AND e.estado IN ('borrador','enviada','aprobada')`);
  const requisiciones = await q1("SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0) AS s FROM nh_facturas WHERE tenant_id=:t AND estado='requisicion'");
  const pagosSemana = await sel(`SELECT g.id, g.proveedor, g.folio, g.categoria, g.monto_propuesto, g.saldo, k.unidad AS camion FROM nh_gastos g
    LEFT JOIN nh_trucks k ON k.id=g.truck_id AND k.tenant_id=g.tenant_id WHERE g.tenant_id=:t AND g.estado='programado' AND g.semana_pago=:d ORDER BY g.monto_propuesto DESC`, r);
  const porPagar = await q1("SELECT COALESCE(SUM(saldo),0) AS s, COUNT(*)::int AS n FROM nh_gastos WHERE tenant_id=:t AND estado<>'pagado'");
  const dieselSin = await q1(`SELECT COUNT(*)::int AS n, COALESCE(SUM(c.total),0) AS s FROM nh_diesel_cargas c JOIN nh_gastos g ON g.id=c.gasto_id AND g.tenant_id=c.tenant_id
    WHERE c.tenant_id=:t AND c.truck_id IS NULL AND COALESCE(c.fecha,g.fecha) BETWEEN :d AND :h`);
  const tallerCobrar = await q1("SELECT COALESCE(SUM(total),0) AS s, COUNT(*)::int AS n FROM nh_taller WHERE tenant_id=:t AND estado='por_cobrar'");
  // Por camión propio: ingresos de sus viajes en la semana contra sus costos directos capturados en la semana.
  const camiones = await sel(`SELECT k.id, k.unidad,
      COALESCE((SELECT SUM(importe) FROM nh_viajes v WHERE v.tenant_id=:t AND v.truck_id=k.id AND v.fecha BETWEEN :d AND :h),0) AS ingresos,
      COALESCE((SELECT COUNT(*) FROM nh_viajes v WHERE v.tenant_id=:t AND v.truck_id=k.id AND v.fecha BETWEEN :d AND :h),0)::int AS viajes,
      COALESCE((SELECT SUM(total) FROM nh_gastos g WHERE g.tenant_id=:t AND g.truck_id=k.id AND g.fecha BETWEEN :d AND :h),0) AS gastos,
      COALESCE((SELECT SUM(r.monto) FROM nh_gasto_reparto r JOIN nh_gastos g ON g.id=r.gasto_id AND g.tenant_id=r.tenant_id
        WHERE r.tenant_id=:t AND r.truck_id=k.id AND g.fecha BETWEEN :d AND :h),0) AS repartido,
      COALESCE((SELECT SUM(total) FROM nh_taller s WHERE s.tenant_id=:t AND s.truck_id=k.id AND s.cliente='NeoHaul' AND s.fecha BETWEEN :d AND :h),0) AS taller,
      COALESCE((SELECT SUM(c.total) FROM nh_diesel_cargas c JOIN nh_gastos g ON g.id=c.gasto_id AND g.tenant_id=c.tenant_id
        WHERE c.tenant_id=:t AND c.truck_id=k.id AND COALESCE(c.fecha,g.fecha) BETWEEN :d AND :h),0) AS diesel,
      COALESCE((SELECT SUM(c.litros) FROM nh_diesel_cargas c JOIN nh_gastos g ON g.id=c.gasto_id AND g.tenant_id=c.tenant_id
        WHERE c.tenant_id=:t AND c.truck_id=k.id AND COALESCE(c.fecha,g.fecha) BETWEEN :d AND :h),0) AS litros
    FROM nh_trucks k WHERE k.tenant_id=:t AND k.propio AND k.active ORDER BY k.unidad`, r);
  camiones.forEach((c) => {
    c.costos = M.sum([c.gastos, c.repartido, c.taller, c.diesel]);
    c.litros = Number(c.litros);
    c.sin_costos = M.toCents(c.costos) === 0;
    c.margen = c.sin_costos ? null : M.fromCents(M.toCents(c.ingresos) - M.toCents(c.costos));
  });
  res.json({
    desde, hasta,
    viajes: { n: viajes.n, importe: Number(viajes.s), sin_confirmar: viajes.sin_confirmar },
    facturado: { n: facturado.n, total: Number(facturado.s) },
    cobrado: { n: cobrado.n, total: Number(cobrado.s) },
    por_cobrar: porCobrar.map((p) => ({ ...p, s: Number(p.s) })),
    por_cobrar_total: M.sum(porCobrar.map((p) => p.s)),
    estimado_sin_facturar: { n: sinFacturar.n, subtotal: Number(sinFacturar.s) },
    requisiciones_sin_folio: { n: requisiciones.n, total: Number(requisiciones.s) },
    pagos_semana: pagosSemana, pagos_semana_total: M.sum(pagosSemana.map((g) => g.monto_propuesto)),
    cuentas_por_pagar: { n: porPagar.n, saldo: Number(porPagar.s) },
    taller_por_cobrar: { n: tallerCobrar.n, total: Number(tallerCobrar.s) },
    camiones,
    diesel_sin_asignar: { n: dieselSin.n, total: Number(dieselSin.s) },
    notas: ['Costos por camión = gastos asignados + diésel por carga (o repartido por km) + taller propio de la semana. La nómina y las comisiones aún no se cargan por camión.']
  });
});

/* ── usuarios y actividad ────────────────────────────────────────────── */
api.get('/usuarios', adminOnly, async (req, res) => {
  res.json(await sel('SELECT id,email,name,phone,role,must_change,active,last_login,created_at FROM nh_users WHERE tenant_id=:t ORDER BY role,name', { t: req.tenant }));
});
api.post('/usuarios', adminOnly, async (req, res) => {
  const b = req.body || {};
  const email = str(b.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'email_invalido' });
  if (!ROLES.includes(b.role)) return res.status(400).json({ error: 'rol_invalido' });
  if (b.role === 'director' && req.user.role !== 'owner') return res.status(403).json({ error: 'solo_dueno' });
  if (email === OWNER_EMAIL) return res.status(409).json({ error: 'reservado' });
  const pw = tempPassword();
  const [r] = await exec(`INSERT INTO nh_users (tenant_id,email,name,phone,role,password_hash,must_change) VALUES (:t,:e,:n,:p,:r,:h,TRUE)
    ON CONFLICT DO NOTHING RETURNING id,email,name,role`, { t: req.tenant, e: email, n: strOrNull(b.name, 160), p: strOrNull(b.phone, 40), r: b.role, h: await bcrypt.hash(pw, 12) });
  if (!r.length) return res.status(409).json({ error: 'ya_existe' });
  audit(req, 'usuario_created', email);
  res.status(201).json({ ...r[0], password_temporal: pw });
});
api.patch('/usuarios/:id', adminOnly, async (req, res) => {
  const id = intId(req.params.id), u = id && (await own('nh_users', id, req.tenant));
  if (!u || u.role === 'owner' || u.id === req.user.id) return res.status(404).json({ error: 'not_found' });
  if (u.role === 'director' && req.user.role !== 'owner') return res.status(404).json({ error: 'not_found' }); // un director no toma la cuenta de otro
  const b = req.body || {};
  if (b.reset) {
    const pw = tempPassword();
    await exec('UPDATE nh_users SET password_hash=:h, must_change=TRUE WHERE id=:id AND tenant_id=:t', { h: await bcrypt.hash(pw, 12), id, t: req.tenant });
    audit(req, 'usuario_reset', u.email);
    return res.json({ ok: true, password_temporal: pw });
  }
  const role = ROLES.includes(b.role) && (b.role !== 'director' || req.user.role === 'owner') ? b.role : u.role;
  const active = b.active === undefined ? u.active : !!b.active;
  await exec('UPDATE nh_users SET role=:r, active=:a WHERE id=:id AND tenant_id=:t', { r: role, a: active, id, t: req.tenant });
  audit(req, 'usuario_updated', u.email);
  res.json({ ok: true });
});
api.get('/actividad', adminOnly, async (req, res) => {
  res.json(await sel('SELECT action,detail,user_email,created_at FROM nh_activity WHERE tenant_id=:t ORDER BY id DESC LIMIT 200', { t: req.tenant }));
});

router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'archivo_muy_grande' });
  console.error('[neohaul]', err && err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal' });
});

module.exports = router;
module.exports.ready = ready;
module.exports._verifyOwner = null; // la SIT inyecta aquí la verificación del dueño
module.exports._db = db;
