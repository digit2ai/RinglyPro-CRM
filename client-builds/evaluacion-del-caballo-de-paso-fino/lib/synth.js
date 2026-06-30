// =====================================================
// Synth — generador de marchas sintéticas (footfalls + pose frames).
//
// Una SOLA fuente de verdad para:
//   - los tests del clasificador (sección 4.5): secuencias de pisadas con el
//     patrón de cada modalidad y jitter configurable (para subir el CV).
//   - el "modo demostración" de la UI: cuando no hay pose estimation real de
//     caballo disponible en el navegador, se sintetizan keypoints plausibles
//     para la modalidad inscrita y el pipeline REAL corre de punta a punta.
//
// Patrones de apoyo (extremidad: ant_izq/ant_der/post_izq/post_der):
//   paso_fino   -> 4 tiempos LATERALES: post_izq, ant_izq, post_der, ant_der
//   trocha      -> 4 tiempos DIAGONALES: post_izq, ant_der, post_der, ant_izq
//   trote       -> 2 tiempos: pares diagonales simultáneos
//   galope      -> 3 tiempos: post_izq, {post_der+ant_izq}, ant_der
//
// Coordenadas de imagen: y CRECE hacia abajo; el casco toca el suelo en el
// MÁXIMO local de y. Entre apoyos el casco se eleva (y menor).
// =====================================================

'use strict';

const { CASCOS } = require('./anatomy');

// Patrón de un ciclo: lista de "beats", cada beat = una o más extremidades que
// apoyan (casi) simultáneamente. offsetFrac posiciona cada beat dentro del ciclo.
const PATRONES = {
  paso_fino: { tiempos: 4, beats: [['post_izq'], ['ant_izq'], ['post_der'], ['ant_der']] },
  trocha:    { tiempos: 4, beats: [['post_izq'], ['ant_der'], ['post_der'], ['ant_izq']] },
  trote:     { tiempos: 2, beats: [['post_izq', 'ant_der'], ['post_der', 'ant_izq']] },
  galope:    { tiempos: 3, beats: [['post_izq'], ['post_der', 'ant_izq'], ['ant_der']] }
};

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Genera la secuencia de pisadas (timestamp_ms + extremidad) para `ciclos`
// ciclos de la modalidad. cycleMs = duración de un ciclo. jitter (0..1) añade
// variación relativa al intervalo entre beats (sube el coeficiente de variación).
//   pisadas: [{ timestamp_ms, extremidad }]
function syntheticPisadas(modalidad, opts = {}) {
  const P = PATRONES[modalidad] || PATRONES.paso_fino;
  const ciclos = opts.ciclos || 5;
  const cycleMs = opts.cycleMs || 1000;       // 1 s/ciclo
  const jitter = opts.jitter || 0;            // 0 = perfecto; ~0.4 = muy irregular
  const pairMs = opts.pairMs != null ? opts.pairMs : 8; // separación dentro de un par diagonal
  const rnd = mulberry(opts.seed || 12345);

  const nBeats = P.beats.length;
  const beatGap = cycleMs / nBeats;
  const pisadas = [];
  let t = 200; // arranque
  for (let c = 0; c < ciclos; c++) {
    for (let b = 0; b < nBeats; b++) {
      // Jitter simétrico sobre el instante del beat.
      const j = jitter ? (rnd() - 0.5) * 2 * jitter * beatGap : 0;
      const beatT = t + j;
      const limbs = P.beats[b];
      for (let k = 0; k < limbs.length; k++) {
        pisadas.push({ timestamp_ms: Math.round(beatT + k * pairMs), extremidad: limbs[k] });
      }
      t += beatGap;
    }
  }
  pisadas.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  return pisadas;
}

// Genera frames de pose (30 fps) cuyos cascos tocan el suelo en cada pisada.
// Cada casco sube (y menor) entre sus apoyos y vuelve al suelo (y máximo) en el
// instante de contacto, de modo que footfall.detectVideoFootfalls recupera las
// mismas pisadas — probando el camino de VIDEO end-to-end.
//   frames: [{ numero_frame, timestamp_ms, keypoints: { casco_*:{x,y,confianza} } }]
function syntheticFrames(modalidad, opts = {}) {
  const pisadas = syntheticPisadas(modalidad, opts);
  const fps = opts.fps || 30;
  const ground = 0.80;          // y del suelo (0..1, crece hacia abajo)
  const lift = opts.lift != null ? opts.lift : 0.12; // amplitud de elevación
  const dtMs = 1000 / fps;

  // Contactos por extremidad.
  const contactos = { ant_izq: [], ant_der: [], post_izq: [], post_der: [] };
  for (const p of pisadas) if (contactos[p.extremidad]) contactos[p.extremidad].push(p.timestamp_ms);
  for (const k of Object.keys(contactos)) contactos[k].sort((a, b) => a - b);

  const endMs = pisadas.length ? pisadas[pisadas.length - 1].timestamp_ms + 400 : 1000;
  const codigoPorExtremidad = {};
  for (const codigo of Object.keys(CASCOS)) codigoPorExtremidad[CASCOS[codigo]] = codigo;

  // y(t) para una extremidad: 0 de elevación en cada contacto, máxima elevación
  // a mitad entre contactos consecutivos (medio arco de seno).
  function yAt(ext, tms) {
    const cs = contactos[ext];
    if (!cs.length) return ground - lift; // siempre aéreo si no apoya nunca
    // Fuera del rango de contactos el casco está en fase de vuelo (aéreo), NO en
    // el suelo: así no genera mesetas planas que el detector confunda con apoyos.
    if (tms < cs[0] || tms > cs[cs.length - 1]) return ground - lift;
    let i = 0;
    while (i < cs.length - 1 && cs[i + 1] < tms) i++;
    const a = cs[i], b = cs[i + 1];
    if (b <= a) return ground;
    const phase = (tms - a) / (b - a); // 0..1
    return ground - lift * Math.sin(Math.PI * phase);
  }

  const frames = [];
  let n = 0;
  for (let tms = 0; tms <= endMs; tms += dtMs) {
    const keypoints = {};
    for (const ext of Object.keys(contactos)) {
      const codigo = codigoPorExtremidad[ext];
      // x avanza levemente con el tiempo (caballo en movimiento).
      const x = 0.5 + 0.0001 * tms + (ext.endsWith('_der') ? 0.04 : -0.04);
      keypoints[codigo] = { x: Number(x.toFixed(4)), y: Number(yAt(ext, tms).toFixed(4)), confianza: 0.9 };
    }
    frames.push({ numero_frame: n, timestamp_ms: Math.round(tms), keypoints });
    n++;
  }
  return frames;
}

// Onsets de audio (segundos) para una modalidad: un golpe por apoyo de casco.
// El audio NO distingue extremidad; solo el instante.
function syntheticAudioOnsets(modalidad, opts = {}) {
  const pisadas = syntheticPisadas(modalidad, opts);
  // Agrupa apoyos casi simultáneos (un golpe audible por beat).
  const onsets = [];
  let last = -Infinity;
  for (const p of pisadas) {
    if (p.timestamp_ms - last >= 30) { onsets.push(Number((p.timestamp_ms / 1000).toFixed(3))); last = p.timestamp_ms; }
  }
  return onsets;
}

module.exports = { PATRONES, syntheticPisadas, syntheticFrames, syntheticAudioOnsets };
