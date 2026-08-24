'use strict';

const { spawn } = require('child_process');
const { FFMPEG } = require('./ffmpeg');

/**
 * Character-frame handling.
 *
 * A generated frame arrives as a 1024x1536 PNG (~2.4MB, ~3.2MB once base64'd).
 * Runway renders at 720x1280, so that frame is upscaled input for a downscaled
 * render — the extra pixels are discarded by the video model and the only
 * thing they buy is a request payload big enough to sit at the edge of
 * Runway's data-URI limit. Recompressing to 720x1280 JPEG first drops the
 * payload ~32x (3.2MB -> 0.10MB) for no visible loss in what the model gets.
 *
 * This uses the bundled ffmpeg (see ffmpeg.js) rather than adding an image
 * library: the binary is already a dependency of the render path, and it
 * streams through pipes so nothing touches disk.
 */

const FRAME_WIDTH = 720;
const FRAME_HEIGHT = 1280;

/**
 * PNG/JPEG buffer -> `data:image/jpeg;base64,...`, scaled to the video model's
 * native frame size.
 *
 * @param image   raw image bytes
 * @param opts.width/height  target geometry (defaults to Runway's 720x1280)
 * @param opts.quality  ffmpeg -q:v, 2 (best) .. 31 (worst). 3 is visually
 *                      lossless at this size and still ~70KB.
 */
function toDataUri(image, opts = {}) {
  const width = opts.width || FRAME_WIDTH;
  const height = opts.height || FRAME_HEIGHT;
  const quality = opts.quality || 3;

  return new Promise((resolve, reject) => {
    // COVER vs FIT.
    //
    // A photographic frame should cover and crop: letterboxing hands the video
    // model black bars to animate. A UI SCREENSHOT is the opposite — cropping a
    // 1738x708 banner to 9:16 throws away most of the interface, which is the
    // only reason it is in the ad. `fit` pads onto the brand background instead.
    const geometry = opts.fit
      ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,`
        + `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${opts.pad || '#07080c'}`
      : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;

    const proc = spawn(FFMPEG, [
      '-v', 'error',
      '-i', 'pipe:0',
      '-vf', geometry,
      '-q:v', String(quality),
      '-f', 'mjpeg',
      'pipe:1'
    ]);

    const out = [];
    const err = [];
    proc.stdout.on('data', (c) => out.push(c));
    proc.stderr.on('data', (c) => err.push(c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      const buf = Buffer.concat(out);
      if (code !== 0) {
        return reject(Object.assign(
          new Error(`frame conversion failed: ${Buffer.concat(err).toString().trim().split('\n')[0] || 'exit ' + code}`),
          { code: 'frame_convert_failed' }
        ));
      }
      if (!buf.length) {
        return reject(Object.assign(new Error('frame conversion produced no image'),
          { code: 'frame_convert_failed' }));
      }
      resolve('data:image/jpeg;base64,' + buf.toString('base64'));
    });

    // ffmpeg can exit before the whole PNG is written; that surfaces as the
    // non-zero exit above, not as an unhandled EPIPE.
    proc.stdin.on('error', () => {});
    proc.stdin.end(image);
  });
}

module.exports = { toDataUri, FRAME_WIDTH, FRAME_HEIGHT };
