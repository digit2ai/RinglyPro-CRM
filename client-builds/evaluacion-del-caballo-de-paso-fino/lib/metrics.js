// =====================================================
// Métricas derivadas — metricas_movimiento (de pisadas + pose) y metricas_sonido
// (de los golpes de audio). La SUPERFICIE normaliza el nivel de audio (el sonido
// cambia mucho entre tablado, arena y asfalto).
// =====================================================

'use strict';

const { CASCOS, lado } = require('./anatomy');
const { DEFAULT_MODEL } = require('./thresholds');

// Rango (max-min) de una serie; 0 si vacía.
function rango(a) { return a.length ? Math.max(...a) - Math.min(...a) : 0; }
// Vaivén horizontal quitando la traslación (el caballo avanza): residual sobre
// una recta ajustada de extremo a extremo, luego rango del residual.
function swayDetrend(xs) {
  const n = xs.length;
  if (n < 3) return 0;
  const x0 = xs[0], xN = xs[n - 1];
  const res = xs.map((x, i) => x - (x0 + (xN - x0) * (i / (n - 1))));
  return rango(res);
}

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

  // Cadencia (pisadas por minuto). Se usa el INTERVALO MEDIO entre pisadas
  // (60000/mu) — método estándar y robusto: inmune al silencio inicial/final del
  // clip. Solo si no hay intervalos válidos se cae a conteo/duración.
  const cadencia_ppm = mu > 0 ? 60000 / mu : (durSec > 0 ? (ps.length / durSec) * 60 : null);
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

  // ---- Métricas de pose del TRONCO y la CABEZA (rubro oficial FEDEQUINAS) ----
  // Requieren keypoints de tronco/cabeza (cruz, dorso, grupa, nuca, hocico). Con
  // solo audio (o pose de solo cascos) quedan null -> el criterio será medible:false
  // y scoring lo excluye y renormaliza (no castiga con 0).
  const U = DEFAULT_MODEL.umbrales;
  let suavidad = null, quietud_anca = null, posicion_cabeza = null, compensacion = null;
  if (Array.isArray(frames) && frames.length > 2) {
    const serieY = (codigo) => frames.map((f) => f.keypoints && f.keypoints[codigo] && typeof f.keypoints[codigo].y === 'number' ? f.keypoints[codigo].y : null).filter((v) => v != null);
    const serieX = (codigo) => frames.map((f) => f.keypoints && f.keypoints[codigo] && typeof f.keypoints[codigo].x === 'number' ? f.keypoints[codigo].x : null).filter((v) => v != null);

    // SUAVIDAD (la línea de mayor peso): cuanto MENOS cabecea verticalmente el
    // tronco (cruz/dorso), más cómodo el transporte del jinete => más suave.
    const cruzY = serieY('cruz'), dorsoY = serieY('dorso');
    if (cruzY.length > 2 || dorsoY.length > 2) {
      const bob = ((cruzY.length ? rango(cruzY) : 0) + (dorsoY.length ? rango(dorsoY) : 0)) / ((cruzY.length ? 1 : 0) + (dorsoY.length ? 1 : 0) || 1);
      suavidad = clamp(1 - bob / (U.suavidad_bob_ref || 0.14), 0, 1);
    }
    // QUIETUD DE ANCA: poco desplazamiento vertical + poco vaivén horizontal
    // (detrend de la traslación) de la grupa => anca quieta.
    const grupaY = serieY('grupa'), grupaX = serieX('grupa');
    if (grupaY.length > 2) {
      const vert = rango(grupaY) / (U.quietud_anca_vert_ref || 0.12);
      const sway = swayDetrend(grupaX) / (U.quietud_anca_sway_ref || 0.06);
      quietud_anca = clamp(1 - (vert * 0.6 + sway * 0.4), 0, 1);
    }
    // POSICIÓN DE CABEZA / REUNIÓN: porte estable de nuca/hocico (poca oscilación
    // vertical) => cabeza bien colocada, en reunión.
    const nucaY = serieY('nuca'), hocicoY = serieY('hocico');
    if (nucaY.length > 2 || hocicoY.length > 2) {
      const osc = ((nucaY.length ? std(nucaY) : 0) + (hocicoY.length ? std(hocicoY) : 0)) / ((nucaY.length ? 1 : 0) + (hocicoY.length ? 1 : 0) || 1);
      posicion_cabeza = clamp(1 - osc / (U.posicion_cabeza_ref || 0.10), 0, 1);
    }
  }
  // COMPENSACIÓN: armonía entre el arco del tren anterior y el posterior; cuanto
  // más parejos, mejor. Deriva de la elevación ya calculada (no requiere tronco).
  if (elevacion_anterior != null && elevacion_posterior != null) {
    compensacion = clamp(1 - Math.abs(elevacion_anterior - elevacion_posterior) / (U.compensacion_ref || 0.45), 0, 1);
  }

  // SOSTENIMIENTO (adiestramiento): constancia de la cadencia a lo largo del clip
  // — no la evenness instantánea (eso es Ritmo), sino que NO se desvíe entre la
  // primera y la segunda mitad. Penaliza deriva de tempo + irregularidad residual.
  let sostenimiento = null;
  if (intervalos.length >= 4) {
    const mid = Math.floor(intervalos.length / 2);
    const m1 = mean(intervalos.slice(0, mid)), m2 = mean(intervalos.slice(mid));
    const drift = mu > 0 ? Math.abs(m1 - m2) / mu : 0;
    const k = U.sostenimiento_drift_k || 3.0;
    sostenimiento = clamp(1 - drift * k - (cv != null ? cv : 0) * 0.5, 0, 1);
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
    velocidad_promedio,
    // Nuevas métricas del rubro oficial (pose de tronco/cabeza + deriva de tempo).
    suavidad: suavidad != null ? Number(suavidad.toFixed(3)) : null,
    compensacion: compensacion != null ? Number(compensacion.toFixed(3)) : null,
    quietud_anca: quietud_anca != null ? Number(quietud_anca.toFixed(3)) : null,
    posicion_cabeza: posicion_cabeza != null ? Number(posicion_cabeza.toFixed(3)) : null,
    sostenimiento: sostenimiento != null ? Number(sostenimiento.toFixed(3)) : null
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
