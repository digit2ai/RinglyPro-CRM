'use strict';
/**
 * JobUp — 15s, 9:16, built from four iPhone screenshots.
 *
 * THE SCREENSHOTS ARE NEVER REDRAWN OR RE-GENERATED. They are the most
 * credible footage a product ad has and the least forgiving: a model asked to
 * animate a UI melts its text and invents controls that do not exist. So the
 * pixels are left exactly as captured and the MOTION is added around them —
 * the frame drifts, accents draw themselves in, a ring pulses around the
 * score. The 1357s and 92s on screen are the real numbers from the real app.
 *
 * The Safari toolbar and the iOS status bar are cropped out: a 1125x2436 phone
 * capture scaled to 1080 leaves 2340px, and taking a 1920 window from y=100
 * loses the clock at the top and the browser chrome at the foot. Shipping an
 * ad with someone's battery percentage in it is the tell that nobody looked.
 *
 * $0 — no model calls. Voice is the repo's keyless Edge TTS, music the
 * deterministic in-repo score.
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
const SRC = path.join(os.homedir(), 'Desktop', 'JobUpIMG');
const WORK = '/tmp/jobupimg/work';
const OUT_DIR = path.join(os.homedir(), 'Desktop', 'JobUp', 'JobUp-Video');
const BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
const REG = '/System/Library/Fonts/Supplemental/Arial.ttf';
const LOGO = path.join(__dirname, 'jobup-logo.png');

const SHOTS = [4.70, 4.90, 2.80, 2.60];
const DUR = SHOTS.reduce((a, b) => a + b, 0);   // 15.00

const VO = [
  { file: 'j1.mp3', at: 0.20 }, { file: 'j2.mp3', at: 4.85 },
  { file: 'j3.mp3', at: 9.75 }, { file: 'j4.mp3', at: 12.60 },
];

const esc = (s) => String(s).replace(/[\\:']/g, (c) => '\\' + c);
const ramp = (at, d = 0.4) => `min(1\\,max(0\\,(t-${at})/${d}))`;

/** A subtitle band. Social video is watched muted; the line has to be readable. */
function caption(line) {
  return `drawbox=x=0:y=1636:w=${W}:h=150:color=0x05060cc4:t=fill,`
    + `drawtext=fontfile=${BOLD}:text='${esc(line)}':x=(w-text_w)/2:y=1682:`
    + `fontsize=46:fontcolor=white:expansion=none`;
}

/**
 * The frame drifts across an oversized copy of the still. This is a couple of
 * arithmetic expressions per frame, not a per-pixel filter — rendering a
 * gradient per pixel per frame once cost 147s of CPU for a single card.
 *
 * ANNOTATIONS MUST TRACK THE DRIFT. A ring drawn at a fixed screen position
 * over a moving frame starts on the number and slides off it — by the end of
 * a 2.8s scene the ring sat below and left of the 92, pointing at nothing.
 * So the mapper below turns a coordinate measured on the STILL into the screen
 * expression for where that point actually is on each frame.
 *
 * THEY ARE OVERLAYS, NOT drawbox. Inside drawbox, `t` is the border THICKNESS,
 * not the timestamp — so a tracking expression written with `t` silently reads
 * the border width and never animates. drawtext has a real `t`; drawbox does
 * not. overlay's x/y do, so every moving annotation is an image composited
 * with overlay.
 *
 * The zoom is 6%, not 10%: a centred 10% crop removes 54px from each side and
 * the stat cards begin at x=40, so their left edge — and the accent bar drawn
 * on it — sat outside the frame entirely.
 */
const OW = 1145, OH = 2036;              // 6% of room to move; see below
const Z = OW / W;                        // everything measured on the still scales by this

function drift(seconds, dir = 'down') {
  const dx = OW - W, dy = OH - H;
  const p = `(t/${seconds.toFixed(2)})`;
  const cropX = Math.round(dx / 2);
  const cropY = dir === 'down' ? `(${dy})*${p}` : `(${dy})*(1-${p})`;
  return {
    vf: `scale=${OW}:${OH},crop=${W}:${H}:${cropX}:'${cropY}'`,
    // where a point on the still lands on screen at time t
    x: (x0) => `${(x0 * Z - cropX).toFixed(1)}`,
    y: (y0) => `(${(y0 * Z).toFixed(1)}-${cropY})`,
    s: (n) => Math.round(n * Z),         // a measured length, scaled
  };
}

const SCENES = [
  // 1 — the promise, straight off the landing page
  {
    img: '2830.png', dir: 'down', inputs: [],
    layers: () => ({ chain: [], last: 'base' }),
    line: 'Let your AI agents find them while you sleep.',
  },
  // 2 — an accent draws down the left edge of each stat card, staggered, so
  // the eye is walked through the three numbers instead of meeting them at once.
  {
    img: '2832.png', dir: 'down', inputs: ['/tmp/jobupimg/bar.png'],
    layers: (d) => {
      const chain = []; let last = 'base';
      [[391, 221, 0.35], [684, 221, 0.75], [977, 221, 1.15]].forEach(([y0, h, at], k) => {
        chain.push(`[1:v]scale=${d.s(9)}:'max(2\\,${d.s(h)}*${ramp(at, 0.45)})':eval=frame[bar${k}]`);
        chain.push(`[${last}][bar${k}]overlay=x=${d.x(40)}:y='${d.y(y0)}':`
          + `enable='gte(t,${at})'[b${k}]`);
        last = `b${k}`;
      });
      return { chain, last };
    },
    line: '100 matches. 5 of them strong.',
  },
  // 3 — a ring pulses around the score. The 92 itself is never touched.
  {
    img: '2833.png', dir: 'up', inputs: ['/tmp/jobupimg/ring.png'],
    layers: (d) => {
      // measured, not eyeballed: the score occupies x 920-989, y 346-387
      const pad = 26;
      const w = d.s(989 - 920 + pad * 2), h = d.s(387 - 346 + pad * 2);
      return {
        chain: [
          `[1:v]scale=${w}:${h},format=rgba[ring]`,
          `[base][ring]overlay=x=${d.x(920 - pad)}:y='${d.y(346 - pad)}':`
            + `enable='gt(t,0.3)'[r0]`,
        ],
        last: 'r0',
      };
    },
    line: 'Scored, and explained.',
  },
];

async function renderScene(i, sc) {
  const out = path.join(WORK, `s${i}.mp4`);
  const d = drift(SHOTS[i], sc.dir);
  const { chain, last } = sc.layers(d);
  const graph = [`[0:v]${d.vf}[base]`, ...chain, `[${last}]${caption(sc.line)}[v]`].join(';');
  const args = ['-y', '-v', 'error',
    '-loop', '1', '-framerate', String(FPS), '-t', String(SHOTS[i]), '-i', path.join(WORK, sc.img)];
  for (const p of sc.inputs) args.push('-loop', '1', '-framerate', String(FPS), '-t', String(SHOTS[i]), '-i', p);
  args.push('-filter_complex', graph, '-map', '[v]', '-t', String(SHOTS[i]), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', out);
  await run(FFMPEG, args, { maxBuffer: 1 << 27 });
  return out;
}

async function renderEnd() {
  const d = SHOTS[3];
  const out = path.join(WORK, 's3.mp4');
  await run(FFMPEG, ['-y', '-v', 'error',
    '-f', 'lavfi', '-i', `color=c=0x05060c:s=${W}x${H}:r=${FPS}:d=${d}`,
    '-loop', '1', '-framerate', String(FPS), '-t', String(d), '-i', LOGO,
    '-filter_complex',
    `[1:v]scale=760:-1,fade=t=in:st=0.08:d=0.45:alpha=1[lg];`
    + `[0:v][lg]overlay=x='(W-w)/2':y='840-14*${ramp(0.08, 0.9)}'[a];`
    + `[a]drawtext=fontfile=${BOLD}:text='jobup.dev':x=(w-text_w)/2:y=1120:fontsize=64:`
    + `fontcolor=0xff5fa2:expansion=none:alpha='${ramp(0.5, 0.45)}',`
    + `drawtext=fontfile=${REG}:text='Your site. Your agents. Your matches.':`
    + `x=(w-text_w)/2:y=1230:fontsize=40:fontcolor=0x9aa3c4:expansion=none:alpha='${ramp(0.8, 0.45)}'[v]`,
    '-map', '[v]', '-t', String(d), '-r', String(FPS), '-c:v', 'libx264',
    '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', out], { maxBuffer: 1 << 27 });
  return out;
}

(async () => {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Crop each capture to 1080x1920 below the status bar, above the Safari bar.
  process.stdout.write('  preparing shots ... ');
  for (const n of ['2830', '2831', '2832', '2833']) {
    const src = path.join(SRC, `IMG_${n}.PNG`);
    if (!fs.existsSync(src)) throw new Error(`missing ${src}`);
    await run(FFMPEG, ['-y', '-v', 'error', '-i', src,
      '-vf', `scale=${W}:-1,crop=${W}:${H}:0:100`, path.join(WORK, `${n}.png`)],
      { maxBuffer: 1 << 27 });
  }
  console.log('ok');

  const parts = [];
  for (let i = 0; i < SCENES.length; i++) {
    process.stdout.write(`  scene ${i + 1}/4 (${SHOTS[i]}s) ... `);
    parts.push(await renderScene(i, SCENES[i]));
    console.log('ok');
  }
  process.stdout.write('  scene 4/4 (end card) ... ');
  parts.push(await renderEnd());
  console.log('ok');

  const list = path.join(WORK, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  const silent = path.join(WORK, 'silent.mp4');
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-c', 'copy', silent], { maxBuffer: 1 << 27 });

  const music = path.join(WORK, 'score.wav');
  fs.writeFileSync(music, score(DUR));

  process.stdout.write('  mixing ... ');
  const ai = [], af = [];
  VO.forEach((v, i) => {
    ai.push('-i', path.join('/tmp/jobupimg', v.file));
    af.push(`[${i + 1}:a]adelay=${Math.round(v.at * 1000)}|${Math.round(v.at * 1000)},volume=1.9[q${i}]`);
  });
  af.push(`${VO.map((_, i) => `[q${i}]`).join('')}amix=inputs=${VO.length}:duration=longest:dropout_transition=0[voice]`);
  af.push(`[${VO.length + 1}:a]volume=0.17,afade=t=out:st=${DUR - 1.3}:d=1.3[bed]`);
  // amix's `normalize` is missing from builds reporting the same version, so
  // levels are set explicitly rather than relying on it.
  af.push(`[voice][bed]amix=inputs=2:duration=first:dropout_transition=0,`
    + `loudnorm=I=-14:TP=-1.2:LRA=11,atrim=0:${DUR},asetpts=N/SR/TB[a]`);

  const out = path.join(OUT_DIR, `jobup-shots-15s-${Date.now()}.mp4`);
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
