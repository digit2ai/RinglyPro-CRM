// =====================================================
// Métricas derivadas — metricas_movimiento (de pisadas + pose) y metricas_sonido
// (de los golpes de audio). La SUPERFICIE normaliza el nivel de audio (el sonido
// cambia mucho entre tablado, arena y asfalto).
// =====================================================

'use strict';

const { CASCOS, lado } = require('./anatomy');

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function std(a, m) {
  if (a.length < 2) return 0;
  const mu = m == null ? mean(a) : m;
  return Math.sqrt(a.reduce((x, y) => x + (y - mu) * (y - mu), 0) / a.length);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Atenuación de ganancia por superficie para normalizar nivel_db (referencia tablado).
const GANANCIA_SUPERFICIE = {
  tablado: 0, arena: 8, asfalto: -2, tierra: 6, cemento: -1
};

// pisadas: con timestamp_ms, extremidad, intervalo_anterior_ms.
// frames: opcional (para elevación/longitud). durSec: duración total.
function movimiento(pisadas, frames, durSec, clas) {
  const ps = (pisadas || []).slice().sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  const intervalos = ps.map((p) => p.intervalo_anterior_ms).filter((x) => x != null && x > 0);
  const mu = mean(intervalos);
  const cv = mu > 0 ? std(intervalos, mu) / mu : null;

  // Cadencia (pisadas por minuto).
  const cadencia_ppm = durSec > 0 ? (ps.length / durSec) * 60 : (mu > 0 ? 60000 / mu : null);
  // Regularidad: 1 - CV (acotado 0..1).
  const regularidad_ritmo = cv != null ? clamp(1 - cv, 0, 1) : null;

  // Simetría lateral: balance de número de apoyos izq vs der.
  let izq = 0, der = 0;
  for (const p of ps) { if (!p.extremidad) continue; if (lado(p.extremidad) === 'izq') izq++; else der++; }
  const tot = izq + der;
  const simetria_lateral = tot > 0 ? clamp(1 - Math.abs(izq - der) / tot, 0, 1) : null;

  // Uniformidad de 4 tiempos: qué tan parejos son los intervalos (1 - CV) pero
  // penalizado si la marcha no es de 4 tiempos.
  let uniformidad_4_tiempos = null;
  if (cv != null) {
    const base = clamp(1 - cv * 1.5, 0, 1);
    const penal = clas && clas.tiempos ? clamp(1 - Math.abs(clas.tiempos - 4) * 0.3, 0, 1) : 1;
    uniformidad_4_tiempos = clamp(base * penal, 0, 1);
  }

  // Elevación (de pose): rango vertical del casco por tren. y crece hacia abajo,
  // así que más rango = más elevación. Normalizado 0..1 contra el tamaño del cuadro.
  let elevacion_anterior = null, elevacion_posterior = null, longitud_paso = null, velocidad_promedio = null;
  if (Array.isArray(frames) && frames.length > 2) {
    const rangos = {};
    const xs = {};
    for (const codigo of Object.keys(CASCOS)) { rangos[codigo] = []; xs[codigo] = []; }
    for (const f of frames) {
      for (const codigo of Object.keys(CASCOS)) {
        const kp = f.keypoints && f.keypoints[codigo];
        if (kp && typeof kp.y === 'number') { rangos[codigo].push(kp.y); xs[codigo].push(kp.x); }
      }
    }
    const rangoY = (c) => (rangos[c].length ? Math.max(...rangos[c]) - Math.min(...rangos[c]) : 0);
    const rangoX = (c) => (xs[c].length ? Math.max(...xs[c]) - Math.min(...xs[c]) : 0);
    elevacion_anterior = clamp((rangoY('casco_ant_izq') + rangoY('casco_ant_der')) / 2 * 2.0, 0, 1);
    elevacion_posterior = clamp((rangoY('casco_post_izq') + rangoY('casco_post_der')) / 2 * 2.0, 0, 1);
    longitud_paso = clamp((rangoX('casco_ant_izq') + rangoX('casco_ant_der')) / 2, 0, 1);
    velocidad_promedio = durSec > 0 ? Number((longitud_paso / durSec).toFixed(4)) : null;
  }

  return {
    cadencia_ppm: cadencia_ppm != null ? Number(cadencia_ppm.toFixed(1)) : null,
    regularidad_ritmo: regularidad_ritmo != null ? Number(regularidad_ritmo.toFixed(3)) : null,
    simetria_lateral: simetria_lateral != null ? Number(simetria_lateral.toFixed(3)) : null,
    uniformidad_4_tiempos: uniformidad_4_tiempos != null ? Number(uniformidad_4_tiempos.toFixed(3)) : null,
    coef_variacion_intervalos: cv != null ? Number(cv.toFixed(4)) : null,
    elevacion_anterior: elevacion_anterior != null ? Number(elevacion_anterior.toFixed(3)) : null,
    elevacion_posterior: elevacion_posterior != null ? Number(elevacion_posterior.toFixed(3)) : null,
    longitud_paso: longitud_paso != null ? Number(longitud_paso.toFixed(3)) : null,
    velocidad_promedio
  };
}

// golpesAudio: pisadas con detectada_por_audio. superficie normaliza el nivel.
function sonido(golpesAudio, superficie, opts = {}) {
  const ga = (golpesAudio || []).filter((p) => p.detectada_por_audio).sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  const intervalos = [];
  for (let i = 1; i < ga.length; i++) intervalos.push(ga[i].timestamp_ms - ga[i - 1].timestamp_ms);
  const mu = mean(intervalos);
  const sd = std(intervalos, mu);
  const cv = mu > 0 ? sd / mu : null;
  // Claridad de 4 tiempos: qué tan parejos y separados están los golpes (1 - CV).
  const claridad_4_tiempos = cv != null ? clamp(1 - cv * 1.5, 0, 1) : null;

  const niveles = ga.map((p) => p.intensidad_db).filter((x) => x != null);
  let nivel_db_promedio = niveles.length ? mean(niveles) : (opts.nivel_db != null ? opts.nivel_db : null);
  if (nivel_db_promedio != null) nivel_db_promedio += (GANANCIA_SUPERFICIE[superficie] || 0);

  return {
    intervalo_promedio_ms: mu ? Number(mu.toFixed(1)) : null,
    desviacion_intervalos_ms: sd ? Number(sd.toFixed(1)) : null,
    claridad_4_tiempos: claridad_4_tiempos != null ? Number(claridad_4_tiempos.toFixed(3)) : null,
    nivel_db_promedio: nivel_db_promedio != null ? Number(nivel_db_promedio.toFixed(1)) : null,
    frecuencia_dominante_hz: opts.frecuencia_dominante_hz != null ? Number(opts.frecuencia_dominante_hz) : null,
    relacion_senal_ruido: opts.relacion_senal_ruido != null ? Number(opts.relacion_senal_ruido) : null
  };
}

module.exports = { movimiento, sonido, GANANCIA_SUPERFICIE };
