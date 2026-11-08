'use strict';
/**
 * The orb travels the post — 7s, 9:16.
 *
 * The post is REBUILT to fill 1080x1920 rather than floated on a canvas: photo,
 * caption, then a comment thread that fills the remaining height. Stretching
 * the white box to fit would have looked like a stretched screenshot; filling
 * it with a real thread is what an actual post looks like at this aspect.
 *
 *   0.0-0.6  hold, the orb sits small in the photo
 *   0.6-3.3  it descends the full frame, growing as it comes forward
 *   3.3-3.7  it settles at the bottom of the thread
 *   3.7-5.8  it rises back to the top, shrinking away again
 *   5.8-7.0  the mark resolves with it
 *
 * The orb is keyed by luminance, not cut out: it is a glow on dark, so its own
 * brightness is the matte. A dimmer copy travels with it as spill, so it lights
 * what it passes instead of sitting on top like a sticker.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');

const W = 1080, H = 1920, FPS = 30, DUR = 7.0;
const SRC = '/tmp/orbpost';
const OUT_DIR = process.env.OUT_DIR || path.join(os.homedir(), 'Desktop', 'JobUp', 'JobUp-Video');

const X = W / 2;
const TOP_Y = 330, BOT_Y = 1780;
const S_TOP = 250, S_BOT = 560, S_BACK = 300;
const DOWN0 = 0.6, DOWN1 = 3.3, UP0 = 3.7, UP1 = 5.8;

const ease = (a, b) => {
  const p = `min(1\\,max(0\\,(t-${a})/${(b - a).toFixed(3)}))`;
  return `(${p}*${p}*(3-2*${p}))`;
};
const seg = (from, to, a, b) => `(${from}+(${to}-${from})*${ease(a, b)})`;
/** down then back up, as one continuous expression */
const path2 = (top, bot, back) =>
  `if(lt(t,${UP0}), ${seg(top, bot, DOWN0, DOWN1)}, ${seg(bot, back, UP0, UP1)})`;

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `jobup-orb-post-travel-${Date.now()}.mp4`);

  const orbY = path2(TOP_Y, BOT_Y, TOP_Y);
  const orbW = path2(S_TOP, S_BOT, S_BACK);
  const spillW = path2(S_TOP * 2.3, S_BOT * 1.9, S_BACK * 2.3);

  const f = [
    `[0:v]format=rgba[post]`,
    // spill first, so the orb core sits on top of its own light
    `[1:v]format=rgba,scale=w='${spillW}':h=-1:eval=frame,colorchannelmixer=aa=0.30[spill]`,
    `[post][spill]overlay=x='${X}-w/2':y='(${orbY})-h/2'[s1]`,
    `[2:v]format=rgba,scale=w='${orbW}':h=-1:eval=frame[orb]`,
    `[s1][orb]overlay=x='${X}-w/2':y='(${orbY})-h/2'[s2]`,
    // the mark lands at the top, where the orb returns to
    `[3:v]format=rgba,scale=520:-1,fade=t=in:st=5.75:d=0.45:alpha=1[lg]`,
    `[s2][lg]overlay=x='(W-w)/2':y='${seg(640, 610, 5.75, 6.6)}':enable='gte(t,5.75)'[v]`,
  ];

  const args = ['-y', '-v', 'error',
    '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', path.join(SRC, 'POSTFULL.png'),
    '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', path.join(SRC, 'orb-cut.png'),
    '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', path.join(SRC, 'orb-cut.png'),
    '-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', path.join(__dirname, 'jobup-logo.png'),
    '-filter_complex', f.join(';'), '-map', '[v]',
    '-r', String(FPS), '-t', String(DUR),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', out];

  process.stdout.write('  compositing ... ');
  await run(FFMPEG, args, { maxBuffer: 1 << 27 });
  console.log('ok');
  console.log(`\n${out}`);
  console.log(`  ${W}x${H} · ${DUR}s · ${FPS}fps · post fills the frame`);
})().catch((e) => {
  console.error('FAILED:', String(e.stderr || e.message).split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 500));
  process.exit(1);
});
