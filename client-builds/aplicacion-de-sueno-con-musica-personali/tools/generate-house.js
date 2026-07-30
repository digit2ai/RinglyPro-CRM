// =====================================================
// generate-house.js — the Electronic family: deep house (8 tracks).
//
// A different problem from the rest of the library. Everything else is free-time
// and loops seamlessly because the material has no pulse to disturb. Deep house
// has a pulse, so two things change:
//
//   1. LOOP LENGTH IS DERIVED FROM THE TEMPO, not chosen. A loop is exactly
//      `bars` bars at `bpm`, so the downbeat after the wrap lands where the next
//      downbeat would have. Everything is placed on a 16th-note grid.
//   2. MP3 ENCODER PADDING BECOMES AUDIBLE. Measured at ~25 ms on this encoder:
//      nothing in a rain bed, a clear hiccup in a groove. These tracks are
//      therefore flagged `gapless` in tracks.json, and the player decodes them
//      into an AudioBuffer and loops that instead of using <audio loop>.
//
// Original compositions, synthesized from scratch — no samples, no artist or
// album names. Run:
//   /opt/homebrew/bin/node client-builds/aplicacion-de-sueno-con-musica-personali/tools/generate-house.js
// =====================================================

'use strict';

const path = require('path');
const {
  SR, mulberry32, whiteNoise, onePoleLowpass, onePoleHighpass, brownNoise,
  wrapCrossfade, peakNormalize, wrapAddStereo, makeEncoder,
} = require('./lib-dsp');
const { fadeTail } = require('./lib-instruments');

const OUT_DIR = path.join(__dirname, '..', 'public', 'audio');
const enc = makeEncoder(OUT_DIR, 'sueno-house-build');

// --- note names -> frequency ------------------------------------------------
const SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function nf(name) {
  const m = /^([A-G]#?)(-?\d+)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  const midi = SEMI[m[1]] + (parseInt(m[2], 10) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// =====================================================
// DRUMS
// =====================================================

// The kick: a sine sweeping down from the attack pitch to the body pitch. That
// downward sweep in the first ~25 ms is the whole sound; without it you get a
// sine blip, not a kick.
function kick(amp, decay, fromHz, toHz) {
  const n = Math.floor(SR * (decay * 3.2));
  const y = new Float64Array(n);
  let phase = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const f = toHz + (fromHz - toHz) * Math.exp(-t / 0.020);
    phase += (2 * Math.PI * f) / SR;
    const env = Math.exp(-t / decay) * Math.min(1, t / 0.002);
    y[k] = Math.sin(phase) * env * amp;
  }
  // A touch of click so it reads on a phone speaker, not just on sub.
  const cN = Math.floor(SR * 0.004);
  const click = onePoleLowpass(whiteNoise(cN, mulberry32(9001)), 4200);
  for (let k = 0; k < cN; k++) y[k] += click[k] * Math.exp(-k / (cN * 0.3)) * amp * 0.35;
  return fadeTail(y, 0.08);
}

// Clap: several noise bursts a few milliseconds apart (many hands, not one),
// then a short diffuse tail.
function clap(amp, seed) {
  const n = Math.floor(SR * 0.34);
  const src = onePoleHighpass(onePoleLowpass(whiteNoise(n, mulberry32(seed)), 2600), 1100);
  const y = new Float64Array(n);
  const bursts = [0, 0.008, 0.017, 0.027];
  for (const b of bursts) {
    const off = Math.floor(b * SR);
    for (let k = 0; k + off < n; k++) {
      y[k + off] += src[k] * Math.exp(-k / (SR * 0.012)) * amp * 0.6;
    }
  }
  for (let k = 0; k < n; k++) {                       // the room behind it
    const t = k / SR;
    y[k] += src[k] * Math.exp(-Math.max(0, t - 0.03) / 0.075) * amp * 0.22;
  }
  return fadeTail(y, 0.1);
}

function hat(amp, decay, seed, bright) {
  const n = Math.floor(SR * decay * 4);
  const src = onePoleHighpass(whiteNoise(n, mulberry32(seed)), bright || 7000);
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) y[k] = src[k] * Math.exp(-(k / SR) / decay) * amp;
  return fadeTail(y, 0.12);
}

function shaker(amp, seed) {
  const n = Math.floor(SR * 0.11);
  const src = onePoleHighpass(onePoleLowpass(whiteNoise(n, mulberry32(seed)), 9000), 4200);
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    y[k] = src[k] * Math.pow(Math.sin(Math.PI * Math.min(1, t / 0.10)), 1.6) * amp;
  }
  return fadeTail(y, 0.15);
}

// Conga / tumba for the organic variants: a pitched membrane plus a slap.
function conga(f, amp, seed) {
  const n = Math.floor(SR * 0.30);
  const y = new Float64Array(n);
  const noise = onePoleHighpass(onePoleLowpass(whiteNoise(n, mulberry32(seed)), 3200), 400);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.exp(-t / 0.075);
    y[k] = (Math.sin(2 * Math.PI * f * t) * 0.85 + Math.sin(2 * Math.PI * f * 1.62 * t) * 0.25) * env * amp
      + noise[k] * Math.exp(-t / 0.012) * amp * 0.5;
  }
  return fadeTail(y, 0.1);
}

// =====================================================
// PITCHED PARTS
// =====================================================

// Sub bass: mostly fundamental, a little second harmonic so it survives a phone
// speaker, with a fast attack and a rounded release.
function bassNote(f, dur, amp) {
  const n = Math.floor(SR * dur);
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.006) * Math.exp(-t / (dur * 0.55));
    y[k] = (Math.sin(2 * Math.PI * f * t)
      + Math.sin(2 * Math.PI * f * 2 * t) * 0.18
      + Math.sin(2 * Math.PI * f * 3 * t) * 0.05) * env * amp;
  }
  return fadeTail(y, 0.1);
}

// Electric-piano chord tone: two-operator FM. The modulator index falling with
// the envelope is what gives a tine its bell-like attack and mellow tail.
function rhodesNote(f, dur, amp, seed) {
  const n = Math.floor(SR * dur);
  const y = new Float64Array(n);
  const rnd = mulberry32(seed);
  const drift = 1 + (rnd() - 0.5) * 0.0015;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / (dur * 0.34));
    const index = 2.6 * Math.exp(-t / 0.10);
    const mod = Math.sin(2 * Math.PI * f * 2 * drift * t) * index;
    // Slow tremolo, the way an electric piano sits in a mix.
    const trem = 0.9 + 0.1 * Math.sin(2 * Math.PI * 4.6 * t);
    y[k] = Math.sin(2 * Math.PI * f * drift * t + mod) * env * trem * amp;
  }
  return fadeTail(y, 0.08);
}

// Warm pad: detuned saw-ish stack through a lowpass, slow in and out.
function padChord(freqs, dur, amp, cutoff) {
  const n = Math.floor(SR * dur);
  const raw = new Float64Array(n);
  for (const f of freqs) {
    for (const det of [0.997, 1.0, 1.003]) {
      for (let k = 0; k < n; k++) {
        const t = k / SR;
        // Band-limited saw: a handful of harmonics, no aliasing.
        let s = 0;
        for (let h = 1; h <= 7; h++) {
          if (f * det * h > SR / 2.2) break;
          s += Math.sin(2 * Math.PI * f * det * h * t) / h;
        }
        raw[k] += s;
      }
    }
  }
  const filt = onePoleLowpass(raw, cutoff || 1600);
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.min(1, t / (dur * 0.28)) * Math.min(1, (dur - t) / (dur * 0.34));
    y[k] = filt[k] * Math.max(0, env) * amp;
  }
  return fadeTail(y, 0.12);
}

// =====================================================
// THE SEQUENCER
//
// Patterns are 16 characters = one bar of 16th notes. 'x' is a hit, '-' is a
// rest. The loop length comes from the tempo, so the grid is exact.
// =====================================================
function houseTrack(cfg) {
  const bpm = cfg.bpm;
  const bars = cfg.bars;
  const beat = 60 / bpm;                 // seconds per quarter note
  const step = beat / 4;                 // 16th note
  const barLen = beat * 4;
  const seconds = bars * barLen;
  const D = Math.round(seconds * SR);

  const drums = [new Float64Array(D), new Float64Array(D)];
  const tonal = [new Float64Array(D), new Float64Array(D)];   // ducked under the kick
  const rnd = mulberry32(cfg.seed);
  const kickTimes = [];

  const place = (bus, at, samples, pan) =>
    wrapAddStereo(bus[0], bus[1], Math.round(at * SR), samples, pan);

  const K = cfg.kick ? kick(cfg.kickAmp || 0.95, cfg.kickDecay || 0.14, cfg.kickFrom || 118, cfg.kickTo || 47) : null;

  for (let bar = 0; bar < bars; bar++) {
    const barAt = bar * barLen;
    const pat = (arr) => arr[bar % arr.length];

    for (let s = 0; s < 16; s++) {
      const at = barAt + s * step;

      if (K && pat(cfg.kickPat)[s] === 'x') { place(drums, at, K, 0.5); kickTimes.push(at); }
      if (cfg.clapPat && pat(cfg.clapPat)[s] === 'x') {
        place(drums, at, clap(cfg.clapAmp || 0.34, cfg.seed + 700 + s), 0.5 + (rnd() - 0.5) * 0.22);
      }
      if (cfg.hatPat && pat(cfg.hatPat)[s] === 'x') {
        const open = cfg.openPat && pat(cfg.openPat)[s] === 'x';
        place(drums, at, hat(open ? (cfg.hatAmp || 0.20) * 1.05 : (cfg.hatAmp || 0.20),
          open ? 0.16 : 0.026, cfg.seed + 900 + bar * 16 + s, cfg.hatBright),
        0.5 + (rnd() - 0.5) * 0.34);
      }
      if (cfg.shakerPat && pat(cfg.shakerPat)[s] === 'x') {
        place(drums, at, shaker(cfg.shakerAmp || 0.14, cfg.seed + 1300 + bar * 16 + s),
          0.5 + (rnd() - 0.5) * 0.5);
      }
      if (cfg.congaPat && pat(cfg.congaPat)[s] === 'x') {
        const f = cfg.congaTones[(bar * 16 + s) % cfg.congaTones.length];
        place(drums, at, conga(f, cfg.congaAmp || 0.22, cfg.seed + 1700 + bar * 16 + s),
          0.5 + (rnd() - 0.5) * 0.55);
      }
    }

    // --- harmony: one chord per bar, moving through the progression ---
    const prog = cfg.progression[bar % cfg.progression.length];

    if (cfg.pad) {
      place(tonal, barAt, padChord(prog.chord.map(nf), barLen * (cfg.padSustain || 1.05),
        cfg.padAmp || 0.10, cfg.padCutoff || 1500), 0.5);
    }

    if (cfg.chordPat) {
      const cp = pat(cfg.chordPat);
      for (let s = 0; s < 16; s++) {
        if (cp[s] !== 'x') continue;
        const at = barAt + s * step;
        // Spread the voices across the stereo field, low notes nearer centre.
        prog.chord.forEach((note, vi) => {
          const pan = 0.5 + ((vi / Math.max(1, prog.chord.length - 1)) - 0.5) * (cfg.chordSpread || 0.5);
          place(tonal, at, rhodesNote(nf(note), cfg.chordDur || beat * 1.6,
            (cfg.chordAmp || 0.20) / Math.pow(vi + 1, 0.25), cfg.seed + 2100 + bar * 97 + s * 7 + vi), pan);
        });
      }
    }

    if (cfg.bassPat) {
      const bp = pat(cfg.bassPat);
      for (let s = 0; s < 16; s++) {
        if (bp[s] !== 'x') continue;
        place(tonal, barAt + s * step,
          bassNote(nf(prog.bass), cfg.bassDur || step * 3.2, cfg.bassAmp || 0.42), 0.5);
      }
    }
  }

  // --- sidechain: the tonal bus dips under every kick ---
  // This is the pump that makes house feel like house, and it also stops the
  // bass and the kick fighting for the same headroom.
  if (kickTimes.length && cfg.duck !== false) {
    const depth = cfg.duckDepth == null ? 0.55 : cfg.duckDepth;
    const rel = cfg.duckRelease == null ? 0.10 : cfg.duckRelease;
    const win = Math.floor(SR * rel * 5);
    const gain = new Float64Array(D).fill(1);
    for (const kt of kickTimes) {
      const s0 = Math.round(kt * SR);
      for (let k = 0; k < win; k++) {
        const idx = ((s0 + k) % D + D) % D;
        const g = 1 - depth * Math.exp(-(k / SR) / rel);
        if (g < gain[idx]) gain[idx] = g;
      }
    }
    for (let c = 0; c < 2; c++) for (let i = 0; i < D; i++) tonal[c][i] *= gain[i];
  }

  const L = new Float64Array(D);
  const R = new Float64Array(D);
  for (let i = 0; i < D; i++) {
    L[i] = drums[0][i] + tonal[0][i];
    R[i] = drums[1][i] + tonal[1][i];
  }

  // --- optional texture beds ---
  if (cfg.vinyl) {
    // Tape/vinyl bed: filtered hiss plus occasional crackle. The lo-fi variant.
    const T = 2 * SR;
    const hiss = wrapCrossfade(onePoleHighpass(onePoleLowpass(whiteNoise(D + T, mulberry32(cfg.seed + 31)), 7000), 700), D, T);
    let pk = 0;
    for (let i = 0; i < D; i++) pk = Math.max(pk, Math.abs(hiss[i]));
    const hg = pk > 0 ? cfg.vinyl / pk : 0;
    for (let i = 0; i < D; i++) { L[i] += hiss[i] * hg; R[i] += hiss[i] * hg * 0.92; }
    const cr = mulberry32(cfg.seed + 37);
    for (let i = 0; i < Math.round(seconds * 9); i++) {
      const at = Math.floor(cr() * D);
      const len = Math.floor(SR * 0.004);
      for (let k = 0; k < len; k++) {
        const v = (cr() * 2 - 1) * Math.exp(-k / (len * 0.3)) * cfg.vinyl * 2.2;
        L[(at + k) % D] += v; R[(at + k) % D] += v * 0.8;
      }
    }
  }
  if (cfg.rain) {
    const T = 3 * SR;
    let bed = onePoleLowpass(whiteNoise(D + T, mulberry32(cfg.seed + 41)), 2400);
    bed = onePoleHighpass(bed, 300);
    const rainBed = wrapCrossfade(bed, D, T);
    let pk = 0;
    for (let i = 0; i < D; i++) pk = Math.max(pk, Math.abs(rainBed[i]));
    const g = pk > 0 ? cfg.rain / pk : 0;
    for (let i = 0; i < D; i++) { L[i] += rainBed[i] * g; R[i] += rainBed[i] * g * 0.96; }
  }
  if (cfg.subDrone) {
    // Integer cycles over the loop so the sub wraps without a click.
    const f = Math.max(1, Math.round(nf(cfg.subDrone) * seconds)) / seconds;
    for (let i = 0; i < D; i++) {
      const t = i / SR;
      const v = Math.sin(2 * Math.PI * f * t) * (cfg.subDroneAmp || 0.08);
      L[i] += v; R[i] += v;
    }
  }

  peakNormalize([L, R], cfg.peak || 0.84);
  console.log(`    (${bars} bars @ ${bpm} BPM = ${seconds.toFixed(3)}s, ${kickTimes.length} kicks)`);
  return [L, R];
}

// =====================================================
// PROGRESSIONS — ninth and seventh voicings, the deep-house vocabulary
// =====================================================
const PROG_AMIN = [
  { chord: ['A3', 'C4', 'E4', 'G4', 'B4'], bass: 'A1' },   // Am9
  { chord: ['D3', 'F3', 'A3', 'C4', 'E4'], bass: 'D1' },   // Dm9
  { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F1' },         // Fmaj7
  { chord: ['E3', 'G3', 'B3', 'D4'], bass: 'E1' },         // Em7
];
const PROG_FMIN = [
  { chord: ['F3', 'A3', 'C4', 'E4', 'G4'], bass: 'F1' },
  { chord: ['A#3', 'D4', 'F4', 'A4'], bass: 'A#1' },
  { chord: ['D#3', 'G3', 'A#3', 'D4'], bass: 'D#1' },
  { chord: ['C3', 'D#3', 'G3', 'A#3'], bass: 'C1' },
];
const PROG_SOUL = [
  { chord: ['D3', 'F3', 'A3', 'C4', 'E4'], bass: 'D1' },   // Dm9
  { chord: ['G3', 'B3', 'D4', 'F4'], bass: 'G1' },         // G7
  { chord: ['C3', 'E3', 'G3', 'B3', 'D4'], bass: 'C1' },   // Cmaj9
  { chord: ['A3', 'C4', 'E4', 'G4'], bass: 'A1' },         // Am7
];

// Four-on-the-floor, off-beat hats, clap on 2 and 4. The grammar of the genre.
const FOUR = ['x---x---x---x---'];
const HAT_OFF = ['--x---x---x---x-'];
const HAT_16 = ['--x-x-x---x-x-x-'];
const CLAP_24 = ['----x-------x---'];
const OPEN_OFF = ['------x-------x-'];

console.log('Generating deep house ->', OUT_DIR);

// 1. Classic deep house
enc('deep-house-clasico', houseTrack({
  seed: 60001, bpm: 122, bars: 16, kick: true, progression: PROG_AMIN,
  kickPat: FOUR, hatPat: HAT_OFF, openPat: OPEN_OFF, clapPat: CLAP_24,
  bassPat: ['x---x---x--x-x--'], chordPat: ['--x-------x-----', '--x----x--------'],
  pad: true, padAmp: 0.09, chordAmp: 0.19, bassAmp: 0.44, hatAmp: 0.17,
}), '128k');

// 2. Late night — darker, fewer elements, more space
enc('deep-house-nocturno', houseTrack({
  seed: 60002, bpm: 120, bars: 16, kick: true, progression: PROG_FMIN,
  kickPat: FOUR, hatPat: HAT_OFF, clapPat: ['------------x---'],
  bassPat: ['x-------x-------'], chordPat: ['----------x-----', '--------------x-'],
  pad: true, padAmp: 0.12, padCutoff: 1100, chordAmp: 0.15, bassAmp: 0.46,
  hatAmp: 0.12, hatBright: 6000, kickDecay: 0.17, subDrone: 'F0', subDroneAmp: 0.07,
}), '128k');

// 3. Organic — congas and shaker carry the groove
enc('deep-house-organico', houseTrack({
  seed: 60003, bpm: 121, bars: 16, kick: true, progression: PROG_AMIN,
  kickPat: FOUR, hatPat: HAT_16, clapPat: CLAP_24,
  shakerPat: ['--x---x---x---x-'], congaPat: ['----x--x--x---x-'],
  congaTones: [196, 261.63, 174.61, 220],
  bassPat: ['x--x----x--x----'], chordPat: ['--x---x-------x-'],
  pad: true, padAmp: 0.07, chordAmp: 0.17, bassAmp: 0.42, hatAmp: 0.13,
  shakerAmp: 0.13, congaAmp: 0.20,
}), '128k');

// 4. Melodic — the chords lead
enc('deep-house-melodico', houseTrack({
  seed: 60004, bpm: 122, bars: 16, kick: true, progression: PROG_SOUL,
  kickPat: FOUR, hatPat: HAT_OFF, openPat: OPEN_OFF, clapPat: CLAP_24,
  bassPat: ['x---x---x---x---'],
  chordPat: ['x-x---x---x---x-', '--x---x---x-x---'],
  pad: true, padAmp: 0.10, chordAmp: 0.22, chordSpread: 0.6, bassAmp: 0.40, hatAmp: 0.16,
}), '128k');

// 5. Lo-fi — dusty, filtered, tape hiss and crackle
enc('lo-fi-house', houseTrack({
  seed: 60005, bpm: 118, bars: 16, kick: true, progression: PROG_AMIN,
  kickPat: FOUR, hatPat: HAT_OFF, clapPat: CLAP_24,
  bassPat: ['x---x---x---x-x-'], chordPat: ['--x-----x-------'],
  pad: true, padAmp: 0.11, padCutoff: 900, chordAmp: 0.16, bassAmp: 0.40,
  hatAmp: 0.11, hatBright: 5200, kickFrom: 96, kickTo: 44, vinyl: 0.055,
}), '128k');

// 6. Soulful — jazzier voicings, brighter, a little quicker
enc('soulful-house', houseTrack({
  seed: 60006, bpm: 124, bars: 16, kick: true, progression: PROG_SOUL,
  kickPat: FOUR, hatPat: HAT_16, openPat: OPEN_OFF, clapPat: CLAP_24,
  shakerPat: ['----x-------x---'],
  bassPat: ['x--x-x--x--x-x--'], chordPat: ['--x-x-----x-x---'],
  pad: true, padAmp: 0.08, padCutoff: 2100, chordAmp: 0.21, bassAmp: 0.41, hatAmp: 0.18,
}), '128k');

// 7. Deep house under rain — the house-of-this-app version
enc('deep-house-y-lluvia', houseTrack({
  seed: 60007, bpm: 120, bars: 16, kick: true, progression: PROG_FMIN,
  kickPat: FOUR, hatPat: HAT_OFF, clapPat: ['------------x---'],
  bassPat: ['x-------x-------'], chordPat: ['----------x-----'],
  pad: true, padAmp: 0.11, padCutoff: 1200, chordAmp: 0.15, bassAmp: 0.42,
  hatAmp: 0.10, kickAmp: 0.78, kickDecay: 0.18, rain: 0.30,
}), '128k');

// 8. Beatless — the same harmony with the drums taken out, so the genre has a
// version that belongs in a bedtime app rather than fighting it.
enc('deep-house-sin-bateria', houseTrack({
  seed: 60008, bpm: 120, bars: 16, kick: false, progression: PROG_FMIN,
  kickPat: FOUR, bassPat: ['x---------------'], chordPat: ['----------x-----'],
  pad: true, padAmp: 0.16, padCutoff: 1000, padSustain: 1.15,
  chordAmp: 0.13, bassAmp: 0.30, bassDur: 1.4, duck: false,
  subDrone: 'F0', subDroneAmp: 0.09, peak: 0.80,
}), '128k');

console.log('Done.');
