// =====================================================
// replay — compact playback tracks for the 2D animated slow-motion replay.
//
// Pure functions. Built SERVER-SIDE from the posted rider keypoint frames so the
// browser animates purely from stored data (works on re-opened reports + public
// share links with no client re-generation, and the raw video is never stored).
//
//   buildPoseTrack(frames, maxFrames)  -> { idx:[...], frames:[{t, xy:[[x,y]|null,...]}] }
//        only the ~13 rider landmarks used by the skeleton (drawOverlay CONNECTIONS),
//        rounded to 3 decimals, downsampled to <= maxFrames (default 200). PRIVACY:
//        joint coordinates only — no video, no faces.
//
//   buildHorseTrack(frames, maxFrames) -> { source:'stylized', frames:[{t, pts:{...}}] }
//        a STYLIZED horse skeleton (poll/withers/croup + 4 hooves) that follows the
//        jump arc derived from the rider's center-of-mass. source='stylized' ALWAYS
//        (never claims real horse pose — that requires a real model on horseFrames[]).
//
// Coordinate convention: normalized [0,1], origin top-left, y grows DOWN.
// =====================================================

'use strict';

const K = require('./keypoints');
const horse = require('./horseTechnique');
const MIN_VIS = 0.15;
const r3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Landmarks the rider skeleton draws (must cover drawOverlay CONNECTIONS).
const POSE_IDX = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

// Even downsample of a frame array to at most `max` frames (keeps first + last).
function pickIndices(n, max) {
  if (n <= max) { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; }
  const out = [], step = (n - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(Math.round(i * step));
  return out;
}

function tOf(frames, i) { const f = frames[i]; return (f && typeof f.t === 'number') ? f.t : i; }

function buildPoseTrack(frames, maxFrames) {
  maxFrames = maxFrames || 200;
  if (!Array.isArray(frames) || !frames.length) return { idx: POSE_IDX, frames: [] };
  const picks = pickIndices(frames.length, maxFrames);
  const out = [];
  for (const i of picks) {
    const f = frames[i]; const kps = (f && f.keypoints) || [];
    const xy = POSE_IDX.map((li) => {
      const k = kps[li];
      if (!k || typeof k.x !== 'number' || typeof k.y !== 'number') return null;
      if (typeof k.visibility === 'number' && k.visibility < MIN_VIS) return null;
      return [r3(k.x), r3(k.y)];
    });
    out.push({ t: r3(tOf(frames, i)), xy });
  }
  return { idx: POSE_IDX, frames: out };
}

// Overall horizontal travel sign from rider hip drift (+1 / -1).
function travelSign(frames) {
  let first = null, last = null;
  for (let i = 0; i < frames.length; i++) { const h = K.hipMid(frames[i], MIN_VIS); if (h) { first = h; break; } }
  for (let i = frames.length - 1; i >= 0; i--) { const h = K.hipMid(frames[i], MIN_VIS); if (h) { last = h; break; } }
  if (!first || !last) return 1;
  return (last.x - first.x) >= 0 ? 1 : -1;
}

function buildHorseTrack(frames, maxFrames) {
  maxFrames = maxFrames || 200;
  if (!Array.isArray(frames) || !frames.length) return { source: 'stylized', frames: [] };

  // Rider center-of-mass height series (1 - hipY) to drive the leg tuck over the arc.
  const series = [];
  for (let i = 0; i < frames.length; i++) { const h = K.hipMid(frames[i], MIN_VIS); series.push(h ? (1 - h.y) : null); }
  const ap = horse.arcPoints(series);
  const baseline = ap ? ap.baseline : 0;
  const peak = ap ? ap.peak : 1;
  const span = Math.max(1e-3, peak - baseline);
  const s = travelSign(frames);

  const picks = pickIndices(frames.length, maxFrames);
  const out = [];
  for (const i of picks) {
    const c = K.hipMid(frames[i], MIN_VIS);            // rider seat ~ on the horse's back
    if (!c) { out.push({ t: r3(tOf(frames, i)), pts: null }); continue; }
    const sh = K.shoulderMid(frames[i], MIN_VIS);
    let scale = sh ? Math.abs(c.y - sh.y) * 1.4 : 0.12;
    scale = clamp(scale, 0.07, 0.16);
    const arcFrac = series[i] != null ? clamp((series[i] - baseline) / span, 0, 1) : 0.5; // 1 = apex
    const legDrop = 0.06 + 0.18 * (1 - arcFrac);        // legs extend down at ends, tuck at apex
    const pt = (x, y) => [r3(clamp(x, 0, 1)), r3(clamp(y, 0, 1))];

    const withers = { x: c.x + s * 0.55 * scale, y: c.y + 0.14 * scale };
    const croup   = { x: c.x - s * 0.75 * scale, y: c.y + 0.20 * scale };
    const poll    = { x: withers.x + s * 0.95 * scale, y: withers.y - 0.75 * scale };
    const pts = {
      poll:    pt(poll.x, poll.y),
      withers: pt(withers.x, withers.y),
      croup:   pt(croup.x, croup.y),
      fore_l:  pt(withers.x + s * 0.10 * scale, withers.y + legDrop),
      fore_r:  pt(withers.x - s * 0.10 * scale, withers.y + legDrop * 0.95),
      hind_l:  pt(croup.x + s * 0.05 * scale, croup.y + legDrop),
      hind_r:  pt(croup.x - s * 0.05 * scale, croup.y + legDrop * 0.95)
    };
    out.push({ t: r3(tOf(frames, i)), pts });
  }
  return { source: 'stylized', frames: out };
}

module.exports = { buildPoseTrack, buildHorseTrack, POSE_IDX };
