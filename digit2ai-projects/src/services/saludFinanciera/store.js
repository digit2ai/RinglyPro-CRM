'use strict';
/**
 * Persistence for Salud Financiera. Raw SQL, every statement filtered by the
 * authenticated user_id (and tenant_id). Tables carry the `sf_` prefix because
 * they share the Projects Hub database with every other module.
 * Money columns are NUMERIC(12,2) and travel as exact decimal strings.
 */
const fs = require('fs');
const path = require('path');
const { toCents, toDecimalString } = require('./money');
const { seedRows } = require('./seed');
const { CATEGORIAS, isISO } = require('./engine');

let ready = null;

function ensure(sequelize) {
  if (!ready) {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'migrations', '019_salud_financiera.sql'), 'utf8');
    ready = sequelize.query(sql).catch(e => { ready = null; throw e; });
  }
  return ready;
}

const COLS = 'id, fecha::text AS fecha, concepto, tipo, monto::text AS monto, monto_real::text AS monto_real, categoria, origen, estado, nota, created_at, fuente, pendiente_banco, comercio, categoria_manual';

async function config(sequelize, user) {
  const [rows] = await sequelize.query('SELECT colchon_meta::text AS colchon_meta, presupuesto_semanal::text AS presupuesto_semanal, seeded_at FROM sf_config WHERE user_id = :u AND tenant_id = :t',
    { replacements: { u: user.userId, t: user.tenantId } });
  return rows[0] || null;
}

// Seeds the owner's plan base once. The marker in sf_config means deleting
// every row never silently brings the seed back.
async function seedIfNeeded(sequelize, user) {
  const c = await config(sequelize, user);
  if (c && c.seeded_at) return false;
  const t = await sequelize.transaction();
  try {
    await sequelize.query(`INSERT INTO sf_config (user_id, tenant_id, seeded_at) VALUES (:u, :t, NOW())
      ON CONFLICT (user_id) DO UPDATE SET seeded_at = COALESCE(sf_config.seeded_at, NOW())`, { replacements: { u: user.userId, t: user.tenantId }, transaction: t });
    const [[{ n }]] = await sequelize.query('SELECT COUNT(*)::int AS n FROM sf_movimientos WHERE user_id = :u AND tenant_id = :t',
      { replacements: { u: user.userId, t: user.tenantId }, transaction: t });
    if (n === 0) {
      for (const r of seedRows()) await insertRow(sequelize, user, r, t);
    }
    await t.commit();
    return n === 0;
  } catch (e) { await t.rollback(); throw e; }
}

async function list(sequelize, user, f = {}) {
  const where = ['user_id = :u', 'tenant_id = :t'];
  const rep = { u: user.userId, t: user.tenantId };
  if (f.desde && isISO(f.desde)) { where.push('fecha >= :desde'); rep.desde = f.desde; }
  if (f.hasta && isISO(f.hasta)) { where.push('fecha <= :hasta'); rep.hasta = f.hasta; }
  if (f.categoria && CATEGORIAS.includes(f.categoria)) { where.push('categoria = :cat'); rep.cat = f.categoria; }
  const [rows] = await sequelize.query(`SELECT ${COLS} FROM sf_movimientos WHERE ${where.join(' AND ')} ORDER BY fecha, CASE tipo WHEN 'ingreso' THEN 0 ELSE 1 END, id`, { replacements: rep });
  return rows;
}

async function get(sequelize, user, id) {
  const [rows] = await sequelize.query(`SELECT ${COLS} FROM sf_movimientos WHERE id = :id AND user_id = :u AND tenant_id = :t`,
    { replacements: { id, u: user.userId, t: user.tenantId } });
  return rows[0] || null;
}

// Validates a movement. Returns { value } or { error }.
function validate(b, { partial = false } = {}) {
  const v = {};
  if (!partial || b.fecha !== undefined) { if (!isISO(b.fecha)) return { error: 'fecha inválida (AAAA-MM-DD)' }; v.fecha = b.fecha; }
  if (!partial || b.concepto !== undefined) {
    const c = String(b.concepto || '').trim();
    if (!c || c.length > 200) return { error: 'concepto requerido (máximo 200 caracteres)' };
    v.concepto = c;
  }
  if (!partial || b.tipo !== undefined) { if (!['ingreso', 'egreso'].includes(b.tipo)) return { error: "tipo debe ser 'ingreso' o 'egreso'" }; v.tipo = b.tipo; }
  if (!partial || b.monto !== undefined) {
    const c = toCents(b.monto);
    if (c == null || c <= 0 || c >= 1e12) return { error: 'monto debe ser positivo, con hasta 2 decimales' };
    v.monto = toDecimalString(c);
  }
  if (!partial || b.categoria !== undefined) { if (!CATEGORIAS.includes(b.categoria)) return { error: 'categoría inválida' }; v.categoria = b.categoria; }
  if (b.nota !== undefined) v.nota = b.nota == null ? null : String(b.nota).slice(0, 1000);
  if (b.monto_real !== undefined) {
    if (b.monto_real === null || b.monto_real === '') v.monto_real = null;
    else { const c = toCents(b.monto_real); if (c == null || c < 0 || c >= 1e12) return { error: 'monto_real inválido' }; v.monto_real = toDecimalString(c); }
  }
  if (b.estado !== undefined) { if (!['pendiente', 'cumplido'].includes(b.estado)) return { error: "estado debe ser 'pendiente' o 'cumplido'" }; v.estado = b.estado; }
  return { value: v };
}

async function insertRow(sequelize, user, r, transaction) {
  const [rows] = await sequelize.query(`INSERT INTO sf_movimientos (tenant_id, user_id, fecha, concepto, tipo, monto, monto_real, categoria, origen, estado, nota)
    VALUES (:t, :u, :fecha, :concepto, :tipo, :monto, :monto_real, :categoria, :origen, :estado, :nota) RETURNING ${COLS}`,
    { replacements: { t: user.tenantId, u: user.userId, fecha: r.fecha, concepto: r.concepto, tipo: r.tipo, monto: r.monto,
      monto_real: r.monto_real || null, categoria: r.categoria, origen: r.origen, estado: r.origen === 'plan' ? (r.estado || 'pendiente') : null, nota: r.nota || null }, transaction });
  return rows[0];
}

async function update(sequelize, user, id, v) {
  const keys = Object.keys(v);
  if (!keys.length) return get(sequelize, user, id);
  let sets = keys.map(k => `${k} = :${k}`).join(', ');
  // a category CHANGED by hand is never overwritten by a bank re-sync (an unchanged one stays free)
  if (keys.includes('categoria')) sets += ', categoria_manual = (categoria_manual OR categoria IS DISTINCT FROM :categoria)';
  const [rows] = await sequelize.query(`UPDATE sf_movimientos SET ${sets}, updated_at = NOW() WHERE id = :id AND user_id = :u AND tenant_id = :t RETURNING ${COLS}`,
    { replacements: { ...v, id, u: user.userId, t: user.tenantId } });
  return rows[0] || null;
}

async function remove(sequelize, user, id) {
  const [rows] = await sequelize.query('DELETE FROM sf_movimientos WHERE id = :id AND user_id = :u AND tenant_id = :t RETURNING id',
    { replacements: { id, u: user.userId, t: user.tenantId } });
  return rows.length > 0;
}

// Lina's conversation state. A pending change expires after 15 minutes.
async function getState(sequelize, user) {
  const [rows] = await sequelize.query("SELECT pendiente, contexto, (pendiente_at > NOW() - INTERVAL '15 minutes') AS vigente FROM sf_config WHERE user_id = :u AND tenant_id = :t",
    { replacements: { u: user.userId, t: user.tenantId } });
  const r = rows[0] || {};
  return { pendiente: r.vigente ? r.pendiente : null, contexto: r.contexto || {} };
}
async function setState(sequelize, user, { pendiente, contexto }) {
  await sequelize.query(`INSERT INTO sf_config (user_id, tenant_id, pendiente, pendiente_at, contexto) VALUES (:u, :t, CAST(:p AS JSONB), CASE WHEN :p IS NULL THEN NULL ELSE NOW() END, CAST(:c AS JSONB))
    ON CONFLICT (user_id) DO UPDATE SET pendiente = EXCLUDED.pendiente, pendiente_at = EXCLUDED.pendiente_at, contexto = EXCLUDED.contexto`,
    { replacements: { u: user.userId, t: user.tenantId, p: pendiente ? JSON.stringify(pendiente) : null, c: JSON.stringify(contexto || {}) } });
}

async function recurrentes(sequelize, user, { soloActivos = true } = {}) {
  const [rows] = await sequelize.query(`SELECT id, concepto, tipo, monto::text AS monto, categoria, dia, fin_de_mes, activo FROM sf_recurrentes
    WHERE user_id = :u AND tenant_id = :t ${soloActivos ? 'AND activo' : ''} ORDER BY id`, { replacements: { u: user.userId, t: user.tenantId } });
  return rows;
}
async function insertRecurrente(sequelize, user, r) {
  const [rows] = await sequelize.query(`INSERT INTO sf_recurrentes (tenant_id, user_id, concepto, tipo, monto, categoria, dia, fin_de_mes)
    VALUES (:t, :u, :concepto, :tipo, :monto, :categoria, :dia, :fin) RETURNING id, concepto, tipo, monto::text AS monto, categoria, dia, fin_de_mes, activo`,
    { replacements: { t: user.tenantId, u: user.userId, concepto: r.concepto, tipo: r.tipo, monto: r.monto, categoria: r.categoria, dia: r.dia, fin: !!r.fin_de_mes } });
  return rows[0];
}
async function desactivarRecurrente(sequelize, user, id, desde) {
  const [rows] = await sequelize.query('UPDATE sf_recurrentes SET activo = FALSE WHERE id = :id AND user_id = :u AND tenant_id = :t RETURNING concepto',
    { replacements: { id, u: user.userId, t: user.tenantId } });
  if (!rows.length) return null;
  // its future, still-pending plan rows go with it; history stays
  const [del] = await sequelize.query(`DELETE FROM sf_movimientos WHERE user_id = :u AND tenant_id = :t AND origen = 'plan' AND estado = 'pendiente'
    AND lower(concepto) = lower(:c) AND fecha >= :desde RETURNING ${COLS}`, { replacements: { u: user.userId, t: user.tenantId, c: rows[0].concepto, desde } });
  return { concepto: rows[0].concepto, borrados: del.length, filas: del };
}

async function reactivarRecurrente(sequelize, user, id) {
  await sequelize.query('UPDATE sf_recurrentes SET activo = TRUE WHERE id = :id AND user_id = :u AND tenant_id = :t', { replacements: { id, u: user.userId, t: user.tenantId } });
}

// ---- Lina's brain: undo log + standing preferences ----
async function registrarCambio(sequelize, user, accion, descripcion, datos) {
  const [rows] = await sequelize.query(`INSERT INTO sf_cambios (tenant_id, user_id, accion, descripcion, datos) VALUES (:t, :u, :a, :d, CAST(:x AS JSONB)) RETURNING id`,
    { replacements: { t: user.tenantId, u: user.userId, a: accion, d: String(descripcion).slice(0, 500), x: JSON.stringify(datos || {}) } });
  return rows[0].id;
}
async function ultimoCambio(sequelize, user) {
  const [rows] = await sequelize.query('SELECT id, accion, descripcion, datos, created_at FROM sf_cambios WHERE user_id = :u AND tenant_id = :t AND NOT deshecho ORDER BY id DESC LIMIT 1',
    { replacements: { u: user.userId, t: user.tenantId } });
  return rows[0] || null;
}
async function marcarDeshecho(sequelize, user, id) {
  await sequelize.query('UPDATE sf_cambios SET deshecho = TRUE WHERE id = :id AND user_id = :u AND tenant_id = :t', { replacements: { id, u: user.userId, t: user.tenantId } });
}
async function preferencias(sequelize, user) {
  const [rows] = await sequelize.query('SELECT preferencias FROM sf_config WHERE user_id = :u AND tenant_id = :t', { replacements: { u: user.userId, t: user.tenantId } });
  return (rows[0] && Array.isArray(rows[0].preferencias)) ? rows[0].preferencias : [];
}
async function setPreferencias(sequelize, user, lista) {
  await sequelize.query('UPDATE sf_config SET preferencias = CAST(:p AS JSONB) WHERE user_id = :u AND tenant_id = :t',
    { replacements: { u: user.userId, t: user.tenantId, p: JSON.stringify(lista.slice(0, 30)) } });
}

async function logConversation(sequelize, user, pregunta, respuesta, canal, motor = null, detalle = null) {
  await sequelize.query(`INSERT INTO sf_conversaciones_lina (tenant_id, user_id, pregunta, respuesta, canal, motor, detalle) VALUES (:t, :u, :p, :r, :c, :m, CAST(:d AS JSONB))`,
    { replacements: { t: user.tenantId, u: user.userId, p: String(pregunta).slice(0, 4000), r: String(respuesta).slice(0, 8000), c: canal === 'voz' ? 'voz' : 'texto', m: motor, d: detalle ? JSON.stringify(detalle).slice(0, 20000) : null } });
}

async function conversations(sequelize, user, limit = 20) {
  const [rows] = await sequelize.query(`SELECT id, pregunta, respuesta, canal, created_at FROM sf_conversaciones_lina WHERE user_id = :u AND tenant_id = :t ORDER BY id DESC LIMIT :l`,
    { replacements: { u: user.userId, t: user.tenantId, l: Math.min(100, Math.max(1, limit)) } });
  return rows.reverse();
}

module.exports = { reactivarRecurrente, registrarCambio, ultimoCambio, marcarDeshecho, preferencias, setPreferencias, recurrentes, insertRecurrente, desactivarRecurrente, getState, setState, ensure, config, seedIfNeeded, list, get, validate, insertRow, update, remove, logConversation, conversations };
