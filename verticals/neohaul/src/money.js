'use strict';
/**
 * NeoHaul — every peso figure the platform shows is computed HERE, in whole
 * centavos, and nowhere else. No model ever produces an amount.
 *
 * Rules taken from NeoHaul's own documents (process map, 27-oct-2026):
 *  - importe del viaje = cantidad x tarifa (toneladas, días o viajes).
 *    218.46 t x $22 = $4,806.12 (Excel «PLANTA SANT»).
 *  - requisición FOR-FYC-01: IVA 16% y retención 4% por acarreo.
 *    $6,500 + IVA - 4% = $7,280.
 *  - diésel: una sola factura, repartida por camión según kilómetros.
 *  - comisión del chofer: 8% a 10% del total de sus viajes (la regla exacta
 *    por volumen diario está por confirmar; el porcentaje se elige a mano).
 */

const IVA = 0.16;
const RETENCION = 0.04;

const toCents = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
};
const fromCents = (c) => Math.round(c) / 100;

/** cantidad x precio, redondeado al centavo. null si algo no es un número >= 0. */
function importe(cantidad, precio) {
  const q = Number(cantidad), p = toCents(precio);
  if (!Number.isFinite(q) || q < 0 || p == null || p < 0) return null;
  return fromCents(Math.round(q * p));
}

/** Requisición: subtotal, IVA 16%, retención 4% (si aplica), total. */
function facturaTotals(subtotal, aplicaRetencion = true) {
  const s = toCents(subtotal);
  if (s == null || s < 0) return null;
  const iva = Math.round(s * IVA);
  const ret = aplicaRetencion ? Math.round(s * RETENCION) : 0;
  return { subtotal: fromCents(s), iva: fromCents(iva), retencion: fromCents(ret), total: fromCents(s + iva - ret) };
}

/**
 * Reparte un monto entre camiones en proporción a los km. Método del mayor
 * residuo: la suma de las partes es EXACTAMENTE el total, al centavo.
 * Devuelve null si no hay km positivos (no se inventa un reparto).
 */
function reparto(total, filas) {
  const t = toCents(total);
  const rows = (filas || []).map((r) => ({ truck_id: r.truck_id, km: Number(r.km) })).filter((r) => r.truck_id && Number.isFinite(r.km) && r.km > 0);
  const kmTotal = rows.reduce((a, r) => a + r.km, 0);
  if (t == null || t < 0 || !rows.length || kmTotal <= 0) return null;
  const parts = rows.map((r) => { const exact = (t * r.km) / kmTotal; return { ...r, c: Math.floor(exact), rem: exact - Math.floor(exact) }; });
  let left = t - parts.reduce((a, p) => a + p.c, 0);
  [...parts].sort((a, b) => b.rem - a.rem).forEach((p) => { if (left > 0) { p.c++; left--; } });
  return parts.map((p) => ({ truck_id: p.truck_id, km: p.km, monto: fromCents(p.c) }));
}

/** Comisión = pct% de la base. pct entre 0 y 15. */
function comision(base, pct) {
  const b = toCents(base), p = Number(pct);
  if (b == null || b < 0 || !Number.isFinite(p) || p < 0 || p > 15) return null;
  return fromCents(Math.round((b * p) / 100));
}

function sum(values) {
  return fromCents((values || []).reduce((a, v) => a + (toCents(v) || 0), 0));
}

/** Lunes (YYYY-MM-DD) de la semana de una fecha. Semana de lunes a domingo. */
function lunes(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1) return null;
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/** "$4,806.12" */
function pesos(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { IVA, RETENCION, toCents, fromCents, importe, facturaTotals, reparto, comision, sum, lunes, sumarDias, pesos };
