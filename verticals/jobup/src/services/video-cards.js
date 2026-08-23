'use strict';

// =============================================================
// PRODUCT-BEAT CARDS.
//
// A beat tagged as a product screen is SUPPLIED footage, not generated — the
// pipeline expects a file. The console had no way to hand it one, so a
// product-tour video reached the first product beat and died, having already
// paid for the character sheet.
//
// So: when no recording is supplied, render a branded card from the beat's own
// spoken line. It is a placeholder with a job — dark, on-brand, and MOVING,
// because a static frame held for several seconds reads as a broken video.
//
// A real screen recording of the actual product always beats this. That is
// what `screenRecordings` is for; this is the floor, not the ceiling.
// =============================================================

const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);

const W = 1080, H = 1920;
const FONTS = [
  process.env.JOBUP_VIDEO_FONT,
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
];

function font() {
  const fs = require('fs');
  return FONTS.filter(Boolean).find((f) => { try { return fs.existsSync(f); } catch (_) { return false; } }) || null;
}

const esc = (t) => String(t == null ? '' : t).replace(/[':\\%]/g, '').replace(/\s+/g, ' ').trim();

/** drawtext cannot wrap, so break the line into readable rows first. */
function wrap(text, perLine = 22) {
  const words = esc(text).split(' ').filter(Boolean);
  const rows = [];
  let row = '';
  for (const w of words) {
    if ((row + ' ' + w).trim().length > perLine && row) { rows.push(row.trim()); row = w; }
    else row = (row ? row + ' ' : '') + w;
  }
  if (row.trim()) rows.push(row.trim());
  return rows.slice(0, 5);
}

/**
 * @param file    where to write the mp4
 * @param opts.text   the beat's spoken line — the card's headline
 * @param opts.label  small brand/section word above it
 * @param opts.seconds  clip length (rendered a little longer, then trimmed)
 * @param opts.accent   hex accent colour
 */
async function card(file, opts) {
  const { FFMPEG } = binaries();
  const f = font();
  const seconds = Math.max(2, Number(opts.seconds) || 5) + 0.4;
  const accent = opts.accent || '#8b5cf6';
  const rows = wrap(opts.text || '', 22);

  // geq's time variable is T; drawtext's and drawbox's is lowercase t. Mixing
  // them fails at filter-graph init, not at render.
  const filters = [];
  // A slow drifting glow so the card is never a frozen frame.
  filters.push(
    `geq=` +
    `r='18+34*exp(-pow(hypot(X-540\\,Y-620-40*sin(T/3)) \\,2)/520000)':` +
    `g='18+26*exp(-pow(hypot(X-540\\,Y-620-40*sin(T/3)) \\,2)/520000)':` +
    `b='26+70*exp(-pow(hypot(X-540\\,Y-620-40*sin(T/3)) \\,2)/520000)'`
  );

  if (f) {
    if (opts.label) {
      filters.push(`drawtext=fontfile=${f}:text='${esc(opts.label).toUpperCase()}':fontcolor=${accent}` +
        `:fontsize=34:x=(w-text_w)/2:y=430:alpha='min(1\\,max(0\\,t/0.5))'`);
    }
    // accent rule that draws itself in
    filters.push(`drawbox=x='540-min(150\\,max(0\\,(t-0.35)*300))':y=510:` +
      `w='2*min(150\\,max(0\\,(t-0.35)*300))':h=4:color=${accent}@0.9:t=fill`);

    rows.forEach((r, i) => {
      const at = (0.55 + i * 0.16).toFixed(2);
      filters.push(`drawtext=fontfile=${f}:text='${r}':fontcolor=#f5f5f7:fontsize=74` +
        `:x=(w-text_w)/2:y='${640 + i * 96}+26*max(0\\,1-(t-${at})/0.45)'` +
        `:alpha='min(1\\,max(0\\,(t-${at})/0.45))'`);
    });

    filters.push(`drawtext=fontfile=${f}:text='${esc(opts.footer || '')}':fontcolor=#9aa3b4` +
      `:fontsize=30:x=(w-text_w)/2:y=1360:alpha='min(1\\,max(0\\,(t-1.4)/0.6))'`);
  }

  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
    '-i', `color=c=#07080c:s=${W}x${H}:d=${seconds}:r=30`,
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', file],
    { maxBuffer: 1 << 26 });
  return file;
}

function binaries() {
  let FFMPEG = process.env.FFMPEG_PATH;
  if (!FFMPEG) { try { FFMPEG = require('@ffmpeg-installer/ffmpeg').path; } catch (_) { FFMPEG = 'ffmpeg'; } }
  return { FFMPEG };
}

/** True when a card can actually be produced on this host. */
function available() {
  try {
    const fs = require('fs');
    return fs.existsSync(binaries().FFMPEG) || binaries().FFMPEG === 'ffmpeg';
  } catch (_) { return false; }
}

module.exports = { card, wrap, font, available };
