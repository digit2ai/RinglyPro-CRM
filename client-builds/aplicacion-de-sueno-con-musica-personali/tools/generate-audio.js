// =====================================================
// generate-audio.js — builds the curated, license-free sleep audio library.
//
// Why synthesize instead of linking a third-party CDN: every external ambient
// URL we evaluated was either short (a few seconds), served in a container
// Safari cannot decode (ogg/oga), or carried an unclear license. These loops
// are generated from scratch here, so they are ours, license-free, seamless,
// and served from our own origin — nothing to 404 at bedtime.
//
// Run (from the repo root, only when the library changes):
//   /opt/homebrew/bin/node client-builds/aplicacion-de-sueno-con-musica-personali/tools/generate-audio.js
//
// Requires ffmpeg on PATH (build-time only — production just serves the mp3s).
// Output: public/audio/*.mp3, committed to the repo.
// =====================================================

'use strict';

const path = require('path');

// Every DSP primitive lives in lib-dsp.js, shared with generate-instrumental.js.
const {
  SR, mulberry32, whiteNoise, onePoleLowpass, onePoleHighpass, brownNoise,
  wrapCrossfade, peakNormalize, wrapAddStereo, wrapAddMono, integerize, makeEncoder,
} = require('./lib-dsp');

const OUT_DIR = path.join(__dirname, '..', 'public', 'audio');
const writeRawAndEncode = makeEncoder(OUT_DIR, 'sueno-audio-build');

// =====================================================
// 1. Lluvia suave — filtered noise rain + sparse droplets + slow gusts
// =====================================================
function lluviaSuave(seconds) {
  const T = 3 * SR, D = seconds * SR, N = D + T;
  const rnd = mulberry32(1011);
  let bed = onePoleLowpass(whiteNoise(N, rnd), 2400);
  bed = onePoleHighpass(bed, 260);
  const y = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const gust = 0.78 + 0.22 * Math.sin(2 * Math.PI * t / 17) * Math.sin(2 * Math.PI * t / 6.5);
    y[i] = bed[i] * gust * 4.2;
  }
  // droplets: short resonant decays, ~9 per second
  const dropRnd = mulberry32(2022);
  const drops = Math.round(seconds * 9);
  for (let d = 0; d < drops; d++) {
    const start = Math.floor(dropRnd() * (N - SR));
    const len = Math.floor(SR * (0.018 + dropRnd() * 0.05));
    const freq = 900 + dropRnd() * 2600;
    const amp = 0.05 + dropRnd() * 0.11;
    for (let k = 0; k < len; k++) {
      const env = Math.exp(-k / (len * 0.28));
      y[start + k] += Math.sin((2 * Math.PI * freq * k) / SR) * env * amp * 0.5
        + (dropRnd() * 2 - 1) * env * amp * 0.5;
    }
  }
  const out = wrapCrossfade(y, D, T);
  peakNormalize([out], 0.82);
  return [out];
}

// =====================================================
// 2. Olas del mar — brown-noise swells with hiss at the crest
// =====================================================
function olasDelMar(seconds) {
  const T = 4 * SR, D = seconds * SR, N = D + T;
  const rnd = mulberry32(3033);
  const body = onePoleLowpass(brownNoise(N, rnd, 0.9985), 900);
  const hissRnd = mulberry32(4044);
  const hiss = onePoleHighpass(onePoleLowpass(whiteNoise(N, hissRnd), 6000), 1800);
  const y = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    // two interfering swell periods so no wave sounds like the last one
    const s1 = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * t / 9.5), 1.7);
    const s2 = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * t / 13.7 + 1.1), 2.2);
    const swell = 0.30 + 0.70 * (0.62 * s1 + 0.38 * s2);
    const crest = Math.pow(swell, 3.2);
    y[i] = body[i] * swell * 9 + hiss[i] * crest * 2.6;
  }
  const out = wrapCrossfade(y, D, T);
  peakNormalize([out], 0.80);
  return [out];
}

// =====================================================
// 3. Ruido marrón — the classic flat sleep mask
// =====================================================
function ruidoMarron(seconds) {
  const T = 3 * SR, D = seconds * SR, N = D + T;
  const rnd = mulberry32(5055);
  const y = onePoleLowpass(brownNoise(N, rnd, 0.9975), 1400);
  const out = wrapCrossfade(y, D, T);
  peakNormalize([out], 0.78);
  return [out];
}

// =====================================================
// 4. Viento en el bosque — deep wind bed + high "leaves" layer
// =====================================================
function vientoEnElBosque(seconds) {
  const T = 4 * SR, D = seconds * SR, N = D + T;
  const rnd = mulberry32(6066);
  const wind = onePoleLowpass(brownNoise(N, rnd, 0.9990), 420);
  const leafRnd = mulberry32(7077);
  const leaves = onePoleHighpass(onePoleLowpass(whiteNoise(N, leafRnd), 7500), 2600);
  const y = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const g = 0.55 + 0.45 * Math.sin(2 * Math.PI * t / 21.3) * Math.cos(2 * Math.PI * t / 8.1 + 0.6);
    const rustle = Math.max(0, g);
    y[i] = wind[i] * (0.5 + 0.5 * rustle) * 11 + leaves[i] * Math.pow(rustle, 2) * 1.5;
  }
  const out = wrapCrossfade(y, D, T);
  peakNormalize([out], 0.78);
  return [out];
}

// =====================================================
// 5. Nocturno suave — soft classical-style pad, A minor pentatonic.
// Note tails wrap modulo the buffer, so the loop is exact by construction.
// =====================================================
function nocturnoSuave(seconds) {
  const D = seconds * SR;
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  const rnd = mulberry32(8088);
  // A2 .. E5 pentatonic minor
  const scale = [110.00, 130.81, 146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00];
  const grid = 4;                          // one note every 4 s
  const notes = Math.round(seconds / grid); // integer by construction
  for (let n = 0; n < notes; n++) {
    const startT = n * grid + (rnd() - 0.5) * 0.35;
    const f = scale[Math.floor(rnd() * scale.length)];
    const dur = 7 + rnd() * 4;
    const pan = 0.5 + (rnd() - 0.5) * 0.5;
    const amp = 0.14 + rnd() * 0.08;
    const attack = 1.4 + rnd() * 0.8;
    const len = Math.floor(dur * SR);
    const s0 = Math.floor(startT * SR);
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      const env = (t < attack ? t / attack : Math.exp(-(t - attack) / (dur * 0.42)));
      const vib = 1 + 0.0018 * Math.sin(2 * Math.PI * 4.6 * t);
      const s = Math.sin(2 * Math.PI * f * vib * t) * 1.0
        + Math.sin(2 * Math.PI * f * 2 * vib * t) * 0.22
        + Math.sin(2 * Math.PI * f * 3 * vib * t) * 0.07;
      const v = s * env * amp;
      const idx = ((s0 + k) % D + D) % D;   // wrap = seamless
      L[idx] += v * (1 - pan);
      R[idx] += v * pan;
    }
  }
  // low drone (A1) at an exact integer number of cycles so it wraps too
  const droneF = Math.round(55 * seconds) / seconds;
  for (let i = 0; i < D; i++) {
    const t = i / SR;
    const d = Math.sin(2 * Math.PI * droneF * t) * 0.10
      + Math.sin(2 * Math.PI * droneF * 2 * t) * 0.03;
    L[i] += d; R[i] += d;
  }
  peakNormalize([L, R], 0.72);
  return [L, R];
}

// =====================================================
// 6. Ondas theta — pre-recorded binaural pair (200 Hz / 205.5 Hz => 5.5 Hz theta)
// Carriers chosen so both are integer cycles over the loop length.
// =====================================================
function ondasTheta(seconds) {
  const D = seconds * SR;
  const fL = Math.round(200 * seconds) / seconds;
  const fR = Math.round(205.5 * seconds) / seconds;
  const lfoP = 6; // 6 s, divides the loop length evenly
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  const T = 3 * SR;
  const bedRaw = onePoleLowpass(brownNoise(D + T, mulberry32(9099), 0.998), 900);
  const bed = wrapCrossfade(bedRaw, D, T);
  let bedPeak = 0;
  for (let i = 0; i < D; i++) bedPeak = Math.max(bedPeak, Math.abs(bed[i]));
  const bedG = bedPeak > 0 ? 0.22 / bedPeak : 0;
  for (let i = 0; i < D; i++) {
    const t = i / SR;
    const lfo = 0.80 + 0.20 * Math.sin(2 * Math.PI * t / lfoP);
    const tone = 0.34 * lfo;
    L[i] = Math.sin(2 * Math.PI * fL * t) * tone
      + Math.sin(2 * Math.PI * fL * 2 * t) * tone * 0.10 + bed[i] * bedG;
    R[i] = Math.sin(2 * Math.PI * fR * t) * tone
      + Math.sin(2 * Math.PI * fR * 2 * t) * tone * 0.10 + bed[i] * bedG;
  }
  peakNormalize([L, R], 0.74);
  return [L, R];
}

// =====================================================
// EVENT LAYER — bowls, birds, insects, wave crashes, flutes.
//
// Every event is written into the buffer MODULO its length, so an event that
// starts near the end simply continues over the loop point. That makes these
// tracks seamless by construction: no crossfade, no seam to hide.
// =====================================================

// A struck bowl. Real singing bowls are INHARMONIC — the partials are not
// integer multiples — and each mode is split into a close pair, which is what
// produces the slow wobble you hear as the bowl "breathes".
function bowlStrike(f0, seconds, amp, ratios, beatHz, decayScale) {
  const n = Math.floor(seconds * SR);
  const y = new Float64Array(n);
  for (let p = 0; p < ratios.length; p++) {
    const f = f0 * ratios[p];
    const pAmp = amp / Math.pow(p + 1, 1.55);
    const decay = seconds * decayScale / Math.pow(p + 1, 0.85); // highs die first
    const split = beatHz * (1 + p * 0.6);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const env = Math.exp(-t / decay);
      y[k] += (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * (f + split) * t))
        * 0.5 * pAmp * env;
    }
  }
  // Soften the very first milliseconds so the strike is a mallet, not a click.
  const attack = Math.floor(SR * 0.012);
  for (let k = 0; k < attack && k < n; k++) y[k] *= k / attack;
  return y;
}

// A bird call: a short run of frequency-swept notes. Sweep direction and note
// count are what make one species sound different from another.
function birdCall(f1, f2, noteMs, notes, gapMs, amp, rnd) {
  const noteN = Math.floor((noteMs / 1000) * SR);
  const gapN = Math.floor((gapMs / 1000) * SR);
  const total = notes * (noteN + gapN);
  const y = new Float64Array(total);
  for (let i = 0; i < notes; i++) {
    const off = i * (noteN + gapN);
    const detune = 1 + (rnd() - 0.5) * 0.06;
    let phase = 0;
    for (let k = 0; k < noteN; k++) {
      const u = k / noteN;
      const f = (f1 + (f2 - f1) * u) * detune;
      phase += (2 * Math.PI * f) / SR;
      // Bell envelope — no click at either end.
      const env = Math.pow(Math.sin(Math.PI * u), 1.4);
      y[off + k] += (Math.sin(phase) + 0.22 * Math.sin(phase * 2)) * env * amp;
    }
  }
  return y;
}

// Cicada / insect shimmer: a narrow high band, amplitude-modulated fast enough
// to buzz, and slowly swelling so the chorus drifts in and out.
function insectBed(D, rnd, centreHz, amp) {
  const raw = onePoleHighpass(onePoleLowpass(whiteNoise(D + 3 * SR, rnd), centreHz * 1.35), centreHz * 0.72);
  const bed = wrapCrossfade(raw, D, 3 * SR);
  const y = new Float64Array(D);
  for (let i = 0; i < D; i++) {
    const t = i / SR;
    const buzz = 0.55 + 0.45 * Math.sin(2 * Math.PI * 47 * t);
    const swell = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t / 19));
    y[i] = bed[i] * buzz * swell * amp;
  }
  return y;
}

// A wooden flute tone: odd-harmonic-leaning sine stack plus breath noise.
function fluteNote(f, seconds, amp, rnd) {
  const n = Math.floor(seconds * SR);
  const y = new Float64Array(n);
  const attack = 0.16, release = seconds * 0.42;
  const breathRaw = onePoleHighpass(onePoleLowpass(whiteNoise(n, rnd), 4200), 1400);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = t < attack
      ? t / attack
      : Math.min(1, Math.exp(-(t - attack) / release));
    const drift = 1 + 0.0022 * Math.sin(2 * Math.PI * 4.1 * t) + 0.0015 * Math.sin(2 * Math.PI * 0.7 * t);
    y[k] = (Math.sin(2 * Math.PI * f * drift * t)
      + 0.16 * Math.sin(2 * Math.PI * f * 3 * drift * t)
      + 0.06 * Math.sin(2 * Math.PI * f * 5 * drift * t)) * env * amp
      + breathRaw[k] * env * amp * 0.35;
  }
  return y;
}

// A struck wooden bar (marimba-ish): fast decay, one bright inharmonic partial.
function woodNote(f, amp) {
  const seconds = 0.75;
  const n = Math.floor(seconds * SR);
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    y[k] = (Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.20)
      + Math.sin(2 * Math.PI * f * 3.94 * t) * 0.22 * Math.exp(-t / 0.045)) * amp;
  }
  const attack = Math.floor(SR * 0.003);
  for (let k = 0; k < attack; k++) y[k] *= k / attack;
  return y;
}

// A rain bed, reused by three tracks at different distances/brightness.
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

// =====================================================
// 7. Cuencos tibetanos — struck bronze singing bowls, overlapping tails
// =====================================================
function cuencosTibetanos(seconds) {
  const D = seconds * SR;
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  const rnd = mulberry32(11011);
  // Bronze-bowl mode ratios, measured-instrument territory rather than integers.
  const RATIOS = [1, 2.74, 5.42, 8.91, 13.1];
  const roots = [98.0, 130.81, 146.83, 174.61, 196.0];
  const strikes = Math.max(4, Math.round(seconds / 11));
  for (let i = 0; i < strikes; i++) {
    // Even spacing with a human nudge, so it never sounds sequenced.
    const at = (i * seconds) / strikes + (rnd() - 0.5) * 2.2;
    const f0 = roots[Math.floor(rnd() * roots.length)];
    const dur = 15 + rnd() * 7;
    const amp = 0.30 + rnd() * 0.14;
    const beat = 0.7 + rnd() * 1.1;             // the breathing wobble
    const pan = 0.5 + (rnd() - 0.5) * 0.55;
    wrapAddStereo(L, R, Math.floor(at * SR), bowlStrike(f0, dur, amp, RATIOS, beat, 0.34), pan);
  }
  // A low sustained hum underneath, integer cycles so it wraps exactly.
  const humF = Math.round(65.41 * seconds) / seconds;
  for (let i = 0; i < D; i++) {
    const t = i / SR;
    const swell = 0.72 + 0.28 * Math.sin(2 * Math.PI * t / (seconds / 3));
    const h = (Math.sin(2 * Math.PI * humF * t) * 0.09
      + Math.sin(2 * Math.PI * humF * 2.01 * t) * 0.025) * swell;
    L[i] += h; R[i] += h;
  }
  peakNormalize([L, R], 0.78);
  return [L, R];
}

// =====================================================
// 8. Cuenco de cristal y lluvia — sustained crystal bowl over rain
// (the combination: a rubbed crystal bowl is near-pure, so it sits under rain
//  without fighting it)
// =====================================================
function cuencoDeCristalYLluvia(seconds) {
  const D = seconds * SR;
  const rain = rainBed(D, mulberry32(12012), 2600, 300, 3.4);
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  // Integer-cycle carriers => exact wrap. Two near-unison voices per partial
  // give the shimmer a rubbed bowl has.
  const f1 = Math.round(261.63 * seconds) / seconds;   // C4
  const f2 = Math.round(392.00 * seconds) / seconds;   // G4, a fifth above
  const beat1 = Math.round(0.9 * seconds) / seconds;
  const beat2 = Math.round(1.4 * seconds) / seconds;
  for (let i = 0; i < D; i++) {
    const t = i / SR;
    // Slow, unequal swells so the bowl never pulses in time with itself.
    const s1 = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t / (seconds / 2)));
    const s2 = 0.30 + 0.70 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t / (seconds / 3) + 1.6));
    const bowl1 = (Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * (f1 + beat1) * t)) * 0.5;
    const bowl2 = (Math.sin(2 * Math.PI * f2 * t) + Math.sin(2 * Math.PI * (f2 + beat2) * t)) * 0.5;
    const shimmer = Math.sin(2 * Math.PI * f1 * 2 * t) * 0.05 * s1;
    L[i] = rain[i] * 0.92 + bowl1 * 0.30 * s1 + bowl2 * 0.15 * s2 + shimmer;
    R[i] = rain[i] * 0.92 + bowl1 * 0.26 * s1 + bowl2 * 0.19 * s2 + shimmer;
  }
  // A few soft crystal strikes to mark time.
  const rnd = mulberry32(13013);
  for (let i = 0; i < Math.max(2, Math.round(seconds / 24)); i++) {
    const at = (i * seconds) / Math.max(2, Math.round(seconds / 24)) + rnd() * 3;
    wrapAddStereo(L, R, Math.floor(at * SR),
      bowlStrike(523.25, 9, 0.13, [1, 2.02, 3.01], 0.5, 0.30), 0.5 + (rnd() - 0.5) * 0.4);
  }
  peakNormalize([L, R], 0.80);
  return [L, R];
}

// =====================================================
// 9. Selva tropical — rain under a canopy, cicadas, sparse birds, big drips
// =====================================================
function selvaTropical(seconds) {
  const D = seconds * SR;
  // Distant, darker rain: the canopy eats the high end.
  const rain = rainBed(D, mulberry32(14014), 1500, 220, 3.0);
  const bugs = insectBed(D, mulberry32(15015), 5200, 0.055);
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  for (let i = 0; i < D; i++) {
    L[i] = rain[i] * 0.95 + bugs[i] * 1.0;
    R[i] = rain[i] * 0.95 + bugs[i] * 0.85;
  }
  // Canopy drips: fatter and slower than rain, each a small resonant plop.
  const dripRnd = mulberry32(16016);
  const drips = Math.round(seconds * 1.6);
  for (let d = 0; d < drips; d++) {
    const at = dripRnd() * seconds;
    const f = 380 + dripRnd() * 900;
    const dur = 0.10 + dripRnd() * 0.16;
    const amp = 0.10 + dripRnd() * 0.12;
    const n = Math.floor(dur * SR);
    const s = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const env = Math.exp(-t / (dur * 0.30));
      // Rising pitch is what makes a drip sound like water, not a bell.
      s[k] = Math.sin(2 * Math.PI * f * (1 + 1.4 * t) * t) * env * amp;
    }
    wrapAddStereo(L, R, Math.floor(at * SR), s, dripRnd());
  }
  // Birds, kept sparse — a rainforest at night is mostly insects.
  const bRnd = mulberry32(17017);
  const SPECIES = [
    [2300, 3100, 70, 3, 90], [1750, 1450, 130, 2, 170],
    [3300, 2500, 55, 5, 60], [1250, 1950, 160, 2, 240],
  ];
  for (let b = 0; b < Math.round(seconds / 7); b++) {
    const sp = SPECIES[Math.floor(bRnd() * SPECIES.length)];
    wrapAddStereo(L, R, Math.floor(bRnd() * seconds * SR),
      birdCall(sp[0], sp[1], sp[2], sp[3], sp[4], 0.055 + bRnd() * 0.05, bRnd), bRnd());
  }
  peakNormalize([L, R], 0.80);
  return [L, R];
}

// =====================================================
// 10. Cascada con aves — waterfall plus a dawn chorus
// =====================================================
function cascadaConAves(seconds) {
  const T = 4 * SR, D = seconds * SR, N = D + T;
  const rnd = mulberry32(18018);
  // Broadband spray over a low rumble — a waterfall is both at once.
  const spray = onePoleHighpass(onePoleLowpass(whiteNoise(N, rnd), 7800), 340);
  const rumble = onePoleLowpass(brownNoise(N, mulberry32(19019), 0.9988), 260);
  const mixed = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    // Slow surges: the volume of falling water is never quite steady.
    const surge = 0.86 + 0.14 * Math.sin(2 * Math.PI * t / 11.3) * Math.cos(2 * Math.PI * t / 4.7);
    mixed[i] = spray[i] * surge * 3.1 + rumble[i] * 7.5;
  }
  const bed = wrapCrossfade(mixed, D, T);
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  for (let i = 0; i < D; i++) { L[i] = bed[i]; R[i] = bed[i] * 0.97; }
  // A generous dawn chorus over the top — this is the birds track.
  const bRnd = mulberry32(20020);
  const SPECIES = [
    [2600, 3400, 60, 4, 70], [1900, 1500, 120, 3, 140], [3600, 2800, 50, 6, 55],
    [1400, 2200, 150, 2, 200], [2900, 2900, 40, 7, 45], [1100, 1600, 190, 2, 260],
  ];
  for (let b = 0; b < Math.round(seconds / 2.6); b++) {
    const sp = SPECIES[Math.floor(bRnd() * SPECIES.length)];
    wrapAddStereo(L, R, Math.floor(bRnd() * seconds * SR),
      birdCall(sp[0], sp[1], sp[2], sp[3], sp[4], 0.075 + bRnd() * 0.08, bRnd), bRnd());
  }
  peakNormalize([L, R], 0.80);
  return [L, R];
}

// =====================================================
// 11. Amazonas — music FROM the forest: flute and wood over a jungle bed
// =====================================================
function amazonas(seconds) {
  const D = seconds * SR;
  const rain = rainBed(D, mulberry32(21021), 1300, 240, 1.5);   // distant, quiet
  const bugs = insectBed(D, mulberry32(22022), 4600, 0.030);
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  for (let i = 0; i < D; i++) { L[i] = rain[i] * 0.55 + bugs[i]; R[i] = rain[i] * 0.55 + bugs[i] * 0.9; }

  // E minor pentatonic, low register — the melody stays slow and unhurried.
  const scale = [164.81, 196.00, 220.00, 246.94, 293.66, 329.63, 392.00, 440.00];
  const rnd = mulberry32(23023);
  const flutes = Math.round(seconds / 8);
  for (let i = 0; i < flutes; i++) {
    const at = (i * seconds) / flutes + (rnd() - 0.5) * 1.8;
    const f = scale[Math.floor(rnd() * scale.length)];
    wrapAddStereo(L, R, Math.floor(at * SR),
      fluteNote(f, 4.5 + rnd() * 2.5, 0.19 + rnd() * 0.07, mulberry32(24024 + i)),
      0.5 + (rnd() - 0.5) * 0.45);
  }
  // Wooden accents between the flute phrases.
  const wRnd = mulberry32(25025);
  for (let i = 0; i < Math.round(seconds / 3.2); i++) {
    const f = scale[Math.floor(wRnd() * scale.length)] * 2;
    wrapAddStereo(L, R, Math.floor(wRnd() * seconds * SR),
      woodNote(f, 0.12 + wRnd() * 0.07), wRnd());
  }
  // Occasional bird, so it still reads as the Amazon and not a studio.
  const bRnd = mulberry32(26026);
  for (let b = 0; b < Math.round(seconds / 12); b++) {
    wrapAddStereo(L, R, Math.floor(bRnd() * seconds * SR),
      birdCall(2100 + bRnd() * 900, 1600 + bRnd() * 800, 90, 3, 120, 0.05, bRnd), bRnd());
  }
  peakNormalize([L, R], 0.76);
  return [L, R];
}

// =====================================================
// 12. Olas de playa — shore break: rumble, crash, foam, gap. Distinct from
// olas-del-mar, which is open-sea swell with no break.
// =====================================================
function olasDePlaya(seconds) {
  const T = 4 * SR, D = seconds * SR;
  // A quiet sea floor underneath the individual waves.
  const seaRaw = onePoleLowpass(brownNoise(D + T, mulberry32(27027), 0.9988), 520);
  const sea = wrapCrossfade(seaRaw, D, T);
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  for (let i = 0; i < D; i++) { L[i] = sea[i] * 4.0; R[i] = sea[i] * 3.8; }

  const rnd = mulberry32(28028);
  const waves = Math.max(4, Math.round(seconds / 9.5));
  for (let w = 0; w < waves; w++) {
    const at = (w * seconds) / waves + (rnd() - 0.5) * 1.6;
    const dur = 5.0 + rnd() * 2.4;
    const n = Math.floor(dur * SR);
    const wr = mulberry32(29029 + w);
    // Three stages in one gesture: approach rumble -> break -> foam draining.
    const body = onePoleLowpass(whiteNoise(n, wr), 1500);
    const foam = onePoleHighpass(onePoleLowpass(whiteNoise(n, mulberry32(30030 + w)), 9000), 2400);
    const s = new Float64Array(n);
    const breakAt = dur * 0.34;
    const amp = 0.55 + rnd() * 0.35;
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const rise = Math.min(1, Math.pow(t / breakAt, 2.1));
      const fall = t <= breakAt ? 1 : Math.exp(-(t - breakAt) / (dur * 0.30));
      const env = rise * fall;
      // Foam arrives just after the break and outlives the low rumble.
      const foamEnv = t < breakAt ? 0 : Math.exp(-(t - breakAt) / (dur * 0.42));
      s[k] = (body[k] * 6.5 * env + foam[k] * 2.4 * foamEnv) * amp;
    }
    wrapAddStereo(L, R, Math.floor(at * SR), s, 0.5 + (rnd() - 0.5) * 0.30);
  }
  peakNormalize([L, R], 0.82);
  return [L, R];
}

// =====================================================
// FREQUENCY LAYER — brainwave bands and purpose beds.
//
// A note on units, because it matters: brainwave bands are measured in HERTZ
// (cycles per second), not megahertz. Delta is ~0.5-4 Hz, theta 4-8, alpha
// 8-12, beta 12-30, gamma 30-100. A megahertz tone is radio, not audio — it is
// millions of times above human hearing. What is actually produced here is a
// BINAURAL BEAT: an audible carrier tone in one ear and the same tone offset by
// the target number of hertz in the other, so the difference is perceived as a
// slow pulse. Headphones are required or the effect does not exist at all.
//
// Honesty rule applied throughout: these are relaxation and focus beds built on
// the named frequencies. The metadata describes WHAT EACH TRACK IS, never a
// medical, psychological or financial outcome. See data/tracks.json.
// =====================================================

// One binaural voice: `carrier` in the left ear, `carrier + beat` in the right.
// opts.sub adds a quiet octave below, which keeps high carriers from turning
// piercing over an hour of playback.
function binauralBed(seconds, voices, opts) {
  const o = opts || {};
  const D = Math.round(seconds * SR);
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  const lfoPeriod = o.lfoPeriod || 8;   // must divide `seconds` to wrap cleanly
  for (const v of voices) {
    const fL = integerize(v.carrier, seconds);
    const fR = integerize(v.carrier + v.beat, seconds);
    const sub = o.sub ? integerize(v.carrier / 2, seconds) : 0;
    const amp = v.amp == null ? 0.30 : v.amp;
    for (let i = 0; i < D; i++) {
      const t = i / SR;
      const lfo = 0.82 + 0.18 * Math.sin(2 * Math.PI * t / lfoPeriod);
      const g = amp * lfo;
      let l = Math.sin(2 * Math.PI * fL * t) * g;
      let r = Math.sin(2 * Math.PI * fR * t) * g;
      // A weak second harmonic gives the tone a little body.
      l += Math.sin(2 * Math.PI * fL * 2 * t) * g * 0.07;
      r += Math.sin(2 * Math.PI * fR * 2 * t) * g * 0.07;
      if (sub) {
        const s = Math.sin(2 * Math.PI * sub * t) * g * 0.30;
        l += s; r += s;
      }
      L[i] += l; R[i] += r;
    }
  }
  // Optional noise bed: softens the tone and gives the ear something organic.
  if (o.bedGain) {
    const T = 3 * SR;
    const raw = onePoleLowpass(brownNoise(D + T, mulberry32(o.seed || 31031), 0.998), o.bedCutoff || 900);
    const bed = wrapCrossfade(raw, D, T);
    let peak = 0;
    for (let i = 0; i < D; i++) peak = Math.max(peak, Math.abs(bed[i]));
    const bg = peak > 0 ? o.bedGain / peak : 0;
    for (let i = 0; i < D; i++) { L[i] += bed[i] * bg; R[i] += bed[i] * bg * 0.96; }
  }
  // Optional rain instead of (or over) the brown bed.
  if (o.rainGain) {
    const rain = rainBed(D, mulberry32(o.rainSeed || 32032), o.rainLow || 2400, o.rainHigh || 280, 3.4);
    for (let i = 0; i < D; i++) { L[i] += rain[i] * o.rainGain; R[i] += rain[i] * o.rainGain * 0.97; }
  }
  peakNormalize([L, R], o.peak || 0.76);
  return [L, R];
}

// =====================================================
// Guided breathing — the 4-7-8 pattern: inhale 4 s, hold 7 s, exhale 8 s.
// The loop is exactly one 19-second cycle, so it repeats forever in time.
// =====================================================
function respiracionGuiada() {
  const seconds = 19;                 // 4 + 7 + 8
  const D = seconds * SR;
  const L = new Float64Array(D);
  const R = new Float64Array(D);
  const pad = integerize(220, seconds);        // A3
  const fifth = integerize(329.63, seconds);   // E4
  const low = integerize(110, seconds);
  for (let i = 0; i < D; i++) {
    const t = i / SR;
    let env;
    if (t < 4) env = Math.pow(t / 4, 0.85);                    // rising: inhale
    else if (t < 11) env = 1;                                  // steady: hold
    else env = Math.pow(1 - (t - 11) / 8, 1.15);               // falling: exhale
    const tone = Math.sin(2 * Math.PI * pad * t) * 0.26
      + Math.sin(2 * Math.PI * fifth * t) * 0.10
      + Math.sin(2 * Math.PI * low * t) * 0.14;
    // The exhale opens slightly wider in the stereo field than the inhale.
    L[i] = tone * env;
    R[i] = tone * env * (t >= 11 ? 1.0 : 0.94);
  }
  peakNormalize([L, R], 0.74);
  return [L, R];
}

// =====================================================
console.log('Generating sleep audio library ->', OUT_DIR);
writeRawAndEncode('lluvia-suave', lluviaSuave(60), '96k');
writeRawAndEncode('olas-del-mar', olasDelMar(60), '96k');
writeRawAndEncode('ruido-marron', ruidoMarron(45), '80k');
writeRawAndEncode('viento-en-el-bosque', vientoEnElBosque(60), '96k');
writeRawAndEncode('nocturno-suave', nocturnoSuave(64), '112k');
writeRawAndEncode('ondas-theta', ondasTheta(60), '112k');
writeRawAndEncode('cuencos-tibetanos', cuencosTibetanos(72), '112k');
writeRawAndEncode('cuenco-de-cristal-y-lluvia', cuencoDeCristalYLluvia(72), '112k');
writeRawAndEncode('selva-tropical', selvaTropical(72), '112k');
writeRawAndEncode('cascada-con-aves', cascadaConAves(72), '112k');
writeRawAndEncode('amazonas', amazonas(96), '112k');
writeRawAndEncode('olas-de-playa', olasDePlaya(76), '112k');

// --- brainwave bands (binaural; 24 s loops — a steady tone needs no more) ---
writeRawAndEncode('delta-sueno-profundo',
  binauralBed(24, [{ carrier: 120, beat: 2.5, amp: 0.34 }],
    { bedGain: 0.26, bedCutoff: 700, lfoPeriod: 8, seed: 33033 }), '96k');
writeRawAndEncode('alfa-relajacion',
  binauralBed(24, [{ carrier: 220, beat: 10, amp: 0.32 }],
    { bedGain: 0.20, bedCutoff: 1100, lfoPeriod: 6, seed: 34034 }), '96k');
writeRawAndEncode('beta-concentracion',
  binauralBed(24, [{ carrier: 240, beat: 16, amp: 0.30 }],
    { bedGain: 0.18, bedCutoff: 1400, lfoPeriod: 6, seed: 35035 }), '96k');
writeRawAndEncode('gamma-claridad',
  binauralBed(24, [{ carrier: 300, beat: 40, amp: 0.28 }],
    { bedGain: 0.16, bedCutoff: 1600, lfoPeriod: 8, seed: 36036 }), '96k');

// --- purpose beds, each built on its named frequency ---
// Stress relief: 396 Hz carried with a 10 Hz alpha offset, under soft rain.
writeRawAndEncode('alivio-del-estres',
  binauralBed(24, [{ carrier: 396, beat: 10, amp: 0.24 }],
    { rainGain: 0.62, lfoPeriod: 8, sub: true, seed: 37037, rainSeed: 38038 }), '112k');
// Physical wellbeing: the two lowest Solfeggio tones over a warm bed.
writeRawAndEncode('bienestar-fisico',
  binauralBed(24, [{ carrier: 174, beat: 3, amp: 0.26 }, { carrier: 285, beat: 3, amp: 0.16 }],
    { bedGain: 0.24, bedCutoff: 800, lfoPeriod: 12, seed: 39039 }), '96k');
// 528 Hz, the most widely circulated of the set, kept nearly bare.
writeRawAndEncode('frecuencia-528',
  binauralBed(24, [{ carrier: 528, beat: 8, amp: 0.22 }],
    { bedGain: 0.14, bedCutoff: 900, lfoPeriod: 8, sub: true, seed: 40040 }), '96k');
// Abundance: 432 Hz tuning with 639 Hz above, at the 7.83 Hz Schumann offset.
writeRawAndEncode('abundancia',
  binauralBed(24, [{ carrier: 432, beat: 7.83, amp: 0.22 }, { carrier: 639, beat: 7.83, amp: 0.12 }],
    { bedGain: 0.16, bedCutoff: 1200, lfoPeriod: 8, sub: true, seed: 41041 }), '112k');
// Mental clarity: 741 Hz with a 14 Hz beta offset and a brighter bed.
writeRawAndEncode('claridad-mental',
  binauralBed(24, [{ carrier: 741, beat: 14, amp: 0.20 }],
    { bedGain: 0.18, bedCutoff: 2000, lfoPeriod: 6, sub: true, seed: 42042 }), '96k');
// Intuition: 852 Hz slowed by a 6 Hz theta offset.
writeRawAndEncode('intuicion-852',
  binauralBed(24, [{ carrier: 852, beat: 6, amp: 0.18 }],
    { bedGain: 0.16, bedCutoff: 1400, lfoPeriod: 8, sub: true, seed: 43043 }), '96k');
// Deep calm: 963 Hz over a low C support, 5 Hz theta offset.
writeRawAndEncode('paz-963',
  binauralBed(24, [{ carrier: 963, beat: 5, amp: 0.16 }, { carrier: 261.63, beat: 5, amp: 0.14 }],
    { bedGain: 0.18, bedCutoff: 1000, lfoPeriod: 8, seed: 44044 }), '96k');
// Work focus: brown noise forward, a 14 Hz beta tone sitting well behind it.
writeRawAndEncode('enfoque-profundo',
  binauralBed(24, [{ carrier: 240, beat: 14, amp: 0.12 }],
    { bedGain: 0.62, bedCutoff: 1300, lfoPeriod: 12, seed: 45045 }), '96k');

// --- guided breathing ---
writeRawAndEncode('respiracion-guiada', respiracionGuiada(), '96k');
console.log('Done.');
