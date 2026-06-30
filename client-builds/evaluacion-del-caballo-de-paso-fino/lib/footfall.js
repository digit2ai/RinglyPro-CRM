// =====================================================
// Footfall — detección de golpes de casco (pisadas) desde VIDEO (pose) y desde
// AUDIO (onsets), su FUSIÓN, y la asignación de secuencia + intervalos.
//
//   detectVideoFootfalls(frames)  -> pisadas con extremidad (de los casco_*)
//   detectAudioFootfalls(onsets)  -> golpes con intensidad (sin extremidad)
//   fuse(video, audio, windowMs)  -> unifica golpes coincidentes (sube confianza)
//   sequenceAndIntervals(pisadas) -> intervalo_anterior_ms + orden_secuencia 1..4
//
// Coordenadas de imagen: y CRECE hacia abajo, así que el casco toca el suelo en
// un MÁXIMO local de y (punto más bajo) con velocidad vertical ~0.
// =====================================================

'use strict';

const { CASCOS, EXTREMIDADES } = require('./anatomy');

// frames: [{ numero_frame, timestamp_ms, keypoints: { casco_ant_izq:{x,y,confianza?}, ... } }]
// Detecta, por cada casco, los frames donde y es un máximo local (contacto).
function detectVideoFootfalls(frames) {
  if (!Array.isArray(frames) || frames.length < 3) return [];
  const out = [];
  for (const codigo of Object.keys(CASCOS)) {
    const extremidad = CASCOS[codigo];
    // Serie temporal (t, y) del casco; saltar frames sin el punto.
    const serie = [];
    for (const f of frames) {
      const kp = f.keypoints && f.keypoints[codigo];
      if (kp && typeof kp.y === 'number') serie.push({ t: f.timestamp_ms, y: kp.y });
    }
    if (serie.length < 3) continue;
    const ys = serie.map((s) => s.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rango = maxY - minY;
    if (rango <= 0.01) continue; // casco casi sin movimiento vertical -> sin pisadas
    // Umbral: el casco está "abajo" (en contacto) cerca del máximo y.
    const contacto = maxY - 0.30 * rango;
    let lastT = -Infinity;
    for (let i = 1; i < serie.length - 1; i++) {
      const prev = serie[i - 1].y, cur = serie[i].y, next = serie[i + 1].y;
      // Máximo local ESTRICTO al menos por un lado (evita contar cada frame de
      // una meseta plana como pisada), y por debajo (>=) del umbral de contacto.
      const esMax = cur >= prev && cur >= next && (cur > prev || cur > next) && cur >= contacto;
      if (!esMax) continue;
      // Refractario: un mismo casco no reapoya en <180 ms (máx ~330 pisadas/min).
      if (serie[i].t - lastT < 180) continue;
      lastT = serie[i].t;
      // Profundidad del apoyo como proxy de confianza (0..1).
      const conf = Math.min(1, (cur - contacto) / (maxY - contacto || 1));
      out.push({
        timestamp_ms: Math.round(serie[i].t),
        extremidad,
        intensidad_db: null,
        duracion_contacto_ms: null,
        detectada_por_video: true,
        detectada_por_audio: false,
        confianza: Number((0.6 + 0.4 * conf).toFixed(3))
      });
    }
  }
  out.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  return out;
}

// onsets: tiempos (segundos) del analizador de audio. Sin extremidad (el audio
// no distingue qué pata fue). intensidad_db opcional por onset.
function detectAudioFootfalls(onsets, opts = {}) {
  if (!Array.isArray(onsets)) return [];
  return onsets.map((t) => ({
    timestamp_ms: Math.round(t * 1000),
    extremidad: null,
    intensidad_db: opts.nivel_db != null ? opts.nivel_db : null,
    duracion_contacto_ms: opts.duracion_contacto_ms != null ? opts.duracion_contacto_ms : null,
    detectada_por_video: false,
    detectada_por_audio: true,
    confianza: 0.6
  })).sort((a, b) => a.timestamp_ms - b.timestamp_ms);
}

// Fusiona golpes de video y audio: si caen dentro de windowMs, son el mismo
// golpe -> se unifica (extremidad del video, intensidad del audio, +confianza).
function fuse(videoFalls, audioFalls, windowMs = 40) {
  const v = (videoFalls || []).map((x) => Object.assign({}, x));
  const a = (audioFalls || []).map((x) => Object.assign({}, x));
  const usedAudio = new Set();
  const fused = [];

  for (const vf of v) {
    let best = -1, bestDt = Infinity;
    for (let i = 0; i < a.length; i++) {
      if (usedAudio.has(i)) continue;
      const dt = Math.abs(a[i].timestamp_ms - vf.timestamp_ms);
      if (dt <= windowMs && dt < bestDt) { best = i; bestDt = dt; }
    }
    if (best >= 0) {
      usedAudio.add(best);
      const af = a[best];
      fused.push({
        timestamp_ms: Math.round((vf.timestamp_ms + af.timestamp_ms) / 2),
        extremidad: vf.extremidad,
        intensidad_db: af.intensidad_db != null ? af.intensidad_db : vf.intensidad_db,
        duracion_contacto_ms: af.duracion_contacto_ms != null ? af.duracion_contacto_ms : vf.duracion_contacto_ms,
        detectada_por_video: true,
        detectada_por_audio: true,
        confianza: Math.min(1, Number(((vf.confianza + af.confianza) / 2 + 0.2).toFixed(3)))
      });
    } else {
      fused.push(vf);
    }
  }
  // Golpes de audio sin pareja de video (p. ej. audio-only).
  for (let i = 0; i < a.length; i++) if (!usedAudio.has(i)) fused.push(a[i]);

  fused.sort((x, y) => x.timestamp_ms - y.timestamp_ms);
  return fused;
}

// Asigna intervalo_anterior_ms y orden_secuencia (1..4 dentro de cada ciclo:
// el ciclo se reinicia cuando una extremidad ya vista vuelve a aparecer).
function sequenceAndIntervals(pisadas) {
  const ps = pisadas.slice().sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  let seenInCycle = new Set();
  let orden = 0;
  for (let i = 0; i < ps.length; i++) {
    ps[i].intervalo_anterior_ms = i === 0 ? null : (ps[i].timestamp_ms - ps[i - 1].timestamp_ms);
    const ext = ps[i].extremidad;
    if (ext && seenInCycle.has(ext)) { seenInCycle = new Set(); orden = 0; }
    orden += 1;
    ps[i].orden_secuencia = ((orden - 1) % 4) + 1;
    if (ext) seenInCycle.add(ext);
  }
  return ps;
}

module.exports = {
  detectVideoFootfalls,
  detectAudioFootfalls,
  fuse,
  sequenceAndIntervals,
  EXTREMIDADES
};
