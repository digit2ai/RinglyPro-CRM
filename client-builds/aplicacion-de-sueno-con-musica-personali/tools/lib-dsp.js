// =====================================================
// lib-dsp.js — the shared signal-processing floor for both generators.
//
// Extracted from generate-audio.js so generate-instrumental.js does not carry a
// second copy. The functions are byte-for-byte the originals, including the
// deterministic PRNG, so regenerating the wave library produces identical MP3s
// (verified by `git diff` reporting no change to the existing audio files).
//
// Build-time only. Production never loads this.
// =====================================================

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SR = 44100;

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

// Add a mono event into a stereo pair at a given pan (0 = left, 1 = right).
// Writes MODULO the buffer length, so an event starting near the end simply
// continues over the loop point — that is what makes these tracks seamless.
function wrapAddStereo(L, R, startSample, samples, pan) {
  const D = L.length;
  const gl = 1 - pan, gr = pan;
  for (let k = 0; k < samples.length; k++) {
    const idx = ((startSample + k) % D + D) % D;
    L[idx] += samples[k] * gl;
    R[idx] += samples[k] * gr;
  }
}

function wrapAddMono(y, startSample, samples) {
  const D = y.length;
  for (let k = 0; k < samples.length; k++) {
    y[((startSample + k) % D + D) % D] += samples[k];
  }
}

// Snap a frequency to an exact whole number of cycles over the loop, so a
// sustained tone never clicks at the loop point.
function integerize(f, seconds) {
  return Math.max(1, Math.round(f * seconds)) / seconds;
}

// Loudness target for the WHOLE library, in LUFS (EBU R128).
//
// Peak normalisation alone is not enough here: a plucked guqin peaks as high as
// a flute but averages 16 dB quieter, so switching tracks at a fixed device
// volume would make one inaudible and the next startling. -19 LUFS is quiet
// enough for a bedroom while leaving headroom.
const TARGET_LUFS = -19;
const TARGET_TP = -2.0;
const TARGET_LRA = 14;   // generous, so a gong's dynamics survive

// Measure the raw PCM, so pass two can apply a single LINEAR gain. Linear mode
// preserves the track's own dynamics exactly — it is a volume change, not a
// compressor. Returns null if measurement fails, and the caller falls back to
// a plain encode rather than failing the build.
function measureLoudness(rawPath, channels) {
  try {
    const res = require('child_process').spawnSync('ffmpeg', [
      '-hide_banner', '-f', 's16le', '-ar', String(SR), '-ac', String(channels), '-i', rawPath,
      '-af', `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
      '-f', 'null', '-',
    ], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const out = (res.stderr || '') + (res.stdout || '');
    const start = out.lastIndexOf('{');
    const end = out.lastIndexOf('}');
    if (start < 0 || end < start) return null;
    const m = JSON.parse(out.slice(start, end + 1));
    if (m.input_i == null || String(m.input_i) === '-inf') return null;
    return m;
  } catch (e) { return null; }
}

// Returns a writeRawAndEncode bound to an output directory.
function makeEncoder(outDir, tmpName) {
  const tmpDir = path.join(os.tmpdir(), tmpName || 'sueno-audio-build');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  return function writeRawAndEncode(name, chans, bitrate) {
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
    const raw = path.join(tmpDir, name + '.raw');
    const mp3 = path.join(outDir, name + '.mp3');
    fs.writeFileSync(raw, buf);

    // Two-pass loudness match, then ONE encode — measuring the PCM rather than
    // re-encoding a finished MP3, so there is no generation loss.
    const m = measureLoudness(raw, ch);
    const filter = m
      ? `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}`
        + `:measured_I=${m.input_i}:measured_TP=${m.input_tp}`
        + `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}`
        + `:offset=${m.target_offset}:linear=true`
      : null;

    const args = ['-y', '-hide_banner', '-loglevel', 'error',
      '-f', 's16le', '-ar', String(SR), '-ac', String(ch), '-i', raw];
    if (filter) args.push('-af', filter);
    args.push('-codec:a', 'libmp3lame', '-b:a', bitrate || '96k', mp3);
    execFileSync('ffmpeg', args, { stdio: 'inherit' });

    fs.unlinkSync(raw);
    const kb = Math.round(fs.statSync(mp3).size / 1024);
    const loud = m ? `${Number(m.input_i).toFixed(1)} -> ${TARGET_LUFS} LUFS` : 'loudness unmeasured';
    console.log(`  ${name}.mp3  ${(n / SR).toFixed(0)}s  ${ch}ch  ${kb} KB  ${loud}`);
  };
}

module.exports = {
  SR, mulberry32, whiteNoise, onePoleLowpass, onePoleHighpass, brownNoise,
  wrapCrossfade, peakNormalize, wrapAddStereo, wrapAddMono, integerize, makeEncoder,
};
