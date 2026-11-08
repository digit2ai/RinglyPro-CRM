'use strict';
/**
 * The two designed screens in the cartoon ad.
 *
 * THE PERCENTAGES ARE DRAWN, NOT GENERATED. Video models render text as
 * plausible-looking gibberish — asking Runway for "94% MATCH" returns a shape
 * that reads as text and isn't. Anything the viewer must actually READ has to
 * be composited, which is also why the captions and the logo are burned in
 * rather than prompted.
 */
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const fs = require('fs');
const path = require('path');
const { FFMPEG } = require('../src/ffmpeg');

const W = 1080, H = 1920;
const BG = '#0a0a0e';
const INK = '#f5f5f7', MUT = '#9aa3b4';
const BLUE = '#4c6ef5', PINK = '#e64980', ORANGE = '#ff922b', GREEN = '#3ad07f';

function font(bold) {
  const list = bold
    ? ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
    : ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'];
  return list.find((f) => { try { return fs.existsSync(f); } catch (_) { return false; } })
    || '/System/Library/Fonts/Supplemental/Arial.ttf';
}
const esc = (t) => String(t).replace(/[':\\%]/g, '');

/** Three match cards sliding in, each percentage counting up to its number. */
async function matchCards(file, seconds = 8) {
  const F = font(true), Fr = font(false);
  const secs = Math.max(4, seconds) + 0.4;
  const rows = [
    { pct: 72, title: 'Operations Analyst', at: 0.5, colour: BLUE },
    { pct: 86, title: 'Risk & Compliance Lead', at: 1.5, colour: PINK },
    { pct: 94, title: 'Senior Solutions Architect', at: 2.6, colour: GREEN },
  ];
  const f = [];
  f.push(`drawtext=fontfile=${F}:text='AI IS SCANNING':fontcolor=${ORANGE}:fontsize=38`
    + `:x=(w-text_w)/2:y=430:alpha='min(1\\,max(0\\,t/0.4))'`);

  rows.forEach((r, i) => {
    const y = 640 + i * 300;
    const at = r.at.toFixed(2);
    const slide = `${y}+70*max(0\\,1-(t-${at})/0.4)`;
    const alpha = `min(1\\,max(0\\,(t-${at})/0.4))`;
    // the card
    f.push(`drawbox=x=100:y=${y}:w=880:h=220:color=#16161d@0.96:t=fill:enable='gte(t,${at})'`);
    f.push(`drawbox=x=100:y=${y}:w=10:h=220:color=${r.colour}@1:t=fill:enable='gte(t,${at})'`);
    // the number, counting up from 0 over 0.9s
    f.push(`drawtext=fontfile=${F}:text='%{eif\\:min(${r.pct}\\,floor((t-${at})*${Math.round(r.pct / 0.9)}))\\:d}'`
      + `:fontcolor=${r.colour}:fontsize=104:x=170:y=${y + 55}:enable='gte(t,${at})'`);
    // A LITERAL % NEEDS expansion=none. drawtext parses % as the start of a
    // %{...} expansion and errors with "Stray %" otherwise — text=, textfile=
    // and backslash escaping all fail the same way. Only this filter uses it;
    // the counting number above needs expansion ON.
    f.push(`drawtext=fontfile=${F}:expansion=none:text=%:fontcolor=${r.colour}:fontsize=54`
      + `:x=${r.pct >= 100 ? 405 : 300}:y=${y + 68}:alpha='${alpha}'`);
    f.push(`drawtext=fontfile=${Fr}:text='MATCH':fontcolor=${MUT}:fontsize=30`
      + `:x=180:y='${y}+170':alpha='${alpha}'`);
    f.push(`drawtext=fontfile=${F}:text='${esc(r.title)}':fontcolor=${INK}:fontsize=42`
      + `:x=450:y='${slide}+80':alpha='${alpha}'`);
  });

  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
    '-i', `color=c=${BG}:s=${W}x${H}:d=${secs}:r=30`,
    '-vf', f.join(',') + ',format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', file],
    { maxBuffer: 1 << 26 });
  return file;
}

/** The end card: the logo, the promise, the ask. */
async function ctaCard(file, logo, seconds = 4) {
  const F = font(true), Fr = font(false);
  const secs = Math.max(2.5, seconds) + 0.4;
  const f = [];
  // logo scaled up and settling
  f.push(`[1:v]scale=760:-1[lg]`);
  const chain = [
    `[0:v][lg]overlay=(W-w)/2:'520+40*max(0\\,1-t/0.5)':enable='gte(t,0)'[b]`,
    `[b]drawtext=fontfile=${F}:text='LET AI FIND YOUR NEXT JOB':fontcolor=${INK}:fontsize=56`
      + `:x=(w-text_w)/2:y='860+30*max(0\\,1-(t-0.5)/0.45)':alpha='min(1\\,max(0\\,(t-0.5)/0.45))'`,
    `drawbox=x='540-min(260\\,max(0\\,(t-0.9)*520))':y=960:`
      + `w='2*min(260\\,max(0\\,(t-0.9)*520))':h=5:color=${PINK}@0.95:t=fill`,
    `drawtext=fontfile=${Fr}:text='Create your profile free':fontcolor=${MUT}:fontsize=44`
      + `:x=(w-text_w)/2:y=1030:alpha='min(1\\,max(0\\,(t-1.2)/0.5))'`,
    `drawtext=fontfile=${F}:text='jobup.dev':fontcolor=${ORANGE}:fontsize=64`
      + `:x=(w-text_w)/2:y=1140:alpha='min(1\\,max(0\\,(t-1.5)/0.5))',format=yuv420p[v]`,
  ].join(',');

  await run(FFMPEG, ['-y', '-v', 'error',
    '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:d=${secs}:r=30`,
    '-loop', '1', '-i', logo,
    '-filter_complex', `${f.join(';')};${chain}`,
    '-map', '[v]', '-t', String(secs),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', file],
    { maxBuffer: 1 << 26 });
  return file;
}

module.exports = { matchCards, ctaCard };
