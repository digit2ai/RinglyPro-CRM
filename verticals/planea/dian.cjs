/* PLANEA — calendario tributario DIAN: la ÚNICA fuente de fechas de renta.
 *
 * Revisión de Planea (20-sep-2026): la tabla del año la entrega Planea con el decreto
 * correcto, se carga en el módulo administrativo en un formato estándar y ninguna fecha se
 * muestra a un usuario hasta que está CARGADA Y VALIDADA. Cada año se carga la nueva.
 *
 * Reglas que viven en código:
 * - Formato estándar: JSON { year, tax_year, decree, ranges:[{from,to,date}] } o CSV
 *   "desde,hasta,fecha" (01..00, fecha AAAA-MM-DD). `00` es el último grupo (100).
 * - Una carga se revisa ENTERA antes de guardarse: los rangos cubren 01..00 sin huecos ni
 *   cruces, van en orden, cada fecha existe, cae en el año del calendario y en día hábil
 *   (lunes a viernes). Con un solo error no se guarda nada y se dice cuál.
 * - Se guarda como BORRADOR. La valida OTRO administrador (quien la cargó no puede validar
 *   la suya): así "validada" significa que dos personas la miraron.
 * - Validar una tabla retira la validada anterior del mismo año. Nada se borra.
 * - Sin tabla validada del año en curso: la app, el aviso de Inicio, el Calendario Planea y
 *   los correos NO muestran fecha alguna. No hay ventana estimada.
 * - La tabla validada entra al conocimiento de Maya como un bloque aparte.
 */
'use strict';

const tenantOf = () => Number(process.env.PLANEA_TENANT_ID) || 1;
const CACHE_MS = 60 * 1000;
const cache = new Map(); // `${tenant}:${year}` -> { at, table }

async function ensure(sq) {
  await sq.query(`CREATE TABLE IF NOT EXISTS planea_dian_calendars (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    year INTEGER NOT NULL,
    tax_year INTEGER,
    decree TEXT NOT NULL,
    ranges JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    loaded_by TEXT NOT NULL,
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validated_by TEXT,
    validated_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    retired_by TEXT
  )`);
  await sq.query('CREATE INDEX IF NOT EXISTS idx_planea_dian_tenant_year ON planea_dian_calendars (tenant_id, year, status)');
  await sq.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_dian_one_valid ON planea_dian_calendars (tenant_id, year) WHERE status = 'validated'");
}

function isoOk(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function digitsN(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = parseInt(s, 10);
  if (s === '00' || n === 0 || n === 100) return 100;
  return n >= 1 && n <= 99 ? n : null;
}
// "12/08/2026" o "2026-08-12" -> "2026-08-12"
function dateOf(v) {
  const s = String(v == null ? '' : v).trim();
  if (isoOk(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) { const iso = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); return isoOk(iso) ? iso : null; }
  return null;
}

// Texto (JSON o CSV) -> { table, errors[] }. `meta` trae year/tax_year/decree del formulario.
function parse(text, meta) {
  const errors = [];
  const src = String(text || '').replace(/^﻿/, '').trim();
  meta = meta || {};
  let year = Number(meta.year) || null, taxYear = Number(meta.tax_year) || null, decree = String(meta.decree || '').trim();
  let rows = [];
  if (!src) return { table: null, errors: ['El archivo está vacío.'] };
  if (src[0] === '{') {
    let j; try { j = JSON.parse(src); } catch (e) { return { table: null, errors: ['El JSON no se pudo leer: ' + e.message] }; }
    year = Number(j.year) || year; taxYear = Number(j.tax_year) || taxYear;
    decree = String(j.decree || decree || '').trim();
    rows = Array.isArray(j.ranges) ? j.ranges.map((r, i) => ({ line: i + 1, from: r && r.from, to: r && r.to, date: r && r.date })) : [];
    if (!rows.length) errors.push('El JSON no trae "ranges".');
  } else {
    src.split(/\r?\n/).forEach((l, i) => {
      const t = l.trim(); if (!t) return;
      const c = t.split(/[;,\t]/).map((x) => x.trim().replace(/^"|"$/g, ''));
      if (i === 0 && /desde|from/i.test(c[0])) return; // encabezado
      rows.push({ line: i + 1, from: c[0], to: c[1], date: c[2] });
    });
    if (!rows.length) errors.push('El CSV no trae filas. Formato: desde,hasta,fecha (por ejemplo 01,02,2026-08-12).');
  }
  if (!Number.isInteger(year) || year < 2024 || year > 2100) errors.push('Falta el año del calendario (por ejemplo 2026).');
  if (taxYear != null && (!Number.isInteger(taxYear) || taxYear !== year - 1)) errors.push('El año gravable debe ser el anterior al del calendario (' + (year ? year - 1 : 'año - 1') + ').');
  if (decree.length < 8) errors.push('Escribe el decreto que fija estos plazos (por ejemplo "Decreto 2229 de 2023").');
  const ranges = [];
  rows.forEach((r) => {
    const from = digitsN(r.from), to = digitsN(r.to), date = dateOf(r.date);
    if (from == null || to == null) { errors.push('Fila ' + r.line + ': los dígitos deben ir de 01 a 00.'); return; }
    if (from > to) { errors.push('Fila ' + r.line + ': "desde" es mayor que "hasta".'); return; }
    if (!date) { errors.push('Fila ' + r.line + ': la fecha no es válida (usa AAAA-MM-DD).'); return; }
    if (year && +date.slice(0, 4) !== year) errors.push('Fila ' + r.line + ': la fecha ' + date + ' no cae en ' + year + '.');
    const wd = new Date(date + 'T12:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6) errors.push('Fila ' + r.line + ': el ' + date + ' es fin de semana; la DIAN fija días hábiles.');
    ranges.push({ from, to, date });
  });
  ranges.sort((a, b) => a.from - b.from);
  let next = 1;
  ranges.forEach((r, i) => {
    if (r.from > next) errors.push('Falta el grupo ' + pad(next) + (r.from - 1 > next ? ' a ' + pad(r.from - 1) : '') + '.');
    if (r.from < next) errors.push('El grupo ' + pad(r.from) + ' aparece dos veces.');
    if (i && r.date < ranges[i - 1].date) errors.push('El grupo ' + pad(r.from) + ' vence antes que el grupo anterior.');
    next = Math.max(next, r.to + 1);
  });
  if (ranges.length && next <= 100) errors.push('Falta el grupo ' + pad(next) + ' a 00.');
  if (errors.length) return { table: null, errors: Array.from(new Set(errors)).slice(0, 30) };
  return { table: { year, tax_year: taxYear || year - 1, decree: decree.slice(0, 300), ranges }, errors: [] };
}
function pad(n) { return n === 100 ? '00' : String(n).padStart(2, '0'); }

async function list(sq, tenant) {
  const [rows] = await sq.query(`SELECT id, year, tax_year, decree, jsonb_array_length(ranges) AS ranges, ranges->0->>'date' AS first_date,
      ranges->-1->>'date' AS last_date, status, loaded_by, loaded_at, validated_by, validated_at, retired_at, retired_by
      FROM planea_dian_calendars WHERE tenant_id = :t ORDER BY year DESC, id DESC`, { replacements: { t: tenant } });
  return rows;
}
async function get(sq, tenant, id) {
  const [rows] = await sq.query('SELECT * FROM planea_dian_calendars WHERE tenant_id = :t AND id = :id', { replacements: { t: tenant, id: Number(id) || 0 } });
  return rows[0] || null;
}

async function load(sq, { tenant, text, meta, by }) {
  const r = parse(text, meta);
  if (!r.table) return { status: 422, errors: r.errors };
  const [[row]] = await sq.query(`INSERT INTO planea_dian_calendars (tenant_id, year, tax_year, decree, ranges, status, loaded_by)
      VALUES (:t, :y, :ty, :d, CAST(:r AS JSONB), 'draft', :by) RETURNING id, year, tax_year, decree, status, loaded_by, loaded_at`,
    { replacements: { t: tenant, y: r.table.year, ty: r.table.tax_year, d: r.table.decree, r: JSON.stringify(r.table.ranges), by } });
  return { status: 200, calendar: row, ranges: r.table.ranges.length };
}

async function validate(sq, { tenant, id, by }) {
  const t = await sq.transaction();
  try {
    const [[c]] = await sq.query('SELECT * FROM planea_dian_calendars WHERE tenant_id = :t AND id = :id FOR UPDATE', { replacements: { t: tenant, id: Number(id) || 0 }, transaction: t });
    if (!c) { await t.rollback(); return { status: 404, error: 'not_found' }; }
    if (c.status !== 'draft') { await t.rollback(); return { status: 409, error: 'no_es_borrador', message: 'Solo se valida una tabla en borrador.' }; }
    if (String(c.loaded_by).toLowerCase() === String(by).toLowerCase()) { await t.rollback(); return { status: 409, error: 'mismo_admin', message: 'La valida otro administrador, no quien la cargó.' }; }
    // Revisión otra vez, por si la tabla se tocó en la base de datos.
    const again = parse(JSON.stringify({ year: c.year, tax_year: c.tax_year, decree: c.decree, ranges: c.ranges }));
    if (!again.table) { await t.rollback(); return { status: 422, error: 'tabla_invalida', errors: again.errors }; }
    await sq.query(`UPDATE planea_dian_calendars SET status = 'retired', retired_at = NOW(), retired_by = :by
        WHERE tenant_id = :t AND year = :y AND status = 'validated'`, { replacements: { t: tenant, y: c.year, by }, transaction: t });
    await sq.query(`UPDATE planea_dian_calendars SET status = 'validated', validated_by = :by, validated_at = NOW() WHERE id = :id`,
      { replacements: { id: c.id, by }, transaction: t });
    await t.commit();
    cache.clear();
    return { status: 200, id: c.id, year: c.year };
  } catch (e) { try { await t.rollback(); } catch (_) {} throw e; }
}

async function discard(sq, { tenant, id, by }) {
  const [rows] = await sq.query(`UPDATE planea_dian_calendars SET status = 'retired', retired_at = NOW(), retired_by = :by
      WHERE tenant_id = :t AND id = :id AND status IN ('draft','validated') RETURNING id, year, status`,
    { replacements: { t: tenant, id: Number(id) || 0, by } });
  cache.clear();
  return rows[0] || null;
}

// La tabla validada de ese año, en la forma que usa PlaneaTax. null si no hay.
async function current(sq, { tenant, year } = {}) {
  const tn = tenant || tenantOf();
  const key = tn + ':' + year;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.table;
  let table = null;
  try {
    const [rows] = await sq.query(`SELECT id, year, tax_year, decree, ranges, validated_by, validated_at FROM planea_dian_calendars
        WHERE tenant_id = :t AND year = :y AND status = 'validated' LIMIT 1`, { replacements: { t: tn, y: year } });
    if (rows[0]) {
      const r = rows[0];
      table = { id: r.id, year: r.year, tax_year: r.tax_year, decree: r.decree, source: r.decree, validated_at: r.validated_at, ranges: r.ranges };
    }
  } catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  cache.set(key, { at: Date.now(), table });
  return table;
}

// Bloque de conocimiento para Maya con la tabla validada.
function knowledgeBlock(table) {
  if (!table) return '';
  const rows = table.ranges.map((r) => pad(r.from) + (r.to !== r.from ? ' a ' + pad(r.to) : '') + ': ' + r.date).join('\n');
  return '\n\nCALENDARIO TRIBUTARIO DIAN ' + table.year + ' (validado por Planea, ' + table.decree + ')\n' +
    'Declaración de renta de personas naturales, año gravable ' + table.tax_year + '. Fecha límite según los dos últimos dígitos de la cédula (00 es el último grupo).\n' +
    'Usa SOLO estas fechas. No afirmes que la persona está obligada a declarar.\n' + rows;
}

module.exports = { ensure, parse, list, get, load, validate, discard, current, knowledgeBlock, _cache: cache };
