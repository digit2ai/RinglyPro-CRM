// =====================================================
// lib-instruments.js — four synthesis engines plus a performance renderer.
//
// ORIGINALITY, STATED PLAINLY: nothing here samples or reproduces any
// commercial recording. The artist names in the design brief (Nakai, Einaudi,
// Frahm, Eno, Gasparyan and the rest) were used only as a reference for TIMBRE
// and TEMPO — how breathy, how slow, how sparse. Every note below is computed
// from scratch, so the whole library stays royalty-free and same-origin. No
// artist or album name appears anywhere in the shipped product.
//
// The four engines cover the instrument families in the brief:
//   pluckVoice   — plucked string (guitar, harp, koto, guqin, oud, kalimba, dulcimer)
//   struckVoice  — struck metal or wood (handpan, tongue drum, gong, gamelan, marimba, vibraphone)
//   blownVoice   — blown tube (quena, zampoña, shakuhachi, bansuri, whistle, ney, duduk)
//   bowedVoice   — sustained bow or reed (cello, hurdy-gurdy drone)
//   pianoVoice   — struck string with inharmonicity and felt damping
//
// Every voice returns a mono Float64Array; the performance renderer places it in
// the stereo field MODULO the buffer, so all output loops seamlessly.
// =====================================================

'use strict';

const {
  SR, mulberry32, whiteNoise, onePoleLowpass, onePoleHighpass,
  wrapAddStereo, peakNormalize,
} = require('./lib-dsp');

// Fade the last few percent of any voice to zero. A decaying tail truncated at
// a non-zero sample is an audible click, and over a whole night you hear it.
function fadeTail(y, fraction) {
  const n = y.length;
  const f = Math.max(1, Math.floor(n * (fraction || 0.06)));
  for (let k = 0; k < f; k++) {
    const w = k / f;
    y[n - f + k] *= (1 - w) * (1 - w);
  }
  return y;
}

// =====================================================
// 1. Plucked string — Karplus-Strong.
//
// A delay line of length SR/f is filled with a noise burst (the pluck), then
// fed back through a one-pole lowpass. The lowpass is the physics: high
// partials lose energy faster than the fundamental, which is why a real string
// gets darker as it decays rather than just quieter.
// =====================================================
function pluckVoice(opts) {
  const o = opts || {};
  const loopGain = o.loopGain == null ? 0.9965 : o.loopGain;
  const lossAlpha = o.lossAlpha == null ? 0.5 : o.lossAlpha;   // 1 = no damping
  const bright = o.bright == null ? 3200 : o.bright;           // pluck hardness
  const inharm = o.inharm || 0;                                // added metal ring
  const bodyGain = o.bodyGain || 0;                            // soundboard thump

  return function pluck(f, dur, amp, rnd) {
    const n = Math.floor(dur * SR);
    const N = Math.max(2, Math.round(SR / f));
    const exc = onePoleLowpass(whiteNoise(N, rnd), bright);
    let mx = 0;
    for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(exc[i]));
    const buf = new Float64Array(N);
    for (let i = 0; i < N; i++) buf[i] = exc[i] / (mx || 1);

    const y = new Float64Array(n);
    let idx = 0, filt = 0;
    for (let k = 0; k < n; k++) {
      const cur = buf[idx];
      const avg = 0.5 * (cur + buf[(idx + 1) % N]);
      filt += lossAlpha * (avg - filt);
      buf[idx] = filt * loopGain;
      y[k] = cur * amp;
      idx = (idx + 1) % N;
    }
    // A tine or a bell plate rings above the string; kalimba needs this.
    if (inharm) {
      for (let k = 0; k < n; k++) {
        const t = k / SR;
        y[k] += Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t / 0.09) * amp * inharm;
      }
    }
    // The body responding to the pluck: a short lowpassed thud.
    if (bodyGain) {
      const thudN = Math.min(n, Math.floor(SR * 0.06));
      const thud = onePoleLowpass(whiteNoise(thudN, rnd), 260);
      for (let k = 0; k < thudN; k++) y[k] += thud[k] * Math.exp(-k / (thudN * 0.3)) * amp * bodyGain * 4;
    }
    return fadeTail(y, 0.07);
  };
}

// =====================================================
// 2. Struck metal or wood — a stack of partials, each with its own decay.
//
// `ratios` is what makes one instrument a handpan and another a gong. Handpans
// are deliberately tuned so each tonefield rings 1:2:3 (harmonic, which is why
// they sound melodic); a gong is wildly inharmonic (which is why it sounds like
// weather). `beat` splits each mode into a close pair, the wobble of real metal.
// =====================================================
function struckVoice(opts) {
  const o = opts || {};
  const ratios = o.ratios || [1, 2, 3];
  const decayScale = o.decayScale == null ? 0.30 : o.decayScale;
  const beat = o.beat || 0;
  const attack = (o.attackMs == null ? 6 : o.attackMs) / 1000;
  const tremoloHz = o.tremoloHz || 0;      // vibraphone motor
  const tilt = o.tilt == null ? 1.55 : o.tilt;  // how fast upper partials fall off

  return function struck(f0, dur, amp, rnd) {
    const n = Math.floor(dur * SR);
    const y = new Float64Array(n);
    for (let p = 0; p < ratios.length; p++) {
      const f = f0 * ratios[p];
      if (f > SR / 2.2) continue;             // no aliasing
      const pAmp = amp / Math.pow(p + 1, tilt);
      const decay = (dur * decayScale) / Math.pow(p + 1, 0.85);
      const split = beat * (1 + p * 0.6);
      for (let k = 0; k < n; k++) {
        const t = k / SR;
        const env = Math.exp(-t / decay);
        const a = Math.sin(2 * Math.PI * f * t);
        const b = split ? Math.sin(2 * Math.PI * (f + split) * t) : a;
        y[k] += (a + b) * 0.5 * pAmp * env;
      }
    }
    if (tremoloHz) {
      for (let k = 0; k < n; k++) {
        y[k] *= 0.78 + 0.22 * Math.sin(2 * Math.PI * tremoloHz * (k / SR));
      }
    }
    const aN = Math.min(n, Math.floor(attack * SR));
    for (let k = 0; k < aN; k++) y[k] *= Math.pow(k / aN, 1.4);
    return fadeTail(y, 0.06);
  };
}

// =====================================================
// 3. Blown tube — harmonic stack plus breath noise.
//
// Breath is the whole character of these instruments: a shakuhachi is mostly
// air, a bansuri mostly tone. `chiff` is the transient at the start of the note
// when the air first catches the edge. `bendSemis` slides into the note, which
// is how a bansuri meend and a shakuhachi meri actually behave.
// =====================================================
function blownVoice(opts) {
  const o = opts || {};
  const harm = o.harm || [1, 0.25, 0.10, 0.04];
  const breath = o.breath == null ? 0.35 : o.breath;
  const vibDepth = o.vibDepth == null ? 0.008 : o.vibDepth;
  const vibRate = o.vibRate == null ? 5.2 : o.vibRate;
  const vibOnset = o.vibOnset == null ? 0.7 : o.vibOnset;
  const attack = o.attack == null ? 0.10 : o.attack;
  const chiff = o.chiff == null ? 0.35 : o.chiff;
  const bendSemis = o.bendSemis || 0;
  const bendTime = o.bendTime == null ? 0.35 : o.bendTime;

  return function blown(f, dur, amp, rnd) {
    const n = Math.floor(dur * SR);
    const y = new Float64Array(n);
    const release = dur * 0.30;
    const air = onePoleHighpass(onePoleLowpass(whiteNoise(n, rnd), 4600), 1200);

    // Phase accumulation, because the frequency moves (bend + vibrato).
    let phase = 0;
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const bend = bendSemis && t < bendTime
        ? Math.pow(2, (bendSemis * (1 - t / bendTime)) / 12) : 1;
      const vib = 1 + vibDepth * (t > vibOnset ? 1 : t / Math.max(vibOnset, 1e-6))
        * Math.sin(2 * Math.PI * vibRate * t);
      phase += (2 * Math.PI * f * bend * vib) / SR;

      const env = t < attack
        ? Math.pow(t / attack, 0.8)
        : Math.min(1, Math.exp(-Math.max(0, t - (dur - release)) / (release * 0.5)));

      let s = 0;
      for (let h = 0; h < harm.length; h++) s += Math.sin(phase * (h + 1)) * harm[h];
      const chiffEnv = Math.exp(-t / 0.06) * chiff;
      y[k] = (s * env + air[k] * (breath * env + chiffEnv)) * amp;
    }
    return fadeTail(y, 0.08);
  };
}

// =====================================================
// 4. Bowed / sustained — slow attack, vibrato, bow noise on the string.
// =====================================================
function bowedVoice(opts) {
  const o = opts || {};
  const harm = o.harm || [1, 0.5, 0.3, 0.18, 0.10, 0.06];
  const attack = o.attack == null ? 0.7 : o.attack;
  const vibDepth = o.vibDepth == null ? 0.007 : o.vibDepth;
  const vibRate = o.vibRate == null ? 5.0 : o.vibRate;
  const bowNoise = o.bowNoise == null ? 0.05 : o.bowNoise;

  return function bowed(f, dur, amp, rnd) {
    const n = Math.floor(dur * SR);
    const y = new Float64Array(n);
    const release = dur * 0.36;
    const scratch = onePoleHighpass(onePoleLowpass(whiteNoise(n, rnd), 5200), 900);
    let phase = 0;
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const vib = 1 + vibDepth * Math.min(1, t / 0.8) * Math.sin(2 * Math.PI * vibRate * t);
      phase += (2 * Math.PI * f * vib) / SR;
      const env = t < attack
        ? Math.pow(t / attack, 1.3)
        : Math.min(1, Math.exp(-Math.max(0, t - (dur - release)) / (release * 0.55)));
      let s = 0;
      for (let h = 0; h < harm.length; h++) s += Math.sin(phase * (h + 1)) * harm[h];
      y[k] = (s + scratch[k] * bowNoise) * env * amp;
    }
    return fadeTail(y, 0.10);
  };
}

// =====================================================
// 5. Felt piano — struck string with real inharmonicity.
//
// Piano partials are slightly SHARP of the harmonic series (stiffness), which
// is `B` below; without it a synthetic piano sounds like an organ. Felt over
// the hammers means very few upper partials survive, plus audible key noise.
// =====================================================
function pianoVoice(opts) {
  const o = opts || {};
  const B = o.inharmonicity == null ? 0.00042 : o.inharmonicity;
  const partials = o.partials == null ? 5 : o.partials;
  const tilt = o.tilt == null ? 1.9 : o.tilt;
  const keyNoise = o.keyNoise == null ? 0.05 : o.keyNoise;

  return function piano(f, dur, amp, rnd) {
    const n = Math.floor(dur * SR);
    const y = new Float64Array(n);
    for (let p = 1; p <= partials; p++) {
      const fp = f * p * Math.sqrt(1 + B * p * p);
      if (fp > SR / 2.2) break;
      const pAmp = amp / Math.pow(p, tilt);
      const decay = (dur * 0.36) / Math.pow(p, 0.6);
      // Two strings per note, a hair apart: that slow shimmer is a real piano.
      const det = 1 + (p === 1 ? 0.0004 : 0);
      for (let k = 0; k < n; k++) {
        const t = k / SR;
        const env = Math.exp(-t / decay);
        y[k] += (Math.sin(2 * Math.PI * fp * t) + Math.sin(2 * Math.PI * fp * det * t))
          * 0.5 * pAmp * env;
      }
    }
    const kN = Math.min(n, Math.floor(SR * 0.05));
    const thud = onePoleLowpass(whiteNoise(kN, rnd), 380);
    for (let k = 0; k < kN; k++) y[k] += thud[k] * Math.exp(-k / (kN * 0.28)) * amp * keyNoise * 6;
    const aN = Math.floor(SR * 0.004);
    for (let k = 0; k < aN && k < n; k++) y[k] *= k / aN;
    return fadeTail(y, 0.06);
  };
}

// =====================================================
// Performance renderer.
//
// Notes move by a RANDOM WALK over the scale rather than uniform random choice.
// That single detail is the difference between a melody and a wind chime: real
// playing mostly steps, occasionally leaps, and returns toward the centre.
// =====================================================
function renderPerformance(spec) {
  const s = spec;
  const D = Math.round(s.seconds * SR);
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  const rnd = mulberry32(s.seed || 1234);

  const scale = s.scale;
  let idx = Math.floor(scale.length / 2);
  const notes = Math.max(1, Math.round(s.seconds / s.every));

  for (let i = 0; i < notes; i++) {
    // Rests matter as much as notes in this material — a gap is a phrase mark.
    if (s.restProb && rnd() < s.restProb) { continue; }

    const at = i * s.every + (rnd() - 0.5) * (s.jitter || 0);
    // Step by -2..+2, weighted to small moves, pulled back toward the centre.
    const step = Math.round((rnd() - 0.5) * 4 * (s.leap == null ? 1 : s.leap));
    idx += step;
    if (idx < 0 || idx >= scale.length) idx = Math.max(0, Math.min(scale.length - 1, idx));
    if (rnd() < 0.16) idx = Math.floor(scale.length / 2);

    let f = scale[idx];
    if (s.octaveUpProb && rnd() < s.octaveUpProb) f *= 2;

    const dur = s.durMin + rnd() * (s.durMax - s.durMin);
    const amp = s.ampMin + rnd() * (s.ampMax - s.ampMin);
    const pan = 0.5 + (rnd() - 0.5) * (s.panSpread == null ? 0.4 : s.panSpread);
    const start = Math.floor(at * SR);

    wrapAddStereo(L, R, start, s.voice(f, dur, amp, mulberry32(s.seed + i * 977)), pan);

    // A second voice a fifth or octave away: the panpipe / dulcimer doubling.
    if (s.doubleInterval && rnd() < (s.doubleProb == null ? 1 : s.doubleProb)) {
      wrapAddStereo(L, R, start + Math.floor((s.doubleDelay || 0) * SR),
        s.voice(f * s.doubleInterval, dur * 0.9, amp * (s.doubleAmp || 0.5),
          mulberry32(s.seed + i * 977 + 5)),
        1 - pan);
    }
    // Grace note just before the beat: the whistle cut, the flute ornament.
    if (s.graceProb && rnd() < s.graceProb && idx + 1 < scale.length) {
      wrapAddStereo(L, R, start - Math.floor(0.09 * SR),
        s.voice(scale[idx + 1], 0.10, amp * 0.55, mulberry32(s.seed + i * 977 + 11)), pan);
    }
  }

  // A sustained drone under everything: hurdy-gurdy, bansuri tanpura, oud qarar.
  if (s.drone) {
    const dr = s.drone;
    const freqs = Array.isArray(dr.freqs) ? dr.freqs : [dr.freqs];
    for (const f0 of freqs) {
      // Integer cycles over the loop, so the drone wraps without a click.
      const f = Math.max(1, Math.round(f0 * s.seconds)) / s.seconds;
      for (let k = 0; k < D; k++) {
        const t = k / SR;
        const swell = 0.80 + 0.20 * Math.sin(2 * Math.PI * t / (s.seconds / 2));
        const v = (Math.sin(2 * Math.PI * f * t)
          + Math.sin(2 * Math.PI * f * 2 * t) * 0.18
          + Math.sin(2 * Math.PI * f * 3 * t) * 0.07) * dr.amp * swell;
        L[k] += v; R[k] += v;
      }
    }
  }

  if (s.normalize !== false) peakNormalize([L, R], s.peak || 0.78);
  return [L, R];
}

module.exports = {
  pluckVoice, struckVoice, blownVoice, bowedVoice, pianoVoice,
  renderPerformance, fadeTail,
};
