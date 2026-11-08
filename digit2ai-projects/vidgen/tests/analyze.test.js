'use strict';
const assert = require('assert');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');
const { analyze, aspectName, mergeCuts, motionOf, peaks, toSpecSkeleton } = require('../src/analyze');

const TMP = '/tmp/vidgen-analyze-test';
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/**
 * Three solid colours, HARD cuts at 2s and 4s, with a tone.
 *
 * red and green are chosen deliberately: ffmpeg's `red` has luma 76 and its
 * `green` has luma 75, so the cut between them is invisible to anything that
 * looks at brightness — the scene score included. Only a colour-aware pass
 * finds it.
 */
async function makeHardCuts(file) {
  await run(FFMPEG, ['-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=c=red:s=320x568:d=2:r=25',
    '-f', 'lavfi', '-i', 'color=c=green:s=320x568:d=2:r=25',
    '-f', 'lavfi', '-i', 'color=c=blue:s=320x568:d=2:r=25',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=6',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
    '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
}

/** A plain bright/dark hard cut, which is what the scene score is good at. */
async function makeLumaCut(file) {
  await run(FFMPEG, ['-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x568:d=2:r=25',
    '-f', 'lavfi', '-i', 'color=c=white:s=320x568:d=2:r=25',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file]);
}

/** Two colours DISSOLVED into each other over a second — no hard cut at all. */
async function makeDissolve(file) {
  await run(FFMPEG, ['-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x568:d=4:r=25',
    '-f', 'lavfi', '-i', 'color=c=white:s=320x568:d=4:r=25',
    '-filter_complex', '[0:v][1:v]xfade=transition=fade:duration=1:offset=2[v]',
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file]);
}

/** A shot that MOVES, so motion classification has something to separate. */
async function makeMoving(file) {
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
    '-i', 'testsrc2=s=320x568:d=4:r=25', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', file]);
}

test('format is read, and the aspect is named the way a platform names it', async () => {
  const r = await analyze(`${TMP}/hard.mp4`);
  assert.equal(r.format.width, 320);
  assert.equal(r.format.height, 568);
  assert.equal(r.format.aspect, '9:16 portrait');
  assert.ok(Math.abs(r.format.seconds - 6) < 0.3, `duration ${r.format.seconds}`);
  assert.equal(r.format.hasAudio, true);
});

test('aspect names cover the shapes social actually uses', () => {
  assert.equal(aspectName(1080, 1920), '9:16 portrait');
  assert.equal(aspectName(1080, 1080), '1:1 square');
  assert.equal(aspectName(1920, 1080), '16:9 landscape');
  assert.equal(aspectName(1080, 1350), '4:5 portrait');
  assert.equal(aspectName(1000, 300), '3.33:1');
});

test('HARD cuts are found, at the right times', async () => {
  const r = await analyze(`${TMP}/hard.mp4`);
  assert.equal(r.shots.length, 3, `expected 3 shots, got ${r.shots.length}`);
  const starts = r.shots.map((s) => s.start);
  assert.ok(Math.abs(starts[1] - 2) < 0.4, `cut 1 at ${starts[1]}, expected ~2`);
  assert.ok(Math.abs(starts[2] - 4) < 0.4, `cut 2 at ${starts[2]}, expected ~4`);
});

test('the scene-score pass is alive — it fires on a bright/dark hard cut', async () => {
  const r = await analyze(`${TMP}/lumacut.mp4`);
  assert.ok(r.cutsFoundBy.sceneScore >= 1,
    `scene score found ${r.cutsFoundBy.sceneScore}; that path is dead if this is 0`);
});

test('AN EQUAL-LUMA CUT IS FOUND — a greyscale pass would report one shot too few', async () => {
  const r = await analyze(`${TMP}/hard.mp4`);
  // red->green differ by one unit of luma out of 255. The scene score cannot
  // see this cut and is not expected to; the RGB pass must.
  const starts = r.shots.map((s) => s.start);
  assert.ok(starts.some((t) => Math.abs(t - 2) < 0.4),
    `no cut near 2s — found ${JSON.stringify(starts)}`);
});

test('A DISSOLVE IS STILL FOUND — the scene score alone would miss it entirely', async () => {
  const r = await analyze(`${TMP}/dissolve.mp4`);
  // This is the whole reason two passes exist. Measured on a real 3:42 deck,
  // the scene score reported zero cuts on a video that changed five times.
  assert.equal(r.cutsFoundBy.sceneScore, 0, 'fixture is meant to have NO hard cut');
  assert.equal(r.shots.length, 2, `dissolve not detected: ${r.shots.length} shot(s)`);
  assert.ok(Math.abs(r.shots[1].start - 2.5) < 0.6,
    `transition timed at ${r.shots[1].start}, expected the middle of the 2-3s fade`);
});

test('a one-second fade is ONE cut, not one per frame of it', async () => {
  const r = await analyze(`${TMP}/dissolve.mp4`);
  assert.equal(r.cutsFoundBy.kept, 1, `${r.cutsFoundBy.kept} cuts kept across a single fade`);
});

test('peaks() collapses a run to its steepest sample', () => {
  const d = [
    { t: 1, lagged: 1 }, { t: 2, lagged: 9 }, { t: 3, lagged: 20 }, { t: 4, lagged: 8 },
    { t: 5, lagged: 0 }, { t: 6, lagged: 30 },
  ];
  assert.deepEqual(peaks(d, 6), [3, 6]);
});

test('a null lagged sample is never treated as a cut', () => {
  assert.deepEqual(peaks([{ t: 0.25, lagged: null }, { t: 0.5, lagged: null }], 6), []);
});

test('static and moving shots are told apart, with the number behind the verdict', async () => {
  const still = await analyze(`${TMP}/hard.mp4`);
  const moving = await analyze(`${TMP}/moving.mp4`);
  assert.equal(still.shots[0].motion, 'static');
  assert.equal(moving.shots[0].motion, 'active');
  assert.ok(moving.shots[0].meanDelta > still.shots[0].meanDelta,
    'the evidence must move with the verdict');
});

test('motion on a shot too short to sample is unknown, not a guess', () => {
  assert.deepEqual(motionOf([{ t: 5, delta: 3 }], 0, 0.2), { motion: 'unknown', meanDelta: null });
});

test('cuts closer together than a shot collapse into one', () => {
  assert.deepEqual(mergeCuts([[2, 2.1, 2.2], [5]], 10), [2, 5]);
});

test('cuts at the very edges are dropped — they are not edits', () => {
  assert.deepEqual(mergeCuts([[0.1, 4, 9.95]], 10), [4]);
});

test('SPEECH CADENCE IS MEASURED WITHOUT TRANSCRIBING A WORD', async () => {
  const r = await analyze(`${TMP}/hard.mp4`);
  assert.ok(r.audio, 'the tone track should be seen');
  assert.equal(typeof r.audio.loudnessLufs, 'number');
  assert.ok(Array.isArray(r.audio.speech));
});

test('a silent video reports audio:null rather than an empty object', async () => {
  const r = await analyze(`${TMP}/moving.mp4`);
  assert.equal(r.audio, null);
});

test('THE RECIPE CARRIES NO WORDS FROM THE REFERENCE', async () => {
  const r = await analyze(`${TMP}/hard.mp4`);
  // The one thing this tool must never do is hand back the source's script or
  // its on-screen copy. Timing is reusable; the writing is not ours.
  assert.equal(r.transcript, null);
  assert.equal(r.onScreenText, null);
  assert.ok(r.transcriptNote && r.onScreenTextNote, 'an absent field must say why it is absent');
  assert.ok(r.spec.beats.every((b) => b.text === ''),
    'a beat arrived pre-filled with text — that text could only have come from the reference');
});

test('the spec skeleton is one beat per shot and states a word budget', async () => {
  const r = await analyze(`${TMP}/hard.mp4`);
  assert.equal(r.spec.beats.length, r.shots.length);
  assert.equal(r.spec.targetSeconds, r.format.seconds);
  assert.ok(r.spec.beats.every((b) => b._budgetWords >= 1));
});

test('the skeleton feeds planShots once its beats are written', async () => {
  const { planShots } = require('../src/pipeline/script');
  const r = await analyze(`${TMP}/hard.mp4`);
  const spec = {
    ...r.spec,
    beats: r.spec.beats.map((b, i) => ({ ...b, text: `Line number ${i + 1} of the rebuild.`, emotion: 'calm' })),
  };
  const plan = planShots(spec);
  assert.ok(plan.shots.length > 0);
  assert.ok(plan.captionCues.length > 0);
});

test('pacing is derived from the shots, not asserted separately', async () => {
  const r = await analyze(`${TMP}/hard.mp4`);
  const mean = r.shots.reduce((n, s) => n + s.seconds, 0) / r.shots.length;
  assert.ok(Math.abs(r.pacing.meanShotSeconds - mean) < 0.02);
  assert.equal(r.pacing.shots, r.shots.length);
});

test('a file with no video stream is refused by name', async () => {
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=200:duration=1',
    '-c:a', 'aac', `${TMP}/audio-only.m4a`]);
  await assert.rejects(() => analyze(`${TMP}/audio-only.m4a`), (e) => e.code === 'not_a_video');
});

test('toSpecSkeleton budgets more words for a longer shot', () => {
  const s = toSpecSkeleton([{ seconds: 1, motion: 'static' }, { seconds: 6, motion: 'active' }], 7);
  assert.ok(s.beats[1]._budgetWords > s.beats[0]._budgetWords);
});

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  await makeHardCuts(`${TMP}/hard.mp4`);
  await makeLumaCut(`${TMP}/lumacut.mp4`);
  await makeDissolve(`${TMP}/dissolve.mp4`);
  await makeMoving(`${TMP}/moving.mp4`);
  let pass = 0, fail = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`  PASS  ${t.name}`); pass++; }
    catch (e) { console.log(`  FAIL  ${t.name}\n        ${e.message}`); fail++; }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
