// =====================================================
// verify-binaural.js — proves the binaural tracks actually contain the
// frequencies their metadata advertises, instead of taking the label's word.
//
// For each track with a `beat_hz`, the encoded MP3 is decoded back to PCM and a
// Goertzel filter measures the energy at one exact frequency per channel:
//   left  should be dominated by `carrier`
//   right should be dominated by `carrier + beat`
// A track that fails this is mislabelled, and a mislabelled frequency is the
// one thing this library must never ship.
//
// Requires ffmpeg (build/test-time only). Run standalone:
//   node client-builds/aplicacion-de-sueno-con-musica-personali/tools/verify-binaural.js
// Exits 0 if every track matches its label, 1 otherwise, 2 if ffmpeg is absent.
// =====================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SR = 44100;
const ROOT = path.join(__dirname, '..');
const AUDIO = path.join(ROOT, 'public', 'audio');

function ffmpegAvailable() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch (e) { return false; }
}

// Energy at a single exact frequency. Cheaper than a full FFT and more precise
// at the frequency we actually care about.
function goertzel(x, f, sr) {
  const w = (2 * Math.PI * f) / sr;
  const c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - c * s1 * s2)) / x.length;
}

function decodeStereo(file) {
  const buf = execFileSync('ffmpeg',
    ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'],
    { maxBuffer: 1 << 28 });
  const n = Math.floor(buf.length / 8);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = buf.readFloatLE(i * 8); R[i] = buf.readFloatLE(i * 8 + 4); }
  return { L, R, n };
}

// Returns { skipped } or { results: [{id, ok, detail}] }
function verify() {
  if (!ffmpegAvailable()) return { skipped: 'ffmpeg not on PATH' };

  const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tracks.json'), 'utf8'));
  const results = [];

  for (const t of lib.tracks) {
    if (t.beat_hz == null) continue;
    // The carrier the left ear should hold. Purpose beds name it `frequency_hz`;
    // the brainwave beds name it `carrier_hz`. Both mean the same thing.
    const carrier = t.carrier_hz != null ? t.carrier_hz : t.frequency_hz;
    if (carrier == null) {
      results.push({ id: t.id, ok: false, detail: 'no carrier_hz or frequency_hz to check against' });
      continue;
    }
    const file = path.join(AUDIO, t.id + '.mp3');
    if (!fs.existsSync(file)) {
      results.push({ id: t.id, ok: false, detail: 'audio file missing' });
      continue;
    }
    const right = carrier + t.beat_hz;
    const { L, R, n } = decodeStereo(file);
    // A 4-second window from the middle: past any encoder warm-up, and long
    // enough that the Goertzel bin is far narrower than the beat itself.
    const st = Math.floor(n / 2);
    const len = Math.min(SR * 4, n - st);
    const l = L.subarray(st, st + len);
    const r = R.subarray(st, st + len);
    const lAtCarrier = goertzel(l, carrier, SR);
    const rAtCarrier = goertzel(r, carrier, SR);
    const rAtRight = goertzel(r, right, SR);
    // Each ear must clearly favour its own tone. 4x is far below the ~500x the
    // synthesis actually achieves, so this catches mislabelling, not encoding.
    const ok = lAtCarrier > rAtCarrier * 4 && rAtRight > rAtCarrier * 4;
    results.push({
      id: t.id,
      ok,
      detail: `L@${carrier}=${lAtCarrier.toExponential(2)} `
        + `R@${carrier}=${rAtCarrier.toExponential(2)} R@${right}=${rAtRight.toExponential(2)}`,
    });
  }
  return { results };
}

module.exports = { verify };

if (require.main === module) {
  const out = verify();
  if (out.skipped) {
    console.log('SKIPPED: ' + out.skipped);
    process.exit(2);
  }
  let bad = 0;
  for (const r of out.results) {
    if (!r.ok) bad++;
    console.log(`  [${r.ok ? 'OK  ' : 'FAIL'}] ${r.id.padEnd(28)} ${r.detail}`);
  }
  console.log(`\n${out.results.length - bad}/${out.results.length} binaural tracks match their labels`);
  process.exit(bad === 0 ? 0 : 1);
}
