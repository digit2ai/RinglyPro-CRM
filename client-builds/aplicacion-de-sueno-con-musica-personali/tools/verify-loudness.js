// =====================================================
// verify-loudness.js — proves the whole library sits at one listening level.
//
// Peak normalisation is not enough: a plucked guqin can peak as high as a flute
// while averaging 16 dB quieter. Before the loudness pass this library spanned
// 17.2 LUFS end to end, which in practice means picking a new track at 2am and
// either hearing nothing or being startled awake. Every file is measured here
// with ffmpeg's EBU R128 meter and the spread is asserted.
//
// Requires ffmpeg (test-time only). Run standalone:
//   node client-builds/aplicacion-de-sueno-con-musica-personali/tools/verify-loudness.js
// Exits 0 if the spread is within tolerance, 1 if not, 2 if ffmpeg is absent.
// =====================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const AUDIO = path.join(ROOT, 'public', 'audio');
const TOLERANCE_LUFS = 3.0;

function ffmpegAvailable() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}

// Integrated loudness (LUFS) and true peak (dBTP) for one file.
function measure(file) {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128=peak=true:framelog=quiet',
    '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = (res.stderr || '') + (res.stdout || '');
  const tail = out.slice(out.lastIndexOf('Integrated loudness'));
  const i = /I:\s*(-?[\d.]+)\s*LUFS/.exec(tail);
  const tp = /Peak:\s*(-?[\d.]+|-inf)\s*dBFS/.exec(out.slice(out.lastIndexOf('True peak')));
  return {
    lufs: i ? parseFloat(i[1]) : null,
    truePeak: tp && tp[1] !== '-inf' ? parseFloat(tp[1]) : null,
  };
}

function verify() {
  if (!ffmpegAvailable()) return { skipped: 'ffmpeg not on PATH' };
  const lib = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tracks.json'), 'utf8'));

  const rows = [];
  for (const t of lib.tracks) {
    const file = path.join(AUDIO, t.id + '.mp3');
    if (!fs.existsSync(file)) return { skipped: `audio missing for ${t.id}` };
    const m = measure(file);
    if (m.lufs == null) return { skipped: `could not measure ${t.id}` };
    rows.push({ id: t.id, lufs: m.lufs, truePeak: m.truePeak == null ? -99 : m.truePeak });
  }
  rows.sort((a, b) => a.lufs - b.lufs);
  return {
    count: rows.length,
    rows,
    quietest: rows[0],
    loudest: rows[rows.length - 1],
    spread: rows[rows.length - 1].lufs - rows[0].lufs,
    maxTruePeak: rows.reduce((mx, r) => Math.max(mx, r.truePeak), -99),
  };
}

module.exports = { verify, TOLERANCE_LUFS };

if (require.main === module) {
  const out = verify();
  if (out.skipped) { console.log('SKIPPED: ' + out.skipped); process.exit(2); }
  for (const r of out.rows) {
    console.log(`  ${r.id.padEnd(30)} ${r.lufs.toFixed(1).padStart(6)} LUFS   ${r.truePeak.toFixed(2).padStart(6)} dBTP`);
  }
  console.log(`\n  ${out.count} tracks · quietest ${out.quietest.lufs.toFixed(1)} (${out.quietest.id})`
    + ` · loudest ${out.loudest.lufs.toFixed(1)} (${out.loudest.id})`);
  console.log(`  spread ${out.spread.toFixed(1)} LUFS (tolerance ${TOLERANCE_LUFS})`
    + ` · worst true peak ${out.maxTruePeak.toFixed(2)} dBTP`);
  process.exit(out.spread <= TOLERANCE_LUFS && out.maxTruePeak <= -0.5 ? 0 : 1);
}
