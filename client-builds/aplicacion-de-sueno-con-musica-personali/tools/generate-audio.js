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

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SR = 44100;
const OUT_DIR = path.join(__dirname, '..', 'public', 'audio');
const TMP_DIR = path.join(require('os').tmpdir(), 'sueno-audio-build');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

// --- deterministic PRNG so a rebuild produces identical files ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- DSP helpers ---
function whiteNoise(n, rnd) {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = rnd() * 2 - 1;
  return x;
}

function onePoleLowpass(x, cutoffHz) {
  const dt = 1 / SR;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const a = dt / (rc + dt);
  const y = new Float64Array(x.length);
  let prev = 0;
  for (let i = 0; i < x.length; i++) { prev += a * (x[i] - prev); y[i] = prev; }
  return y;
}

function onePoleHighpass(x, cutoffHz) {
  const lp = onePoleLowpass(x, cutoffHz);
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] - lp[i];
  return y;
}

// Brown-ish noise: leaky integration of white noise.
function brownNoise(n, rnd, leak) {
  const y = new Float64Array(n);
  let acc = 0;
  const k = leak == null ? 0.997 : leak;
  for (let i = 0; i < n; i++) { acc = acc * k + (rnd() * 2 - 1) * 0.05; y[i] = acc; }
  return y;
}

// Seamless loop: generate D+T samples, then crossfade the extra tail T back
// over the first T samples. y[D-1] and y[0] then come from adjacent samples of
// one continuous signal, so the wrap is smooth.
function wrapCrossfade(x, D, T) {
  const y = new Float64Array(D);
  for (let i = 0; i < D; i++) y[i] = x[i];
  for (let k = 0; k < T; k++) {
    const w = 0.5 - 0.5 * Math.cos((Math.PI * k) / T); // 0 -> 1
    y[k] = x[k] * w + x[D + k] * (1 - w);
  }
  return y;
}

function peakNormalize(chans, target) {
  let peak = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
  if (peak === 0) return;
  const g = target / peak;
  for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
}

function writeRawAndEncode(name, chans, bitrate) {
  const n = chans[0].length;
  const ch = chans.length;
  const buf = Buffer.allocUnsafe(n * ch * 2);
  let o = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      let v = chans[c][i];
      if (v > 1) v = 1; else if (v < -1) v = -1;
      buf.writeInt16LE(Math.round(v * 32767), o); o += 2;
    }
  }
  const raw = path.join(TMP_DIR, name + '.raw');
  const mp3 = path.join(OUT_DIR, name + '.mp3');
  fs.writeFileSync(raw, buf);
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 's16le', '-ar', String(SR), '-ac', String(ch), '-i', raw,
    '-codec:a', 'libmp3lame', '-b:a', bitrate || '96k',
    mp3,
  ], { stdio: 'inherit' });
  fs.unlinkSync(raw);
  const kb = Math.round(fs.statSync(mp3).size / 1024);
  console.log(`  ${name}.mp3  ${(n / SR).toFixed(0)}s  ${ch}ch  ${kb} KB`);
}

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
console.log('Generating sleep audio library ->', OUT_DIR);
writeRawAndEncode('lluvia-suave', lluviaSuave(60), '96k');
writeRawAndEncode('olas-del-mar', olasDelMar(60), '96k');
writeRawAndEncode('ruido-marron', ruidoMarron(45), '80k');
writeRawAndEncode('viento-en-el-bosque', vientoEnElBosque(60), '96k');
writeRawAndEncode('nocturno-suave', nocturnoSuave(64), '112k');
writeRawAndEncode('ondas-theta', ondasTheta(60), '112k');
console.log('Done.');
