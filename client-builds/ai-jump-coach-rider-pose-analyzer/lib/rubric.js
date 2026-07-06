// =====================================================
// rubric — the AI Jump Coach evaluation engine (v2).
//
// Layers a full COACHING RUBRIC on top of the base fault engine. Pure function:
// rider MediaPipe keypoint frames (+ optional manual course inputs) -> a scored,
// dimensioned evaluation a coach would recognize.
//
// HONESTY (same convention as the EquiMind Paso Fino judge): every metric here is
// computed from the RIDER pose the browser can see today, using DOCUMENTED
// HEURISTICS (not validated accuracy). Things that require HORSE pose (bascule,
// take-off distance, fore/hind symmetry) or full-COURSE data (stride length
// between fences, approach speed) are NOT invented — they are declared in
// `pending[]` and, where the coach can supply them, taken as MANUAL input
// (optimal vs total time, rails down, refusals).
//
// Backward-compatible: still returns the original `faults[]` (4 base types) so
// the existing route/UI/SIT keep working; the rubric is additive.
//
// Coordinate convention (see keypoints.js): normalized [0,1], origin top-left,
// y grows DOWNWARD. "height" == (1 - y).
// =====================================================

'use strict';

const K = require('./keypoints');
const base = require('./faultEngine');

const RUBRIC_VERSION = '2.0.0';
const MIN_VIS = 0.2;

// ---- Height categories (cm). Tolerance factor scales positional thresholds:
// bigger fences demand a deeper fold and are physically more athletic, so we
// relax fold/geometry thresholds slightly while KEEPING timing strict. --------
const CATEGORIES = {
  '80':      { code: '80',      label_es: '80 cm',            label_en: '80 cm',            tol: 0.85 },
  '100':     { code: '100',     label_es: '1.00 m',           label_en: '1.00 m',           tol: 0.92 },
  '110':     { code: '110',     label_es: '1.10 m',           label_en: '1.10 m',           tol: 1.00 },
  '120':     { code: '120',     label_es: '1.20 m',           label_en: '1.20 m',           tol: 1.06 },
  '130':     { code: '130',     label_es: '1.30 m',           label_en: '1.30 m',           tol: 1.12 },
  '140':     { code: '140',     label_es: '1.40 m',           label_en: '1.40 m',           tol: 1.18 },
  '150_160': { code: '150_160', label_es: '1.50–1.60 m+ (Profesional)', label_en: '1.50–1.60 m+ (Pro)', tol: 1.25 }
};
const CATEGORY_CM = { '80': 80, '100': 100, '110': 110, '120': 120, '130': 130, '140': 140, '150_160': 150 };

function categoryOf(code) { return CATEGORIES[String(code)] || CATEGORIES['110']; }

// ---- small math helpers -------------------------------------------------------
const clamp01 = K.clamp01;
const round = (n, d) => { const p = Math.pow(10, d || 0); return Math.round(n * p) / p; };
function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function std(xs) { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m)))); }
// Pearson correlation of two equal-length series (0 if degenerate).
function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const xa = a[i] - ma, xb = b[i] - mb; num += xa * xb; da += xa * xa; db += xb * xb; }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}
function tOf(frames, i) { const f = frames[i]; return (f && typeof f.t === 'number') ? f.t : i; }

// Map a raw metric to a 0..100 sub-score. `good` is the value scoring ~100,
// `bad` the value scoring ~0; linear between, clamped. Direction inferred.
function scoreLinear(value, good, bad) {
  if (good === bad) return 100;
  const s = (value - bad) / (good - bad);
  return round(clamp01(s) * 100, 0);
}

// ---- Phase segmentation -------------------------------------------------------
// approach: start..takeoff | suspension: around apex | landing: apex..lowest hip
// | recovery: landing..end. Ranges are frame-index [a,b] inclusive.
function segmentPhases(frames, apex) {
  const n = frames.length;
  // landing = post-apex frame where hip is lowest (max y)
  let landing = apex, lowest = -Infinity;
  for (let i = apex; i < n; i++) { const h = K.hipMid(frames[i], MIN_VIS); if (h && h.y > lowest) { lowest = h.y; landing = i; } }
  const susStart = Math.max(0, apex - Math.max(1, Math.round(n * 0.12)));
  const susEnd = Math.min(n - 1, apex + Math.max(1, Math.round(n * 0.12)));
  return {
    approach:   [0, Math.max(0, susStart - 1)],
    suspension: [susStart, susEnd],
    landing:    [apex, landing],
    recovery:   [landing, n - 1],
    apexIndex: apex,
    landingIndex: landing
  };
}

function framesIn(frames, range) {
  const out = [];
  for (let i = range[0]; i <= range[1] && i < frames.length; i++) out.push(frames[i]);
  return out;
}

// ---- Individual rider metrics (each 0..100 + a raw value) ---------------------

// Torso fold at the apex (suspension): shoulders should come FORWARD over the
// hips ("folding"). Angle from vertical, in the travel direction. Too upright
// (no fold) OR jack-knifed both cost points; ideal ~ a clear forward fold.
function metricFold(frames, phases, sign, tol) {
  const idx = phases.apexIndex;
  const sh = K.shoulderMid(frames[idx], MIN_VIS), hp = K.hipMid(frames[idx], MIN_VIS);
  if (!sh || !hp) return { value: null, score: null };
  const vert = Math.max(1e-4, hp.y - sh.y);
  const fwd = sign * (sh.x - hp.x);           // + shoulders ahead of hips
  const deg = Math.atan2(fwd, vert) * 180 / Math.PI;
  // ideal window widens a touch with height (tol)
  const ideal = 22 * tol, lo = 8, hiPenalty = 55 * tol;
  let score;
  if (deg <= 0) score = scoreLinear(deg, ideal, -20);          // upright/behind = bad
  else if (deg <= ideal) score = scoreLinear(deg, ideal, lo);
  else score = scoreLinear(deg, ideal, hiPenalty);             // over-folded = bad
  return { value: round(deg, 1), score };
}

// Classic balance line ear–shoulder–hip–heel: collinearity in the approach.
// Deviation of shoulder & hip from the ear->heel line (normalized) -> lower is
// better. Falls back to nose for ear, ankle for heel.
function metricAlignment(frames, phases) {
  const seg = framesIn(frames, phases.approach.concat ? phases.approach : phases.approach);
  const devs = [];
  for (const f of framesIn(frames, phases.approach)) {
    const top = K.earMid(f, MIN_VIS) || K.pt(f, K.LM.NOSE, MIN_VIS) || K.eyeMid(f, MIN_VIS);
    const heel = K.heelMid(f, MIN_VIS) || K.ankleMid(f, MIN_VIS);
    const sh = K.shoulderMid(f, MIN_VIS), hp = K.hipMid(f, MIN_VIS);
    if (!top || !heel || !sh || !hp) continue;
    // distance of a point p from line top->heel (2D), normalized by line length
    const L = Math.hypot(heel.x - top.x, heel.y - top.y) || 1e-4;
    const distTo = (p) => Math.abs((heel.y - top.y) * p.x - (heel.x - top.x) * p.y + heel.x * top.y - heel.y * top.x) / L;
    devs.push((distTo(sh) + distTo(hp)) / 2 / L);
  }
  if (!devs.length) return { value: null, score: null };
  const d = mean(devs);
  return { value: round(d, 3), score: scoreLinear(d, 0.02, 0.20) };
}

// Left-right symmetry: mean |leftY - rightY| for shoulders & hips across the clip
// (a rider that collapses one side, esp. on turns). Lower diff = better.
function metricSymmetry(frames) {
  const diffs = [];
  for (const f of frames) {
    const ls = K.pt(f, K.LM.LEFT_SHOULDER, MIN_VIS), rs = K.pt(f, K.LM.RIGHT_SHOULDER, MIN_VIS);
    const lh = K.pt(f, K.LM.LEFT_HIP, MIN_VIS), rh = K.pt(f, K.LM.RIGHT_HIP, MIN_VIS);
    if (ls && rs) diffs.push(Math.abs(ls.y - rs.y));
    if (lh && rh) diffs.push(Math.abs(lh.y - rh.y));
  }
  if (!diffs.length) return { value: null, score: null, side: null };
  const d = mean(diffs);
  // which side sits lower on average (informational)
  let leftLow = 0, rightLow = 0;
  for (const f of frames) {
    const ls = K.pt(f, K.LM.LEFT_SHOULDER, MIN_VIS), rs = K.pt(f, K.LM.RIGHT_SHOULDER, MIN_VIS);
    if (ls && rs) { if (ls.y > rs.y) leftLow++; else rightLow++; }
  }
  const side = leftLow === rightLow ? null : (leftLow > rightLow ? 'left' : 'right');
  return { value: round(d, 3), score: scoreLinear(d, 0.01, 0.12), side };
}

// Heel down: fraction of frames where the heel sits BELOW the toe (heel.y >
// foot.y). Needs heel + foot_index landmarks; null if unavailable.
function metricHeel(frames) {
  let ok = 0, total = 0;
  for (const f of frames) {
    const heel = K.heelMid(f, MIN_VIS), toe = K.footMid(f, MIN_VIS);
    if (!heel || !toe) continue;
    total++; if (heel.y >= toe.y) ok++;
  }
  if (!total) return { value: null, score: null };
  const pct = ok / total;
  return { value: round(pct, 2), score: scoreLinear(pct, 0.9, 0.2) };
}

// Lower-leg stability: std-dev of (kneeMid.x - hipMid.x) — the leg should stay
// fixed under the body, not swing back/forth. Lower std = better.
function metricLegSwing(frames) {
  const xs = [];
  for (const f of frames) { const k = K.kneeMid(f, MIN_VIS), h = K.hipMid(f, MIN_VIS); if (k && h) xs.push(k.x - h.x); }
  if (xs.length < 3) return { value: null, score: null };
  const s = std(xs);
  return { value: round(s, 3), score: scoreLinear(s, 0.01, 0.10) };
}

// Independent hand: correlation between wrist height and hip height across the
// clip. A stable, independent hand does NOT rise/fall with the body -> low corr.
// High positive corr = "following the jump with the hands" = bad.
function metricHandIndependence(frames) {
  const w = [], h = [];
  for (const f of frames) { const wm = K.wristMid(f, MIN_VIS), hm = K.hipMid(f, MIN_VIS); if (wm && hm) { w.push(wm.y); h.push(hm.y); } }
  if (w.length < 3) return { value: null, score: null };
  const c = Math.abs(corr(w, h));
  return { value: round(c, 2), score: scoreLinear(c, 0.2, 0.9) };
}

// Release quality/timing near apex: how far the wrist advances toward the horse's
// mouth (travel direction) between takeoff and apex. Classifies short/automatic/
// long. Score peaks for a clear-but-controlled release.
function metricRelease(frames, phases, sign) {
  const start = K.wristMid(frames[0], MIN_VIS);
  const apexW = K.wristMid(frames[phases.apexIndex], MIN_VIS);
  if (!start || !apexW) return { value: null, score: null, kind: null };
  const adv = sign * (apexW.x - start.x);   // forward advance of the hand
  let kind, score;
  if (adv < 0.02) { kind = 'short'; score = scoreLinear(adv, 0.06, -0.05); }
  else if (adv <= 0.10) { kind = 'automatic'; score = 90; }
  else { kind = 'long'; score = scoreLinear(adv, 0.10, 0.28); }
  return { value: round(adv, 3), score, kind };
}

// Sync/timing: does the fold peak BEFORE, AT, or AFTER the horse's apex? We use
// the rider's own max-fold frame vs the apex frame as a proxy (real horse-takeoff
// timing needs horse pose). Negative = anticipates (ahead), positive = behind.
function metricSync(frames, phases, sign) {
  let foldFrame = phases.apexIndex, best = -Infinity;
  for (let i = 0; i < frames.length; i++) {
    const sh = K.shoulderMid(frames[i], MIN_VIS), hp = K.hipMid(frames[i], MIN_VIS);
    if (!sh || !hp) continue;
    const vert = Math.max(1e-4, hp.y - sh.y);
    const fwd = sign * (sh.x - hp.x);
    const deg = Math.atan2(fwd, vert);
    if (deg > best) { best = deg; foldFrame = i; }
  }
  const dtFrames = foldFrame - phases.apexIndex;   // <0 ahead, >0 behind
  const sec = round(tOf(frames, foldFrame) - tOf(frames, phases.apexIndex), 3);
  const score = scoreLinear(Math.abs(dtFrames), 0, Math.max(2, frames.length * 0.25));
  const kind = dtFrames < -0.5 ? 'ahead' : (dtFrames > 0.5 ? 'behind' : 'in_time');
  return { value: sec, score, kind };
}

// Landing recovery: frames from landing until the torso returns near vertical
// (fold angle back under ~10°). Fewer frames = quicker restabilization.
function metricRecovery(frames, phases, sign) {
  const start = phases.landingIndex;
  let recovered = null;
  for (let i = start; i < frames.length; i++) {
    const sh = K.shoulderMid(frames[i], MIN_VIS), hp = K.hipMid(frames[i], MIN_VIS);
    if (!sh || !hp) continue;
    const vert = Math.max(1e-4, hp.y - sh.y);
    const deg = Math.abs(Math.atan2(sign * (sh.x - hp.x), vert) * 180 / Math.PI);
    if (deg < 10) { recovered = i; break; }
  }
  const span = recovered == null ? (frames.length - start) : (recovered - start);
  return { value: span, score: scoreLinear(span, 1, Math.max(3, frames.length * 0.4)) };
}

// ---- Course metrics (from MANUAL input; not from pose) ------------------------
function courseMetrics(opts) {
  const out = { total_time_sec: null, optimal_time_sec: null, delta_sec: null, time_score: null };
  const tot = Number(opts && opts.totalTimeSec), opt = Number(opts && opts.optimalTimeSec);
  if (Number.isFinite(tot) && tot > 0) out.total_time_sec = round(tot, 2);
  if (Number.isFinite(opt) && opt > 0) out.optimal_time_sec = round(opt, 2);
  if (out.total_time_sec != null && out.optimal_time_sec != null) {
    out.delta_sec = round(out.total_time_sec - out.optimal_time_sec, 2);
    // within +/-3% of optimal = 100; degrade outward
    const rel = Math.abs(out.delta_sec) / out.optimal_time_sec;
    out.time_score = scoreLinear(rel, 0.0, 0.20);
  }
  return out;
}

// Normalize manual faults (rails/refusals) into a structured array + a penalty.
// manualFaults: [{kind:'rail'|'refusal', fence_type:'vertical'|'oxer'|'combo'|'other', at_sec?, note?}]
function normalizeManualFaults(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 60).map((m) => ({
    kind: m && (m.kind === 'refusal' ? 'refusal' : 'rail'),
    fence_type: m && ['vertical', 'oxer', 'combo', 'other'].indexOf(m.fence_type) >= 0 ? m.fence_type : 'other',
    at_sec: m && Number.isFinite(Number(m.at_sec)) ? round(Number(m.at_sec), 2) : null,
    note: m && typeof m.note === 'string' ? m.note.slice(0, 140) : null
  }));
}

// ---- Dimensions (grouped scores a coach reads) --------------------------------
// Each dimension averages its available sub-scores (nulls skipped). If a whole
// dimension has no signal, its score is null (shown as "n/d").
function avgScores(xs) { const v = xs.filter((s) => s != null); return v.length ? round(mean(v), 0) : null; }

// ---- Additional insight faults (extend the base 4, same shape) ---------------
function insightFaults(m, sym) {
  const out = [];
  const push = (type, at, conf) => out.push({ type, timestampSec: round(at || 0, 3), confidence: round(clamp01(conf), 3), source: 'rubric' });
  if (m.heel && m.heel.score != null && m.heel.score < 45) push('heel_up', 0, (45 - m.heel.score) / 45);
  if (m.legSwing && m.legSwing.score != null && m.legSwing.score < 45) push('leg_swing', 0, (45 - m.legSwing.score) / 45);
  if (m.hand && m.hand.score != null && m.hand.score < 45) push('hand_dependent', 0, (45 - m.hand.score) / 45);
  if (sym && sym.score != null && sym.score < 50 && sym.side) push(sym.side === 'left' ? 'load_left' : 'load_right', 0, (50 - sym.score) / 50);
  if (m.align && m.align.score != null && m.align.score < 45) push('alignment_off', 0, (45 - m.align.score) / 45);
  if (m.release && m.release.kind === 'short') push('release_short', m.apexSec, 0.6);
  if (m.sync && m.sync.kind && m.sync.kind !== 'in_time') push(m.sync.kind === 'ahead' ? 'timing_ahead' : 'timing_behind', 0, 0.55);
  return out;
}

// ============================================================================
// evaluate(frames, opts) -> full rubric result
//   opts: { heightCategory, optimalTimeSec, totalTimeSec, manualFaults }
// ============================================================================
function evaluate(frames, opts) {
  opts = opts || {};
  const cat = categoryOf(opts.heightCategory);
  const baseOut = base.analyze(frames);           // apex + original 4 faults
  const empty = !Array.isArray(frames) || frames.length === 0;
  if (empty) {
    return {
      version: RUBRIC_VERSION, category: cat.code,
      apexIndex: -1, apexSec: 0, frameCount: 0,
      faults: baseOut.faults, metrics: {}, phases: null,
      dimensions: {}, rider_score: null,
      course: courseMetrics(opts), manual_faults: normalizeManualFaults(opts.manualFaults),
      pending: ['horse_technique', 'course_rhythm']
    };
  }
  const apex = baseOut.apexIndex < 0 ? 0 : baseOut.apexIndex;
  const sign = base.travelSign(frames);
  const phases = segmentPhases(frames, apex);
  const apexSec = round(tOf(frames, apex), 3);

  const fold = metricFold(frames, phases, sign, cat.tol);
  const align = metricAlignment(frames, phases);
  const sym = metricSymmetry(frames);
  const heel = metricHeel(frames);
  const legSwing = metricLegSwing(frames);
  const hand = metricHandIndependence(frames);
  const release = metricRelease(frames, phases, sign); release.apexSec = apexSec;
  const sync = metricSync(frames, phases, sign);
  const recovery = metricRecovery(frames, phases, sign);

  // dropped-rein penalty folds the base fault into the hands dimension
  const droppedRein = (baseOut.faults.find((f) => f.type === 'dropped_rein') || {}).confidence || 0;
  const leftBehind = (baseOut.faults.find((f) => f.type === 'left_behind') || {}).confidence || 0;
  const gazeDrop = (baseOut.faults.find((f) => f.type === 'gaze_drop') || {}).confidence || 0;
  const fwdSeat = (baseOut.faults.find((f) => f.type === 'forward_seat') || {}).confidence || 0;

  const metrics = { fold, align, sym, heel, legSwing, hand, release, sync, recovery, apexSec };

  const dimensions = {
    // Posición general del jinete: alignment + symmetry + pelvis(via fold sign)
    posicion_general: { score: avgScores([align.score, sym.score]),
      detail: { alignment: align.score, symmetry: sym.score, symmetry_side: sym.side } },
    // Manos y contacto: independence + release - dropped-rein
    manos_contacto: { score: avgScores([hand.score, release.score, droppedRein ? round((1 - droppedRein) * 100, 0) : null]),
      detail: { hand_independence: hand.score, release: release.score, release_kind: release.kind, dropped_rein_conf: round(droppedRein, 2) } },
    // Piernas y asiento: heel down + leg stability
    piernas_asiento: { score: avgScores([heel.score, legSwing.score]),
      detail: { heel_down: heel.score, leg_stability: legSwing.score } },
    // Sincronización con el caballo: fold timing + not-left-behind
    sincronizacion: { score: avgScores([sync.score, leftBehind ? round((1 - leftBehind) * 100, 0) : null]),
      detail: { timing: sync.score, timing_kind: sync.kind, left_behind_conf: round(leftBehind, 2) } },
    // Postura por fase: fold(suspension) + recovery(landing) + gaze(approach) - forward-seat
    postura_fase: { score: avgScores([fold.score, recovery.score, gazeDrop ? round((1 - gazeDrop) * 100, 0) : null, fwdSeat ? round((1 - fwdSeat) * 100, 0) : null]),
      detail: { fold_deg: fold.value, fold: fold.score, landing_recovery: recovery.score, gaze_drop_conf: round(gazeDrop, 2), forward_seat_conf: round(fwdSeat, 2) } }
  };

  // Weighted overall rider score (weights sum to 1; skip null dims and renormalize)
  const W = { posicion_general: 0.24, manos_contacto: 0.22, piernas_asiento: 0.18, sincronizacion: 0.18, postura_fase: 0.18 };
  let num = 0, den = 0;
  for (const k of Object.keys(W)) { const s = dimensions[k].score; if (s != null) { num += s * W[k]; den += W[k]; } }
  const rider_score = den > 0 ? round(num / den, 0) : null;

  // Merge base faults + rubric insight faults, de-dup by type, sort by time.
  const merged = baseOut.faults.map((f) => Object.assign({ source: 'base' }, f))
    .concat(insightFaults(metrics, sym));
  const seen = new Set();
  const faults = merged.filter((f) => { if (seen.has(f.type)) return false; seen.add(f.type); return true; })
    .sort((a, b) => (a.timestampSec || 0) - (b.timestampSec || 0));

  const phaseSec = {
    approach:   [round(tOf(frames, phases.approach[0]), 2), round(tOf(frames, phases.approach[1]), 2)],
    suspension: [round(tOf(frames, phases.suspension[0]), 2), round(tOf(frames, phases.suspension[1]), 2)],
    landing:    [round(tOf(frames, phases.landing[0]), 2), round(tOf(frames, phases.landing[1]), 2)],
    recovery:   [round(tOf(frames, phases.recovery[0]), 2), round(tOf(frames, phases.recovery[1]), 2)]
  };

  return {
    version: RUBRIC_VERSION,
    category: cat.code,
    height_cm: CATEGORY_CM[cat.code] || null,
    apexIndex: apex,
    apexSec,
    frameCount: frames.length,
    phases: phaseSec,
    metrics,
    dimensions,
    rider_score,
    faults,
    course: courseMetrics(opts),
    manual_faults: normalizeManualFaults(opts.manualFaults),
    // Declared-but-not-computed (needs horse pose or full-course data). Honest.
    pending: ['horse_bascule', 'takeoff_distance', 'fore_hind_symmetry', 'stride_between_fences', 'approach_speed']
  };
}

module.exports = { evaluate, categoryOf, CATEGORIES, CATEGORY_CM, RUBRIC_VERSION };
