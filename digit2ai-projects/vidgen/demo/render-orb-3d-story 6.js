'use strict';
/**
 * "The orb comes out of the post" — 7.5s, 9:16.
 *
 * THE POST NEVER MOVES OR CHANGES SIZE. An earlier cut tilted it with
 * ffmpeg's perspective filter, which defaults to sense=source: the corner
 * points are read as a quadrilateral to lift OUT of the input and stretch to
 * fill the output, so pulling the corners inward ZOOMED INTO the post instead
 * of tilting it away. The background then grew alongside the orb, and two
 * things growing together read as a camera zoom, never as depth.
 *
 * Depth needs something that holds still to be measured against. The post is
 * that fixed window and the orb is the only thing that changes size.
 *
 * OCCLUSION IS THE TRICK, NOT GLOW. Measured off a reference breakout reel:
 * where the subject crosses out of the photo rectangle it is OPAQUE — the
 * reaction counts, the button bar and the poster's name are gone underneath
 * it, not tinted. A translucent pass over the same pixels reads as a lens
 * flare sitting on a screenshot. So the orb carries two copies: its natural
 * soft halo, plus an alpha-boosted core faded in as it approaches, which
 * hard-hides the caption and the top comment rows on its way past them.
 *
 *   0.0-1.0   the post, orb small inside the photo
 *   1.0-4.2   the orb comes forward, breaches the photo's bottom edge at
 *             y=850 and blots out the chrome below it
 *   4.2-4.7   bloom through
 *   4.7-7.5   the mark
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');

const W = 1080, H = 1920, FPS = 30, DUR = 7.5;
const SRC = '/tmp/orbpost';
const OUT_DIR = process.env.OUT_DIR || path.join(os.homedir(), 'Desktop', 'JobUp', 'JobUp-Video');

// y=850 is where POSTFULL's photo ends and the white caption box begins. The
// orb has to be seen crossing it — that boundary IS the window frame.
const EDGE = 850;
const T = { go0: 1.0, go1: 4.2, bloom: 4.35, logo: 4.75 };

const ease = (a, b) => {
  const p = `min(1\\,max(0\\,(t-${a})/${(b - a).toFixed(3)}))`;
  return `(${p}*${p}*(3-2*${p}))`;
};
const seg = (from, to, a, b) => `(${from}+(${to}-${from})*${ease(a, b)})`;

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `jobup-orb-3d-${Date.now()}.mp4`);

  const E = ease(T.go0, T.go1);
  // Starts small and well inside the photo; ends wider than the frame with
  // its centre below EDGE, so it has visibly come out through the opening.
  const orbW = seg(210, 3500, T.go0, T.go1 + 0.15);
  const orbY = seg(400, 1010, T.go0, T.go1 + 0.15);
  const spillW = seg(520, 4100, T.go0, T.go1 + 0.15);
  const vis = `lte(t,${(T.bloom + 0.25).toFixed(2)})`;

  const f = [
    // ---- the post, held perfectly still
    //
    // Nothing here touches the post's GEOMETRY. The depth comes from the two
    // things a real lens does when something comes at it: the background
    // falls out of focus and it loses the exposure fight. Both are free — the
    // palm trees and the caption stay exactly where and how big they were.
    //
    // The defocus is a blurred copy faded over the sharp one, because gblur's
    // sigma is not per-frame animatable; crossfading two fixed renders is.
    // eq needs eval=frame or its expressions are computed once at t=0, where
    // the ramp is still zero and nothing ever darkens.
    `[0:v]format=rgba,split=2[p1][p2]`,
    `[p1]eq=brightness='-0.50*${E}':saturation='1-0.42*${E}':eval=frame[psharp]`,
    `[p2]gblur=sigma=24:steps=2,`
      + `eq=brightness='-0.50*${E}':saturation='1-0.42*${E}':eval=frame,`
      + `fade=t=in:st=${T.go0 + 0.3}:d=2.4:alpha=1[pblur]`,
    `[psharp][pblur]overlay=0:0[post]`,
    `color=c=0x05070c:s=${W}x${H}:r=${FPS}:d=${DUR}[room]`,
    `[room][post]overlay=0:0:enable='${vis}'[a1]`,

    // ---- the halo, which spills across the frame edge and sells the light
    `[1:v]format=rgba,scale=w='${spillW}':h=-1:eval=frame,colorchannelmixer=aa=0.42[spill]`,
    `[a1][spill]overlay=x='(W-w)/2':y='(${orbY})-h/2':enable='${vis}'[a2]`,

    // ---- the orb, soft pass
    `[2:v]format=rgba,scale=w='${orbW}':h=-1:eval=frame,`
      + `eq=brightness='0.05*${E}':saturation='1+0.30*${E}':eval=frame[orbsoft]`,
    `[a2][orbsoft]overlay=x='(W-w)/2':y='(${orbY})-h/2':enable='${vis}'[a3]`,

    // ---- the orb, OPAQUE pass: this is what makes it an object rather than
    // a glow. The source orb's alpha peaks at 0.78 and the part that ends up
    // over the comments sits near 0.15, so no multiplier makes it occlude
    // without also flattening the halo. orb-core.png is the same art with its
    // alpha remapped (a<=0.18 -> 0, a>=0.35 -> 1) so the sphere is solid while
    // the magenta glow beyond it stays translucent and still reads as light. It fades in as the orb nears the photo's edge,
    // so the occlusion arrives exactly when it starts covering the comments.
    `[3:v]format=rgba,scale=w='${orbW}':h=-1:eval=frame,`
      + `eq=brightness='0.05*${E}':saturation='1+0.30*${E}':eval=frame,`
      + `fade=t=in:st=${T.go0 + 0.5}:d=1.5:alpha=1[orbhard]`,
    `[a3][orbhard]overlay=x='(W-w)/2':y='(${orbY})-h/2':enable='${vis}'[a4]`,

    // ---- bloom through
    `color=c=white:s=${W}x${H}:r=${FPS}:d=${DUR},format=rgba,`
      + `fade=t=in:st=${T.bloom - 0.18}:d=0.18:alpha=1,`
      + `fade=t=out:st=${T.bloom + 0.05}:d=0.30:alpha=1[flash]`,
    `[a4][flash]overlay=0:0:enable='between(t,${T.bloom - 0.18},${T.bloom + 0.4})'[a5]`,

    // ---- the mark, with the orb's light still behind it
    `[4:v]format=rgba,scale=1500:-1,colorchannelmixer=aa=0.30,`
      + `fade=t=in:st=${T.logo - 0.1}:d=0.6:alpha=1[glow]`,
    `[a5][glow]overlay=x='(W-w)/2':y='(H-h)/2':enable='gte(t,${T.logo - 0.1})'[a6]`,
    `[5:v]format=rgba,scale=700:-1,fade=t=in:st=${T.logo}:d=0.5:alpha=1[lg]`,
    `[a6][lg]overlay=x='(W-w)/2':y='${seg(985, 940, T.logo, T.logo + 1.2)}':`
      + `enable='gte(t,${T.logo})'[v]`,
  ];

  const img = (p) => ['-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', p];
  const ORB = path.join(SRC, 'orb-cut.png');
  const CORE = path.join(SRC, 'orb-core.png');
  if (!fs.existsSync(CORE)) throw new Error(`missing ${CORE} — build it with the geq alpha remap`);
  const args = ['-y', '-v', 'error',
    ...img(path.join(SRC, 'POSTFULL.png')),
    ...img(ORB), ...img(ORB), ...img(CORE), ...img(ORB),
    ...img(path.join(__dirname, 'jobup-logo.png')),
    '-filter_complex', f.join(';'), '-map', '[v]',
    '-r', String(FPS), '-t', String(DUR),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', out];

  process.stdout.write('  compositing ... ');
  await run(FFMPEG, args, { maxBuffer: 1 << 27 });
  console.log('ok');
  console.log(`\n${out}`);
  console.log(`  ${W}x${H} · ${DUR}s · ${FPS}fps · orb crosses the photo edge at y=${EDGE}`);
})().catch((e) => {
  console.error('FAILED:', String(e.stderr || e.message).split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 600));
  process.exit(1);
});
