// =====================================================
// faultEngine — PURE function: keypoint frames -> faults[]
//
// PoC heuristics (NOT validated accuracy). Each rule reduces the per-frame
// pose keypoints to one scalar metric, compares it to a documented threshold,
// and emits {type, timestampSec, confidence} when the metric clears the bar.
//
// Coordinate convention (see keypoints.js): normalized [0,1], origin top-left,
// y grows DOWNWARD. "Apex" = the frame where the rider/hands are HIGHEST, i.e.
// the frame with the SMALLEST wrist-midpoint y. The four signatures evaluate
// the rider's upper body around that apex.
//
// Exported as a stand-alone pure function so sit.js can exercise it directly
// against a checked-in fixture without any browser, DB, or HTTP in the loop.
// =====================================================

'use strict';

const K = require('./keypoints');

// ---- Tunable thresholds (documented heuristics) -------------------------
const TH = {
  MIN_VIS: 0.2,            // ignore landmarks below this visibility
  // left_behind: torso angle from vertical (radians) AFTER apex. ~0.30 rad ≈ 17°.
  // A correct jumping position keeps the shoulders roughly stacked over the hips
  // through the arc; a rider "left behind" lags backward as the horse rises.
  LEFT_BEHIND_RAD: 0.30,
  LEFT_BEHIND_RANGE: 0.50, // angle span over which confidence ramps 0->1
  // dropped_rein: how far the wrist sinks BELOW the elbow (wrist.y - elbow.y)
  // during the ascent. Positive => hand has dropped beneath the elbow line.
  DROPPED_REIN_DY: 0.05,
  DROPPED_REIN_RANGE: 0.12,
  // gaze_drop: how far the head (nose) drops (nose.y increases) BEFORE apex,
  // relative to the takeoff frame. Rider should look up/ahead over the fence.
  GAZE_DROP_DY: 0.04,
  GAZE_DROP_RANGE: 0.10,
  // forward_seat: how far the hip sits AHEAD of the ankle (in the travel
  // direction) at landing — the rider tipped forward onto the horse's neck.
  FORWARD_SEAT_DX: 0.06,
  FORWARD_SEAT_RANGE: 0.14
};

function tOf(frames, i) {
  const f = frames[i];
  if (f && typeof f.t === 'number') return f.t;
  return i; // fall back to frame index as a pseudo-timestamp
}

// Index of the apex frame: smallest wrist-midpoint y (hands highest). Falls
// back to shoulder midpoint, then nose, so a partial pose still yields an apex.
function findApex(frames) {
  let best = -1, bestY = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const w = K.wristMid(frames[i], TH.MIN_VIS) || K.shoulderMid(frames[i], TH.MIN_VIS) || K.pt(frames[i], K.LM.NOSE, TH.MIN_VIS);
    if (!w) continue;
    if (w.y < bestY) { bestY = w.y; best = i; }
  }
  return best;
}

// Overall direction of horizontal travel (+1 / -1) from hip-midpoint drift.
function travelSign(frames) {
  let first = null, last = null;
  for (let i = 0; i < frames.length; i++) { const h = K.hipMid(frames[i], TH.MIN_VIS); if (h) { first = h; break; } }
  for (let i = frames.length - 1; i >= 0; i--) { const h = K.hipMid(frames[i], TH.MIN_VIS); if (h) { last = h; break; } }
  if (!first || !last) return 1;
  const dx = last.x - first.x;
  return dx >= 0 ? 1 : -1;
}

// ---- Individual rules: each returns {hit, timestampSec, confidence} | null --

function ruleLeftBehind(frames, apex) {
  // Look from apex to end; the worst (largest) backward torso lean wins.
  let worst = 0, at = apex;
  const sign = travelSign(frames);
  for (let i = apex; i < frames.length; i++) {
    const sh = K.shoulderMid(frames[i], TH.MIN_VIS);
    const hp = K.hipMid(frames[i], TH.MIN_VIS);
    if (!sh || !hp) continue;
    const vert = Math.max(1e-4, hp.y - sh.y);      // shoulders above hips => positive
    const horiz = sh.x - hp.x;                       // +: shoulders ahead of hips
    // Backward lean = shoulders BEHIND hips relative to travel direction.
    const backward = -sign * horiz;                  // >0 means leaning back
    const angle = Math.atan2(Math.max(0, backward), vert);
    if (angle > worst) { worst = angle; at = i; }
  }
  if (worst <= TH.LEFT_BEHIND_RAD) return null;
  return { hit: true, timestampSec: tOf(frames, at), confidence: K.clamp01((worst - TH.LEFT_BEHIND_RAD) / TH.LEFT_BEHIND_RANGE) };
}

function ruleDroppedRein(frames, apex) {
  // Ascent = takeoff (start) .. apex. Largest wrist-below-elbow gap wins.
  let worst = -Infinity, at = 0;
  const end = Math.max(1, apex);
  for (let i = 0; i <= end && i < frames.length; i++) {
    const w = K.wristMid(frames[i], TH.MIN_VIS);
    const e = K.elbowMid(frames[i], TH.MIN_VIS);
    if (!w || !e) continue;
    const dy = w.y - e.y;        // >0: wrist below elbow (hand dropped)
    if (dy > worst) { worst = dy; at = i; }
  }
  if (!(worst > TH.DROPPED_REIN_DY)) return null;
  return { hit: true, timestampSec: tOf(frames, at), confidence: K.clamp01((worst - TH.DROPPED_REIN_DY) / TH.DROPPED_REIN_RANGE) };
}

function ruleGazeDrop(frames, apex) {
  // Head drop BEFORE apex relative to takeoff. nose.y rising = looking down.
  let base = null, baseI = 0;
  for (let i = 0; i <= apex && i < frames.length; i++) {
    const n = K.pt(frames[i], K.LM.NOSE, TH.MIN_VIS) || K.eyeMid(frames[i], TH.MIN_VIS);
    if (n) { base = n; baseI = i; break; }
  }
  if (!base) return null;
  let worst = 0, at = baseI;
  for (let i = baseI; i <= apex && i < frames.length; i++) {
    const n = K.pt(frames[i], K.LM.NOSE, TH.MIN_VIS) || K.eyeMid(frames[i], TH.MIN_VIS);
    if (!n) continue;
    const drop = n.y - base.y;   // >0: head has dropped since takeoff
    if (drop > worst) { worst = drop; at = i; }
  }
  if (worst <= TH.GAZE_DROP_DY) return null;
  return { hit: true, timestampSec: tOf(frames, at), confidence: K.clamp01((worst - TH.GAZE_DROP_DY) / TH.GAZE_DROP_RANGE) };
}

function ruleForwardSeat(frames, apex) {
  // Landing = post-apex frame where the hip is LOWEST (largest hip.y). At that
  // frame, is the hip ahead of the ankle in the travel direction?
  let landing = -1, lowest = -Infinity;
  for (let i = apex; i < frames.length; i++) {
    const h = K.hipMid(frames[i], TH.MIN_VIS);
    if (!h) continue;
    if (h.y > lowest) { lowest = h.y; landing = i; }
  }
  if (landing < 0) return null;
  const h = K.hipMid(frames[landing], TH.MIN_VIS);
  const a = K.ankleMid(frames[landing], TH.MIN_VIS);
  if (!h || !a) return null;
  const sign = travelSign(frames);
  const ahead = sign * (h.x - a.x);   // >0: hip ahead of ankle (tipped forward)
  if (ahead <= TH.FORWARD_SEAT_DX) return null;
  return { hit: true, timestampSec: tOf(frames, landing), confidence: K.clamp01((ahead - TH.FORWARD_SEAT_DX) / TH.FORWARD_SEAT_RANGE) };
}

const RULES = [
  ['left_behind', ruleLeftBehind],
  ['dropped_rein', ruleDroppedRein],
  ['gaze_drop', ruleGazeDrop],
  ['forward_seat', ruleForwardSeat]
];

// analyze(frames) -> { apexIndex, apexSec, frameCount, faults: [{type,timestampSec,confidence}] }
// `frames`: [{ t:Number(seconds), keypoints:[{x,y,z?,visibility?}, ... up to 33] }]
function analyze(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return { apexIndex: -1, apexSec: 0, frameCount: 0, faults: [] };
  }
  const apex = findApex(frames);
  const apexIndex = apex < 0 ? 0 : apex;
  const faults = [];
  for (const [type, fn] of RULES) {
    let r = null;
    try { r = fn(frames, apexIndex); } catch (e) { r = null; }
    if (r && r.hit) {
      faults.push({
        type,
        timestampSec: Math.round((r.timestampSec || 0) * 1000) / 1000,
        confidence: Math.round(r.confidence * 1000) / 1000
      });
    }
  }
  faults.sort((a, b) => a.timestampSec - b.timestampSec);
  return { apexIndex, apexSec: Math.round(tOf(frames, apexIndex) * 1000) / 1000, frameCount: frames.length, faults };
}

module.exports = { analyze, TH, findApex, travelSign };
