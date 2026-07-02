// =====================================================
// bench-rppg.js — runs the EXACT browser DSP (rppg-core.js) against committed
// RGB-trace fixtures with known ground-truth HR, and reports MAE / RMSE / %±3bpm.
// This is a reproducible accuracy benchmark, NOT a clinical validation.
//   run: node client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/scripts/bench-rppg.js
// Exits 0 when MAE is under BOUND_BPM, else 1.
// Fixtures: fixtures/*_gt<HR>.csv  with header  t_ms,r,g,b
// Source format modeled on public rPPG datasets (UBFC-rPPG / PURE). No video vendored.
// =====================================================

const fs = require('fs');
const path = require('path');
const Core = require('../public/rppg-core');

const BOUND_BPM = 5.0;
const FIX_DIR = path.join(__dirname, '..', 'fixtures');

function parseCsv(txt) {
  const lines = txt.trim().split(/\r?\n/).filter((l) => l && !/^t_ms/i.test(l));
  const t = [], r = [], g = [], b = [];
  for (const ln of lines) {
    const p = ln.split(',');
    if (p.length < 4) continue;
    t.push(Number(p[0])); r.push(Number(p[1])); g.push(Number(p[2])); b.push(Number(p[3]));
  }
  return { t, r, g, b };
}

function main() {
  if (!fs.existsSync(FIX_DIR)) { console.error('No fixtures dir:', FIX_DIR); process.exit(1); }
  const files = fs.readdirSync(FIX_DIR).filter((f) => f.endsWith('.csv'));
  if (!files.length) { console.error('No fixtures found in', FIX_DIR); process.exit(1); }

  const rows = [];
  let absSum = 0, sqSum = 0, within3 = 0, n = 0;
  for (const f of files) {
    const m = f.match(/_gt(\d+)/);
    if (!m) continue;
    const gt = parseInt(m[1], 10);
    const trace = parseCsv(fs.readFileSync(path.join(FIX_DIR, f), 'utf8'));
    const est = Core.estimateVitals(trace);
    const got = est.bpm;
    const err = got == null ? NaN : Math.abs(got - gt);
    if (Number.isFinite(err)) { absSum += err; sqSum += err * err; if (err <= 3) within3++; n++; }
    rows.push({ f, gt, got: got == null ? 'null' : got, rr: est.respiratory_bpm, sqi: est.sqi, err: Number.isFinite(err) ? err.toFixed(1) : 'n/a' });
  }

  const mae = n ? absSum / n : Infinity;
  const rmse = n ? Math.sqrt(sqSum / n) : Infinity;
  const pct3 = n ? (100 * within3 / n) : 0;

  console.log('\n## rPPG benchmark — solicitud-por-voz-okay-luis-carlos-tio-e\n');
  console.log('| Fixture | GT bpm | Est bpm | RR | SQI | |err| |');
  console.log('|---|---|---|---|---|---|');
  rows.forEach((r) => console.log(`| ${r.f} | ${r.gt} | ${r.got} | ${r.rr == null ? '—' : r.rr} | ${r.sqi} | ${r.err} |`));
  console.log(`\n**MAE = ${mae.toFixed(2)} bpm · RMSE = ${rmse.toFixed(2)} bpm · within ±3 bpm = ${pct3.toFixed(0)}% (n=${n}) · bound = ${BOUND_BPM} bpm**`);

  if (mae <= BOUND_BPM) { console.log(`\nPASS — MAE ${mae.toFixed(2)} <= ${BOUND_BPM}`); process.exit(0); }
  console.log(`\nFAIL — MAE ${mae.toFixed(2)} > ${BOUND_BPM}`); process.exit(1);
}

main();
