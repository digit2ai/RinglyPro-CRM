// =====================================================
// MediaPipe Pose landmark indices + small geometry helpers.
//
// MediaPipe Pose returns 33 landmarks per frame, each {x, y, z, visibility}
// in NORMALIZED image coordinates: x,y in [0,1], ORIGIN TOP-LEFT, so y GROWS
// DOWNWARD (a smaller y == higher up in the frame). Every fault rule below is
// written against that convention — read "height" as (1 - y).
// =====================================================

'use strict';

const LM = {
  NOSE: 0,
  LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32
};

// Safe landmark accessor — returns null if the keypoint is missing or has low
// visibility, so a rule can skip a degenerate frame instead of NaN-ing out.
function pt(frame, idx, minVis) {
  const kps = frame && frame.keypoints;
  if (!Array.isArray(kps) || idx >= kps.length) return null;
  const k = kps[idx];
  if (!k || typeof k.x !== 'number' || typeof k.y !== 'number') return null;
  if (minVis != null && typeof k.visibility === 'number' && k.visibility < minVis) return null;
  return { x: k.x, y: k.y, z: typeof k.z === 'number' ? k.z : 0, visibility: typeof k.visibility === 'number' ? k.visibility : 1 };
}

// Midpoint of two landmarks (null if either is unavailable).
function mid(frame, a, b, minVis) {
  const pa = pt(frame, a, minVis);
  const pb = pt(frame, b, minVis);
  if (!pa || !pb) return null;
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 };
}

const shoulderMid = (f, v) => mid(f, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, v);
const hipMid = (f, v) => mid(f, LM.LEFT_HIP, LM.RIGHT_HIP, v);
const wristMid = (f, v) => mid(f, LM.LEFT_WRIST, LM.RIGHT_WRIST, v);
const elbowMid = (f, v) => mid(f, LM.LEFT_ELBOW, LM.RIGHT_ELBOW, v);
const ankleMid = (f, v) => mid(f, LM.LEFT_ANKLE, LM.RIGHT_ANKLE, v);
const eyeMid = (f, v) => mid(f, LM.LEFT_EYE, LM.RIGHT_EYE, v);

const clamp01 = (n) => Math.max(0, Math.min(1, n));

module.exports = {
  LM, pt, mid,
  shoulderMid, hipMid, wristMid, elbowMid, ankleMid, eyeMid,
  clamp01
};
