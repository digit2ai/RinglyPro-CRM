'use strict';
/**
 * Measures what the breathing estimator actually does, rather than asserting it.
 *
 * Two numbers matter and neither can be reasoned to:
 *   FALSE ALARM — how often pure noise comes back as a confident breathing rate.
 *                 Every one of those is a wrong number an owner would act on.
 *   RECOVERY    — how often a known rate buried in noise is recovered, and how
 *                 close. A detector that refuses everything has a perfect false
 *                 alarm rate and is useless.
 *
 * Run: node verticals/marapet/scripts/calibrate-breathing.js
 */
const b = require('../src/services/breathing.js');

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const FPS = 30, SECS = 30, N = FPS * SECS;
const TRIALS = 400;

let falseAlarm = 0;
for (let t = 0; t < TRIALS; t++) {
  const rnd = mulberry(1000 + t);
  const s = [];
  // noise plus slow exposure drift, which is what a real still camera gives
  for (let i = 0; i < N; i++) s.push(gauss(rnd) + 0.4 * Math.sin(2 * Math.PI * 0.012 * i / FPS));
  if (b.estimate(s, FPS).ok) falseAlarm++;
}

const rows = [];
for (const snr of [3, 1.5, 1.0, 0.6, 0.35, 0.2, 0.1]) {
  let ok = 0, within2 = 0, n = 0;
  for (const bpm of [12, 18, 24, 30, 40, 60]) {
    for (let t = 0; t < 40; t++) {
      const rnd = mulberry(7000 + t * 97 + bpm);
      const s = [];
      for (let i = 0; i < N; i++) {
        s.push(snr * Math.sin(2 * Math.PI * (bpm / 60) * (i / FPS) + t)
               + gauss(rnd)
               + 0.4 * Math.sin(2 * Math.PI * 0.012 * i / FPS));
      }
      const r = b.estimate(s, FPS);
      n++;
      if (r.ok) { ok++; if (Math.abs(r.bpm - bpm) <= 2) within2++; }
    }
  }
  rows.push({ snr, detected_pct: Math.round(100 * ok / n), correct_within_2bpm_pct: Math.round(100 * within2 / n) });
}

console.log('MaraPet breathing estimator — measured behaviour');
console.log(`  window ${SECS}s at ${FPS}fps, declared false-alarm target ${b.FALSE_ALARM * 100}%`);
console.log('');
console.log(`  FALSE ALARM on pure noise: ${falseAlarm}/${TRIALS} = ${(100 * falseAlarm / TRIALS).toFixed(2)}%`);
console.log('');
console.log('  amplitude/noise  detected   correct within 2 bpm');
for (const r of rows) {
  console.log(`  ${String(r.snr).padStart(14)}   ${String(r.detected_pct + '%').padStart(7)}   ${String(r.correct_within_2bpm_pct + '%').padStart(18)}`);
}
console.log('');
console.log('  Of the clips it accepts, the share that are within 2 bpm of truth is the');
console.log('  figure that matters: a refusal costs the owner a retake, a wrong number');
console.log('  costs them a vet visit they did not need, or one they did not make.');
