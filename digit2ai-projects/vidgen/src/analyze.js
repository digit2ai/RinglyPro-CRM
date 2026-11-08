'use strict';
/**
 * Read a reference video and write down HOW it was made.
 *
 * The point is not to copy a video. It is to recover the thing that is
 * actually reusable — the pacing. Shot lengths, where the cuts land, how long
 * the voice runs before it breathes, how loud it sits. Structure and rhythm
 * are not anybody's property; the footage, the music and the script are, and
 * this deliberately extracts none of them.
 *
 * Everything here is local ffmpeg. No API, no key, no upload, $0 a run.
 *
 * CUTS ARE FOUND TWICE, ON PURPOSE. ffmpeg's scene score only fires on a hard
 * cut: run it over a deck that dissolves between screens and it reports ZERO
 * cuts on a video that plainly changes six times (measured, on a real 3:42
 * file). So a second pass differences low-resolution thumbnails a few times a
 * second, which sees a dissolve as a slow ramp the scene score smooths away.
 * The union is taken and near-duplicates collapse. Dropping either pass loses
 * a whole class of edit silently, which is the worst way to lose one.
 *
 * THE THUMBNAILS ARE RGB, NOT GREY. Both the scene score and an obvious
 * greyscale diff work on luma, and luma cannot see a cut between two shots of
 * the same brightness — ffmpeg's own `red` and `green` differ by ONE unit of
 * luma out of 255, so a cut straight between them is invisible to either. A
 * grey pass silently reported two shots where there were three. Colour costs
 * three bytes a pixel on a 32x32 thumbnail, which is nothing, and it is the
 * difference between finding an edit and not.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG, FFPROBE } = require('./ffmpeg');

const THUMB = 32;                 // thumbnail edge for the differencing pass (RGB)
const THUMB_FPS = 4;              // how often to look; 4/s catches a 0.25s dissolve
const SCENE_THRESHOLD = 0.15;     // ffmpeg scene score for a hard cut
const DIFF_THRESHOLD = 6;         // mean abs luma delta that counts as a change
const DIFF_LAG_SECONDS = 1;       // how far back a sample is compared; see thumbnailDeltas
const MIN_SHOT = 0.6;             // two "cuts" closer than this are one cut

const round2 = (n) => Math.round(n * 100) / 100;

async function probe(file) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_streams', '-show_format',
    '-of', 'json', file], { maxBuffer: 1 << 24 });
  const j = JSON.parse(stdout);
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  if (!v) throw Object.assign(new Error('no video stream'), { code: 'not_a_video' });
  const [num, den] = String(v.r_frame_rate || '0/1').split('/').map(Number);
  const w = Number(v.width), h = Number(v.height);
  return {
    width: w,
    height: h,
    aspect: aspectName(w, h),
    fps: den ? round2(num / den) : null,
    seconds: round2(Number(j.format && j.format.duration) || 0),
    hasAudio: Boolean(a),
    videoCodec: v.codec_name,
    audioCodec: a ? a.codec_name : null,
  };
}

/** The label a social platform would use, not a raw ratio nobody reads. */
function aspectName(w, h) {
  const r = w / h;
  const near = (x) => Math.abs(r - x) < 0.04;
  if (near(9 / 16)) return '9:16 portrait';
  if (near(1)) return '1:1 square';
  if (near(16 / 9)) return '16:9 landscape';
  if (near(4 / 5)) return '4:5 portrait';
  return `${round2(r)}:1`;
}

/**
 * Hard cuts, via ffmpeg's own scene score. Misses dissolves by design, and
 * misses equal-luma cuts as a consequence of being luma-based — the RGB pass
 * covers both.
 *
 * metadata=print writes to a FILE, and its `-` means stdout, which the null
 * muxer is also writing to. Reading either stream back is a race; a temp file
 * is the only reliable way to get this out.
 */
async function hardCuts(file) {
  const tmp = path.join(os.tmpdir(), `scd-${process.pid}-${Date.now()}.txt`);
  try {
    await run(FFMPEG, ['-v', 'error', '-i', file,
      '-filter_complex', `select='gt(scene,${SCENE_THRESHOLD})',metadata=print:file=${tmp}`,
      '-an', '-f', 'null', '-'], { maxBuffer: 1 << 26 });
    const out = fs.readFileSync(tmp, 'utf8');
    return [...out.matchAll(/pts_time:([0-9.]+)/g)].map((m) => round2(Number(m[1])));
  } catch (e) {
    return [];  // the RGB pass still carries the analysis
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) { /* nothing to clean */ }
  }
}

/**
 * Thumbnails, differenced two ways off ONE decode.
 *
 * `delta` compares adjacent samples and answers "is this shot moving".
 *
 * `lagged` compares each sample against the one a second earlier, and is what
 * finds cuts. Differencing adjacent samples cannot: a dissolve spreads its
 * change across every frame it covers, so at 4 samples a second each step is
 * a quarter the size and slides under any threshold loose enough to ignore
 * noise. Measured on a real 3:42 deck, adjacent differencing found 3 of its 5
 * changes; against a one-second lag it finds all 5, and still times them to
 * the quarter-second because the sampling rate did not drop.
 */
async function thumbnailDeltas(file) {
  const { stdout } = await run(FFMPEG, ['-v', 'error', '-i', file,
    '-vf', `fps=${THUMB_FPS},scale=${THUMB}:${THUMB},format=rgb24`,
    '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28, encoding: 'buffer' });
  const N = THUMB * THUMB * 3;
  const frames = Math.floor(stdout.length / N);
  const lag = Math.max(1, Math.round(THUMB_FPS * DIFF_LAG_SECONDS));
  const mad = (i, j) => {
    let s = 0;
    for (let k = 0; k < N; k++) s += Math.abs(stdout[i * N + k] - stdout[j * N + k]);
    return round2(s / N);
  };
  const deltas = [];
  for (let i = 1; i < frames; i++) {
    deltas.push({
      t: round2(i / THUMB_FPS),
      delta: mad(i, i - 1),
      lagged: i >= lag ? mad(i, i - lag) : null,
    });
  }
  return deltas;
}

/** Speech vs silence. Gives the VO's cadence without transcribing a word. */
async function speechSegments(file, seconds) {
  const { stderr } = await run(FFMPEG, ['-v', 'info', '-i', file,
    '-af', 'silencedetect=n=-32dB:d=0.35', '-vn', '-f', 'null', '-'],
    { maxBuffer: 1 << 26 }).catch((e) => e);
  const out = String(stderr === undefined ? '' : stderr);
  const starts = [...out.matchAll(/silence_start: *(-?[0-9.]+)/g)].map((m) => Number(m[1]));
  const ends = [...out.matchAll(/silence_end: *([0-9.]+)/g)].map((m) => Number(m[1]));
  // Invert the silences into speech spans.
  const spans = [];
  let cursor = 0;
  for (let i = 0; i < starts.length; i++) {
    const s = Math.max(0, starts[i]);
    if (s - cursor > 0.25) spans.push({ start: round2(cursor), end: round2(s) });
    cursor = ends[i] !== undefined ? ends[i] : seconds;
  }
  if (seconds - cursor > 0.25) spans.push({ start: round2(cursor), end: round2(seconds) });
  return spans.map((s) => ({ ...s, seconds: round2(s.end - s.start) }));
}

/** Integrated loudness, so a rebuild can sit at the same level. */
async function loudness(file) {
  const { stderr } = await run(FFMPEG, ['-v', 'info', '-i', file,
    '-af', 'ebur128=peak=true', '-vn', '-f', 'null', '-'],
    { maxBuffer: 1 << 26 }).catch((e) => e);
  const out = String(stderr === undefined ? '' : stderr);
  const m = out.match(/I: *(-?[0-9.]+) LUFS/g);
  if (!m || !m.length) return null;
  return Number(m[m.length - 1].match(/(-?[0-9.]+)/)[1]);
}

/** Collapses each above-threshold run of lagged deltas to its single peak. */
function peaks(deltas, threshold) {
  const out = [];
  let run = [];
  for (const d of deltas) {
    if (d.lagged !== null && d.lagged > threshold) { run.push(d); continue; }
    if (run.length) { out.push(run.reduce((a, b) => (b.lagged > a.lagged ? b : a)).t); run = []; }
  }
  if (run.length) out.push(run.reduce((a, b) => (b.lagged > a.lagged ? b : a)).t);
  return out;
}

function mergeCuts(lists, seconds) {
  const all = [...new Set(lists.flat())].filter((t) => t > MIN_SHOT && t < seconds - 0.2)
    .sort((a, b) => a - b);
  const kept = [];
  for (const t of all) if (!kept.length || t - kept[kept.length - 1] >= MIN_SHOT) kept.push(t);
  return kept;
}

/**
 * A shot is static, drifting or active. It is reported with the number it was
 * derived from, because "active" on its own is an opinion and the delta is
 * the evidence for it.
 */
function motionOf(deltas, start, end) {
  const inside = deltas.filter((d) => d.t > start + 0.15 && d.t < end - 0.15);
  if (!inside.length) return { motion: 'unknown', meanDelta: null };
  const mean = inside.reduce((n, d) => n + d.delta, 0) / inside.length;
  const motion = mean < 1.2 ? 'static' : mean < 4 ? 'drifting' : 'active';
  return { motion, meanDelta: round2(mean) };
}

/**
 * Turns the shot list into a spec skeleton planShots() accepts. Every beat's
 * text is EMPTY and the word budget is stated instead: the recipe carries the
 * reference's timing, and the words have to be the operator's own. Filling
 * these in from the source video is the one thing this tool must never do.
 */
function toSpecSkeleton(shots, seconds) {
  const WORDS_PER_SECOND = 2.6;
  return {
    targetSeconds: seconds,
    beats: shots.map((s, i) => ({
      text: '',
      scene: `shot ${i + 1} — ${s.motion}, ${s.seconds}s`,
      emotion: '',
      _budgetWords: Math.max(1, Math.round(s.seconds * WORDS_PER_SECOND)),
    })),
  };
}

async function analyze(file) {
  const format = await probe(file);
  const [hard, deltas] = await Promise.all([hardCuts(file), thumbnailDeltas(file)]);
  // A dissolve trips the lagged test for as long as it lasts, so the run is
  // collapsed to its steepest sample — the middle of the transition — rather
  // than reporting one "cut" per frame of a one-second fade.
  const soft = peaks(deltas, DIFF_THRESHOLD);
  const cuts = mergeCuts([hard, soft], format.seconds);

  const bounds = [0, ...cuts, format.seconds];
  const shots = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = round2(bounds[i]), end = round2(bounds[i + 1]);
    shots.push({ index: i, start, end, seconds: round2(end - start), ...motionOf(deltas, start, end) });
  }

  const audio = format.hasAudio
    ? { loudnessLufs: await loudness(file), speech: await speechSegments(file, format.seconds) }
    : null;

  return {
    source: file,
    format,
    shots,
    cutsFoundBy: { sceneScore: hard.length, thumbnailDiff: soft.length, kept: cuts.length },
    audio,
    // Stated, not omitted: an absent field must never read as "there is none".
    transcript: null,
    transcriptNote: 'not extracted in v1 — the words are the reference owner\'s, and OrbUp copy replaces them anyway',
    onScreenText: null,
    onScreenTextNote: 'OCR skipped in v1',
    pacing: {
      shots: shots.length,
      meanShotSeconds: shots.length ? round2(shots.reduce((n, s) => n + s.seconds, 0) / shots.length) : 0,
      shortestShotSeconds: shots.length ? round2(Math.min(...shots.map((s) => s.seconds))) : 0,
      longestShotSeconds: shots.length ? round2(Math.max(...shots.map((s) => s.seconds))) : 0,
      cutsPerMinute: format.seconds ? round2((shots.length - 1) / (format.seconds / 60)) : 0,
    },
    spec: toSpecSkeleton(shots, format.seconds),
  };
}

module.exports = { analyze, probe, aspectName, mergeCuts, motionOf, toSpecSkeleton, peaks,
  THUMB_FPS, DIFF_THRESHOLD, MIN_SHOT };
