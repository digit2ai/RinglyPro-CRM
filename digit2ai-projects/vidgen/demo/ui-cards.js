'use strict';
/**
 * The four product beats, as animated JobUp-branded cards.
 *
 * They used to be one static placeholder held for 17.5s, which read as a
 * frozen video. These move: rows slide in, a score counts, a bar fills.
 * Every string is real product copy from verticals/jobup/public/index.html —
 * no invented employers, no invented numbers.
 *
 * Still a mockup, not a capture. Real screen recordings of the live dashboard
 * would beat these and cost nothing; drop them in and delete this file.
 */
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');

const W = 1080, H = 1920;
const BG = '#0a0a0e', INK = '#f5f5f7', MUT = '#a6a9b4';
const BLUE = '#4263eb', PINK = '#e64980', ORANGE = '#ff922b', GOOD = '#3ad07f';

function esc(t) { return String(t).replace(/[':\\%]/g, ''); }

/** drawtext that fades in and slides up a little, starting at `at`. */
function line(font, text, { size, color, y, at = 0, x = null, bold = false }) {
  const a = at.toFixed(2);
  const slide = `${y}+28*max(0\\,1-(t-${a})/0.45)`;
  const alpha = `min(1\\,max(0\\,(t-${a})/0.45))`;
  const xx = x === null ? '(w-text_w)/2' : x;
  return `drawtext=fontfile=${font}:text='${esc(text)}':fontcolor=${color}:fontsize=${size}` +
    `:x=${xx}:y=${slide}:alpha='${alpha}'${bold ? ':borderw=0' : ''}`;
}

function box(x, y, w, h, color, at = 0, alpha = 1) {
  const a = at.toFixed(2);
  return `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}@${alpha}:t=fill:enable='gte(t,${a})'`;
}

/**
 * @param kind  which of the four beats
 * @param secs  clip length
 */
async function card(file, kind, secs, font) {
  const f = [];
  // brand mark, always present
  f.push(line(font, 'JobUp', { size: 46, color: INK, y: 150, at: 0 }));
  f.push(line(font, 'jobup.dev', { size: 26, color: MUT, y: 210, at: 0.1 }));

  if (kind === 'hunter') {
    f.push(line(font, 'Opportunity Hunter', { size: 62, color: INK, y: 640, at: 0.15 }));
    f.push(line(font, 'searching eight job platforms', { size: 34, color: MUT, y: 730, at: 0.3 }));
    // three result rows sliding in
    const rows = [['Greenhouse', 0.7], ['Lever', 1.0], ['Ashby', 1.3], ['Workday', 1.6]];
    rows.forEach(([name, at], i) => {
      const y = 880 + i * 130;
      f.push(box(140, y, 800, 96, '#16161d', at));
      f.push(box(140, y, 6, 96, [BLUE, PINK, ORANGE, GOOD][i], at));
      f.push(line(font, name, { size: 38, color: INK, y: y + 28, at, x: 190 }));
      f.push(line(font, 'scanned', { size: 30, color: GOOD, y: y + 32, at: at + 0.25, x: 760 }));
    });
  }

  if (kind === 'presence') {
    f.push(line(font, 'Professional Presence', { size: 58, color: INK, y: 620, at: 0.15 }));
    f.push(line(font, 'your site, built from your resume', { size: 34, color: MUT, y: 710, at: 0.3 }));
    f.push(box(140, 860, 800, 300, '#16161d', 0.6));
    f.push(line(font, 'yourname.jobup.dev', { size: 46, color: INK, y: 900, at: 0.8 }));
    f.push(line(font, 'live in minutes', { size: 30, color: MUT, y: 970, at: 1.0 }));
    // Two columns, two rows — the old y only alternated, so items 0/2 and 1/3
    // were drawn on top of each other.
    ['resume.json', 'JSON-LD', 'agent card', 'MCP endpoint'].forEach((t, i) => {
      f.push(line(font, t, { size: 28, color: [BLUE, PINK, ORANGE, GOOD][i],
        y: 1220 + Math.floor(i / 2) * 58, at: 1.2 + i * 0.18, x: i % 2 === 0 ? 200 : 600 }));
    });
    f.push(line(font, 'so recruiters and their AI can read you', { size: 30, color: MUT, y: 1130, at: 2.0 }));
  }

  if (kind === 'scored') {
    f.push(line(font, 'Ranked. Scored. Explained.', { size: 56, color: INK, y: 620, at: 0.15 }));
    f.push(box(140, 780, 800, 420, '#16161d', 0.5));
    f.push(box(140, 780, 800, 8, BLUE, 0.5));
    // a score that counts up, then holds
    f.push(`drawtext=fontfile=${font}:text='%{eif\\:min(94\\,floor((t-0.8)*130))\\:d}':fontcolor=${GOOD}` +
      `:fontsize=130:x=200:y=850:enable='gte(t,0.8)'`);
    f.push(line(font, 'match', { size: 32, color: MUT, y: 1000, at: 1.3, x: 210 }));
    f.push(line(font, 'why it matches', { size: 30, color: MUT, y: 870, at: 1.6, x: 470 }));
    f.push(line(font, 'your 8 years in operations', { size: 32, color: INK, y: 920, at: 1.8, x: 470 }));
    f.push(line(font, 'the team size you managed', { size: 32, color: INK, y: 972, at: 2.0, x: 470 }));
    f.push(line(font, 'never invented', { size: 30, color: ORANGE, y: 1240, at: 2.4 }));
    f.push(line(font, 'then tailored to that posting', { size: 34, color: INK, y: 1300, at: 2.7 }));
    f.push(`drawbox=x=400:y=1372:w='min(280\\,max(0\\,(t-2.9)*400))':h=12:color=${PINK}@1:t=fill:enable='gte(t,2.9)'`);
  }

  if (kind === 'tailor') {
    f.push(line(font, 'Tailored per posting', { size: 58, color: INK, y: 620, at: 0.15 }));
    f.push(box(140, 780, 800, 340, '#16161d', 0.5));
    ['Summary rewritten', 'Bullets reordered', 'Keywords matched'].forEach((t, i) => {
      const y = 830 + i * 100;
      f.push(line(font, t, { size: 36, color: INK, y, at: 0.7 + i * 0.35, x: 190 }));
      // a bar that fills
      f.push(`drawbox=x=620:y=${y + 14}:w='min(280\\,max(0\\,(t-${(0.9 + i * 0.35).toFixed(2)})*420))'` +
        `:h=14:color=${[BLUE, PINK, ORANGE][i]}@1:t=fill:enable='gte(t,${(0.9 + i * 0.35).toFixed(2)})'`);
    });
    f.push(line(font, 'using only what you already wrote', { size: 32, color: MUT, y: 1190, at: 2.0 }));
  }

  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
    '-i', `color=c=${BG}:s=${W}x${H}:d=${secs}:r=30`,
    '-vf', f.join(','),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', file],
    { maxBuffer: 1 << 26 });
  return file;
}

module.exports = { card };
