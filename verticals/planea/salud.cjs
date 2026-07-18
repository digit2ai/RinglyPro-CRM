/**
 * PLANEA — Salud Financiera engine (glass-cockpit spec).
 *
 * Score = 20·S1 + 15·S2 + 20·S3 + 10·S4 + 20·S5 + 15·S6  (range 1–100)
 *   S1 Fondo emergencia = min(ahorro / (6 × ingreso_mensual), 1)
 *   S2 Tasa de ahorro   = clamp(((ingreso − gasto)/ingreso) / 0.20, 0, 1)
 *   S3 Deuda            = max(1 − (deuda_total / ingreso_anual), 0)
 *   S4 Solvencia        = clamp(patrimonio_neto / activos_totales, 0, 1)
 *   S5 Retiro           = min(retiro / meta_edad, 1)   meta = ing_anual × factor(edad)
 *   S6 Seguros          = min(cobertura / (10 × ingreso_anual), 1)
 * Net worth = activos_totales − deuda_total.
 * Also emits per-bucket (7) scores + flight-instrument data for the cockpit.
 * Same formula runs client-side (planea-salud.js) for the live simulator.
 */
'use strict';

function num(x) { var v = +x; return isNaN(v) ? 0 : v; }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function round(x) { return Math.round(x); }
function rangoDe(s) { return s == null ? null : s <= 30 ? 'Punto de partida' : s <= 50 ? 'Construyendo' : s <= 70 ? 'En camino' : s <= 85 ? 'Sólido' : 'Planeado'; }
function lightOf(s) { return s == null ? 'gray' : s >= 70 ? 'green' : s >= 40 ? 'yellow' : 'red'; }

// Age-based retirement goal factor (× annual income), interpolated: 30→1, 40→3, 50→6, 60→8.
function retFactor(age) {
  var pts = [[30, 1], [40, 3], [50, 6], [60, 8]];
  if (age <= 30) return 1;
  if (age >= 60) return 8;
  for (var i = 0; i < pts.length - 1; i++) {
    if (age >= pts[i][0] && age <= pts[i + 1][0]) {
      var a0 = pts[i][0], f0 = pts[i][1], a1 = pts[i + 1][0], f1 = pts[i + 1][1];
      return f0 + (f1 - f0) * (age - a0) / (a1 - a0);
    }
  }
  return 3;
}

function totalsFromItems(items) {
  items = items || [];
  var sum = function (cat, field) { return items.filter(function (i) { return i.category === cat; }).reduce(function (a, i) { return a + num(i[field || 'value']); }, 0); };
  var cnt = function (cat) { return items.filter(function (i) { return i.category === cat; }).length; };
  return {
    I: sum('ingreso'), G: sum('gasto'), C: sum('deuda', 'monthly'),
    A: sum('ahorro'), V: sum('inversion'), R: sum('retiro'), D: sum('deuda'), S: sum('seguros'),
    n_ing: cnt('ingreso'),
  };
}

// Core score from raw totals (identical to the client simulator).
function scoreFromTotals(t, age) {
  var I = t.I, G = t.G, A = t.A, V = t.V, R = t.R, D = t.D, S = t.S;
  var annual = I * 12;
  var totalAssets = A + V + R;
  var netWorth = totalAssets - D;
  var goalRet = annual * retFactor(age || 35);

  var S1 = I > 0 ? clamp01(A / (6 * I)) : 0;
  var S2 = I > 0 ? clamp01(((I - G) / I) / 0.20) : 0;
  var S3 = annual > 0 ? Math.max(1 - D / annual, 0) : (D > 0 ? 0 : 1);
  var S4 = totalAssets > 0 ? clamp01(netWorth / totalAssets) : (D > 0 ? 0 : 1);
  var S5 = goalRet > 0 ? clamp01(R / goalRet) : 0;
  var S6 = annual > 0 ? clamp01(S / (10 * annual)) : 0;

  var raw = 20 * S1 + 15 * S2 + 20 * S3 + 10 * S4 + 20 * S5 + 15 * S6;
  var overall = I > 0 ? Math.max(1, Math.min(100, round(raw))) : null;
  return { overall: overall, S1: S1, S2: S2, S3: S3, S4: S4, S5: S5, S6: S6, annual: annual, totalAssets: totalAssets, netWorth: netWorth, goalRet: goalRet };
}

function computeSalud(items, meta) {
  var t = totalsFromItems(items);
  var age = (meta && +meta.age) || 35;
  var r = scoreFromTotals(t, age);
  var I = t.I, G = t.G, D = t.D, A = t.A, R = t.R;

  if (r.overall == null) {
    return {
      overall: null, rango: null, light: 'gray', age: age,
      net_worth: r.netWorth, total_assets: r.totalAssets, total_liabilities: D,
      pillars: null, instruments: null, buckets: null,
      inputs: { I: t.I, G: t.G, A: t.A, V: t.V, R: t.R, D: t.D, S: t.S, C: t.C, annual: r.annual, goalRet: r.goalRet, age: age },
    };
  }

  // Per-bucket (7) display scores — mapped to the pillars per the data model.
  var expScore = I > 0 ? round(clamp01((0.9 - G / I) / (0.9 - 0.5)) * 100) : 0;
  var buckets = [
    { key: 'income', label: 'Ingresos', pillar: 'S2', score: round(r.S2 * 100),
      formula: 'Capacidad de ahorro = (ingreso − gasto) ÷ ingreso, meta 20%.', target: '≥ 20% de superávit' },
    { key: 'expenses', label: 'Gastos', pillar: 'S2', score: expScore,
      formula: 'Control del gasto: gastar ≤ 50% del ingreso es saludable.', target: '≤ 50% del ingreso' },
    { key: 'savings', label: 'Ahorro', pillar: 'S1', score: round(r.S1 * 100),
      formula: 'Fondo de emergencia = ahorro ÷ (6 × ingreso mensual).', target: '6 meses de ingreso' },
    { key: 'debt', label: 'Deuda', pillar: 'S3', score: round(r.S3 * 100),
      formula: 'Salud de deuda = 1 − (deuda total ÷ ingreso anual).', target: 'Deuda ≤ ingreso anual' },
    { key: 'investments', label: 'Inversiones', pillar: 'S4', score: round(r.S4 * 100),
      formula: 'Solvencia = patrimonio neto ÷ activos totales.', target: 'Patrimonio positivo' },
    { key: 'insurance', label: 'Seguros', pillar: 'S6', score: round(r.S6 * 100),
      formula: 'Protección = cobertura ÷ (10 × ingreso anual).', target: '10× ingreso anual' },
    { key: 'retirement', label: 'Retiro', pillar: 'S5', score: round(r.S5 * 100),
      formula: 'Retiro = ahorro de retiro ÷ meta por edad (edad ' + age + ').', target: (retFactor(age)).toFixed(1) + '× ingreso anual' },
  ].map(function (b) { b.light = lightOf(b.score); return b; });

  var mesesGasto = G > 0 ? A / G : (A > 0 ? 99 : 0);
  var savingsRate = I > 0 ? (I - G) / I : 0;

  var instruments = {
    score: { value: r.overall },
    // fuel gauge E→F : F = S1 full (6× monthly income). Also months of expenses for the plate.
    emergency: { frac: clamp01(A / (6 * I)), meses: Math.round(mesesGasto * 10) / 10, target: 6 },
    // vertical speed indicator: climb (+) saving, descent (−) overspending
    savings: { rate: savingsRate, frac: clamp01(savingsRate / 0.20) },
    // engine temperature: debt / annual income, red as →1
    dti: { frac: r.annual > 0 ? Math.min(D / r.annual, 1.3) : 0, ratio: r.annual > 0 ? D / r.annual : 0 },
    // compass/arc: % toward age-based retirement target
    retirement: { frac: clamp01(r.S5), pct: Math.round(r.S5 * 100) },
  };

  return {
    overall: r.overall, rango: rangoDe(r.overall), light: lightOf(r.overall), age: age,
    net_worth: r.netWorth, total_assets: r.totalAssets, total_liabilities: D,
    pillars: {
      S1: r.S1, S2: r.S2, S3: r.S3, S4: r.S4, S5: r.S5, S6: r.S6,
      weights: { S1: 20, S2: 15, S3: 20, S4: 10, S5: 20, S6: 15 },
    },
    instruments: instruments,
    buckets: buckets,
    inputs: { I: t.I, G: t.G, A: t.A, V: t.V, R: t.R, D: t.D, S: t.S, C: t.C, n_ing: t.n_ing, annual: r.annual, goalRet: r.goalRet, age: age },
  };
}

module.exports = { computeSalud: computeSalud, scoreFromTotals: scoreFromTotals, totalsFromItems: totalsFromItems, retFactor: retFactor, rangoDe: rangoDe, lightOf: lightOf };
