// =====================================================
// Puntuación — evalúa cada criterio (fórmula sobre las métricas), normaliza a
// 0..100, y calcula el puntaje_total como suma ponderada por peso_porcentaje.
//
// Las fórmulas se guardan como texto en ecpf_criterios_evaluacion.formula
// (p. ej. 'f(coef_variacion_intervalos)'). Aquí está el evaluador determinista
// que mapea cada fórmula a un puntaje. Criterios base de paso fino (sección 4.4):
//   ritmo/regularidad 35% · claridad 4 tiempos 25% · simetría 15% ·
//   brío/cadencia 15% · elevación 10%.
// =====================================================

'use strict';

const { DEFAULT_MODEL } = require('./thresholds');

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Criterios base sembrados (modalidad paso_fino). pesos en %.
const CRITERIOS_PASO_FINO = [
  { nombre: 'Ritmo y regularidad', modalidad: 'paso_fino', peso_porcentaje: 35.0, formula: 'f(coef_variacion_intervalos)' },
  { nombre: 'Claridad 4 tiempos', modalidad: 'paso_fino', peso_porcentaje: 25.0, formula: 'f(claridad_4_tiempos)' },
  { nombre: 'Simetría lateral', modalidad: 'paso_fino', peso_porcentaje: 15.0, formula: 'f(simetria_lateral)' },
  { nombre: 'Brío / cadencia', modalidad: 'paso_fino', peso_porcentaje: 15.0, formula: 'f(cadencia_ppm)' },
  { nombre: 'Elevación', modalidad: 'paso_fino', peso_porcentaje: 10.0, formula: 'f(elevacion_anterior, elevacion_posterior)' }
];

// Evalúa una fórmula -> { valor_medido, puntaje_normalizado (0..100) }.
function evalFormula(formula, mov, son, umbrales) {
  const U = Object.assign({}, DEFAULT_MODEL.umbrales, umbrales || {});
  const f = String(formula || '');

  if (f.includes('coef_variacion_intervalos')) {
    const cv = mov.coef_variacion_intervalos;
    if (cv == null) return { valor_medido: null, puntaje_normalizado: 0 };
    // CV bajo = mejor. 0 -> 100; cv_regular_max -> ~50; 2*max -> 0.
    const score = 100 * clamp(1 - cv / (2 * U.cv_regular_max), 0, 1);
    return { valor_medido: cv, puntaje_normalizado: Number(score.toFixed(1)) };
  }
  if (f.includes('claridad_4_tiempos')) {
    const c = son.claridad_4_tiempos != null ? son.claridad_4_tiempos : mov.uniformidad_4_tiempos;
    if (c == null) return { valor_medido: null, puntaje_normalizado: 0 };
    return { valor_medido: c, puntaje_normalizado: Number((100 * clamp(c, 0, 1)).toFixed(1)) };
  }
  if (f.includes('simetria_lateral')) {
    const s = mov.simetria_lateral;
    if (s == null) return { valor_medido: null, puntaje_normalizado: 0 };
    return { valor_medido: s, puntaje_normalizado: Number((100 * clamp(s, 0, 1)).toFixed(1)) };
  }
  if (f.includes('cadencia_ppm')) {
    const c = mov.cadencia_ppm;
    if (c == null) return { valor_medido: null, puntaje_normalizado: 0 };
    // Banda triangular: ideal = 100, cae a 0 en los extremos min/max.
    const { cadencia_paso_fino_min_ppm: lo, cadencia_paso_fino_ideal_ppm: id, cadencia_paso_fino_max_ppm: hi } = U;
    let score;
    if (c <= lo || c >= hi) score = 0;
    else if (c <= id) score = 100 * (c - lo) / (id - lo);
    else score = 100 * (hi - c) / (hi - id);
    return { valor_medido: c, puntaje_normalizado: Number(clamp(score, 0, 100).toFixed(1)) };
  }
  if (f.includes('elevacion')) {
    const ea = mov.elevacion_anterior, ep = mov.elevacion_posterior;
    if (ea == null && ep == null) return { valor_medido: null, puntaje_normalizado: 0 };
    const e = ((ea || 0) + (ep || 0)) / ((ea != null ? 1 : 0) + (ep != null ? 1 : 0) || 1);
    return { valor_medido: Number(e.toFixed(3)), puntaje_normalizado: Number((100 * clamp(e, 0, 1)).toFixed(1)) };
  }
  return { valor_medido: null, puntaje_normalizado: 0 };
}

// Devuelve { puntuaciones:[{criterio, valor_medido, puntaje_normalizado, peso}], puntaje_total }
function score(criterios, mov, son, umbrales) {
  const puntuaciones = [];
  let totalPeso = 0, acum = 0;
  for (const c of criterios) {
    const { valor_medido, puntaje_normalizado } = evalFormula(c.formula, mov, son, umbrales);
    puntuaciones.push({
      criterio_id: c.id != null ? c.id : null,
      nombre: c.nombre,
      peso_porcentaje: Number(c.peso_porcentaje),
      valor_medido,
      puntaje_normalizado
    });
    totalPeso += Number(c.peso_porcentaje);
    acum += puntaje_normalizado * Number(c.peso_porcentaje);
  }
  const puntaje_total = totalPeso > 0 ? Number((acum / totalPeso).toFixed(2)) : 0;
  return { puntuaciones, puntaje_total };
}

module.exports = { score, evalFormula, CRITERIOS_PASO_FINO };
