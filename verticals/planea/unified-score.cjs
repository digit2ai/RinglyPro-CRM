/**
 * PLANEA — Puntaje Unificado (HU-1)  ·  Opción A (aprobada 2026-07)
 *
 * UN SOLO número para el usuario, construido sobre los SIETE PILARES que ya usan
 * el documento de Arquitectura Multi-Agente y el producto en vivo (salud.cjs).
 * Las CUATRO dimensiones ponderadas del survey inicial (Fondo 35 / Flujo 25 /
 * Deuda 25 / Estabilidad 15) NO son un segundo puntaje: alimentan cada pilar como
 * PROXY mientras el usuario no haya dado el dato real de ese pilar, y se reemplazan
 * dimensión por dimensión a medida que llegan los datos reales.
 *
 * Reglas HU-1 que este módulo garantiza:
 *  - Survey solo → se muestra el Puntaje Planea puro (0-100), sin blend raro.
 *  - Con datos reales → un único score que combina real + proxy por dimensión.
 *  - Nunca dos números distintos.
 *  - Cada pilar viaja con una bandera {source:'real'|'proxy'} para trazabilidad
 *    (nivel de dato, no necesariamente visible) — usada también por HU-2 para
 *    priorizar qué le pregunta Maya al usuario primero.
 *
 * Mapa dimensión-del-survey → pilar-en-vivo (instrumento salud):
 *   Fondo de Emergencia 35% → S1 Ahorro
 *   Flujo de Caja       25% → S2 Ingresos+Gastos
 *   Salud de Deuda      25% → S3 Deuda
 *   Estabilidad         15% → S4 Solvencia/Patrimonio
 *   (el survey NO mide)     → S5 Retiro     · proxy = puntaje general del survey
 *   (el survey NO mide)     → S6 Seguros    · proxy = puntaje general del survey
 */
'use strict';

var salud = require('./salud.cjs');

// Pesos de los 7 pilares (idénticos a salud.cjs — la fuente de verdad en vivo).
var WEIGHTS = { S1: 20, S2: 15, S3: 20, S4: 10, S5: 20, S6: 15 };

// Etiqueta y pilar del portal para cada instrumento (para la traza).
var PILLAR = {
  S1: { key: 'savings', label: 'Ahorro (Fondo de Emergencia)', survey: 'emergency_fund' },
  S2: { key: 'cashflow', label: 'Flujo de caja', survey: 'cash_flow' },
  S3: { key: 'debt', label: 'Deuda', survey: 'debt_health' },
  S4: { key: 'stability', label: 'Estabilidad / Patrimonio', survey: 'stability' },
  S5: { key: 'retirement', label: 'Retiro', survey: null },
  S6: { key: 'insurance', label: 'Seguros', survey: null },
};

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function round(n) { return Math.round(n); }
function rangoDe(s) { return s <= 30 ? 'Punto de partida' : s <= 50 ? 'Construyendo' : s <= 70 ? 'En camino' : s <= 85 ? 'Sólido' : 'Planeado'; }
function lightOf(s) { return s == null ? 'gray' : s >= 70 ? 'green' : s >= 45 ? 'yellow' : 'red'; }

// Proxy 0..1 por instrumento, tomado del survey. Si el survey trae sus 4 sub-pilares
// úsalos; si solo trae el puntaje general, ese general sirve de proxy para todos.
function surveyProxies(surveyData) {
  var pil = (surveyData && surveyData.pillars) || null;
  var overall = (surveyData && surveyData.score != null) ? clamp01(surveyData.score / 100) : null;
  function px(v) { return v != null ? clamp01(v / 100) : overall; }
  if (pil) {
    return { S1: px(pil.emergency_fund), S2: px(pil.cash_flow), S3: px(pil.debt_health), S4: px(pil.stability), S5: overall, S6: overall };
  }
  return { S1: overall, S2: overall, S3: overall, S4: overall, S5: overall, S6: overall };
}

// ¿Qué pilares tienen DATO REAL? (a partir de los ítems de los módulos).
function realFlags(items) {
  var c = {};
  ['ingreso', 'gasto', 'ahorro', 'inversion', 'deuda', 'seguros', 'retiro'].forEach(function (k) {
    c[k] = items.filter(function (i) { return i.category === k; }).length;
  });
  var incomeKnown = c.ingreso > 0;
  return {
    S1: c.ahorro > 0 && incomeKnown,                                  // fondo de emergencia = ahorro / ingreso
    S2: c.ingreso > 0 && c.gasto > 0,                                 // margen = (ingreso − gasto) / ingreso
    S3: incomeKnown,                                                  // salud de deuda computable (0 deuda = sano real)
    S4: (c.ahorro + c.inversion + c.retiro + c.deuda) > 0,            // solvencia = patrimonio / activos
    S5: c.retiro > 0,                                                 // retiro
    S6: c.seguros > 0,                                                // seguros
  };
}

/**
 * computeUnified(items, meta, surveyData)
 *   items      = filas de planea_items (datos reales de los módulos)
 *   meta       = finance_meta (edad, tipo_ingreso, dependientes…)
 *   surveyData = profile.score_data (el puntaje del survey inicial + opc. pillars)
 *
 * Devuelve el objeto salud enriquecido: overall/rango/light unificados +
 * dimensions[] con la traza real/proxy por pilar, y score_source.
 */
function computeUnified(items, meta, surveyData) {
  items = items || [];
  var sal = salud.computeSalud(items, meta);           // instrumentos reales (o overall null si no hay ingreso)
  var realPillars = sal && sal.pillars ? sal.pillars : null;
  var proxies = surveyProxies(surveyData);
  var flags = realFlags(items);

  // Traza por pilar — siempre se construye, aun en modo survey puro.
  function traceFor(k, source, value01) {
    var meta = PILLAR[k];
    return { pillar: k, key: meta.key, label: meta.label, weight: WEIGHTS[k], source: source, score: value01 == null ? null : round(value01 * 100) };
  }

  // CASO 1 — sin datos reales suficientes (no hay ingreso): survey puro.
  // HU-1: "Si el usuario solo completó el survey → se muestra únicamente el
  // Puntaje Planea, sin blend". Así el número no cambia por re-ponderar.
  if (!realPillars) {
    var surveyScore = (surveyData && surveyData.score != null) ? surveyData.score : null;
    var dims0 = Object.keys(PILLAR).map(function (k) { return traceFor(k, 'proxy', proxies[k]); });
    return Object.assign({}, sal, {
      overall: surveyScore,
      rango: surveyScore != null ? rangoDe(surveyScore) : null,
      light: lightOf(surveyScore),
      dimensions: dims0,
      score_source: surveyScore != null ? 'survey' : 'none',
      proxy_pillars: dims0.map(function (d) { return d.key; }),   // todo es proxy
    });
  }

  // CASO 2 — hay datos reales: blend por dimensión (real donde exista, proxy si no).
  var num = 0, den = 0, dims = [], proxyKeys = [];
  Object.keys(PILLAR).forEach(function (k) {
    var real = flags[k] && realPillars[k] != null ? realPillars[k] : null;
    var v, source;
    if (real != null) { v = real; source = 'real'; }
    else if (proxies[k] != null) { v = proxies[k]; source = 'proxy'; }
    else { v = null; source = 'none'; }        // sin survey y sin dato real → se excluye y renormaliza
    dims.push(traceFor(k, source, v));
    if (source === 'proxy') proxyKeys.push(PILLAR[k].key);
    if (v != null) { num += WEIGHTS[k] * v; den += WEIGHTS[k]; }
  });

  var overall = den > 0 ? Math.max(1, Math.min(99, round(100 * num / den))) : null;   // tope 99 — nunca 100
  var allReal = dims.every(function (d) { return d.source === 'real'; });

  return Object.assign({}, sal, {
    overall: overall,
    rango: overall != null ? rangoDe(overall) : null,
    light: lightOf(overall),
    dimensions: dims,
    score_source: allReal ? 'real' : 'blended',
    proxy_pillars: proxyKeys,
  });
}

module.exports = { computeUnified: computeUnified, WEIGHTS: WEIGHTS, PILLAR: PILLAR };
