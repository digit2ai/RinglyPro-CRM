'use strict';
/**
 * OrbUp — 29.6s, 9:16. "Talk to it. We build it."
 *
 * Pacing cloned from a measured NetSuite ad (6.32 open, ONE continuous 14.5s
 * centrepiece, then 2.25 / 1.42 / 1.47 into the end card). Its footage,
 * script, music and copy are its own and appear nowhere here.
 *
 * THE PRODUCT IS THE BUILD PLATFORM, NOT A RECEPTIONIST. An earlier cut of
 * this ad described an AI that answers your phone, because the brand row in
 * verticals/growth/src/services/brands.js still says that. That is RinglyPro
 * — one of the platforms OrbUp BUILT. Every claim below traces to orbup.app's
 * own landing copy: 83 agents (8 core + 75 specialists), open MCP, 21 live
 * platforms, 22 verticals.
 *
 * SIX DISTINCT TREATMENTS, ON PURPOSE. The previous cut gave its three
 * closing beats the same layout, and the analyser read them back as ONE shot
 * — the accelerando existed in the audio and nowhere on screen.
 *
 * $0. Drawn by ffmpeg, voiced by the repo's keyless Edge TTS, scored by the
 * deterministic in-repo generator. No model calls, so a copy change is free.
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
const WORK = '/tmp/orbup/work2';
const LOGO = '/Users/manuelstagg/Desktop/DESKTOP/PROJECTS/OrbUp/OrbUp.png';
const OUT_DIR = process.env.OUT_DIR || path.join(os.homedir(), 'Desktop', 'JobUp', 'JobUp-Video');
const BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
const REG = '/System/Library/Fonts/Supplemental/Arial.ttf';
const MONO = '/System/Library/Fonts/Menlo.ttc';
const BG = '0x05060f';

const SHOTS = [6.32, 14.50, 2.25, 1.42, 1.47, 3.64];
const DUR = SHOTS.reduce((a, b) => a + b, 0);   // 29.60

const VO = [
  { file: 'w1.mp3', at: 0.50 }, { file: 'w2.mp3', at: 6.60 },
  { file: 'w3.mp3', at: 20.95 }, { file: 'w4.mp3', at: 23.10 },
  { file: 'w5.mp3', at: 25.00 }, { file: 'w6.mp3', at: 26.60 },
];

const esc = (s) => String(s).replace(/[\\:']/g, (c) => '\\' + c);
const T = (t, o) => `drawtext=fontfile=${o.font || BOLD}:text='${esc(t)}':`
  + `x=${o.x !== undefined ? o.x : '(w-text_w)/2'}:y=${o.y}:fontsize=${o.size}:`
  + `fontcolor=${o.color || 'white'}:expansion=none`
  + (o.enable ? `:enable='${o.enable}'` : '') + (o.alpha ? `:alpha='${o.alpha}'` : '');
const ramp = (at, d = 0.4) => `min(1\\,max(0\\,(t-${at})/${d}))`;

/** SHOT 1 — the ask. The prompt types itself, word by word. */
function shot1() {
  // Wrapped by hand at a fixed break: a 44px mono line of this sentence is
  // wider than the 900px frame it sits in and was clipped mid-word.
  const words = 'I need a tool that recovers missed appointments'.split(' ');
  const BREAK = 5;
  const t0 = 1.15, step = 0.30;
  const f = [
    `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${SHOTS[0]}[bg]`,
    `[0:v]scale=760:-1[orb]`,
    `[bg][orb]overlay=x='(W-w)/2':y='150-6*sin(t*1.3)'[a]`,
    `[a]` + T('TAP THE ORB AND JUST TALK', { y: 900, size: 34, color: '0x7d86a8', font: REG }) + `[b]`,
    // the input frame the site actually puts under the orb
    `[b]drawbox=x=90:y=980:w=900:h=250:color=0x101527:t=fill,`
      + `drawbox=x=90:y=980:w=900:h=250:color=0x2b3355:t=3[c]`,
  ];
  let cur = 'c';
  // Each layer draws the sentence GROWN BY ONE WORD, shown only in its own
  // window. Revealing a single string with a moving mask needs per-pixel work;
  // this is nine cheap draws.
  words.forEach((_, i) => {
    const shown = words.slice(0, i + 1);
    const l1 = shown.slice(0, BREAK).join(' ');
    const l2 = shown.slice(BREAK).join(' ');
    const from = (t0 + i * step).toFixed(2);
    const to = i === words.length - 1 ? SHOTS[0] : (t0 + (i + 1) * step).toFixed(2);
    const win = `between(t,${from},${to})`;
    f.push(`[${cur}]` + T(l1, { x: 130, y: 1030, size: 38, font: MONO, color: '0xe8ecff', enable: win })
      + (l2 ? ',' + T(l2, { x: 130, y: 1092, size: 38, font: MONO, color: '0xe8ecff', enable: win }) : '')
      + `[w${i}]`);
    cur = `w${i}`;
  });
  f.push(`[${cur}]drawbox=x=130:y=1152:w=18:h=4:color=0x6f5bff:t=fill:enable='lt(mod(t\\,0.9),0.5)'[cur2]`);
  f.push(`[cur2]` + T('Out loud, or typed. That is the whole interface.',
    { y: 1400, size: 40, color: '0x9aa3c4', font: REG, alpha: ramp(3.9, 0.5) }) + `[v]`);
  return { inputs: [`${A}/orb.png`], graph: f.join(';') };
}

/**
 * SHOT 2 — the centrepiece. One continuous 14.5s take: the brain hands work
 * out to the core agents one at a time, each staying lit, so the web is built
 * in front of you instead of simply appearing.
 */
function shot2() {
  const d = SHOTS[1];
  const f = [
    `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${d}[bg]`,
    `[0:v]scale=1000:-1[web]`,
    `[1:v]scale=520:-1[orb]`,
    // The dashed orbit ring was removed here: over the constellation it reads
    // as clutter crossing the links rather than as motion. The web lighting
    // up in sequence IS the motion.
    `[bg][web]overlay=x='(W-w)/2':y=270:enable='gte(t,0.5)'[s1]`,
    `[s1][orb]overlay=x='(W-w)/2':y='510-5*sin(t*1.2)'[s2]`,
  ];
  let cur = 's2';
  for (let i = 0; i < 8; i++) {
    const at = (2.3 + i * 0.85).toFixed(2);
    f.push(`[${i + 2}:v]scale=1000:-1,format=rgba,fade=t=in:st=${at}:d=0.30:alpha=1[n${i}]`);
    f.push(`[${cur}][n${i}]overlay=x='(W-w)/2':y=270:enable='gte(t,${at})'[m${i}]`);
    cur = `m${i}`;
  }
  f.push(`[${cur}]` + T('ONE BRAIN. EVERY AGENT.', { y: 1345, size: 40, color: '0x7d86a8', font: REG, alpha: ramp(1.0, 0.5) })
    + ',' + T('8 core', { x: 210, y: 1425, size: 56, color: '0x8b7bff', alpha: ramp(2.3, 0.4) })
    + ',' + T('+  75 specialists', { x: 400, y: 1425, size: 56, color: '0x7fb4ff', alpha: ramp(5.0, 0.5) })
    + ',' + T('= 83 AGENTS', { y: 1520, size: 88, alpha: ramp(9.4, 0.5) })
    + ',' + T('wired to your live systems over open MCP',
      { y: 1660, size: 38, color: '0x9aa3c4', font: REG, alpha: ramp(11.2, 0.6) }) + `[v]`);
  return {
    inputs: [`${A}/web.png`, `${A}/orb.png`,
      ...Array.from({ length: 8 }, (_, i) => `${A}/node${i}.png`)],
    graph: f.join(';'),
  };
}

/** SHOT 3 — the plan writes itself. Lines land fast. */
function shot3() {
  const rows = [[0.10, 620], [0.22, 780], [0.34, 540], [0.46, 700], [0.58, 460]];
  const f = [
    `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${SHOTS[2]}[bg]`,
    `[0:v]scale=1000:-1,colorchannelmixer=aa=0.22[glow]`,
    `[bg][glow]overlay=x='(W-w)/2':y=200[a]`,
    `[a]drawbox=x=120:y=700:w=840:h=520:color=0x0d1120:t=fill,drawbox=x=120:y=700:w=840:h=520:color=0x252c48:t=3[b]`,
  ];
  let cur = 'b';
  rows.forEach((r, i) => {
    f.push(`[${cur}]drawbox=x=170:y=${770 + i * 82}:w=${r[1]}:h=14:color=0x6f5bff:t=fill:enable='gte(t,${r[0]})',`
      + `drawbox=x=170:y=${770 + i * 82}:w=14:h=14:color=0x57e0ff:t=fill:enable='gte(t,${r[0]})'[p${i}]`);
    cur = `p${i}`;
  });
  f.push(`[${cur}]` + T('A real plan in seconds.', { y: 1380, size: 74 })
    + ',' + T('A genuine scope, not a canned demo.',
      { y: 1490, size: 38, color: '0x9aa3c4', font: REG, alpha: ramp(0.7, 0.4) }) + `[v]`);
  return { inputs: [`${A}/orb.png`], graph: f.join(';') };
}

/** SHOT 4 — the receipts. A number, and the platforms behind it. */
function shot4() {
  const names = ['RinglyPro', 'SurgicalMind', 'EquiMind', 'AgroMercado', 'Veritas'];
  const f = [
    `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${SHOTS[3]}[bg]`,
    `[bg]` + T('21', { y: 620, size: 300, color: '0xffffff' })
    + ',' + T('LIVE PLATFORMS', { y: 960, size: 52, color: '0x8b7bff' }) + `[a]`,
  ];
  let cur = 'a';
  names.forEach((n, i) => {
    f.push(`[${cur}]` + T(n, { y: 1140 + i * 86, size: 44, color: '0x9aa3c4', font: REG,
      enable: `gte(t,${(0.05 + i * 0.06).toFixed(2)})` }) + `[q${i}]`);
    cur = `q${i}`;
  });
  f.push(`[${cur}]null[v]`);
  return { inputs: [], graph: f.join(';') };
}

/** SHOT 5 — the second number, deliberately a different layout to shot 4. */
function shot5() {
  const f = [`color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${SHOTS[4]}[bg]`];
  let cur = 'bg';
  // A grid that fills in, so this beat MOVES where shot 4 was typographic.
  for (let i = 0; i < 22; i++) {
    const c = i % 5, r = Math.floor(i / 5);
    f.push(`[${cur}]drawbox=x=${210 + c * 140}:y=${1120 + r * 140}:w=96:h=96:color=0x6f5bff:t=fill:`
      + `enable='gte(t,${(0.02 + i * 0.028).toFixed(3)})'[g${i}]`);
    cur = `g${i}`;
  }
  f.push(`[${cur}]` + T('22', { y: 620, size: 300 })
    + ',' + T('INDUSTRY VERTICALS', { y: 960, size: 52, color: '0x57e0ff' }) + `[v]`);
  return { inputs: [], graph: f.join(';') };
}

/** SHOT 6 — the mark. */
function shot6() {
  return {
    inputs: [`${A}/orb.png`, LOGO],
    graph: [
      `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${SHOTS[5]}[bg]`,
      `[0:v]scale=1700:-1,colorchannelmixer=aa=0.24[glow]`,
      `[bg][glow]overlay=x='(W-w)/2':y='(H-h)/2'[a]`,
      `[1:v]scale=820:-1,fade=t=in:st=0.05:d=0.45:alpha=1[lg]`,
      `[a][lg]overlay=x='(W-w)/2':y='600-16*${ramp(0.05, 0.9)}'[b]`,
      `[b]` + T('Talk to it. We build it.', { y: 1480, size: 62, alpha: ramp(0.45, 0.45) })
      + ',' + T('orbup.app', { y: 1600, size: 56, color: '0x8b7bff', alpha: ramp(0.8, 0.45) }) + `[v]`,
    ].join(';'),
  };
}

async function renderShot(i, def) {
  const out = path.join(WORK, `s${i}.mp4`);
  const args = ['-y', '-v', 'error'];
  for (const p of def.inputs) args.push('-loop', '1', '-framerate', String(FPS), '-t', String(SHOTS[i]), '-i', p);
  args.push('-filter_complex', def.graph, '-map', '[v]', '-t', String(SHOTS[i]), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', out);
  await run(FFMPEG, args, { maxBuffer: 1 << 27 });
  return out;
}

(async () => {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const defs = [shot1(), shot2(), shot3(), shot4(), shot5(), shot6()];
  const parts = [];
  for (let i = 0; i < defs.length; i++) {
    process.stdout.write(`  shot ${i + 1}/6 (${SHOTS[i]}s) ... `);
    parts.push(await renderShot(i, defs[i]));
    console.log('ok');
  }

  const list = path.join(WORK, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  const silent = path.join(WORK, 'silent.mp4');
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent],
    { maxBuffer: 1 << 27 });

  const music = path.join(WORK, 'score.wav');
  fs.writeFileSync(music, score(DUR));

  process.stdout.write('  mixing ... ');
  const ai = [], af = [];
  VO.forEach((v, i) => {
    ai.push('-i', path.join(A, v.file));
    af.push(`[${i + 1}:a]adelay=${Math.round(v.at * 1000)}|${Math.round(v.at * 1000)},volume=1.9[q${i}]`);
  });
  af.push(`${VO.map((_, i) => `[q${i}]`).join('')}amix=inputs=${VO.length}:duration=longest:dropout_transition=0[voice]`);
  af.push(`[${VO.length + 1}:a]volume=0.18,afade=t=out:st=${DUR - 1.6}:d=1.6[bed]`);
  // amix's `normalize` option is absent from builds reporting the same version
  // number, so levels are set explicitly rather than relying on it.
  af.push(`[voice][bed]amix=inputs=2:duration=first:dropout_transition=0,`
    + `loudnorm=I=-14:TP=-1.2:LRA=11,atrim=0:${DUR},asetpts=N/SR/TB[a]`);

  const out = path.join(OUT_DIR, `orbup-talk-to-it-${Date.now()}.mp4`);
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
