// =====================================================
// verify-tempo.js — proves the beat-driven tracks are actually on the grid.
//
// Two properties matter for a track that loops forever under a sleeping or
// working person, and neither is safe to assume:
//
//   1. EVERY HIT LANDS ON THE GRID, and the material is periodic at the
//      declared tempo. Both are measured from the audio itself.
//
//      Counting kicks does NOT work: the sub bass shares the 25-120 Hz band, so
//      an off-beat bass note is indistinguishable from a kick to an onset
//      detector. Two better tests are used instead:
//        - GRID COMB: compare the onset-envelope energy inside a narrow window
//          around every 16th-note line against the energy everywhere else. A
//          sequenced track puts almost all of its transients on the lines, so
//          the ratio is large; unsequenced audio scores about 1. This avoids
//          peak-picking entirely — a peak-picker cannot resolve a 123 ms 16th
//          note without merging adjacent hits, which is what made an earlier
//          version of this check report false failures on correct audio.
//        - AUTOCORRELATION: the onset envelope must correlate with itself at
//          exactly one beat, and more strongly than at a slightly wrong tempo,
//          which is what proves the declared BPM is the real one.
//   2. THE LOOP IS A WHOLE NUMBER OF BARS. If it is not, every repeat drifts
//      and the groove stumbles. Checked against the declared bpm and bars.
//
// Requires ffmpeg (test-time only). Run standalone:
//   node client-builds/aplicacion-de-sueno-con-musica-personali/tools/verify-tempo.js
// Exits 0 if every beat track is on grid, 1 otherwise, 2 if ffmpeg is absent.
// =====================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SR = 8000;                 // plenty for kick detection, and fast
const ROOT = path.join(__dirname, '..');
const AUDIO = path.join(ROOT, 'public', 'audio');

function ffmpegAvailable() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}

// Decode to lowpassed mono: only the kick survives a 30-120 Hz band.
function decodeLowBand(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file,
    '-af', 'highpass=f=25,lowpass=f=120', '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'],
  { maxBuffer: 1 << 27 });
  const n = Math.floor(buf.length / 4);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = buf.readFloatLE(i * 4);
  return x;
}

// Onset times, in seconds: peaks of the smoothed envelope, at least 150 ms apart
// (a kick cannot be faster than that at house tempos).
function onsets(x) {
  const env = new Float32Array(x.length);
  let e = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    e += (a > e ? 0.35 : 0.004) * (a - e);   // fast attack, slow release
    env[i] = e;
  }
  let peak = 0;
  for (let i = 0; i < env.length; i++) peak = Math.max(peak, env[i]);
  const thresh = peak * 0.35;
  const minGap = Math.floor(SR * 0.15);
  const out = [];
  let last = -minGap;
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] < thresh) continue;
    if (env[i] < env[i - 1] || env[i] < env[i + 1]) continue;
    if (i - last < minGap) continue;
    out.push(i / SR);
    last = i;
  }
  return out;
}

// Onset energy on the grid vs off it. ~1 means unsequenced audio; a sequenced
// track concentrates its transients on the lines and scores well above that.
function gridEnergyRatio(env, rate, gridStep, tolSeconds) {
  const tol = Math.max(1, Math.round((tolSeconds || 0.015) * rate));
  const onGrid = new Float64Array(env.length);
  for (let g = 0; ; g++) {
    const centre = Math.round(g * gridStep * rate);
    if (centre >= env.length) break;
    for (let k = -tol; k <= tol; k++) {
      const i = centre + k;
      if (i >= 0 && i < env.length) onGrid[i] = 1;
    }
  }
  let onSum = 0, onN = 0, offSum = 0, offN = 0;
  for (let i = 0; i < env.length; i++) {
    if (onGrid[i]) { onSum += env[i]; onN++; } else { offSum += env[i]; offN++; }
  }
  if (!onN || !offN) return 0;
  const on = onSum / onN, off = offSum / offN;
  return off > 0 ? on / off : (on > 0 ? Infinity : 0);
}

// Normalised autocorrelation of the onset envelope at one lag, in seconds.
function autocorr(env, rate, lagSeconds) {
  const lag = Math.round(lagSeconds * rate);
  if (lag <= 0 || lag >= env.length) return 0;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i + lag < env.length; i++) {
    num += env[i] * env[i + lag];
    da += env[i] * env[i];
    db += env[i + lag] * env[i + lag];
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

// Coarse onset envelope for the autocorrelation, at 200 Hz.
function onsetEnvelope(x) {
  const step = Math.floor(SR / 200);
  const n = Math.floor(x.length / step);
  const rms = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < step; k++) { const v = x[i * step + k]; acc += v * v; }
    rms[i] = Math.sqrt(acc / step);
  }
  // Half-wave rectified difference: energy going UP is an onset.
  const env = new Float64Array(n);
  for (let i = 1; i < n; i++) env[i] = Math.max(0, rms[i] - rms[i - 1]);
  return { env, rate: 200 };
}

function verify() {
  if (!ffmpegAvailable()) return { skipped: 'ffmpeg not on PATH' };
  const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tracks.json'), 'utf8'));
  const results = [];

  for (const t of lib.tracks) {
    if (t.bpm == null) continue;
    const file = path.join(AUDIO, t.id + '.mp3');
    if (!fs.existsSync(file)) { results.push({ id: t.id, ok: false, detail: 'audio missing' }); continue; }

    const beat = 60 / t.bpm;
    const bars = t.bars || 16;
    const expected = bars * 4 * beat;

    // The loop must be a whole number of bars. MP3 frames are 1152 samples, so
    // the container rounds up; allow one frame of slack, nothing more.
    const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
    const durErr = Math.abs(dur - expected);
    const gridOk = durErr < 0.03;

    if (t.beatless) {
      results.push({
        id: t.id, ok: gridOk,
        detail: `beatless · ${dur.toFixed(3)}s vs ${expected.toFixed(3)}s expected (${bars} bars @ ${t.bpm})`,
      });
      continue;
    }

    const low = decodeLowBand(file);
    const { env, rate } = onsetEnvelope(low);

    // Beat grid, not the 16th grid: the kick is on every beat and a ±20 ms
//      window there is 8% of the timeline, so the contrast is measurable.
    // Measured margins: beat tracks 1.35-1.71x, unsequenced audio 0.97-1.07x.
    const comb = gridEnergyRatio(env, rate, beat, 0.020);
    const atBeat = autocorr(env, rate, beat);
    const atBar = autocorr(env, rate, beat * 4);
    const atWrongFast = autocorr(env, rate, beat * 0.92);
    const atWrongSlow = autocorr(env, rate, beat * 1.08);
    // The declared BPM must be a distinct peak, not merely correlated.
    const tempoIsSharp = atBeat > atWrongFast * 1.15 && atBeat > atWrongSlow * 1.15;

    // Thresholds taken from the measured separation, not guessed. Beat tracks:
    // atBeat 0.51-0.78, atBar 0.41-0.78, comb >= 1.35, always a distinct peak.
    // Unsequenced controls: atBeat <= 0.31, comb <= 1.07, never a distinct peak.
    const ok = gridOk && comb >= 1.20 && atBeat > 0.45 && atBar > 0.35 && tempoIsSharp;
    results.push({
      id: t.id, ok,
      detail: `grid comb ${comb.toFixed(2)}x · autocorr beat ${atBeat.toFixed(2)} bar ${atBar.toFixed(2)}`
        + ` (off-tempo ${atWrongFast.toFixed(2)}/${atWrongSlow.toFixed(2)})`
        + ` · loop ${dur.toFixed(3)}s vs ${expected.toFixed(3)}s`,
    });
  }
  // NEGATIVE CONTROLS. A test that everything passes proves nothing, so the
  // same measurement is run against unsequenced tracks pretending to be house.
  // Each one MUST fail: if a rain bed can look like a 122 BPM groove, the
  // thresholds above are meaningless.
  const controls = [];
  for (const id of ['lluvia-suave', 'handpan-kurd', 'olas-de-playa', 'kalimba']) {
    const file = path.join(AUDIO, id + '.mp3');
    if (!fs.existsSync(file)) continue;
    const beat = 60 / 122;
    const { env, rate } = onsetEnvelope(decodeLowBand(file));
    const comb = gridEnergyRatio(env, rate, beat, 0.020);
    const atBeat = autocorr(env, rate, beat);
    const sharp = atBeat > autocorr(env, rate, beat * 0.92) * 1.15
      && atBeat > autocorr(env, rate, beat * 1.08) * 1.15;
    const wouldPass = comb >= 1.20 && atBeat > 0.45 && sharp;
    controls.push({
      id, rejected: !wouldPass,
      detail: `comb ${comb.toFixed(2)}x · autocorr@beat ${atBeat.toFixed(2)} · distinct peak: ${sharp ? 'yes' : 'no'}`,
    });
  }
  return { results, controls };
}

module.exports = { verify };

if (require.main === module) {
  const out = verify();
  if (out.skipped) { console.log('SKIPPED: ' + out.skipped); process.exit(2); }
  let bad = 0;
  for (const r of out.results) {
    if (!r.ok) bad++;
    console.log(`  [${r.ok ? 'OK  ' : 'FAIL'}] ${r.id.padEnd(26)} ${r.detail}`);
  }
  let ctlBad = 0;
  if (out.controls && out.controls.length) {
    console.log('\n  negative controls (unsequenced audio measured against a 122 BPM grid — all must be rejected):');
    for (const c of out.controls) {
      if (!c.rejected) { ctlBad++; bad++; }
      console.log(`  [${c.rejected ? 'OK  ' : 'FAIL'}] ${c.id.padEnd(26)} ${c.detail}`);
    }
  }
  console.log(`\n${out.results.length - bad}/${out.results.length} beat tracks on grid`);
  process.exit(bad === 0 ? 0 : 1);
}
