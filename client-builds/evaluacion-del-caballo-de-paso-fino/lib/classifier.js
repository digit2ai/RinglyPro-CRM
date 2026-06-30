// =====================================================
// Clasificador de modalidad — reglas + umbrales VERSIONADOS (umbrales_json).
//
//   classify(pisadas, umbrales) -> {
//     modalidad_detectada, confianza (0..1), tiempos, patron (lateral|diagonal),
//     coef_variacion_intervalos, intervalo_promedio_ms, beats
//   }
//
// Reglas base (sección 4.3 del brief):
//   - 4 tiempos + apoyos laterales + intervalos muy parejos -> paso_fino
//   - 4 tiempos + apoyos diagonales                          -> trocha
//   - 2 tiempos diagonales                                   -> trote_galope (trote)
//   - 3 tiempos                                              -> trote_galope (galope)
//
// Opera SOLO sobre la secuencia de pisadas (timestamp + extremidad), así que es
// testeable con intervalos sintéticos sin necesitar video real.
// =====================================================

'use strict';

const { lado, tren, esDiagonal, esLateral } = require('./anatomy');
const { DEFAULT_MODEL } = require('./thresholds');

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function std(a, m) {
  if (a.length < 2) return 0;
  const mu = m == null ? mean(a) : m;
  return Math.sqrt(a.reduce((x, y) => x + (y - mu) * (y - mu), 0) / a.length);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Agrupa pisadas casi simultáneas (dentro de cluster_beat_ms) en un mismo
// "tiempo" (beat). Un beat con 2 extremidades = apoyo de bípedo (trote/galope).
function clusterBeats(pisadas, clusterMs) {
  const ps = pisadas.slice().sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  const beats = [];
  for (const p of ps) {
    const last = beats[beats.length - 1];
    if (last && p.timestamp_ms - last.ts_ref <= clusterMs) {
      last.limbs.push(p.extremidad);
      last.ts = Math.round((last.ts * last.limbs.length + p.timestamp_ms) / (last.limbs.length + 1));
    } else {
      beats.push({ ts: p.timestamp_ms, ts_ref: p.timestamp_ms, limbs: [p.extremidad] });
    }
  }
  return beats;
}

// Tiempos por ciclo = número de beats hasta que reaparece una extremidad ya
// vista (un ciclo de marcha completo). Promedia sobre los ciclos detectados.
function tiemposPorCiclo(beats) {
  const ciclos = [];
  let seen = new Set();
  let count = 0;
  for (const b of beats) {
    const repite = b.limbs.some((l) => l && seen.has(l));
    if (repite && count > 0) { ciclos.push(count); seen = new Set(); count = 0; }
    count += 1;
    for (const l of b.limbs) if (l) seen.add(l);
  }
  if (count > 0) ciclos.push(count);
  if (!ciclos.length) return beats.length;
  // Moda/mediana robusta: usar la mediana de los conteos de ciclo.
  ciclos.sort((a, b) => a - b);
  return ciclos[Math.floor(ciclos.length / 2)];
}

// Discriminador robusto lateral vs diagonal. La firma biomecánica real: en una
// marcha LATERAL (paso fino) cada mano (ant_*) sigue al posterior del MISMO lado
// (post_izq -> ant_izq); en una DIAGONAL (trocha/trote) la mano sigue al
// posterior del lado OPUESTO. Para apoyos de bípedo (trote), se mira si el par
// simultáneo es diagonal o lateral. Esto separa limpio aun con CV=0.
function patronApoyos(beats) {
  let lat = 0, diag = 0;
  let hadPairs = false;
  for (const b of beats) {
    if (b.limbs.length >= 2) {
      hadPairs = true;
      const [a, c] = b.limbs;
      if (a && c) { if (esDiagonal(a, c)) diag++; else if (esLateral(a, c)) lat++; }
    }
  }
  if (!hadPairs) {
    // Beats de un solo miembro: cada anterior vs el posterior previo.
    let lastHind = null;
    for (const b of beats) {
      const l = b.limbs[0];
      if (!l) continue;
      if (tren(l) === 'post') { lastHind = l; }
      else if (tren(l) === 'ant' && lastHind) {
        if (lado(l) === lado(lastHind)) lat++; else diag++;
      }
    }
  }
  const total = lat + diag;
  if (total === 0) return { patron: 'indeterminado', lateral_ratio: 0, diagonal_ratio: 0 };
  const lr = lat / total, dr = diag / total;
  return { patron: lr >= dr ? 'lateral' : 'diagonal', lateral_ratio: lr, diagonal_ratio: dr };
}

function classify(pisadas, umbrales) {
  const U = Object.assign({}, DEFAULT_MODEL.umbrales, umbrales || {});
  if (!Array.isArray(pisadas) || pisadas.length < 3) {
    return {
      modalidad_detectada: null, confianza: 0, tiempos: 0, patron: 'indeterminado',
      coef_variacion_intervalos: null, intervalo_promedio_ms: null, beats: 0,
      lateral_ratio: 0, diagonal_ratio: 0, motivo: 'pisadas insuficientes'
    };
  }

  const beats = clusterBeats(pisadas, U.cluster_beat_ms);
  const tiempos = tiemposPorCiclo(beats);
  const { patron, lateral_ratio, diagonal_ratio } = patronApoyos(beats);

  // Intervalos entre beats (clave del ritmo).
  const intervalos = [];
  for (let i = 1; i < beats.length; i++) intervalos.push(beats[i].ts - beats[i - 1].ts);
  const mu = mean(intervalos);
  const cv = mu > 0 ? std(intervalos, mu) / mu : null;

  // Reglas + confianza.
  let modalidad = null;
  let conf = 0.5;
  if (tiempos >= 4) {
    if (patron === 'lateral' && cv != null && cv <= U.cv_paso_fino_max) {
      modalidad = 'paso_fino';
      const cvScore = 1 - clamp(cv / U.cv_paso_fino_max, 0, 1);          // 1 = CV perfecto
      conf = clamp(0.6 + 0.25 * lateral_ratio + 0.15 * cvScore, 0, 1);
    } else if (patron === 'diagonal') {
      modalidad = 'trocha';
      conf = clamp(0.6 + 0.3 * diagonal_ratio, 0, 1);
    } else if (patron === 'lateral') {
      // Lateral pero irregular: sigue siendo paso fino, con menos confianza.
      modalidad = 'paso_fino';
      conf = clamp(0.45 + 0.2 * lateral_ratio, 0, 0.7);
    } else {
      modalidad = 'trocha';
      conf = 0.4;
    }
  } else if (tiempos === 3) {
    modalidad = 'trote_galope'; // galope
    conf = clamp(0.6 + 0.2 * (diagonal_ratio || 0.5), 0, 1);
  } else if (tiempos === 2) {
    modalidad = 'trote_galope'; // trote (2 tiempos diagonales)
    conf = clamp(0.6 + 0.3 * (diagonal_ratio || 0.5), 0, 1);
  } else {
    modalidad = null;
    conf = 0.2;
  }

  return {
    modalidad_detectada: modalidad,
    confianza: Number(conf.toFixed(3)),
    tiempos,
    patron,
    lateral_ratio: Number(lateral_ratio.toFixed(3)),
    diagonal_ratio: Number(diagonal_ratio.toFixed(3)),
    coef_variacion_intervalos: cv != null ? Number(cv.toFixed(4)) : null,
    intervalo_promedio_ms: mu ? Number(mu.toFixed(1)) : null,
    beats: beats.length
  };
}

function esModalidadValida(detectada, modalidadCategoria) {
  if (!detectada || !modalidadCategoria) return null;
  if (detectada === modalidadCategoria) return true;
  // trocha_galope acepta tanto trocha como trote_galope.
  if (modalidadCategoria === 'trocha_galope') return detectada === 'trocha' || detectada === 'trote_galope';
  return false;
}

module.exports = { classify, esModalidadValida, clusterBeats, tiemposPorCiclo, patronApoyos };
