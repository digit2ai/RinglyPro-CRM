// =====================================================
// horseTechnique — the HORSE side of the jump (v2.1).
//
// The rubric scores the RIDER from rider pose. This module estimates the HORSE's
// jumping technique. Two sources, clearly tagged:
//
//   source:'rider_proxy'  — derived from the rider's center-of-mass (hip-midpoint)
//                           vertical trajectory. The rider rises and falls WITH the
//                           horse, so the arc, apex, air-time, and take-off/landing
//                           timing are a real, defensible PROXY for the horse's
//                           parabola. Lower confidence; no limb detail.
//   source:'horse_pose'   — computed from a real equine-keypoint contract (fore/hind
//                           hooves, withers, croup, poll). Full metrics incl.
//                           fore/hind symmetry. Wired the moment a horse-pose model
//                           ships; the contract is defined below.
//
// HONEST SCOPE: exact take-off DISTANCE in metres needs fence detection (not pose),
// and true fore/hind symmetry needs horse limbs. Those stay null / pending until a
// horse-pose model (or fence detector) is present. Nothing is fabricated.
//
// Horse-keypoint contract (normalized [0,1], y down), per frame:
//   { t, horse: { poll, withers, croup, fore_left_hoof, fore_right_hoof,
//                 hind_left_hoof, hind_right_hoof } }  (any subset; missing => null)
// =====================================================

'use strict';

const K = require('./keypoints');
const MIN_VIS = 0.2;
const clamp01 = K.clamp01;
const round = (n, d) => { const p = Math.pow(10, d || 0); return Math.round(n * p) / p; };
function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function tOf(frames, i) { const f = frames[i]; return (f && typeof f.t === 'number') ? f.t : i; }
function scoreLinear(v, good, bad) { if (good === bad) return 100; return round(clamp01((v - bad) / (good - bad)) * 100, 0); }

// Vertical center-of-mass series for the rider (hip midpoint). height = 1 - y.
function riderHeightSeries(frames) {
  const s = [];
  for (let i = 0; i < frames.length; i++) {
    const h = K.hipMid(frames[i], MIN_VIS);
    s.push(h ? (1 - h.y) : null);
  }
  return s;
}

// A horse "center" height series if a horse contract is present (withers/croup mid).
function horseHeightSeries(horseFrames) {
  if (!Array.isArray(horseFrames) || !horseFrames.length) return null;
  const s = [];
  for (const f of horseFrames) {
    const h = f && f.horse; if (!h) { s.push(null); continue; }
    const w = h.withers, c = h.croup;
    if (w && typeof w.y === 'number' && c && typeof c.y === 'number') s.push(1 - (w.y + c.y) / 2);
    else if (w && typeof w.y === 'number') s.push(1 - w.y);
    else s.push(null);
  }
  return s;
}

// Find take-off / apex / landing indices from a height series (nulls skipped).
function arcPoints(series) {
  const idx = [];
  for (let i = 0; i < series.length; i++) if (series[i] != null) idx.push(i);
  if (idx.length < 3) return null;
  // apex = max height
  let apex = idx[0], hi = -Infinity;
  idx.forEach((i) => { if (series[i] > hi) { hi = series[i]; apex = i; } });
  // baseline = median of the first third (approach)
  const approach = idx.filter((i) => i <= idx[Math.floor(idx.length / 3)]).map((i) => series[i]).sort((a, b) => a - b);
  const baseline = approach.length ? approach[Math.floor(approach.length / 2)] : series[idx[0]];
  const riseTh = baseline + Math.max(0.02, (hi - baseline) * 0.15);
  // take-off = last frame before apex still at/below rise threshold
  let takeoff = idx[0];
  for (const i of idx) { if (i >= apex) break; if (series[i] <= riseTh) takeoff = i; }
  // landing = first frame after apex back at/below rise threshold
  let landing = idx[idx.length - 1];
  for (const i of idx) { if (i <= apex) continue; if (series[i] <= riseTh) { landing = i; break; } }
  return { takeoff, apex, landing, baseline, peak: hi };
}

// fore/hind symmetry from a horse contract: compares peak height reached by the
// fore-hoof pair vs the hind-hoof pair over the jump (a balanced jumper clears
// fores and hinds evenly). null if hooves absent.
function foreHindSymmetry(horseFrames) {
  if (!Array.isArray(horseFrames) || !horseFrames.length) return null;
  let foreMax = -Infinity, hindMax = -Infinity, seen = 0;
  for (const f of horseFrames) {
    const h = f && f.horse; if (!h) continue;
    const fl = h.fore_left_hoof, fr = h.fore_right_hoof, hl = h.hind_left_hoof, hr = h.hind_right_hoof;
    const foreY = [fl, fr].filter((p) => p && typeof p.y === 'number').map((p) => 1 - p.y);
    const hindY = [hl, hr].filter((p) => p && typeof p.y === 'number').map((p) => 1 - p.y);
    if (foreY.length) { foreMax = Math.max(foreMax, Math.max.apply(null, foreY)); seen++; }
    if (hindY.length) { hindMax = Math.max(hindMax, Math.max.apply(null, hindY)); seen++; }
  }
  if (!seen || foreMax === -Infinity || hindMax === -Infinity) return null;
  const diff = Math.abs(foreMax - hindMax);
  return { value: round(diff, 3), score: scoreLinear(diff, 0.01, 0.18), fore_peak: round(foreMax, 3), hind_peak: round(hindMax, 3) };
}

// compute(frames, opts) -> horse-technique block
//   opts: { horseFrames?, category? }
function compute(frames, opts) {
  opts = opts || {};
  const horseFrames = opts.horseFrames;
  const useHorse = Array.isArray(horseFrames) && horseFrames.length >= 3;
  const series = useHorse ? horseHeightSeries(horseFrames) : riderHeightSeries(frames);
  const source = useHorse ? 'horse_pose' : 'rider_proxy';
  const confidence = useHorse ? 0.85 : 0.45;

  const out = {
    source, confidence,
    arc_height: null, bascule_score: null, arc_symmetry_score: null,
    airtime_sec: null, takeoff_sec: null, apex_sec: null, landing_sec: null,
    takeoff_distance_label: null, takeoff_distance_score: null,
    fore_hind_symmetry: useHorse ? foreHindSymmetry(horseFrames) : null,
    // still genuinely un-derivable without extra signal:
    pending: []
  };
  if (!series) { out.pending = ['bascule', 'takeoff_distance', 'fore_hind_symmetry']; return out; }

  const refFrames = useHorse ? horseFrames : frames;
  const ap = arcPoints(series);
  if (!ap) { out.pending = ['bascule', 'takeoff_distance', 'fore_hind_symmetry']; return out; }

  const arcHeight = Math.max(0, ap.peak - ap.baseline);
  out.arc_height = round(arcHeight, 3);
  out.takeoff_sec = round(tOf(refFrames, ap.takeoff), 3);
  out.apex_sec = round(tOf(refFrames, ap.apex), 3);
  out.landing_sec = round(tOf(refFrames, ap.landing), 3);
  out.airtime_sec = round(Math.max(0, out.landing_sec - out.takeoff_sec), 3);

  // Bascule = a rounded, symmetric arc with good height. Combine arc symmetry
  // (ascent vs descent time balance) with normalized height.
  const ascent = Math.max(1e-3, out.apex_sec - out.takeoff_sec);
  const descent = Math.max(1e-3, out.landing_sec - out.apex_sec);
  const sym = 1 - Math.abs(ascent - descent) / (ascent + descent);
  out.arc_symmetry_score = round(clamp01(sym) * 100, 0);
  const heightScore = scoreLinear(arcHeight, 0.22, 0.03);   // relative CoM rise
  out.bascule_score = round((out.arc_symmetry_score * 0.5 + heightScore * 0.5), 0);

  // Take-off distance (qualitative proxy): where the rise BEGINS relative to the
  // arc. A late, sharp ascent => took off CLOSE (deep); a long, early ascent =>
  // stood off (LONG). Balanced => good. Exact metres need fence detection.
  const ascentFrac = ascent / (ascent + descent);
  let label, score;
  if (ascentFrac < 0.38) { label = 'close'; score = scoreLinear(ascentFrac, 0.5, 0.2); }
  else if (ascentFrac > 0.62) { label = 'long'; score = scoreLinear(ascentFrac, 0.5, 0.8); }
  else { label = 'good'; score = 90; }
  out.takeoff_distance_label = label;
  out.takeoff_distance_score = round(score, 0);

  // What still can't be computed from this source.
  if (!useHorse) out.pending.push('fore_hind_symmetry', 'landing_angle', 'takeoff_distance_meters');
  else if (!out.fore_hind_symmetry) out.pending.push('fore_hind_symmetry');
  out.pending.push('takeoff_distance_meters'); // always needs fence detection
  out.pending = Array.from(new Set(out.pending));
  return out;
}

module.exports = { compute, arcPoints, foreHindSymmetry };
