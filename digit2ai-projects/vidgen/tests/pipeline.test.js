'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');

const { planShots, chunkCaptions, assertGeneratable } = require('../src/pipeline/script');
const { assemble, buildAss, assTime, probe } = require('../src/pipeline/assemble');
const { render, estimateCost, DEFAULTS } = require('../src/pipeline/runner');

const TMP = '/tmp/vidgen-test';

const BEATS = [
  { text: 'You sent forty applications last month.', scene: 'close-up on tired face at laptop', emotion: 'defeated' },
  { text: 'Nobody wrote back. That is not you.', scene: 'medium wide, empty inbox glow', emotion: 'frustrated' },
  { text: 'Job Up reads your actual work history.', scene: 'app interface', source: 'screen_recording' }
];

async function makeClip(file, seconds, color) {
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
    '-i', `color=c=${color}:s=540x960:d=${seconds}:r=30`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file]);
}
async function makeTone(file, seconds) {
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
    '-i', `sine=frequency=220:duration=${seconds}`, '-c:a', 'libmp3lame', file]);
}

const tests = [];
const test = (n, f) => tests.push({ name: n, fn: f });

test('captions chunk to burn-safe lines', () => {
  const lines = chunkCaptions('you sent forty applications last month and nobody wrote back', 4);
  assert.ok(lines.every(l => l.split(' ').length <= 4));
  assert.strictEqual(lines.join(' ').split(' ').length, 10);
});

test('no shot exceeds the model drift ceiling', () => {
  const plan = planShots({ beats: BEATS, targetSeconds: 60 });
  assert.ok(plan.shots.every(s => s.seconds <= 6.0), 'a shot is longer than any model holds');
  assert.ok(plan.shots.every(s => s.seconds >= 1.2));
});

test('a script too short for the target reports the shortfall honestly', () => {
  const plan = planShots({ beats: BEATS, targetSeconds: 60 });
  assert.strictEqual(plan.meetsTarget, false);
  assert.ok(plan.shortfallSeconds > 0, 'silently under-delivered instead of reporting');
  assert.ok(plan.wordsNeeded > 0, 'did not say how much more script is needed');
});

test('a script with enough words does hit the target runtime', () => {
  const long = Array.from({ length: 12 }, (_, i) => ({
    text: 'another line of the voiceover script carrying the story forward here',
    scene: `scene ${i}`
  }));
  const plan = planShots({ beats: long, targetSeconds: 60 });
  assert.strictEqual(plan.meetsTarget, true, `got ${plan.totalSeconds}s`);
  assert.ok(Math.abs(plan.totalSeconds - 60) < 1.5);
});

test('AUTOFIT — a short runtime yields fewer, longer shots instead of overflowing', () => {
  const long = Array.from({ length: 12 }, (_, i) => ({
    text: 'another line of the voiceover script carrying the story forward here', scene: `s${i}`
  }));
  const wide = planShots({ beats: long, targetSeconds: 60 });
  const tight = planShots({ beats: long, targetSeconds: 34 });
  assert.ok(tight.shots.length < wide.shots.length, 'did not reduce shot count for a shorter read');
  assert.ok(tight.totalSeconds <= 34 * 1.05, `overflowed to ${tight.totalSeconds}s against a 34s read`);
  assert.ok(tight.wordsPerLine > wide.wordsPerLine);
});

test('caption cues tile the timeline with no gaps or overlaps', () => {
  const plan = planShots({ beats: BEATS, targetSeconds: 60 });
  for (let i = 1; i < plan.captionCues.length; i++) {
    assert.ok(Math.abs(plan.captionCues[i].start - plan.captionCues[i - 1].end) < 0.02,
      `gap at cue ${i}`);
  }
});

test('screen-recording shots are free and excluded from generation cost', () => {
  const plan = planShots({ beats: BEATS, targetSeconds: 60 });
  assert.ok(plan.generatedShots < plan.shots.length, 'screen recordings were counted as generations');
  const est = estimateCost(plan, DEFAULTS);
  assert.strictEqual(est.generations, DEFAULTS.angles.length + plan.generatedShots);
});

test('an empty script is rejected rather than rendered', () => {
  assert.throws(() => planShots({ beats: [] }), e => e.code === 'empty_script');
});

test('ASS timing is correct at the hour boundary', () => {
  assert.strictEqual(assTime(0), '0:00:00.00');
  assert.strictEqual(assTime(61.5), '0:01:01.50');
  assert.strictEqual(assTime(3661.25), '1:01:01.25');
});

test('ASS braces are escaped so captions cannot inject override tags', () => {
  const ass = buildAss([{ start: 0, end: 1, text: '{\\an8}not an override' }]);
  assert.ok(ass.includes('\\{'), 'brace not escaped — caption could hijack styling');
});

test('BUDGET — an over-ceiling script is refused before any API call', async () => {
  let called = 0;
  const long = Array.from({ length: 40 }, (_, i) => ({
    text: 'this is a long beat that will produce many separate shots indeed',
    scene: `scene ${i}`
  }));
  await assert.rejects(() => render(
    { beats: long, character: { description: 'x', styleTokens: 'y' }, config: { maxCostUsd: 1.0 } },
    {
      tts: { costPerMillionChars: 15, speak: async () => { called++; return { audio: Buffer.from('') }; } },
      images: { characterSheet: async () => { called++; return []; } },
      video: { animate: async () => { called++; } },
      download: async () => { called++; },
      workDir: TMP + '/budget', outPath: TMP + '/budget/out.mp4'
    }
  ), e => e.code === 'budget_exceeded');
  assert.strictEqual(called, 0, 'made API calls before checking the budget');
});

test('CONTINUITY — every generated shot animates a locked character frame', async () => {
  const seen = [];
  const sheet = [
    { angle: 'front three-quarter view', url: 'https://cdn/x/tq.png' },
    { angle: 'side profile', url: 'https://cdn/x/sp.png' },
    { angle: 'close-up on face', url: 'https://cdn/x/cu.png' },
    { angle: 'medium wide shot', url: 'https://cdn/x/mw.png' }
  ];
  let sheetCalls = 0;

  await render(
    { beats: BEATS.slice(0, 2), character: { description: 'a woman, 30s', styleTokens: '3d pixar style' },
      config: { targetSeconds: 12, maxCostUsd: 10 } },
    {
      tts: { costPerMillionChars: 15, speak: async () => ({ audio: fs.readFileSync(TMP + '/tone.mp3') }) },
      images: { characterSheet: async () => { sheetCalls++; return sheet; } },
      video: {
        animate: async ({ referenceImageUrl, seconds }) => {
          seen.push(referenceImageUrl);
          const f = path.join(TMP, `gen${seen.length}.mp4`);
          await makeClip(f, seconds, 'navy');
          return { url: 'file://' + f, seconds };
        }
      },
      download: async (url, dest) => fs.copyFileSync(url.replace('file://', ''), dest),
      workDir: TMP + '/cont', outPath: TMP + '/cont/out.mp4'
    }
  );

  assert.strictEqual(sheetCalls, 1, 'character sheet regenerated mid-run — that is how faces drift');
  assert.ok(seen.length > 0);
  const allowed = new Set(sheet.map(s => s.url));
  assert.ok(seen.every(u => allowed.has(u)), 'a shot was generated from something other than the locked sheet');
});

test('a missing screen recording fails loudly instead of skipping the beat', async () => {
  await assert.rejects(() => render(
    { beats: BEATS, character: { description: 'x', styleTokens: 'y' },
      config: { targetSeconds: 12, maxCostUsd: 10 } },
    {
      tts: { costPerMillionChars: 15, speak: async () => ({ audio: fs.readFileSync(TMP + '/tone.mp3') }) },
      images: { characterSheet: async () => [{ angle: 'close-up on face', url: 'u' }] },
      video: { animate: async () => ({ url: 'file:///dev/null', seconds: 2 }) },
      download: async () => {},
      workDir: TMP + '/miss', outPath: TMP + '/miss/out.mp4'
    }
  ), e => e.code === 'missing_screen_recording');
});

test('TIMELINE — shots are re-cut to the measured voiceover, not an estimate', async () => {
  // The tone is 12s. The script estimates ~14s. The render must follow the audio.
  const seen = [];
  const res = await render(
    { beats: BEATS.slice(0, 2), character: { description: 'w', styleTokens: 's' },
      config: { targetSeconds: 45, maxCostUsd: 10 } },
    {
      tts: { costPerMillionChars: 15, speak: async () => ({ audio: fs.readFileSync(TMP + '/tone.mp3') }) },
      images: { characterSheet: async () => [{ angle: 'close-up on face', url: 'u' }] },
      video: {
        animate: async ({ seconds }) => {
          seen.push(seconds);
          const f = path.join(TMP, `t${seen.length}.mp4`);
          await makeClip(f, seconds, 'gray');
          return { url: 'file://' + f, seconds };
        }
      },
      download: async (url, dest) => fs.copyFileSync(url.replace('file://', ''), dest),
      workDir: TMP + '/timeline', outPath: TMP + '/timeline/out.mp4'
    }
  );
  assert.ok(Math.abs(res.voSeconds - 12) < 0.5, `voiceover measured at ${res.voSeconds}s`);
  assert.ok(Math.abs(res.seconds - res.voSeconds) < 1.5,
    `timeline is ${res.seconds}s but the read is ${res.voSeconds}s — they will truncate each other`);
  const info = await probe(res.path);
  assert.ok(Math.abs(parseFloat(info.format.duration) - res.voSeconds) < 1.0,
    'rendered file does not match the voiceover length');
});

test('an unreadable voiceover fails before any video spend', async () => {
  let animated = 0;
  await assert.rejects(() => render(
    { beats: BEATS.slice(0, 1), character: { description: 'w', styleTokens: 's' },
      config: { targetSeconds: 12, maxCostUsd: 10 } },
    {
      tts: { costPerMillionChars: 15, speak: async () => ({ audio: Buffer.alloc(0) }) },
      images: { characterSheet: async () => [{ angle: 'close-up on face', url: 'u' }] },
      video: { animate: async () => { animated++; } },
      download: async () => {},
      workDir: TMP + '/badvo', outPath: TMP + '/badvo/out.mp4'
    }
  ), e => e.code === 'vo_unmeasurable');
  assert.strictEqual(animated, 0, 'spent on video generation despite a broken voiceover');
});

test('ASSEMBLY — real ffmpeg produces a correct 9:16 video with audio', async () => {
  const dir = TMP + '/asm';
  fs.mkdirSync(dir, { recursive: true });
  const clips = [];
  const colors = ['navy', 'maroon', 'darkgreen'];
  for (let i = 0; i < 3; i++) {
    const f = path.join(dir, `c${i}.mp4`);
    await makeClip(f, 2, colors[i]);
    clips.push({ path: f, seconds: 2 });
  }
  await makeTone(path.join(dir, 'vo.mp3'), 6);

  const out = path.join(dir, 'final.mp4');
  await assemble({
    clips,
    cues: [
      { start: 0, end: 2, text: 'you sent forty' },
      { start: 2, end: 4, text: 'applications last month' },
      { start: 4, end: 6, text: 'nobody wrote back' }
    ],
    voiceover: path.join(dir, 'vo.mp3'),
    outPath: out,
    workDir: path.join(dir, 'work')
  });

  assert.ok(fs.existsSync(out), 'no output file');
  const info = await probe(out);
  const v = info.streams.find(s => s.codec_type === 'video');
  const a = info.streams.find(s => s.codec_type === 'audio');
  assert.strictEqual(v.width, 1080);
  assert.strictEqual(v.height, 1920);
  assert.ok(a, 'voiceover was not muxed in');
  const dur = parseFloat(info.format.duration);
  assert.ok(Math.abs(dur - 6) < 0.6, `expected ~6s, got ${dur}s — concat probably dropped clips`);

  // THE VOICEOVER MUST SURVIVE THE MUX. `-shortest` used to cut it ~8s early
  // while the video stayed full length, so the ad played on in silence and
  // nothing errored. format.duration reports the VIDEO, so it never caught it.
  const aDur = parseFloat(a.duration);
  assert.ok(Math.abs(aDur - 6) < 0.6,
    `audio is ${aDur}s against a 6s voiceover — the read was truncated in the mux`);
});

test('ASSEMBLY — the voiceover is never truncated, however long the filter runs', async () => {
  const dir = TMP + '/asm-audio';
  fs.mkdirSync(dir, { recursive: true });
  // Long enough to clear ffmpeg's default shortest_buf_duration (10s), which
  // is the window the old bug hid in.
  const clips = [];
  for (let i = 0; i < 5; i++) {
    const f = path.join(dir, `c${i}.mp4`);
    await makeClip(f, 5, ['navy', 'maroon', 'darkgreen', 'purple', 'teal'][i]);
    clips.push({ path: f, seconds: 5 });
  }
  await makeTone(path.join(dir, 'vo.mp3'), 25);

  const cues = Array.from({ length: 18 }, (_, i) => ({
    start: i * 1.35, end: (i + 1) * 1.35, text: `caption line ${i}`
  }));
  const out = path.join(dir, 'final.mp4');
  await assemble({ clips, cues, voiceover: path.join(dir, 'vo.mp3'), outPath: out, workDir: path.join(dir, 'work') });

  const info = await probe(out);
  const v = info.streams.find((st) => st.codec_type === 'video');
  const a = info.streams.find((st) => st.codec_type === 'audio');
  const vDur = parseFloat(v.duration);
  const aDur = parseFloat(a.duration);

  assert.ok(Math.abs(aDur - 25) < 0.75, `voiceover muxed as ${aDur}s of 25s`);
  assert.ok(Math.abs(vDur - aDur) < 0.75,
    `video is ${vDur}s but audio is ${aDur}s — they will not end together`);
});

test('assembling nothing is an error, not an empty file', async () => {
  await assert.rejects(() => assemble({ clips: [], cues: [], outPath: '/tmp/x.mp4', workDir: TMP + '/none' }),
    e => e.code === 'no_clips');
});


// ---------- generation quanta: clips are decoupled from caption cuts ----------

test('ECONOMICS — a 60s render buys ~12 clips, not one per caption cut', () => {
  const long = Array.from({ length: 12 }, (_, i) => ({
    text: 'another line of the voiceover script carrying the story forward here', scene: `s${i}`
  }));
  const plan = planShots({ beats: long, targetSeconds: 60 });

  assert.ok(plan.shots.length >= 10 && plan.shots.length <= 14,
    `${plan.shots.length} generations for 60s — one per caption cut again?`);
  assert.ok(plan.captionCues.length >= 3 * plan.shots.length * 0.8,
    'captions are not cutting faster than the camera');
  assert.strictEqual(plan.billedVideoSeconds, 60,
    `billed ${plan.billedVideoSeconds}s to fill 60s — footage is being thrown away`);

  const est = estimateCost(plan, Object.assign({}, DEFAULTS, { ttsCostPerMillion: 15 }));
  assert.ok(est.video <= 3.05, `video alone is $${est.video}, over the $3.00 target`);
});

test('captions cut faster than the camera — several cues per clip', () => {
  const long = Array.from({ length: 12 }, (_, i) => ({
    text: 'another line of the voiceover script carrying the story forward here', scene: `s${i}`
  }));
  const plan = planShots({ beats: long, targetSeconds: 60 });
  for (const clip of plan.shots) {
    assert.ok(clip.captions.length >= 2,
      `clip ${clip.index} carries ${clip.captions.length} caption(s) — back to one cut per generation`);
  }
  // and the cues still tile the whole timeline, independent of the clips
  const last = plan.captionCues[plan.captionCues.length - 1];
  assert.ok(Math.abs(last.end - plan.totalSeconds) < 0.05, 'cues do not reach the end of the read');
});

test('every generated clip asks for a length the model can actually produce', () => {
  for (const target of [12, 27, 34, 60, 90]) {
    const long = Array.from({ length: 16 }, (_, i) => ({
      text: 'another line of the voiceover script carrying the story forward here', scene: `s${i}`
    }));
    const plan = planShots({ beats: long, targetSeconds: target });
    for (const clip of plan.shots.filter(c => c.source === 'generated')) {
      assert.ok([5, 10].includes(clip.generateSeconds),
        `target ${target}s produced a ${clip.generateSeconds}s generation`);
      assert.ok(clip.seconds <= clip.generateSeconds + 1e-9,
        `target ${target}s uses ${clip.seconds}s of a ${clip.generateSeconds}s clip`);
    }
    assert.doesNotThrow(() => assertGeneratable(plan));
  }
});

test('a length the model does not offer is named, not silently rounded', () => {
  const plan = { shots: [{ index: 0, source: 'generated', seconds: 3, generateSeconds: 3 }] };
  assert.throws(() => assertGeneratable(plan, [5, 10]), (e) => {
    assert.strictEqual(e.code, 'unsupported_shot_length');
    assert.ok(e.terminal, 'a length the model cannot produce is not worth retrying');
    assert.ok(/3s/.test(e.message) && /5s or 10s/.test(e.message), `unhelpful message: ${e.message}`);
    return true;
  });
});

test('an edit that outruns its generation is refused (it would freeze, not error)', () => {
  const plan = { shots: [{ index: 4, source: 'generated', seconds: 7.5, generateSeconds: 5 }] };
  assert.throws(() => assertGeneratable(plan, [5, 10]), (e) => e.code === 'shot_exceeds_generation');
});

test('VALIDATION — an unproducible plan is refused before any paid call', async () => {
  let called = 0;
  const long = Array.from({ length: 12 }, (_, i) => ({
    text: 'another line of the voiceover script carrying the story forward here', scene: `s${i}`
  }));
  await assert.rejects(() => render(
    { beats: long, character: { description: 'x', styleTokens: 'y' },
      // 12s clips: the model tops out at 10, so the edit could never be filled.
      config: { targetSeconds: 60, maxCostUsd: 100, clipSeconds: 12 } },
    {
      tts: { costPerMillionChars: 15, speak: async () => { called++; return { audio: Buffer.alloc(0) }; } },
      images: { characterSheet: async () => { called++; return []; } },
      video: { animate: async () => { called++; } },
      download: async () => { called++; },
      workDir: TMP + '/badlen', outPath: TMP + '/badlen/out.mp4'
    }
  ), (e) => e.code === 'shot_exceeds_generation');
  assert.strictEqual(called, 0, 'bought something before checking the plan was producible');
});

test('screen recordings are supplied, not quantised, and still cost nothing', () => {
  const plan = planShots({ beats: BEATS, targetSeconds: 60 });
  const screen = plan.shots.filter(c => c.source === 'screen_recording');
  assert.ok(screen.length, 'the fixture lost its screen-recording beat');
  assert.ok(screen.every(c => c.generateSeconds === null),
    'a screen recording was rounded up to a billable generation quantum');
  const generatedOnly = plan.shots.filter(c => c.source === 'generated')
    .reduce((n, c) => n + c.generateSeconds, 0);
  assert.strictEqual(plan.billedVideoSeconds, Math.round(generatedOnly * 100) / 100);
});

test('cost follows billed seconds, not runtime', () => {
  // 5s is charged whole even where the edit only uses part of it.
  const plan = { billedVideoSeconds: 60, generatedShots: 12, voiceoverText: 'x'.repeat(1000) };
  const est = estimateCost(plan, Object.assign({}, DEFAULTS, { ttsCostPerMillion: 15 }));
  assert.strictEqual(est.video, 3);
  assert.strictEqual(est.billedVideoSeconds, 60);
  assert.strictEqual(est.generations, DEFAULTS.angles.length + 12);
});

test('the runner asks for the quantum and cuts to the edit length', async () => {
  const asked = [];
  const res = await render(
    { beats: BEATS.slice(0, 2), character: { description: 'w', styleTokens: 's' },
      config: { targetSeconds: 45, maxCostUsd: 10 } },
    {
      tts: { costPerMillionChars: 15, speak: async () => ({ audio: fs.readFileSync(TMP + '/tone.mp3') }) },
      images: { characterSheet: async () => [{ angle: 'close-up on face', url: 'u' }] },
      video: {
        animate: async ({ seconds }) => {
          asked.push(seconds);
          const f = path.join(TMP, `q${asked.length}.mp4`);
          await makeClip(f, seconds, 'gray');
          return { url: 'file://' + f, seconds };
        }
      },
      download: async (url, dest) => fs.copyFileSync(url.replace('file://', ''), dest),
      workDir: TMP + '/quantum', outPath: TMP + '/quantum/out.mp4'
    }
  );

  assert.ok(asked.length, 'nothing was generated');
  assert.ok(asked.every(s => s === 5), `asked the model for ${[...new Set(asked)].join(',')}s`);
  // The tone is 12s, so 3 clips of 5s are bought (15s billed) and the edit
  // uses 12s of them. Billing above runtime is expected; the CUT is not.
  assert.strictEqual(res.billedVideoSeconds, asked.length * 5);
  const info = await probe(res.path);
  assert.ok(Math.abs(parseFloat(info.format.duration) - res.voSeconds) < 1.0,
    `edit is ${info.format.duration}s but the read is ${res.voSeconds}s — used the quantum, not the cut`);
});


// ---------- the character sheet is a saved asset, not a cache ----------

/** A render whose only variable is whether a saved sheet already exists. */
function sheetRun(dir, sheetCalls) {
  return render(
    { beats: BEATS.slice(0, 2), character: { description: 'a woman, 30s', styleTokens: '3d pixar style' },
      config: { targetSeconds: 12, maxCostUsd: 10 } },
    {
      tts: { costPerMillionChars: 15, speak: async () => ({ audio: fs.readFileSync(TMP + '/tone.mp3') }) },
      images: {
        characterSheet: async () => {
          sheetCalls.n++;
          return [{ angle: 'close-up on face', url: 'data:image/jpeg;base64,AAAA' }];
        }
      },
      video: {
        animate: async ({ seconds }) => {
          const f = path.join(TMP, `sh${Math.random().toString(36).slice(2)}.mp4`);
          await makeClip(f, seconds, 'navy');
          return { url: 'file://' + f, seconds };
        }
      },
      download: async (url, dest) => fs.copyFileSync(url.replace('file://', ''), dest),
      workDir: dir, outPath: path.join(dir, 'out.mp4')
    }
  );
}

test('SHEET — the character is persisted and a re-render reuses it', async () => {
  const dir = TMP + '/sheet-reuse';
  const calls = { n: 0 };

  const first = await sheetRun(dir, calls);
  assert.strictEqual(calls.n, 1, 'did not generate a sheet on the first run');
  assert.strictEqual(first.characterSheetReused, false);
  assert.ok(fs.existsSync(first.characterSheetPath), 'the sheet was never written to disk');

  const second = await sheetRun(dir, calls);
  assert.strictEqual(calls.n, 1,
    'paid to generate a SECOND character sheet — gpt-image-1 has no seed, so that is a different person');
  assert.strictEqual(second.characterSheetReused, true);
  assert.strictEqual(second.characterSheetPath, first.characterSheetPath);
});

test('SHEET — reuse is not charged for, and the budget knows it', async () => {
  const dir = TMP + '/sheet-cost';
  const calls = { n: 0 };
  const first = await sheetRun(dir, calls);
  const second = await sheetRun(dir, calls);

  assert.ok(first.estimate.images > 0, 'the first run should be quoted for images');
  assert.strictEqual(second.estimate.images, 0, 'quoted for images it was never going to buy');
  assert.strictEqual(second.estimate.generations, first.estimate.generations - DEFAULTS.angles.length);
  assert.ok(second.actualSpend < first.actualSpend, 'reusing the sheet did not cost less');
});

test('SHEET — a different character mints a different sheet', async () => {
  const dir = TMP + '/sheet-identity';
  const calls = { n: 0 };
  const a = await sheetRun(dir, calls);

  const b = await render(
    { beats: BEATS.slice(0, 2), character: { description: 'a man, 40s', styleTokens: '3d pixar style' },
      config: { targetSeconds: 12, maxCostUsd: 10 } },
    {
      tts: { costPerMillionChars: 15, speak: async () => ({ audio: fs.readFileSync(TMP + '/tone.mp3') }) },
      images: { characterSheet: async () => { calls.n++; return [{ angle: 'close-up on face', url: 'data:image/jpeg;base64,BBBB' }]; } },
      video: {
        animate: async ({ seconds }) => {
          const f = path.join(TMP, `id${Math.random().toString(36).slice(2)}.mp4`);
          await makeClip(f, seconds, 'gray');
          return { url: 'file://' + f, seconds };
        }
      },
      download: async (url, dest) => fs.copyFileSync(url.replace('file://', ''), dest),
      workDir: dir, outPath: path.join(dir, 'out2.mp4')
    }
  );

  assert.notStrictEqual(b.characterSheetPath, a.characterSheetPath,
    'a different character reused the first one\'s sheet');
  assert.strictEqual(b.characterSheetReused, false);
  assert.strictEqual(calls.n, 2);
});

test('SHEET — a corrupt saved sheet is regenerated, not rendered from', async () => {
  const dir = TMP + '/sheet-corrupt';
  const calls = { n: 0 };
  const first = await sheetRun(dir, calls);
  fs.writeFileSync(first.characterSheetPath, '{ this is not json');

  const second = await sheetRun(dir, calls);
  assert.strictEqual(calls.n, 2, 'rendered from an unreadable sheet instead of regenerating');
  assert.strictEqual(second.characterSheetReused, false);
});

test('SHEET — the saved file says plainly that the character cannot be regenerated', async () => {
  const dir = TMP + '/sheet-doc';
  const first = await sheetRun(dir, { n: 0 });
  const doc = JSON.parse(fs.readFileSync(first.characterSheetPath, 'utf8'));

  assert.strictEqual(doc.reproducible, false);
  assert.ok(/no seed/i.test(doc.note), `the file does not warn about regeneration: ${doc.note}`);
  assert.ok(doc.frames.length && doc.frames[0].url, 'the frames were not saved');
  assert.strictEqual(doc.character.description, 'a woman, 30s');
});


test('LEDGER — provider-reported cost is recorded, not just the rate-card guess', async () => {
  const dir = TMP + '/ledger';
  const res = await render(
    { beats: BEATS.slice(0, 2), character: { description: 'w', styleTokens: 's' },
      config: { targetSeconds: 12, maxCostUsd: 10 } },
    {
      tts: { costPerMillionChars: 15, speak: async () => ({ audio: fs.readFileSync(TMP + '/tone.mp3') }) },
      images: { characterSheet: async () => [{ angle: 'close-up on face', url: 'u', outputTokens: 1584 }] },
      video: {
        animate: async ({ seconds }) => {
          const f = path.join(TMP, `l${Math.random().toString(36).slice(2)}.mp4`);
          await makeClip(f, seconds, 'navy');
          return { url: 'file://' + f, seconds, taskId: 'task-' + seconds, credits: 25 };
        }
      },
      download: async (url, dest) => fs.copyFileSync(url.replace('file://', ''), dest),
      workDir: dir, outPath: path.join(dir, 'out.mp4')
    }
  );

  assert.strictEqual(res.ledger.imageTokens, 1584, 'did not record what the image model reported');
  assert.strictEqual(res.ledger.videoCredits, res.generatedShots * 25,
    'credits were not summed from what Runway reported');
  assert.strictEqual(res.ledger.clips.length, res.generatedShots);
  assert.ok(res.ledger.clips.every((c) => c.taskId && c.credits === 25),
    'a clip landed in the ledger with no task id or cost');
  // The quantum billed and the footage used are both recorded, since they differ.
  assert.ok(res.ledger.clips.every((c) => c.generatedSeconds >= c.usedSeconds));
});


test('SHEET — a saved frame the video model could not fetch is not reused', async () => {
  const dir = TMP + '/sheet-stub';
  const calls = { n: 0 };
  const first = await sheetRun(dir, calls);

  // Exactly what the stubbed demo persists: a placeholder that is a valid
  // string but not something Runway can resolve.
  const doc = JSON.parse(fs.readFileSync(first.characterSheetPath, 'utf8'));
  doc.frames = [{ angle: 'close-up on face', url: 'locked://character/close-up-on-face' }];
  fs.writeFileSync(first.characterSheetPath, JSON.stringify(doc));

  const second = await sheetRun(dir, calls);
  assert.strictEqual(calls.n, 2, 'reused a sheet of unfetchable placeholder urls');
  assert.strictEqual(second.characterSheetReused, false);
});


/** Mono RMS of a media file's audio, for level assertions. */
async function audioRms(file) {
  const raw = path.join(TMP, 'rms.raw');
  await run(FFMPEG, ['-y', '-v', 'error', '-i', file, '-ac', '1', '-ar', '16000', '-f', 's16le', raw]);
  const b = fs.readFileSync(raw);
  let sum = 0;
  const n = b.length / 2;
  for (let i = 0; i < n; i++) { const v = b.readInt16LE(i * 2) / 32768; sum += v * v; }
  return Math.sqrt(sum / n);
}

test('MUSIC — a bed is mixed under the voice WITHOUT ducking the voice too', async () => {
  const dir = TMP + '/music';
  fs.mkdirSync(dir, { recursive: true });
  const clips = [];
  for (let i = 0; i < 3; i++) {
    const f = path.join(dir, `c${i}.mp4`);
    await makeClip(f, 3, ['navy', 'maroon', 'darkgreen'][i]);
    clips.push({ path: f, seconds: 3 });
  }
  await makeTone(path.join(dir, 'vo.mp3'), 9);
  // A SILENT bed: whatever the voice measures with this mixed in is what the
  // voice measures on its own — unless amix quietly halved it.
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', '9', '-c:a', 'libmp3lame', path.join(dir, 'silence.mp3')]);

  const cues = [{ start: 0, end: 4.5, text: 'first line' }, { start: 4.5, end: 9, text: 'second line' }];
  const plain = path.join(dir, 'plain.mp4');
  const withBed = path.join(dir, 'bed.mp4');
  await assemble({ clips, cues, voiceover: path.join(dir, 'vo.mp3'), outPath: plain, workDir: path.join(dir, 'w1') });
  await assemble({ clips, cues, voiceover: path.join(dir, 'vo.mp3'), music: path.join(dir, 'silence.mp3'),
    outPath: withBed, workDir: path.join(dir, 'w2') });

  const a = await audioRms(plain);
  const b = await audioRms(withBed);
  assert.ok(a > 0.01, `the voiceover-only mix is silent (${a})`);
  assert.ok(Math.abs(b - a) / a < 0.12,
    `voice is ${b.toFixed(4)} with a silent bed vs ${a.toFixed(4)} without — amix normalisation ate ${((1 - b / a) * 100).toFixed(0)}% of the read`);

  // and the bed run still produces a full-length audio stream
  const info = await probe(withBed);
  const au = info.streams.find((st) => st.codec_type === 'audio');
  assert.ok(Math.abs(parseFloat(au.duration) - 9) < 0.6, `audio is ${au.duration}s against a 9s read`);
});


test('MUSIC — the mix uses no ffmpeg option that some builds lack', () => {
  // A production render died on "Option 'normalize' not found": the linux-x64
  // build reports version 4.4 and rejects an option the darwin build of the
  // SAME version accepts, so testing one binary proved nothing about the other.
  // The mix must therefore be built from options present everywhere.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'pipeline', 'assemble.js'), 'utf8');
  const filterStrings = src.split('\n')
    .filter((l) => /amix=|volume=|afade=/.test(l) && !/^\s*(\/\/|\*)/.test(l));
  assert.ok(filterStrings.length, 'could not find the mix filter to check');
  for (const l of filterStrings) {
    assert.ok(!/normalize\s*=/.test(l),
      `the mix filter uses normalize=, which is missing on some ffmpeg builds: ${l.trim()}`);
  }
  // and it must still compensate, or the voice comes back 6dB down
  // The voice input index shifts when a logo overlay is present, so match the
  // compensation itself rather than a fixed stream number.
  assert.ok(/:a\]volume=\$\{N\}\[voice\]/.test(src),
    'the voice is no longer pre-amplified to offset amix');
});

(async () => {
  // Start clean: several tests now assert on whether the runner GENERATED a
  // character sheet, and a sheet left behind by the previous run would make
  // them pass once and then quietly stop testing anything.
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  await makeTone(TMP + '/tone.mp3', 12);
  let pass = 0, fail = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`  PASS  ${t.name}`); pass++; }
    catch (e) { console.log(`  FAIL  ${t.name}\n        ${e.message}`); fail++; }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
