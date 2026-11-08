'use strict';
/**
 * OrbUp — 29s, 9:16, built to a recipe measured off a real NetSuite ad.
 *
 * The reference's pacing is what was reused, and nothing else: a calm 6.3s
 * open, ONE continuous 14.5s animated centrepiece (half the runtime), then an
 * accelerando of 2.25 / 1.42 / 1.47 into a hard end card. Its footage, script,
 * music and on-screen copy are its own and appear nowhere here.
 *
 * $0 to render. Every frame is drawn by ffmpeg, the voice is the repo's
 * keyless Edge TTS, the music is the deterministic in-repo score. No model,
 * no credits, so a copy change costs a re-render and nothing else.
 *
 * Shots are rendered separately and concatenated. One filtergraph for 29s of
 * six different layouts is unreadable and undebuggable; six short ones can
 * each be looked at on their own.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');
const { score } = require('./score');

const W = 1080, H = 1920, FPS = 30;
const A = '/tmp/orbup';
const WORK = '/tmp/orbup/work';
const OUT_DIR = process.env.OUT_DIR || path.join(os.homedir(), 'Desktop', 'JobUp', 'JobUp-Video');
const BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
const REG = '/System/Library/Fonts/Supplemental/Arial.ttf';
const BG = '0x06060d';

// Shot lengths, taken from the measured recipe.
const SHOTS = [6.32, 14.50, 2.25, 1.42, 1.47, 3.04];
const DUR = SHOTS.reduce((a, b) => a + b, 0);           // 29.00
const startOf = (i) => SHOTS.slice(0, i).reduce((a, b) => a + b, 0);

// Voice, placed on the timeline. A line is allowed to run past its own cut —
// the reference reads wall to wall and its edit never waits for the sentence.
const VO = [
  { file: 'v1.mp3', at: 0.55 },
  { file: 'v2.mp3', at: 6.55 },
  { file: 'v3.mp3', at: 20.95 },
  { file: 'v4.mp3', at: 23.10 },
  { file: 'v5.mp3', at: 24.90 },
  { file: 'v6.mp3', at: 26.40 },
];

const esc = (s) => s.replace(/[\\:']/g, (c) => '\\' + c);
const text = (t, o) => `drawtext=fontfile=${o.font || BOLD}:text='${esc(t)}':`
  + `x=${o.x || '(w-text_w)/2'}:y=${o.y}:fontsize=${o.size}:fontcolor=${o.color || 'white'}:`
  + `expansion=none${o.enable ? `:enable='${o.enable}'` : ''}${o.alpha ? `:alpha='${o.alpha}'` : ''}`;
const fadeIn = (at, d = 0.4) => `min(1\\,max(0\\,(t-${at})/${d}))`;

/** Shot 1 — the cost of not answering. Missed calls stack up. */
function shot1() {
  const rows = [
    ['Missed call', '8:14 AM', 1.0],
    ['Missed call', '11:02 AM', 2.0],
    ['Missed call', '4:47 PM', 3.0],
  ];
  const f = [`color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${SHOTS[0]}[bg]`];
  // A dim orb, present but not yet awake.
  f.push(`[0:v]scale=560:-1,colorchannelmixer=aa=0.44[orb]`);
  f.push(`[bg][orb]overlay=x='(W-w)/2':y=250[a0]`);
  let cur = 'a0';
  rows.forEach((r, i) => {
    const y = 900 + i * 190;
    // The plate and its text are gated by the SAME enable rather than the
    // plate popping while the label fades up behind it: a 0.35s ramp left an
    // empty card on screen, which reads as a rendering fault, not a beat.
    const on = `gte(t,${r[2]})`;
    f.push(`[${cur}]drawbox=x=110:y=${y}:w=860:h=140:color=0x14141ff0:t=fill:enable='${on}',`
      + `drawbox=x=110:y=${y}:w=8:h=140:color=0xff3b5c:t=fill:enable='${on}',`
      + text(r[0], { x: '166', y: y + 34, size: 46, enable: on })
      + `,` + text(r[1], { x: '166', y: y + 88, size: 32, color: '0x8d93a6', font: REG, enable: on })
      + `[b${i}]`);
    cur = `b${i}`;
  });
  f.push(`[${cur}]` + text('Every call you miss', { y: 1560, size: 62, alpha: fadeIn(0.3) })
    + `,` + text('is a customer who called somebody else.', { y: 1650, size: 42, color: '0xb9bed1', font: REG, alpha: fadeIn(1.1) })
    + `[v]`);
  return { inputs: [`${A}/orb.png`], graph: f.join(';') };
}

/**
 * Shot 2 — the centrepiece, and the reason this ad is cheap to make. One
 * continuous 14.5s take: the rings turn in opposite directions and the claims
 * accumulate underneath. No cuts, so nothing has to be generated.
 */
function shot2() {
  const d = SHOTS[1];
  const chips = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const f = [
    `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${d}[bg]`,
    `[0:v]scale=880:-1[orb]`,
    // Opposed rotation: one ring turning alone reads as a spinning picture,
    // two turning against each other reads as a system.
    `[1:v]scale=1040:-1,rotate=a='t*0.22':c=none:ow=1040:oh=1040[ra]`,
    `[2:v]scale=1120:-1,rotate=a='-t*0.15':c=none:ow=1120:oh=1120[rb]`,
    `[bg][orb]overlay=x='(W-w)/2':y='340-4*sin(t*1.1)'[s1]`,
    `[s1][ra]overlay=x='(W-w)/2':y='300-4*sin(t*1.1)'[s2]`,
    `[s2][rb]overlay=x='(W-w)/2':y='260-4*sin(t*1.1)'[s3]`,
  ];
  let cur = 's3';
  chips.forEach((c, i) => {
    const at = 1.1 + i * 2.35;
    const y = 1096 + i * 120;
    // Slides the last few pixels into place as it fades, so the list builds
    // rather than blinking on.
    f.push(`[${i + 3}:v]format=rgba,fade=t=in:st=${at}:d=0.45:alpha=1[ch${i}]`);
    f.push(`[${cur}][ch${i}]overlay=x='(W-w)/2+40*(1-${fadeIn(at, 0.45)})':y=${y}:`
      + `enable='gte(t,${at})'[k${i}]`);
    cur = `k${i}`;
  });
  f.push(`[${cur}]` + text('One AI receptionist. Every call.',
    { y: 1730, size: 44, color: '0x9aa0b8', font: REG, alpha: fadeIn(11.6, 0.6) }) + `[v]`);
  return { inputs: [`${A}/orb.png`, `${A}/ring-a.png`, `${A}/ring-b.png`, ...chips.map((c) => `${A}/${c}.png`)], graph: f.join(';') };
}

/** Shots 3-5 — the accelerando. Big type, the orb glowing behind it. */
function statement(i, lines, sizes) {
  const d = SHOTS[i];
  const f = [
    `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${d}[bg]`,
    `[0:v]scale=1500:-1,colorchannelmixer=aa=0.34[glow]`,
    `[bg][glow]overlay=x='(W-w)/2':y='(H-h)/2'[a]`,
  ];
  let cur = 'a', y = 860 - (lines.length - 1) * 60;
  lines.forEach((ln, k) => {
    f.push(`[${cur}]` + text(ln, { y: y + k * 120, size: sizes[k], alpha: fadeIn(0.05, 0.22) }) + `[t${k}]`);
    cur = `t${k}`;
  });
  f.push(`[${cur}]null[v]`);
  return { inputs: [`${A}/orb.png`], graph: f.join(';') };
}

/** Shot 6 — the mark. */
function shot6() {
  const d = SHOTS[5];
  return {
    inputs: [`${A}/orb.png`, '/Users/manuelstagg/Desktop/DESKTOP/PROJECTS/OrbUp/OrbUp.png'],
    graph: [
      `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${d}[bg]`,
      `[0:v]scale=1600:-1,colorchannelmixer=aa=0.26[glow]`,
      `[bg][glow]overlay=x='(W-w)/2':y='(H-h)/2'[a]`,
      `[1:v]scale=880:-1,fade=t=in:st=0.05:d=0.45:alpha=1[lg]`,
      `[a][lg]overlay=x='(W-w)/2':y='560-14*${fadeIn(0.05, 0.9)}'[b]`,
      `[b]` + text('orbup.app', { y: 1500, size: 74, color: '0xffffff', alpha: fadeIn(0.5, 0.5) }) + `[v]`,
    ].join(';'),
  };
}

async function renderShot(i, def) {
  const out = path.join(WORK, `s${i}.mp4`);
  const args = ['-y', '-v', 'error'];
  for (const p of def.inputs) args.push('-loop', '1', '-framerate', String(FPS), '-t', String(SHOTS[i]), '-i', p);
  args.push('-filter_complex', def.graph, '-map', '[v]', '-t', String(SHOTS[i]),
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p', out);
  await run(FFMPEG, args, { maxBuffer: 1 << 27 });
  return out;
}

(async () => {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const defs = [
    shot1(), shot2(),
    statement(2, ['Nothing goes', 'to voicemail.'], [78, 78]),
    statement(3, ['You stop chasing', 'callbacks.'], [70, 70]),
    statement(4, ['You start', 'booking work.'], [76, 76]),
    shot6(),
  ];
  const parts = [];
  for (let i = 0; i < defs.length; i++) {
    process.stdout.write(`  shot ${i + 1}/6 (${SHOTS[i]}s) ... `);
    parts.push(await renderShot(i, defs[i]));
    console.log('ok');
  }

  const list = path.join(WORK, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  const silent = path.join(WORK, 'silent.mp4');
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-c', 'copy', silent], { maxBuffer: 1 << 27 });

  const music = path.join(WORK, 'score.wav');
  fs.writeFileSync(music, score(DUR));

  // Voice lines are delayed onto one bed, then mixed under the score. amix's
  // `normalize` option does not exist on every build that reports the same
  // version, so the levels are set explicitly instead of relying on it.
  process.stdout.write('  mixing ... ');
  const ai = [];
  const af = [];
  VO.forEach((v, i) => {
    ai.push('-i', path.join(A, v.file));
    af.push(`[${i + 1}:a]adelay=${Math.round(v.at * 1000)}|${Math.round(v.at * 1000)},volume=1.9[q${i}]`);
  });
  af.push(`${VO.map((_, i) => `[q${i}]`).join('')}amix=inputs=${VO.length}:duration=longest:dropout_transition=0[voice]`);
  af.push(`[${VO.length + 1}:a]volume=0.20,afade=t=out:st=${DUR - 1.4}:d=1.4[bed]`);
  af.push(`[voice][bed]amix=inputs=2:duration=first:dropout_transition=0,`
    + `loudnorm=I=-13:TP=-1.2:LRA=11,atrim=0:${DUR},asetpts=N/SR/TB[a]`);

  const out = path.join(OUT_DIR, `orbup-29s-${Date.now()}.mp4`);
  await run(FFMPEG, ['-y', '-v', 'error', '-i', silent, ...ai, '-i', music,
    '-filter_complex', af.join(';'), '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(DUR),
    '-movflags', '+faststart', out], { maxBuffer: 1 << 27 });
  console.log('ok');

  console.log(`\n${out}`);
  console.log(`  ${W}x${H} · ${DUR.toFixed(2)}s · ${FPS}fps · $0 (no model calls)`);
})().catch((e) => {
  console.error('FAILED:', String(e.stderr || e.message).split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 700));
  process.exit(1);
});
