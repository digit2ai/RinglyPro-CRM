// =====================================================
// generate-instrumental.js — the Instrumental Music family (27 tracks).
//
// Original synthesized pieces in the idiom of each instrument. Nothing here
// samples or reproduces a commercial recording; the artist names in the design
// brief were a reference for timbre and tempo only, and no artist or album name
// appears in the shipped product. See lib-instruments.js.
//
// Run (from the repo root, only when the library changes):
//   /opt/homebrew/bin/node client-builds/aplicacion-de-sueno-con-musica-personali/tools/generate-instrumental.js
//
// Requires ffmpeg on PATH (build-time only). Output: public/audio/*.mp3.
// =====================================================

'use strict';

const path = require('path');
const {
  SR, mulberry32, whiteNoise, onePoleLowpass, onePoleHighpass, brownNoise,
  wrapCrossfade, peakNormalize, wrapAddStereo, integerize, makeEncoder,
} = require('./lib-dsp');
const {
  pluckVoice, struckVoice, blownVoice, bowedVoice, pianoVoice, renderPerformance, fadeTail,
} = require('./lib-instruments');

const OUT_DIR = path.join(__dirname, '..', 'public', 'audio');
const enc = makeEncoder(OUT_DIR, 'sueno-instrumental-build');

// --- scales, each the one the tradition actually uses -----------------------
const SCALES = {
  // Kurd D minor — by far the most common handpan tuning
  kurd: [146.83, 220.00, 233.08, 261.63, 293.66, 329.63, 349.23, 440.00],
  akebono: [146.83, 164.81, 174.61, 220.00, 233.08, 293.66],      // steel tongue drum
  andean: [220.00, 261.63, 293.66, 329.63, 392.00, 440.00],        // minor pentatonic
  naFlute: [185.00, 220.00, 246.94, 277.18, 329.63, 370.00],       // F# minor pentatonic
  shaku: [146.83, 174.61, 196.00, 220.00, 261.63, 293.66],         // ro-tsu-re-chi-ri
  bhupali: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25],       // bansuri raga
  dMajor: [146.83, 164.81, 185.00, 196.00, 220.00, 246.94, 277.18, 293.66],
  phrygian: [164.81, 174.61, 207.65, 220.00, 246.94, 261.63, 293.66],  // Spanish
  gPenta: [196.00, 220.00, 246.94, 293.66, 329.63, 392.00, 440.00],
  dMinorLong: [110.00, 146.83, 174.61, 196.00, 220.00, 233.08],     // cello
  guqin: [130.81, 146.83, 174.61, 196.00, 220.00, 261.63],
  hirajoshi: [146.83, 155.56, 196.00, 220.00, 233.08, 293.66],      // koto
  aMinor: [110.00, 130.81, 164.81, 196.00, 220.00, 261.63, 329.63],
  pelog: [147.00, 157.00, 196.00, 220.00, 262.00, 294.00],          // gamelan
  huzzam: [220.00, 233.08, 277.18, 293.66, 329.63, 349.23],         // ney makam
  cPenta: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25],
  hijaz: [146.83, 155.56, 185.00, 196.00, 220.00, 233.08, 261.63],  // oud maqam
  duduk: [220.00, 246.94, 261.63, 293.66, 329.63, 349.23],
};

// --- reusable beds ----------------------------------------------------------
function rainBed(D, rnd, lowHz, highHz, gain) {
  const T = 3 * SR;
  let bed = onePoleLowpass(whiteNoise(D + T, rnd), lowHz);
  bed = onePoleHighpass(bed, highHz);
  const y = new Float64Array(D + T);
  for (let i = 0; i < D + T; i++) {
    const t = i / SR;
    const gust = 0.80 + 0.20 * Math.sin(2 * Math.PI * t / 17) * Math.sin(2 * Math.PI * t / 6.5);
    y[i] = bed[i] * gust * gain;
  }
  return wrapCrossfade(y, D, T);
}

function forestBed(D, seed) {
  const T = 4 * SR;
  const wind = onePoleLowpass(brownNoise(D + T, mulberry32(seed), 0.9990), 420);
  const leaves = onePoleHighpass(onePoleLowpass(whiteNoise(D + T, mulberry32(seed + 1)), 7000), 2600);
  const y = new Float64Array(D + T);
  for (let i = 0; i < D + T; i++) {
    const t = i / SR;
    const g = Math.max(0, 0.55 + 0.45 * Math.sin(2 * Math.PI * t / 21.3) * Math.cos(2 * Math.PI * t / 8.1));
    y[i] = wind[i] * (0.5 + 0.5 * g) * 8 + leaves[i] * Math.pow(g, 2) * 1.1;
  }
  return wrapCrossfade(y, D, T);
}

// Distant thunder: a low rumble that swells and rolls away.
function thunder(seconds, seed) {
  const n = Math.floor(seconds * SR);
  const low = onePoleLowpass(brownNoise(n, mulberry32(seed), 0.9994), 120);
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.pow(Math.min(1, t / 0.5), 2) * Math.exp(-Math.max(0, t - 0.5) / (seconds * 0.32));
    y[k] = low[k] * env * 14;
  }
  return fadeTail(y, 0.2);
}

function mixBed(chans, bed, gainL, gainR) {
  for (let i = 0; i < chans[0].length; i++) {
    chans[0][i] += bed[i] * gainL;
    chans[1][i] += bed[i] * (gainR == null ? gainL * 0.97 : gainR);
  }
}

// =====================================================
// HANDPAN AND METAL RESONANCE
// =====================================================
// Handpans are tuned so each tonefield rings 1:2:3 — harmonic, unlike a bowl,
// which is exactly why they sound melodic rather than atmospheric.
const HANDPAN = struckVoice({ ratios: [1, 2, 3, 4.6, 6.9], decayScale: 0.30, beat: 0.45, attackMs: 5, tilt: 1.5 });
const TONGUE = struckVoice({ ratios: [1, 2.4, 4.1], decayScale: 0.26, beat: 0.3, attackMs: 24, tilt: 1.7 });
const GONG = struckVoice({ ratios: [1, 1.42, 1.88, 2.31, 2.9, 3.7, 4.63], decayScale: 0.44, beat: 1.7, attackMs: 380, tilt: 1.2 });
const GAMELAN = struckVoice({ ratios: [1, 2.4, 4.6, 7.1], decayScale: 0.22, beat: 6.5, attackMs: 4, tilt: 1.4 });
const MARIMBA = struckVoice({ ratios: [1, 3.9, 9.2], decayScale: 0.07, beat: 0, attackMs: 3, tilt: 1.9 });
const VIBRAPHONE = struckVoice({ ratios: [1, 4, 10], decayScale: 0.34, beat: 0, attackMs: 4, tilt: 1.8, tremoloHz: 5.2 });
const KALIMBA = pluckVoice({ loopGain: 0.9905, lossAlpha: 0.62, bright: 6200, inharm: 0.10 });
const DULCIMER = pluckVoice({ loopGain: 0.9975, lossAlpha: 0.55, bright: 5200, bodyGain: 0.06 });

enc('handpan-kurd', renderPerformance({
  seconds: 48, seed: 50501, voice: HANDPAN, scale: SCALES.kurd,
  every: 1.9, jitter: 0.35, durMin: 7, durMax: 11, ampMin: 0.24, ampMax: 0.40,
  panSpread: 0.5, restProb: 0.16, octaveUpProb: 0.14, peak: 0.80,
}), '112k');

enc('tambor-de-lengua', renderPerformance({
  seconds: 48, seed: 50502, voice: TONGUE, scale: SCALES.akebono,
  every: 2.4, jitter: 0.4, durMin: 6, durMax: 9, ampMin: 0.26, ampMax: 0.42,
  panSpread: 0.42, restProb: 0.20, leap: 0.7, peak: 0.78,
}), '112k');

enc('gongs-lentos', renderPerformance({
  seconds: 64, seed: 50503, voice: GONG, scale: [98.00, 110.00, 130.81, 146.83],
  every: 9.5, jitter: 1.6, durMin: 20, durMax: 28, ampMin: 0.30, ampMax: 0.46,
  panSpread: 0.5, leap: 0.6, drone: { freqs: [65.41], amp: 0.055 }, peak: 0.80,
}), '112k');

enc('kalimba', renderPerformance({
  seconds: 48, seed: 50504, voice: KALIMBA, scale: SCALES.gPenta,
  every: 0.62, jitter: 0.06, durMin: 2.4, durMax: 3.6, ampMin: 0.20, ampMax: 0.34,
  panSpread: 0.46, restProb: 0.12, leap: 0.8, octaveUpProb: 0.10, peak: 0.76,
}), '112k');

enc('dulcimer-martillado', renderPerformance({
  seconds: 48, seed: 50505, voice: DULCIMER, scale: SCALES.dMajor,
  every: 0.85, jitter: 0.08, durMin: 3.5, durMax: 5.5, ampMin: 0.16, ampMax: 0.27,
  // The paired courses of a dulcimer: the same note struck twice, a hair apart.
  doubleInterval: 1.003, doubleProb: 0.9, doubleDelay: 0.012, doubleAmp: 0.8,
  panSpread: 0.5, restProb: 0.10, leap: 0.8, peak: 0.76,
}), '112k');

// =====================================================
// WIND AND FLUTE
// =====================================================
const QUENA = blownVoice({ harm: [1, 0.28, 0.12, 0.05], breath: 0.44, vibDepth: 0.010, vibRate: 5.5, vibOnset: 0.5, attack: 0.07, chiff: 0.5 });
const ZAMPONA = blownVoice({ harm: [1, 0.18, 0.06], breath: 0.62, vibDepth: 0.006, vibRate: 4.8, vibOnset: 0.6, attack: 0.13, chiff: 0.6 });
const NA_FLUTE = blownVoice({ harm: [1, 0.22, 0.08, 0.03], breath: 0.34, vibDepth: 0.006, vibRate: 4.6, vibOnset: 0.9, attack: 0.11, chiff: 0.3 });
const SHAKUHACHI = blownVoice({ harm: [1, 0.34, 0.16, 0.09], breath: 0.74, vibDepth: 0.004, vibRate: 4.2, vibOnset: 1.6, attack: 0.22, chiff: 0.55, bendSemis: -0.7, bendTime: 0.45 });
const BANSURI = blownVoice({ harm: [1, 0.26, 0.10, 0.04], breath: 0.30, vibDepth: 0.012, vibRate: 5.8, vibOnset: 0.7, attack: 0.18, chiff: 0.22, bendSemis: -1.6, bendTime: 0.55 });
const WHISTLE = blownVoice({ harm: [1, 0.30, 0.14, 0.06], breath: 0.42, vibDepth: 0.005, vibRate: 5.0, vibOnset: 0.6, attack: 0.05, chiff: 0.45 });
const NEY = blownVoice({ harm: [1, 0.40, 0.20, 0.10], breath: 0.82, vibDepth: 0.008, vibRate: 4.4, vibOnset: 1.2, attack: 0.25, chiff: 0.6 });
const DUDUK = blownVoice({ harm: [1, 0.55, 0.32, 0.18, 0.10], breath: 0.20, vibDepth: 0.016, vibRate: 5.2, vibOnset: 0.4, attack: 0.13, chiff: 0.15 });

enc('quena-andina', renderPerformance({
  seconds: 48, seed: 50511, voice: QUENA, scale: SCALES.andean,
  every: 2.6, jitter: 0.3, durMin: 2.4, durMax: 4.2, ampMin: 0.26, ampMax: 0.40,
  panSpread: 0.30, restProb: 0.14, leap: 0.9, graceProb: 0.20, peak: 0.78,
}), '112k');

enc('zampona-panpipes', renderPerformance({
  seconds: 48, seed: 50512, voice: ZAMPONA, scale: SCALES.andean,
  every: 3.0, jitter: 0.35, durMin: 2.8, durMax: 4.6, ampMin: 0.24, ampMax: 0.36,
  // Panpipe traditions double in octaves; that is the sound of a zampoña bank.
  doubleInterval: 2, doubleProb: 0.75, doubleDelay: 0.03, doubleAmp: 0.42,
  panSpread: 0.55, restProb: 0.16, leap: 0.8, peak: 0.78,
}), '112k');

enc('flauta-nativa-americana', renderPerformance({
  seconds: 64, seed: 50513, voice: NA_FLUTE, scale: SCALES.naFlute,
  every: 3.4, jitter: 0.5, durMin: 3.0, durMax: 5.5, ampMin: 0.26, ampMax: 0.40,
  panSpread: 0.28, restProb: 0.20, leap: 0.8, graceProb: 0.26, peak: 0.78,
}), '112k');

enc('shakuhachi', renderPerformance({
  seconds: 64, seed: 50514, voice: SHAKUHACHI, scale: SCALES.shaku,
  // Long tones with real silence between them — the form is built on the rests.
  every: 5.2, jitter: 0.8, durMin: 4.5, durMax: 8.0, ampMin: 0.28, ampMax: 0.42,
  panSpread: 0.24, restProb: 0.24, leap: 0.7, peak: 0.78,
}), '112k');

enc('bansuri-alap', renderPerformance({
  seconds: 64, seed: 50515, voice: BANSURI, scale: SCALES.bhupali,
  every: 4.0, jitter: 0.6, durMin: 3.5, durMax: 6.5, ampMin: 0.22, ampMax: 0.34,
  panSpread: 0.26, restProb: 0.16, leap: 0.7, graceProb: 0.18,
  // The tanpura underneath an alap: tonic and fifth, never moving.
  drone: { freqs: [130.81, 196.00], amp: 0.045 }, peak: 0.76,
}), '112k');

enc('silbato-irlandes', renderPerformance({
  seconds: 48, seed: 50516, voice: WHISTLE, scale: SCALES.dMajor,
  every: 2.2, jitter: 0.25, durMin: 2.0, durMax: 3.6, ampMin: 0.24, ampMax: 0.36,
  panSpread: 0.30, restProb: 0.12, leap: 0.9, graceProb: 0.34, peak: 0.78,
}), '112k');

// =====================================================
// STRINGS
// =====================================================
const GUITAR = pluckVoice({ loopGain: 0.9972, lossAlpha: 0.50, bright: 2600, bodyGain: 0.09 });
const HARP = pluckVoice({ loopGain: 0.9984, lossAlpha: 0.46, bright: 3400, bodyGain: 0.05 });
const KOTO = pluckVoice({ loopGain: 0.9960, lossAlpha: 0.58, bright: 4600, bodyGain: 0.07 });
const GUQIN = pluckVoice({ loopGain: 0.9990, lossAlpha: 0.38, bright: 1700, bodyGain: 0.04 });
const OUD = pluckVoice({ loopGain: 0.9945, lossAlpha: 0.54, bright: 3100, bodyGain: 0.10 });
const CELLO = bowedVoice({ harm: [1, 0.5, 0.32, 0.18, 0.10, 0.06], attack: 0.8, vibDepth: 0.008, vibRate: 4.8, bowNoise: 0.055 });

enc('guitarra-espanola', renderPerformance({
  seconds: 48, seed: 50521, voice: GUITAR, scale: SCALES.phrygian,
  every: 1.1, jitter: 0.12, durMin: 3.5, durMax: 5.5, ampMin: 0.22, ampMax: 0.36,
  panSpread: 0.34, restProb: 0.14, leap: 0.8, peak: 0.78,
}), '112k');

enc('arpa-celta', renderPerformance({
  seconds: 48, seed: 50522, voice: HARP, scale: SCALES.gPenta,
  every: 0.78, jitter: 0.07, durMin: 4.0, durMax: 6.5, ampMin: 0.17, ampMax: 0.28,
  panSpread: 0.50, restProb: 0.08, leap: 1.0, octaveUpProb: 0.14, peak: 0.76,
}), '112k');

enc('cello-ambiental', renderPerformance({
  seconds: 64, seed: 50523, voice: CELLO, scale: SCALES.dMinorLong,
  every: 5.5, jitter: 0.7, durMin: 7.0, durMax: 11.0, ampMin: 0.20, ampMax: 0.30,
  panSpread: 0.30, leap: 0.6, drone: { freqs: [73.42], amp: 0.05 }, peak: 0.76,
}), '112k');

enc('guqin', renderPerformance({
  seconds: 64, seed: 50524, voice: GUQIN, scale: SCALES.guqin,
  // A guqin piece is mostly silence. High restProb is the instrument, not a bug.
  every: 4.6, jitter: 1.0, durMin: 5.0, durMax: 9.0, ampMin: 0.16, ampMax: 0.26,
  panSpread: 0.22, restProb: 0.34, leap: 0.6, peak: 0.62,
}), '96k');

enc('koto', renderPerformance({
  seconds: 48, seed: 50525, voice: KOTO, scale: SCALES.hirajoshi,
  every: 1.5, jitter: 0.18, durMin: 3.0, durMax: 5.0, ampMin: 0.22, ampMax: 0.34,
  panSpread: 0.40, restProb: 0.16, leap: 0.9, graceProb: 0.12, peak: 0.78,
}), '112k');

// =====================================================
// PIANO AND ATMOSPHERIC
// =====================================================
const FELT_PIANO = pianoVoice({ inharmonicity: 0.00042, partials: 5, tilt: 2.0, keyNoise: 0.06 });
const CLEAR_PIANO = pianoVoice({ inharmonicity: 0.00038, partials: 7, tilt: 1.7, keyNoise: 0.03 });

enc('piano-de-fieltro', renderPerformance({
  seconds: 64, seed: 50531, voice: FELT_PIANO, scale: SCALES.aMinor,
  every: 1.6, jitter: 0.2, durMin: 6.0, durMax: 9.0, ampMin: 0.20, ampMax: 0.32,
  panSpread: 0.38, restProb: 0.14, leap: 0.8, octaveUpProb: 0.12, peak: 0.76,
}), '112k');

// "In the manner of" a slow 3/4 piano piece — an original melody, not a
// transcription, so nothing is misattributed to a historical composer.
enc('piano-lento', renderPerformance({
  seconds: 64, seed: 50532, voice: CLEAR_PIANO, scale: [110.00, 164.81, 196.00, 220.00, 261.63, 329.63, 392.00],
  every: 2.0, jitter: 0.12, durMin: 5.0, durMax: 8.0, ampMin: 0.18, ampMax: 0.28,
  doubleInterval: 0.5, doubleProb: 0.30, doubleDelay: 0.0, doubleAmp: 0.55,
  panSpread: 0.30, restProb: 0.10, leap: 0.7, peak: 0.76,
}), '112k');

// Slow ambient: detuned sine layers, each drifting on its own clock, so the
// texture never lands in the same place twice within the loop.
function ambientePad(seconds) {
  const D = seconds * SR;
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  const base = [110.00, 164.81, 220.00, 277.18, 329.63, 440.00];
  base.forEach((f0, i) => {
    const f = integerize(f0, seconds);
    const det = integerize(f0 * 1.0035, seconds);
    const lfo = seconds / (2 + i);            // divides the loop => wraps clean
    const amp = 0.13 / Math.pow(i + 1, 0.35);
    for (let k = 0; k < D; k++) {
      const t = k / SR;
      const g = amp * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t / lfo + i)));
      const a = Math.sin(2 * Math.PI * f * t) * g;
      const b = Math.sin(2 * Math.PI * det * t) * g;
      L[k] += a * 0.75 + b * 0.25;
      R[k] += a * 0.25 + b * 0.75;
    }
  });
  const air = wrapCrossfade(onePoleLowpass(brownNoise(D + 3 * SR, mulberry32(50533), 0.998), 800), D, 3 * SR);
  let peak = 0;
  for (let i = 0; i < D; i++) peak = Math.max(peak, Math.abs(air[i]));
  const g = peak > 0 ? 0.10 / peak : 0;
  mixBed([L, R], air, g);
  peakNormalize([L, R], 0.74);
  return [L, R];
}
enc('ambiente-lento', ambientePad(64), '112k');

// =====================================================
// WORLD
// =====================================================
enc('gamelan-ceremonial', renderPerformance({
  seconds: 48, seed: 50541, voice: GAMELAN, scale: SCALES.pelog,
  every: 1.7, jitter: 0.22, durMin: 5.0, durMax: 8.0, ampMin: 0.20, ampMax: 0.32,
  // Paired instruments tuned a few hertz apart produce the ombak, the "wave"
  // shimmer that defines a gamelan ensemble.
  doubleInterval: 1.006, doubleProb: 1, doubleDelay: 0.006, doubleAmp: 0.85,
  panSpread: 0.52, restProb: 0.14, leap: 0.8, drone: { freqs: [73.50], amp: 0.04 }, peak: 0.78,
}), '112k');

enc('ney-sufi', renderPerformance({
  seconds: 64, seed: 50542, voice: NEY, scale: SCALES.huzzam,
  every: 4.8, jitter: 0.7, durMin: 4.0, durMax: 7.0, ampMin: 0.26, ampMax: 0.38,
  panSpread: 0.26, restProb: 0.22, leap: 0.7, drone: { freqs: [110.00], amp: 0.04 }, peak: 0.78,
}), '112k');

// Hurdy-gurdy: a continuous wheel drone plus the buzzing bridge, which pulses
// with the crank rather than with any melody.
function zanfona(seconds) {
  const melody = renderPerformance({
    seconds, seed: 50543, voice: bowedVoice({ harm: [1, 0.62, 0.38, 0.22, 0.12], attack: 0.35, vibDepth: 0.004, vibRate: 4.0, bowNoise: 0.10 }),
    scale: [196.00, 220.00, 246.94, 293.66, 329.63, 392.00],
    every: 2.6, jitter: 0.3, durMin: 3.0, durMax: 5.0, ampMin: 0.20, ampMax: 0.30,
    panSpread: 0.30, restProb: 0.16, leap: 0.8, normalize: false,
  });
  const D = melody[0].length;
  const dGs = [integerize(98.00, seconds), integerize(146.83, seconds), integerize(196.00, seconds)];
  for (let k = 0; k < D; k++) {
    const t = k / SR;
    // The crank turns at about 2.6 Hz; the bridge buzzes on each rotation.
    const crank = 0.86 + 0.14 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * 2.6 * t), 3);
    let v = 0;
    for (const f of dGs) {
      v += (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 2 * t) * 0.30
        + Math.sin(2 * Math.PI * f * 3 * t) * 0.16) * 0.075;
    }
    v *= crank;
    melody[0][k] += v; melody[1][k] += v * 0.96;
  }
  peakNormalize(melody, 0.78);
  return melody;
}
enc('zanfona-drone', zanfona(48), '112k');

enc('marimba-y-vibrafono', (() => {
  const a = renderPerformance({
    seconds: 48, seed: 50544, voice: MARIMBA, scale: SCALES.cPenta,
    every: 0.72, jitter: 0.07, durMin: 1.2, durMax: 1.8, ampMin: 0.22, ampMax: 0.34,
    panSpread: 0.46, restProb: 0.14, leap: 0.9, normalize: false,
  });
  const b = renderPerformance({
    seconds: 48, seed: 50545, voice: VIBRAPHONE, scale: SCALES.cPenta,
    every: 2.9, jitter: 0.4, durMin: 5.5, durMax: 8.5, ampMin: 0.20, ampMax: 0.30,
    panSpread: 0.5, restProb: 0.12, leap: 0.7, normalize: false,
  });
  for (let i = 0; i < a[0].length; i++) { a[0][i] += b[0][i]; a[1][i] += b[1][i]; }
  peakNormalize(a, 0.78);
  return a;
})(), '112k');

enc('oud-taqsim', renderPerformance({
  seconds: 48, seed: 50546, voice: OUD, scale: SCALES.hijaz,
  every: 1.25, jitter: 0.18, durMin: 2.5, durMax: 4.0, ampMin: 0.22, ampMax: 0.36,
  panSpread: 0.30, restProb: 0.20, leap: 0.9, drone: { freqs: [73.42], amp: 0.035 }, peak: 0.78,
}), '112k');

enc('duduk', renderPerformance({
  seconds: 64, seed: 50547, voice: DUDUK, scale: SCALES.duduk,
  every: 4.2, jitter: 0.6, durMin: 3.5, durMax: 6.0, ampMin: 0.24, ampMax: 0.36,
  panSpread: 0.24, restProb: 0.18, leap: 0.7,
  // A duduk is nearly always played over a second duduk holding the tonic.
  drone: { freqs: [110.00], amp: 0.055 }, peak: 0.78,
}), '112k');

// =====================================================
// NATURE-BLENDED
// =====================================================
// Wind chimes: struck metal tubes, played by the wind rather than a person, so
// the strikes cluster in gusts instead of arriving on a grid.
function campanasDeViento(seconds) {
  const D = seconds * SR;
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  const chime = struckVoice({ ratios: [1, 2.76, 5.40, 8.93], decayScale: 0.30, beat: 0.6, attackMs: 4, tilt: 1.7 });
  const rnd = mulberry32(50551);
  const tubes = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
  const gusts = Math.round(seconds / 6);
  for (let g = 0; g < gusts; g++) {
    const at = (g * seconds) / gusts + (rnd() - 0.5) * 2.0;
    const hits = 3 + Math.floor(rnd() * 6);
    for (let h = 0; h < hits; h++) {
      const off = at + rnd() * 2.4;
      const f = tubes[Math.floor(rnd() * tubes.length)];
      wrapAddStereo(L, R, Math.floor(off * SR),
        chime(f, 3.5 + rnd() * 2, 0.10 + rnd() * 0.12, mulberry32(50552 + g * 31 + h)),
        rnd());
    }
  }
  mixBed([L, R], forestBed(D, 50553), 0.95, 0.90);
  peakNormalize([L, R], 0.78);
  return [L, R];
}
enc('campanas-de-viento', campanasDeViento(64), '112k');

// Handpan under light rain with thunder well in the distance.
function handpanYLluvia(seconds) {
  const out = renderPerformance({
    seconds, seed: 50561, voice: HANDPAN, scale: SCALES.kurd,
    every: 2.6, jitter: 0.4, durMin: 7, durMax: 11, ampMin: 0.20, ampMax: 0.32,
    panSpread: 0.46, restProb: 0.22, leap: 0.8, normalize: false,
  });
  const D = out[0].length;
  mixBed(out, rainBed(D, mulberry32(50562), 2200, 260, 2.6), 0.60);
  const rnd = mulberry32(50563);
  for (let i = 0; i < Math.max(1, Math.round(seconds / 22)); i++) {
    wrapAddStereo(out[0], out[1], Math.floor(rnd() * seconds * SR),
      thunder(6 + rnd() * 3, 50564 + i), 0.5 + (rnd() - 0.5) * 0.3);
  }
  peakNormalize(out, 0.80);
  return out;
}
enc('handpan-y-lluvia', handpanYLluvia(64), '112k');

console.log('Done.');
