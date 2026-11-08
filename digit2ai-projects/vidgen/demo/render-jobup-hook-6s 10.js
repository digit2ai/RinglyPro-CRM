'use strict';
/**
 * JobUp — 5.9s hook loop, flat 2D vector, one continuous take.
 *
 * NO VIDEO MODEL TOUCHES THIS. Gen-4 Turbo softens edges and warps shapes on
 * movement, which is exactly wrong for flat vector: the whole look depends on
 * hard edges and solid fills holding still. The plate is generated once as a
 * still, and every movement is a composited transform — deterministic, frame
 * exact, re-renderable at any aspect ratio for $0.
 *
 *   0.0-1.2  empty desk, resume on screen
 *   1.2-2.6  resume lifts, splits into three cards
 *   2.6-4.0  cards fly out left, right, up, and exit
 *   4.0-5.2  cards return with listings, stack onto the screen
 *   5.2-5.9  logo and URL resolve centre
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');

const FPS = 30, DUR = 5.9;
const HOOK = '/tmp/hook';
const OUT_DIR = process.env.OUT_DIR || path.join(os.homedir(), 'Desktop', 'JobUp', 'JobUp-Video');

/**
 * THE VERTICAL CUT IS REBUILT, NOT CROPPED. The composition is symmetrical and
 * the symmetry IS the design — cropping 16:9 to 9:16 throws away both sides of
 * it. So each aspect gets its own plate, its own measured screen rect, and its
 * own flight paths: sideways exits read as "out" in a wide frame, vertical
 * exits read as "out" in a tall one.
 */
const VARIANTS = {
  wide: {
    name: '16x9', W: 1920, H: 1080, plate: 'plate.png',
    screen: { x: 768, y: 468, w: 242, h: 167 },   // measured
    card: 190, liftY: 250, capY: 880, logoW: 980, logoY: [500, 455],
    lanes: [
      { spread: -330, exit: { x: -230 } },
      { spread: 0, exit: { y: -230 } },
      { spread: 330, exit: { x: 1960 } },
    ],
  },
  tall: {
    name: '9x16', W: 1080, H: 1920, plate: 'plate-v.png',
    screen: { x: 453, y: 1017, w: 201, h: 150 },  // measured
    card: 170, liftY: 700, capY: 1520, logoW: 760, logoY: [1230, 1180],
    // Spec: agents fly up and down, not left and right.
    lanes: [
      { spread: -210, exit: { y: -210 } },
      { spread: 0, exit: { y: 2100 } },
      { spread: 210, exit: { y: -210 } },
    ],
  },
};

const VARIANT = VARIANTS[process.argv[2] === 'tall' ? 'tall' : 'wide'];
const { W, H } = VARIANT;
const SCREEN = VARIANT.screen;
const CX = SCREEN.x + SCREEN.w / 2;
const CARD = VARIANT.card;
const LIFT_Y = VARIANT.liftY;

/** Eased 0..1 over [a,b] — smoothstep, so nothing starts or stops abruptly. */
const e = (a, b) => {
  const p = `min(1\\,max(0\\,(t-${a})/${(b - a).toFixed(3)}))`;
  return `(${p}*${p}*(3-2*${p}))`;
};
const lerp = (from, to, a, b) => `(${from}+(${to}-${from})*${e(a, b)})`;

const FONT = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
  .find((f) => { try { return fs.existsSync(f); } catch (_) { return false; } });

// Captions carry the message: most social playback is muted.
const CAPTIONS = [
  { at: 0.6, until: 2.8, text: 'Your resume goes in.' },
  { at: 2.8, until: 4.6, text: 'Three AI agents go out.' },
  { at: 4.6, until: 5.4, text: 'The matches come back.' },
  { at: 5.4, until: DUR, text: 'jobup.dev' },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `jobup-hook-6s-${VARIANT.name}-${Date.now()}.mp4`);

  const inputs = [
    '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', path.join(HOOK, VARIANT.plate),
    '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', path.join(HOOK, VARIANT.name === '9x16' ? 'doc-v.png' : 'doc.png'),
    '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', path.join(HOOK, `agent-${CARD}.png`),
    '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', path.join(HOOK, 'job.png'),
    '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', path.join(__dirname, 'jobup-logo.png'),
    '-f', 'lavfi', '-t', String(DUR), '-i', `color=c=0x0F1A2B@0.86:s=${W}x${H}:r=${FPS}`,
  ];

  const f = [];
  // Three agent cards, and three job cards, from the same two source images.
  f.push('[2:v]format=rgba,fade=t=in:st=1.62:d=0.30:alpha=1[ag]');
  // A filter output is consumed ONCE. Each card appears in three phases (fan,
  // fly out, return), so it needs three copies — nine in total.
  f.push('[ag]split=9[a1][a2][a3][a4][a5][a6][a7][a8][a9]');
  f.push('[3:v]format=rgba,fade=t=in:st=4.62:d=0.22:alpha=1[jb]');
  f.push('[jb]split=3[j1][j2][j3]');
  // The document lifts, then hands over to the cards.
  f.push('[1:v]format=rgba,fade=t=out:st=1.62:d=0.28:alpha=1[docf]');

  let v = '[0:v]format=rgba';
  // The screen goes dark the moment the resume leaves it.
  v += `,drawbox=x=${SCREEN.x}:y=${SCREEN.y}:w=${SCREEN.w}:h=${SCREEN.h}`
    + `:color=0x16233a@1:t=fill:enable='gte(t,1.45)'`;
  f.push(`${v}[bg]`);

  const ov = [];
  let cur = 'bg';
  const add = (src, x, y, enable) => {
    const tag = `s${ov.length}`;
    ov.push(`[${cur}][${src}]overlay=x='${x}':y='${y}':enable='${enable}'[${tag}]`);
    cur = tag;
  };

  // 1.2-1.7 the resume lifts off the screen
  add('docf', SCREEN.x, lerp(SCREEN.y, LIFT_Y, 1.2, 1.7), 'between(t,1.2,1.9)');

  // The three cards: fan apart, fly out, come back.
  const HOME = CX - CARD / 2;
  VARIANT.lanes.forEach((L, i) => {
    const src = (phase) => `a${i * 3 + phase}`;   // 1..9, one per lane-phase
    const fanX = lerp(HOME, HOME + L.spread, 2.0, 2.55);
    const fanY = lerp(LIFT_Y, LIFT_Y - 30, 2.0, 2.55);
    add(src(1), fanX, fanY, 'between(t,1.6,2.6)');

    const outX = L.exit.x === undefined ? `${HOME + L.spread}` : lerp(HOME + L.spread, L.exit.x, 2.6, 3.5);
    const outY = L.exit.y === undefined ? `${LIFT_Y - 30}` : lerp(LIFT_Y - 30, L.exit.y, 2.6, 3.5);
    add(src(2), outX, outY, 'between(t,2.6,3.55)');

    // Back from the same direction, converging on the screen.
    const backX = L.exit.x === undefined ? lerp(HOME + L.spread, HOME, 4.0, 4.65) : lerp(L.exit.x, HOME, 4.0, 4.65);
    const backY = L.exit.y === undefined ? lerp(LIFT_Y - 30, SCREEN.y - 40, 4.0, 4.65) : lerp(L.exit.y, SCREEN.y - 40, 4.0, 4.65);
    add(src(3), backX, backY, 'between(t,4.0,4.7)');
  });

  // 4.7-5.2 the listings stack onto the screen
  const jobH = 40, gap = Math.max(6, Math.floor((SCREEN.h - 3 * jobH) / 4));
  [0, 1, 2].forEach((i) => {
    const y = SCREEN.y + gap + i * (jobH + gap);
    const x = SCREEN.x + Math.max(6, Math.floor((SCREEN.w - 210) / 2));
    add(`j${i + 1}`, x, lerp(y - 70, y, 4.62 + i * 0.1, 5.02 + i * 0.1),
      `between(t,${(4.62 + i * 0.1).toFixed(2)},${DUR})`);
  });

  // 5.2-5.9 the logo resolves centre — the three agents converging into one mark
  // The resolve only reads if the scene gets out of its way, so the plate is
  // dimmed under the mark rather than the logo competing with the furniture.
  f.push(`[5:v]format=rgba,fade=t=in:st=5.15:d=0.28:alpha=1[scrim]`);
  add('scrim', '0', '0', 'gte(t,5.15)');
  f.push(`[4:v]format=rgba,scale=${VARIANT.logoW}:-1,fade=t=in:st=5.22:d=0.26:alpha=1[lg]`);
  add('lg', '(W-w)/2', `${lerp(VARIANT.logoY[0], VARIANT.logoY[1], 5.22, 5.7)}`, `gte(t,5.22)`);

  f.push(...ov);

  // Captions: hard cut in, no fade, no outline, lower third.
  let capChain = `[${cur}]`;
  const caps = CAPTIONS.map((c) =>
    `drawtext=fontfile=${FONT}:text='${c.text.replace(/'/g, '')}':fontcolor=white:fontsize=64`
    + `:x=(w-text_w)/2:y=${VARIANT.capY}:enable='between(t,${c.at},${c.until})'`).join(',');
  f.push(`${capChain}${caps},format=yuv420p[v]`);

  const args = ['-y', '-v', 'error', ...inputs,
    '-filter_complex', f.join(';'), '-map', '[v]',
    '-r', String(FPS), '-t', String(DUR),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', out];

  process.stdout.write('  compositing ... ');
  await run(FFMPEG, args, { maxBuffer: 1 << 27 });
  console.log('ok');
  console.log(`\n${out}`);
  console.log(`  ${VARIANT.name} ${W}x${H} · ${DUR}s · ${FPS}fps · no model in the motion path`);
})().catch((e2) => {
  console.error('FAILED:', String(e2.stderr || e2.message).split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 600));
  process.exit(1);
});
