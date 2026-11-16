'use strict';
/**
 * Modelos de la salud de la operación de NeoHaul. PURO: sin base de datos, sin red, sin modelo.
 * Todo en centavos (enteros). Mismo método que Forzza Capital, adaptado a una transportista:
 *  - calificacion(): 0-100 con reglas FIJAS y visibles. Una parte sin dato no se califica y su peso
 *    se reparte entre las demás (y se dice).
 *  - monteCarlo(): remuestrea SEMANAS REALES (ingreso de viajes y costos de la misma semana viajan juntos)
 *    para estimar la utilidad acumulada de las próximas semanas. Es una estimación, no un dato.
 *  - concentracion(): Gini, HHI y peso del mayor, con la curva de Lorenz.
 */
const toC = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const iso = (d) => d.toISOString().slice(0, 10);
const parse = (f) => new Date(String(f).slice(0, 10) + 'T00:00:00Z');
function addDays(f, n) { const d = parse(f); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
function lunes(f) { const d = parse(f); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); }

/**
 * Semanas completas (lunes a domingo) desde la primera con movimiento hasta la última TERMINADA antes de hoy.
 * filas: [{fecha, monto}] en pesos. Devuelve [{semana, ingresos, costos, neto}] en centavos.
 */
function semanas(ingresos, costos, hoy, maxSemanas = 26) {
  const fin = addDays(lunes(hoy), -7); // lunes de la última semana terminada
  const fechas = ingresos.concat(costos).map((x) => String(x.fecha).slice(0, 10)).filter((f) => f <= addDays(fin, 6));
  if (!fechas.length) return [];
  let ini = lunes(fechas.reduce((a, b) => (a < b ? a : b)));
  const tope = addDays(fin, -7 * (maxSemanas - 1)); if (ini < tope) ini = tope;
  const out = []; const idx = {};
  for (let s = ini; s <= fin; s = addDays(s, 7)) { idx[s] = out.length; out.push({ semana: s, ingresos: 0, costos: 0, neto: 0 }); }
  for (const x of ingresos) { const k = idx[lunes(x.fecha)]; if (k != null) out[k].ingresos += toC(x.monto); }
  for (const x of costos) { const k = idx[lunes(x.fecha)]; if (k != null) out[k].costos += toC(x.monto); }
  out.forEach((w) => { w.neto = w.ingresos - w.costos; });
  return out;
}

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pct = (arr, q) => { if (!arr.length) return 0; const i = (arr.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(arr[lo] + (arr[hi] - arr[lo]) * (i - lo)); };

/**
 * Monte Carlo de la utilidad operativa acumulada. Cada semana futura es una semana real del pasado
 * elegida al azar (ingresos y costos de esa misma semana, juntos). Con menos de MIN_SEMANAS no corre.
 */
const MIN_SEMANAS = 4;
function monteCarlo(hist, o = {}) {
  // Sin viajes no hay operación que medir: solo costos daría "100% en pérdida", que es un artefacto, no un riesgo.
  // Se remuestrea desde la primera semana con ingresos, y hacen falta MIN_SEMANAS semanas con ingresos.
  const h = hist || [], i0 = h.findIndex((w) => w.ingresos > 0);
  const ws = i0 < 0 ? [] : h.slice(i0);
  if (ws.filter((w) => w.ingresos > 0).length < MIN_SEMANAS) return null;
  const H = Math.max(4, Math.min(26, Math.round(Number(o.horizonte) || 13)));
  const N = Math.max(200, Math.min(5000, Math.round(Number(o.caminos) || 2000)));
  const r = rng(o.semilla || 20261116);
  const porSem = Array.from({ length: H }, () => new Float64Array(N));
  const finales = new Float64Array(N);
  const neg = { 4: 0, 8: 0, 13: 0 }; let semPerdida = 0;
  for (let n = 0; n < N; n++) {
    let acum = 0;
    for (let k = 0; k < H; k++) {
      const w = ws[Math.floor(r() * ws.length)];
      acum += w.neto; if (w.neto < 0) semPerdida++;
      porSem[k][n] = acum;
      if (k + 1 in neg && acum < 0) neg[k + 1]++;
    }
    finales[n] = acum;
  }
  const bandas = porSem.map((col, k) => { const a = Array.from(col).sort((x, y) => x - y); return { semana: k + 1, p5: pct(a, 0.05), p25: pct(a, 0.25), p50: pct(a, 0.5), p75: pct(a, 0.75), p95: pct(a, 0.95) }; });
  const fins = Array.from(finales).sort((x, y) => x - y);
  return {
    caminos: N, horizonte: H, semanas_historia: ws.length, desde: ws[0].semana, hasta: ws[ws.length - 1].semana, bandas,
    prob_perdida_en: { 4: neg[4] / N, 8: H >= 8 ? neg[8] / N : null, 13: H >= 13 ? neg[13] / N : null },
    prob_semana_en_perdida: semPerdida / (N * H),
    final: { p5: pct(fins, 0.05), p50: pct(fins, 0.5), p95: pct(fins, 0.95) }
  };
}

/** Concentración: Gini, HHI (0-10,000), peso del mayor y de los 5 mayores, curva de Lorenz (≤ 21 puntos). */
function concentracion(montos) {
  const xs = (montos || []).map((m) => ({ nombre: m.nombre, monto: Math.round(Number(m.monto) || 0) })).filter((m) => m.monto > 0).sort((a, b) => a.monto - b.monto);
  const n = xs.length, total = xs.reduce((a, m) => a + m.monto, 0);
  if (!n || !total) return null;
  let acum = 0, area = 0; const curva = [[0, 0]];
  xs.forEach((m, i) => { const prev = acum; acum += m.monto; area += (prev + acum) / 2 / total / n; curva.push([(i + 1) / n, acum / total]); });
  const paso = Math.max(1, Math.ceil(n / 20)); const lorenz = curva.filter((_, i) => i % paso === 0 || i === curva.length - 1);
  const desc = xs.slice().reverse();
  return {
    n, total, gini: n < 2 ? null : Math.max(0, Math.min(1, 1 - 2 * area)),
    hhi: Math.round(desc.reduce((a, m) => a + Math.pow((m.monto / total) * 100, 2), 0)),
    mayor: desc[0].monto / total, top5: desc.slice(0, 5).reduce((a, m) => a + m.monto, 0) / total,
    mayores: desc.slice(0, 8).map((m) => ({ nombre: m.nombre, monto: m.monto, parte: m.monto / total })), lorenz
  };
}

/** Antigüedad de las facturas emitidas sin cobrar, contra el plazo de crédito (días). */
function antiguedad(facturas, hoy, plazo) {
  const T = { por_vencer: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_mas: 0 }; const N = { por_vencer: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_mas: 0 };
  let total = 0, vencido = 0;
  for (const f of facturas || []) {
    const c = toC(f.total); total += c;
    const venc = addDays(String(f.fecha_emision || f.fecha_requisicion).slice(0, 10), plazo), dias = diffDays(venc, hoy);
    const k = dias <= 0 ? 'por_vencer' : dias <= 30 ? 'd1_30' : dias <= 60 ? 'd31_60' : dias <= 90 ? 'd61_90' : 'd90_mas';
    T[k] += c; N[k]++; if (dias > 0) vencido += c;
  }
  const o = { total, vencido, n: (facturas || []).length, plazo };
  for (const k of Object.keys(T)) o[k] = { monto: T[k], n: N[k] };
  return o;
}

const lin = (v, malo, bueno) => (bueno > malo ? Math.max(0, Math.min(1, (v - malo) / (bueno - malo))) : Math.max(0, Math.min(1, (malo - v) / (malo - bueno))));
/**
 * Calificación de la operación 0-100. Reglas fijas; cada parte dice cómo se calculó.
 * d: { margen, prob_perdida_8, vencido_pct, semanas_sin_cobrar, mayor_obra, confirmados_pct }
 */
function calificacion(d) {
  const partes = [
    { clave: 'margen', nombre: 'Margen de la operación (8 semanas)', peso: 25, valor: d.margen, regla: 'pierde 10% = 0 puntos, gana 25% o más = completo', f: (v) => lin(v, -0.10, 0.25) },
    { clave: 'riesgo', nombre: 'Probabilidad de ir en pérdida (8 semanas)', peso: 20, valor: d.prob_perdida_8, regla: '50% o más = 0 puntos, 0% = completo', f: (v) => lin(v, 0.5, 0) },
    { clave: 'cartera', nombre: 'Facturas vencidas', peso: 20, valor: d.vencido_pct, regla: '50% vencido o más = 0, nada vencido = completo', f: (v) => lin(v, 0.5, 0) },
    { clave: 'ciclo', nombre: 'Trabajo hecho sin facturar', peso: 15, valor: d.semanas_sin_cobrar, regla: '4 semanas de ingreso o más detenidas = 0, 1 semana o menos = completo', f: (v) => lin(v, 4, 1) },
    { clave: 'concentracion', nombre: 'Dependencia de una sola obra', peso: 10, valor: d.mayor_obra, regla: 'la obra mayor pesa 90% o más = 0, 40% o menos = completo', f: (v) => lin(v, 0.9, 0.4) },
    { clave: 'captura', nombre: 'Viajes confirmados con ticket', peso: 10, valor: d.confirmados_pct, regla: '50% o menos = 0, 100% = completo', f: (v) => lin(v, 0.5, 1) }
  ];
  const con = partes.filter((p) => p.valor != null && Number.isFinite(p.valor));
  const pesoTotal = con.reduce((a, p) => a + p.peso, 0);
  for (const p of partes) { const ok = con.includes(p); p.puntos = ok ? Math.round(p.f(p.valor) * p.peso * 10) / 10 : null; p.calificada = ok; delete p.f; }
  if (!pesoTotal) return { puntos: null, nivel: 'sin_datos', partes };
  const puntos = Math.round(con.reduce((a, p) => a + p.puntos, 0) / pesoTotal * 100);
  return { puntos, nivel: puntos >= 75 ? 'sana' : puntos >= 50 ? 'atencion' : 'riesgo', partes, peso_calificado: pesoTotal };
}

module.exports = { semanas, monteCarlo, concentracion, antiguedad, calificacion, rng, lunes, addDays, diffDays, toC, MIN_SEMANAS };
