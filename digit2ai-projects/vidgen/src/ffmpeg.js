'use strict';

/**
 * Where the ffmpeg / ffprobe binaries come from.
 *
 * Captions are burned with the `subtitles=` filter, which needs libass, and
 * the demo's placeholder cards need `drawtext`, which needs libfreetype.
 * A stock Homebrew ffmpeg is built with neither, so both filters fail at
 * graph-init time on a machine where every other stage works. ffmpeg-static
 * ships a self-contained binary built --enable-libass --enable-libfreetype,
 * so the pipeline renders identically on any box without asking anyone to
 * rebuild ffmpeg first.
 *
 * ffmpeg-static carries no ffprobe. Probing a container needs no external
 * library, so the system ffprobe is used unless overridden — and
 * ffprobe-static is picked up automatically if it is ever installed.
 *
 * FFMPEG_PATH / FFPROBE_PATH override both, for a box with a known-good
 * build of its own.
 */

function staticFfmpeg() {
  try {
    const p = require('ffmpeg-static');
    return typeof p === 'string' && p ? p : null;
  } catch (_) {
    return null;
  }
}

function staticFfprobe() {
  try {
    const p = require('ffprobe-static');
    const bin = typeof p === 'string' ? p : p && p.path;
    return bin || null;
  } catch (_) {
    return null;
  }
}

const FFMPEG = process.env.FFMPEG_PATH || staticFfmpeg() || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || staticFfprobe() || 'ffprobe';

module.exports = { FFMPEG, FFPROBE };
