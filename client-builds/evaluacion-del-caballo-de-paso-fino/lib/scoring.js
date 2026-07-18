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

const { DEFAULT_MODEL, cadenciaBand } = require('./thresholds');

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Criterios base sembrados (modalidad paso_fino). pesos en %. LEGADO: rubro
// derivado de marcha (audio/pose de cascos) que precedió al rubro oficial. Se
// conserva para continuidad de datos y para los tests unitarios; el motor puntúa
// con RUBRICAS (rubro oficial FEDEQUINAS) vía rubricFor().
const CRITERIOS_PASO_FINO = [
  { nombre: 'Ritmo y regularidad', modalidad: 'paso_fino', peso_porcentaje: 35.0, formula: 'f(coef_variacion_intervalos)' },
  { nombre: 'Claridad 4 tiempos', modalidad: 'paso_fino', peso_porcentaje: 25.0, formula: 'f(claridad_4_tiempos)' },
  { nombre: 'Simetría lateral', modalidad: 'paso_fino', peso_porcentaje: 15.0, formula: 'f(simetria_lateral)' },
  { nombre: 'Brío / cadencia', modalidad: 'paso_fino', peso_porcentaje: 15.0, formula: 'f(cadencia_ppm)' },
  { nombre: 'Elevación', modalidad: 'paso_fino', peso_porcentaje: 10.0, formula: 'f(elevacion_anterior, elevacion_posterior)' }
];

// =====================================================
// RUBRICAS — rubro OFICIAL FEDEQUINAS por tipo de ejemplar (REGLAMENTO_FEDEQUINAS.md
// §2, Cap. XI Art. 3). Cada criterio = una línea de la tabla oficial, con su
// `bloque` (Movimientos / Adiestramiento / Fenotipo / Grupo / Comportamiento) y
// su `origen` de medición:
//   marcha  — lo mide ESTE motor (audio + pose de cascos/tronco/cabeza)
//   gs      — Fenotipo/Aplomos/Alzada/Color: dominio de `equimind-gs-engine` (3D)
//   manual  — requiere señal aún no capturada (rienda) o multi-caballo (grupo)
// Los criterios `gs`/`manual` salen `medible:false` y score() los EXCLUYE y
// RENORMALIZA por cobertura (nunca castiga con 0). Publicar el rubro completo es
// honesto: la UI muestra qué fracción se midió. Versión del rubro: RUBRICAS_VERSION.
// =====================================================
const RUBRICAS_VERSION = 'fedequinas-2026.1'; // Res. 4755/2025 (rige 1-ene-2026)

const FENOTIPO_GS = (nombre, peso) => ({ nombre, peso_porcentaje: peso, bloque: 'Fenotipo', origen: 'gs', formula: 'f(fenotipo_' + nombre.toLowerCase().replace(/[^a-z]+/g, '_') + ')' });

const RUBRICAS = {
  // §2.1 Caballo Criollo Colombiano (reproductor adiestrado) — 40/25/35
  caballo: [
    { nombre: 'Suavidad y naturalidad', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 10, formula: 'f(suavidad)' },
    { nombre: 'Ritmo, cadencia, firmeza y seguridad', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 8, formula: 'f(coef_variacion_intervalos)' },
    { nombre: 'Brío y temperamento', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 8, formula: 'f(cadencia_ppm)' },
    { nombre: 'Compensación', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 8, formula: 'f(compensacion)' },
    { nombre: 'Quietud de anca', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 6, formula: 'f(quietud_anca)' },
    { nombre: 'Sostenimiento', bloque: 'Adiestramiento', origen: 'marcha', peso_porcentaje: 15, formula: 'f(sostenimiento)' },
    { nombre: 'Rienda y comportamiento', bloque: 'Adiestramiento', origen: 'manual', peso_porcentaje: 5, formula: 'f(rienda)' },
    { nombre: 'Reunión, armonía y posición de cabeza', bloque: 'Adiestramiento', origen: 'marcha', peso_porcentaje: 5, formula: 'f(posicion_cabeza)' },
    { nombre: 'Balance y conjunto (conformación, alzada, pintas)', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 20, formula: 'f(fenotipo_conformacion)' },
    { nombre: 'Aplomos', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 15, formula: 'f(fenotipo_aplomos)' }
  ],
  // §2.2 Campeón/Campeona Joven (36–48 m, freno + falsa rienda) — 35/35/30
  campeon_joven: [
    { nombre: 'Suavidad y naturalidad', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 9, formula: 'f(suavidad)' },
    { nombre: 'Ritmo, cadencia, firmeza y seguridad', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 7, formula: 'f(coef_variacion_intervalos)' },
    { nombre: 'Brío y temperamento', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 7, formula: 'f(cadencia_ppm)' },
    { nombre: 'Compensación', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 7, formula: 'f(compensacion)' },
    { nombre: 'Quietud de anca', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 5, formula: 'f(quietud_anca)' },
    { nombre: 'Sostenimiento', bloque: 'Adiestramiento', origen: 'marcha', peso_porcentaje: 15, formula: 'f(sostenimiento)' },
    { nombre: 'Falsa rienda y comportamiento (caminar)', bloque: 'Adiestramiento', origen: 'manual', peso_porcentaje: 15, formula: 'f(rienda_falsa)' },
    { nombre: 'Reunión y posición de cabeza', bloque: 'Adiestramiento', origen: 'marcha', peso_porcentaje: 5, formula: 'f(posicion_cabeza)' },
    { nombre: 'Balance y conjunto (conformación, alzada)', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 15, formula: 'f(fenotipo_conformacion)' },
    { nombre: 'Aplomos', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 15, formula: 'f(fenotipo_aplomos)' }
  ],
  // §2.3 Grupos de Yeguas (Para/Con Cría) — 10/30/15/45
  grupo_yeguas: [
    { nombre: 'Uniformidad del grupo', bloque: 'Grupo', origen: 'manual', peso_porcentaje: 10, formula: 'f(uniformidad_grupo)' },
    { nombre: 'Armonía, naturalidad y estándar', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 15, formula: 'f(armonia)' },
    { nombre: 'Cadencia y ritmo', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 15, formula: 'f(coef_variacion_intervalos)' },
    { nombre: 'Comportamiento (brío, mansedumbre, docilidad)', bloque: 'Comportamiento', origen: 'manual', peso_porcentaje: 15, formula: 'f(comportamiento)' },
    { nombre: 'Conformación, feminidad y pintas', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 10, formula: 'f(fenotipo_conformacion)' },
    { nombre: 'Línea dorsal', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 8, formula: 'f(fenotipo_dorso)' },
    { nombre: 'Amplitud/angulación ancas, pecho, alzada', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 7, formula: 'f(fenotipo_ancas)' },
    { nombre: 'Glándula mamaria y vulva', bloque: 'Fenotipo', origen: 'manual', peso_porcentaje: 5, formula: 'f(fenotipo_repro)' },
    { nombre: 'Aplomos', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 15, formula: 'f(fenotipo_aplomos)' }
  ],
  // §2.4 Asnales — 45/15/40
  asnal: [
    { nombre: 'Armonía (tren anterior/posterior)', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 25, formula: 'f(armonia)' },
    { nombre: 'Cadencia, ritmo y suavidad', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 10, formula: 'f(coef_variacion_intervalos)' },
    { nombre: 'Brío y temperamento', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 10, formula: 'f(cadencia_ppm)' },
    { nombre: 'Respuesta al cabestro (naturalidad)', bloque: 'Adiestramiento', origen: 'marcha', peso_porcentaje: 10, formula: 'f(sostenimiento)' },
    { nombre: 'Comportamiento en pista', bloque: 'Adiestramiento', origen: 'manual', peso_porcentaje: 5, formula: 'f(comportamiento)' },
    { nombre: 'Conformación y alzada', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 30, formula: 'f(fenotipo_conformacion)' },
    { nombre: 'Calidad podal y aplomos', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 10, formula: 'f(fenotipo_aplomos)' }
  ],
  // §2.5 Mulares de Silla — 50/25/25
  mular: [
    { nombre: 'Armonía, quietud de anca y suavidad', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 25, formula: 'f(armonia)' },
    { nombre: 'Cadencia y ritmo', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 15, formula: 'f(coef_variacion_intervalos)' },
    { nombre: 'Brío y temperamento', bloque: 'Movimientos', origen: 'marcha', peso_porcentaje: 10, formula: 'f(cadencia_ppm)' },
    { nombre: 'Sostenimiento', bloque: 'Adiestramiento', origen: 'marcha', peso_porcentaje: 12, formula: 'f(sostenimiento)' },
    { nombre: 'Rienda', bloque: 'Adiestramiento', origen: 'manual', peso_porcentaje: 6, formula: 'f(rienda)' },
    { nombre: 'Posición de cabeza y boca', bloque: 'Adiestramiento', origen: 'marcha', peso_porcentaje: 7, formula: 'f(posicion_cabeza)' },
    { nombre: 'Conformación', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 22, formula: 'f(fenotipo_conformacion)' },
    { nombre: 'Calidad podal', bloque: 'Fenotipo', origen: 'gs', peso_porcentaje: 3, formula: 'f(fenotipo_aplomos)' }
  ]
};

// tipo de ejemplar a partir de la categoría (modalidad + nombre + edad).
function tipoDeCategoria(categoria) {
  if (!categoria) return 'caballo';
  const m = String(categoria.modalidad || '').toLowerCase();
  const n = String(categoria.nombre || '').toLowerCase();
  if (m === 'asnal' || /asnal|burr/.test(n)) return 'asnal';
  if (m === 'mular' || /mular|mula\b/.test(n)) return 'mular';
  if (/grupo|yeguas\s+(para|con)\s+cr|lote de yeguas/.test(n)) return 'grupo_yeguas';
  const edadMin = categoria.edad_min_meses, edadMax = categoria.edad_max_meses;
  if (/campe(o|ó)n(a)?\s+joven|\bjoven\b/.test(n) || (edadMin != null && edadMax != null && edadMin >= 36 && edadMax <= 48)) return 'campeon_joven';
  return 'caballo';
}

// Rubro de criterios para un tipo de ejemplar. `modalidad` se anexa a cada
// criterio (para trazabilidad de la banda de cadencia usada por el andar).
function rubricFor(tipo, modalidad) {
  const base = RUBRICAS[tipo] || RUBRICAS.caballo;
  return base.map((c) => Object.assign({ modalidad: modalidad || null }, c));
}

// Evalúa una fórmula -> { valor_medido, puntaje_normalizado (0..100), medible, nota }.
// `medible:false` = el criterio NO se pudo medir con los datos disponibles (p.ej.
// métricas de POSE sin video, o cadencia fuera de rango físico). NO se castiga
// con 0: score() lo EXCLUYE del promedio ponderado (renormaliza). `nota` explica.
function evalFormula(formula, mov, son, umbrales, modalidad) {
  const U = Object.assign({}, DEFAULT_MODEL.umbrales, umbrales || {});
  const f = String(formula || '');
  const NA = (nota) => ({ valor_medido: null, puntaje_normalizado: null, medible: false, nota: nota || null });

  if (f.includes('coef_variacion_intervalos')) {
    const cv = mov.coef_variacion_intervalos;
    if (cv == null) return NA('audio');
    const score = 100 * clamp(1 - cv / (2 * U.cv_regular_max), 0, 1);
    return { valor_medido: cv, puntaje_normalizado: Number(score.toFixed(1)), medible: true };
  }
  if (f.includes('claridad_4_tiempos')) {
    const c = son.claridad_4_tiempos != null ? son.claridad_4_tiempos : mov.uniformidad_4_tiempos;
    if (c == null) return NA('audio');
    return { valor_medido: c, puntaje_normalizado: Number((100 * clamp(c, 0, 1)).toFixed(1)), medible: true };
  }
  if (f.includes('simetria_lateral')) {
    const s = mov.simetria_lateral;
    if (s == null) return NA('pose'); // requiere pose de video (próximamente)
    return { valor_medido: s, puntaje_normalizado: Number((100 * clamp(s, 0, 1)).toFixed(1)), medible: true };
  }
  if (f.includes('cadencia_ppm')) {
    const c = mov.cadencia_ppm;
    if (c == null) return NA('audio');
    // Banda de cadencia REAL por modalidad (paso fino ~540–760 ppm, etc.).
    const band = cadenciaBand(U, modalidad);
    const lo = band.min, id = band.ideal, hi = band.max;
    // Cadencia fuera del rango físico de la modalidad: NO confiable -> no se puntúa.
    if (c < lo || c > hi) return { valor_medido: c, puntaje_normalizado: null, medible: false, nota: 'cadencia_no_confiable' };
    const score = c <= id ? 100 * (c - lo) / (id - lo) : 100 * (hi - c) / (hi - id);
    return { valor_medido: c, puntaje_normalizado: Number(clamp(score, 0, 100).toFixed(1)), medible: true };
  }
  if (f.includes('elevacion')) {
    const ea = mov.elevacion_anterior, ep = mov.elevacion_posterior;
    if (ea == null && ep == null) return NA('pose'); // requiere pose de video (próximamente)
    const e = ((ea || 0) + (ep || 0)) / ((ea != null ? 1 : 0) + (ep != null ? 1 : 0) || 1);
    return { valor_medido: Number(e.toFixed(3)), puntaje_normalizado: Number((100 * clamp(e, 0, 1)).toFixed(1)), medible: true };
  }

  // ---- Líneas del rubro oficial FEDEQUINAS (métricas de pose de tronco/cabeza) ----
  // Todas ya vienen normalizadas 0..1 desde metrics.movimiento; el puntaje es
  // 100×valor. NA('pose'|'audio') cuando la señal no está disponible.
  if (f.includes('suavidad'))        { const v = mov.suavidad;        return v == null ? NA('pose')  : { valor_medido: v, puntaje_normalizado: Number((100 * clamp(v, 0, 1)).toFixed(1)), medible: true }; }
  if (f.includes('compensacion'))    { const v = mov.compensacion;    return v == null ? NA('pose')  : { valor_medido: v, puntaje_normalizado: Number((100 * clamp(v, 0, 1)).toFixed(1)), medible: true }; }
  if (f.includes('quietud_anca'))    { const v = mov.quietud_anca;    return v == null ? NA('pose')  : { valor_medido: v, puntaje_normalizado: Number((100 * clamp(v, 0, 1)).toFixed(1)), medible: true }; }
  if (f.includes('posicion_cabeza')) { const v = mov.posicion_cabeza; return v == null ? NA('pose')  : { valor_medido: v, puntaje_normalizado: Number((100 * clamp(v, 0, 1)).toFixed(1)), medible: true }; }
  if (f.includes('sostenimiento'))   { const v = mov.sostenimiento;   return v == null ? NA('audio') : { valor_medido: v, puntaje_normalizado: Number((100 * clamp(v, 0, 1)).toFixed(1)), medible: true }; }
  // Armonía (asnal/mular/grupo): promedio de las señales de armonía disponibles.
  if (f.includes('armonia')) {
    const partes = [mov.compensacion, mov.quietud_anca, mov.simetria_lateral].filter((x) => x != null);
    if (!partes.length) return NA('pose');
    const v = partes.reduce((a, b) => a + b, 0) / partes.length;
    return { valor_medido: Number(v.toFixed(3)), puntaje_normalizado: Number((100 * clamp(v, 0, 1)).toFixed(1)), medible: true };
  }
  // Fenotipo (conformación / aplomos / dorso / ancas / repro): dominio del
  // equimind-gs-engine (medición 3D). No medible por el motor de marcha.
  if (f.includes('fenotipo')) return NA('gs');
  // Rienda / falsa rienda / comportamiento / uniformidad de grupo: requieren
  // señal de rienda o comparación multi-caballo (aún no capturadas).
  if (f.includes('rienda') || f.includes('comportamiento') || f.includes('uniformidad_grupo')) return NA('manual');

  return NA(null);
}

// Devuelve { puntuaciones, puntaje_total, cobertura, cadencia_band }
function score(criterios, mov, son, umbrales, modalidad) {
  const puntuaciones = [];
  let totalPeso = 0, acum = 0;
  for (const c of criterios) {
    const r = evalFormula(c.formula, mov, son, umbrales, modalidad);
    puntuaciones.push({
      criterio_id: c.id != null ? c.id : null,
      nombre: c.nombre,
      bloque: c.bloque || null,
      origen: c.origen || null,
      peso_porcentaje: Number(c.peso_porcentaje),
      valor_medido: r.valor_medido,
      puntaje_normalizado: r.puntaje_normalizado,
      medible: r.medible !== false,
      nota: r.nota || c.origen || null
    });
    // SOLO los criterios medibles cuentan en el promedio ponderado. Los no
    // medibles (pose sin video / cadencia no confiable) se excluyen y el peso se
    // renormaliza, en vez de arrastrar el puntaje con ceros injustos.
    if (r.medible !== false && r.puntaje_normalizado != null) {
      totalPeso += Number(c.peso_porcentaje);
      acum += r.puntaje_normalizado * Number(c.peso_porcentaje);
    }
  }
  const puntaje_total = totalPeso > 0 ? Number((acum / totalPeso).toFixed(2)) : null;
  // Cobertura: qué fracción del peso total pudo medirse (para la UI: "parcial").
  const pesoDefinido = criterios.reduce((s, c) => s + Number(c.peso_porcentaje), 0) || 1;
  const cobertura = Number((totalPeso / pesoDefinido).toFixed(3));
  const U = Object.assign({}, DEFAULT_MODEL.umbrales, umbrales || {});
  return { puntuaciones, puntaje_total, cobertura, cadencia_band: cadenciaBand(U, modalidad) };
}

module.exports = { score, evalFormula, CRITERIOS_PASO_FINO, RUBRICAS, RUBRICAS_VERSION, rubricFor, tipoDeCategoria };
