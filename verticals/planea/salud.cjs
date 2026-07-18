/**
 * PLANEA — Salud Financiera engine.
 *
 * A dedicated financial-health score computed from the user's ACTUAL data
 * (planea_items). Distinct from the survey Puntaje Planea. Every bucket
 * (Ingresos, Gastos, Ahorro, Deuda, Inversión, Seguros, Retiro) gets its own
 * 0–100 score, a traffic light (red/yellow/green) and its key metrics; the
 * overall score is the weighted composite. Null when there is no income yet.
 */
'use strict';

function clamp(x) { return Math.max(0, Math.min(100, x)); }
function num(x) { var v = +x; return isNaN(v) ? 0 : v; }
function pct(x) { return (Math.round(x * 1000) / 10) + '%'; }
function cop(n) { return '$' + Math.round(+n || 0).toLocaleString('es-CO'); }
function mult(a, b) { return (b > 0 ? (a / b) : 0).toFixed(2) + '×'; }

function rangoDe(s) { return s <= 30 ? 'Punto de partida' : s <= 50 ? 'Construyendo' : s <= 70 ? 'En camino' : s <= 85 ? 'Sólido' : 'Planeado'; }
function lightOf(s) { return s == null ? 'gray' : s >= 70 ? 'green' : s >= 40 ? 'yellow' : 'red'; }

// Bucket weights in the overall composite (sum = 1.00).
var WEIGHTS = { ingreso: 0.15, gasto: 0.15, ahorro: 0.20, deuda: 0.20, inversion: 0.12, seguros: 0.08, retiro: 0.10 };
var LABELS = { ingreso: 'Ingresos', gasto: 'Gastos', ahorro: 'Ahorro', deuda: 'Deuda', inversion: 'Inversión', seguros: 'Seguros', retiro: 'Retiro' };
var TARGETS = {
  ingreso: 'Superávit ≥ 20% + fuentes diversas',
  gasto: 'Gastar ≤ 50% del ingreso',
  ahorro: '6 meses de fondo + 20% de ahorro',
  deuda: 'DTI < 36% y deuda baja',
  inversion: 'Invertir ≥ 2× tu ingreso anual',
  seguros: 'Cobertura ≥ 5× tu ingreso anual',
  retiro: 'Acumular ≥ 3× tu ingreso anual',
};

function emptyBuckets() {
  return Object.keys(WEIGHTS).map(function (k) {
    return { key: k, label: LABELS[k], weight: WEIGHTS[k], score: null, light: 'gray', target: TARGETS[k], metrics: [] };
  });
}

function computeSalud(items) {
  items = items || [];
  var sum = function (cat, field) { return items.filter(function (i) { return i.category === cat; }).reduce(function (a, i) { return a + num(i[field || 'value']); }, 0); };
  var cnt = function (cat) { return items.filter(function (i) { return i.category === cat; }).length; };

  var I = sum('ingreso'), G = sum('gasto'), C = sum('deuda', 'monthly');
  var A = sum('ahorro'), V = sum('inversion'), R = sum('retiro'), D = sum('deuda'), S = sum('seguros');
  var annual = I * 12;
  var inputs = { I: I, G: G, C: C, A: A, V: V, R: R, D: D, S: S, annual: annual };

  if (I <= 0) {
    return { overall: null, rango: null, light: 'gray', buckets: emptyBuckets(), inputs: inputs };
  }

  var surplus = (I - G - C) / I;              // margen libre / ingreso
  var meses = G > 0 ? A / G : (A > 0 ? 99 : 0); // meses de fondo de emergencia
  var dti = C / I;                            // deuda/ingreso (cuotas)
  var gastoRatio = G / I;

  var b = {};

  // Ingresos — superávit + diversificación
  var i_sup = clamp(surplus / 0.20 * 100);
  var i_div = clamp(cnt('ingreso') / 3 * 100);
  b.ingreso = { score: Math.round(0.7 * i_sup + 0.3 * i_div), metrics: [
    { label: 'Superávit mensual', value: pct(surplus), good: surplus >= 0.20 },
    { label: 'Fuentes de ingreso', value: String(cnt('ingreso')), good: cnt('ingreso') >= 2 },
    { label: 'Ingreso mensual', value: cop(I) },
  ] };

  // Gastos — control del gasto (≤50% ideal, ≥90% crítico)
  b.gasto = { score: Math.round(clamp((0.9 - gastoRatio) / (0.9 - 0.5) * 100)), metrics: [
    { label: 'Gasto sobre ingreso', value: pct(gastoRatio), good: gastoRatio <= 0.5 },
    { label: 'Gasto mensual', value: cop(G) },
    { label: 'Meta', value: '≤ 50%' },
  ] };

  // Ahorro — fondo de emergencia + tasa de ahorro
  var a_f = clamp(meses / 6 * 100);
  var a_r = clamp(surplus / 0.20 * 100);
  b.ahorro = { score: Math.round(0.6 * a_f + 0.4 * a_r), metrics: [
    { label: 'Fondo de emergencia', value: meses.toFixed(1) + ' meses', good: meses >= 6 },
    { label: 'Tasa de ahorro', value: pct(surplus), good: surplus >= 0.20 },
    { label: 'Ahorro total', value: cop(A) },
  ] };

  // Deuda — DTI + carga sobre ingreso anual
  var ds;
  if (D === 0 && C === 0) ds = 100;
  else { var d_dti = clamp((1 - dti / 0.36) * 100), d_bur = clamp((1 - D / annual) * 100); ds = Math.round(0.6 * d_dti + 0.4 * d_bur); }
  b.deuda = { score: ds, metrics: [
    { label: 'DTI (cuotas/ingreso)', value: pct(dti), good: dti < 0.36 },
    { label: 'Deuda vs ingreso anual', value: mult(D, annual), good: D <= annual },
    { label: 'Saldo de deuda', value: cop(D) },
  ] };

  // Inversión — crecimiento del patrimonio (2× ingreso anual = 100)
  b.inversion = { score: Math.round(clamp((V / annual) / 2 * 100)), metrics: [
    { label: 'Inversión acumulada', value: cop(V) },
    { label: 'vs ingreso anual', value: mult(V, annual), good: V >= annual },
    { label: 'Meta', value: '2× ingreso anual' },
  ] };

  // Seguros — protección (5× ingreso anual = 100)
  b.seguros = { score: Math.round(clamp((S / annual) / 5 * 100)), metrics: [
    { label: 'Cobertura total', value: cop(S) },
    { label: 'vs ingreso anual', value: mult(S, annual), good: S >= annual * 5 },
    { label: 'Meta', value: '5× ingreso anual' },
  ] };

  // Retiro — preparación (3× ingreso anual = 100)
  b.retiro = { score: Math.round(clamp((R / annual) / 3 * 100)), metrics: [
    { label: 'Ahorro para retiro', value: cop(R) },
    { label: 'vs ingreso anual', value: mult(R, annual), good: R >= annual },
    { label: 'Meta', value: '3× ingreso anual' },
  ] };

  var overall = Math.round(Object.keys(WEIGHTS).reduce(function (a, k) { return a + b[k].score * WEIGHTS[k]; }, 0));

  var buckets = Object.keys(WEIGHTS).map(function (k) {
    return { key: k, label: LABELS[k], weight: WEIGHTS[k], score: b[k].score, light: lightOf(b[k].score), target: TARGETS[k], metrics: b[k].metrics };
  });

  return { overall: overall, rango: rangoDe(overall), light: lightOf(overall), buckets: buckets, inputs: inputs };
}

module.exports = { computeSalud: computeSalud, rangoDe: rangoDe, lightOf: lightOf };
