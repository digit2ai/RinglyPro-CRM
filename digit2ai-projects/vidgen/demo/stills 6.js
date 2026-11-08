'use strict';

/**
 * Turn a still into a moving clip — a slow pan and drift, the Ken Burns move.
 *
 * A screenshot is the most credible footage in a product ad and the least
 * forgiving: crop it and you lose the interface, re-generate it and the text
 * turns to mush. So it is never cropped and never re-rendered by a model. It is
 * fitted whole onto the brand background, then the FRAME moves across it.
 *
 * The motion is a crop window drifting over an oversized canvas — a couple of
 * arithmetic expressions per frame, not a per-pixel filter. (Rendering a
 * gradient per pixel per frame once cost 147s of CPU for one card; that mistake
 * is not worth repeating here.)
 */
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('./../src/ffmpeg');

const W = 1080, H = 1920;

/**
 * @param opts.zoom   how much larger than the frame to render (1.12 = 12% room to move)
 * @param opts.from   'left'|'right'|'up'|'down'|'in' — direction of travel
 * @param opts.bg     pad colour behind the still
 */
async function kenBurns(file, image, seconds, opts = {}) {
  const secs = Math.max(1.5, Number(seconds) || 4) + 0.3;
  const zoom = opts.zoom || 1.12;
  const bg = opts.bg || '#07080c';
  const CW = Math.round(W * zoom / 2) * 2;
  const CH = Math.round(H * zoom / 2) * 2;
  const dx = CW - W;
  const dy = CH - H;
  const d = secs.toFixed(2);

  // A linear drift across whatever slack the oversize gives us.
  const move = {
    left:  { x: `(${dx})*(1-t/${d})`, y: `(${dy})/2` },
    right: { x: `(${dx})*(t/${d})`,   y: `(${dy})/2` },
    up:    { x: `(${dx})/2`, y: `(${dy})*(1-t/${d})` },
    down:  { x: `(${dx})/2`, y: `(${dy})*(t/${d})` },
    in:    { x: `(${dx})/2`, y: `(${dy})/2` },
  }[opts.from || 'down'];

  // THREE TREATMENTS, because a screenshot is not a photograph.
  //
  //   fit   — the whole image on the brand background. Correct for something
  //           already portrait; on a 2038x952 desktop capture it leaves a thin
  //           band a quarter of the frame high, unreadable on a phone.
  //   cover — fills the frame. On a wide capture that magnifies to ~26% of the
  //           width: you see fragments of a sentence, not an interface.
  //   zoom  — the middle ground and the default for wide UI. Scale the image
  //           to `zoom`x the frame WIDTH, pad the leftover height with the
  //           brand colour, then pan across the overflow. Text is legible and
  //           the move reveals the rest of the screen.
  const z = opts.zoomWidth || 1.5;
  const SW = Math.round(W * z / 2) * 2;
  const panX = opts.from === 'left'
    ? `(iw-${W})*(1-t/${secs.toFixed(2)})`
    : opts.from === 'right' ? `(iw-${W})*(t/${secs.toFixed(2)})`
    : `(iw-${W})/2`;

  const geometry = opts.cover
    ? `scale=-2:${CH},crop=${W}:${H}:'(iw-${W})/2':'(ih-${H})/2'`
    : opts.zoom
      ? `scale=${SW}:-2,pad='iw':'max(ih,${H})':0:'(oh-ih)/2':${bg},`
        + `crop=${W}:${H}:'${panX}':'(ih-${H})/2'`
      : `scale=${CW}:${CH}:force_original_aspect_ratio=decrease,`
        + `pad=${CW}:${CH}:(ow-iw)/2:(oh-ih)/2:${bg},`
        + `crop=${W}:${H}:'${move.x}':'${move.y}'`;

  await run(FFMPEG, ['-y', '-v', 'error',
    '-loop', '1', '-framerate', '30', '-i', image, '-t', String(secs),
    '-vf', `${geometry},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', file],
    { maxBuffer: 1 << 26, timeout: 120000 });
  return file;
}

/** Horizontal travel across a covered (over-wide) image. */
function coverX(opts, secs) {
  const d = secs.toFixed(2);
  const span = `(iw-${W})`;
  // A gentle pan across the middle 70%, so it never slams into either edge.
  const from = opts.from === 'right' ? `${span}*0.15 + ${span}*0.7*(t/${d})`
    : opts.from === 'left' ? `${span}*0.85 - ${span}*0.7*(t/${d})`
    : `${span}/2`;
  return from;
}

module.exports = { kenBurns, W, H };
