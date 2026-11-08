'use strict';
/**
 * Builds the OrbUp ad's drawn assets. Every one is a still; the MOTION is
 * added at composite time by ffmpeg (rotate for the rings, an orbiting
 * overlay expression for the chips), which is why a 14.5s animated centrepiece
 * costs nothing to render and nothing to re-render after a copy change.
 *
 * Chrome draws the vector art rather than sips: sips ignores `fill` on a
 * <tspan> and its feDropShadow support is unreliable, and both fail SILENTLY.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = '/tmp/orbup';
const FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';

/** Renders an SVG string to a transparent PNG. */
async function svg(name, size, body) {
  const f = path.join(OUT, `${name}.svg`);
  fs.writeFileSync(f, `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`);
  await run(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--default-background-color=00000000`, `--window-size=${size},${size}`,
    `--screenshot=${path.join(OUT, name + '.png')}`, `file://${f}`], { maxBuffer: 1 << 26 });
  return path.join(OUT, `${name}.png`);
}

/**
 * A tag of text, drawn on an OPAQUE base.
 *
 * It would be tidier as transparent art, but drawbox does not write the alpha
 * channel over a fully transparent frame — it composites against nothing and
 * the result stays invisible, with no error. That bug already cost a listing
 * card in this project once. The background these sit on is dark, so an
 * opaque plate reads correctly anyway.
 */
async function chip(name, text, w = 680, h = 104) {
  const out = path.join(OUT, `${name}.png`);
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
    '-i', `color=c=0x141a2b:s=${w}x${h}:d=1`,
    '-vf', `drawbox=x=0:y=0:w=7:h=${h}:color=0x9b6bff:t=fill,`
      + `drawbox=x=0:y=0:w=${w}:h=${h}:color=0x3a3f5c:t=2,`
      + `drawtext=fontfile=${FONT}:text='${text}':x=34:y=(h-text_h)/2-3:`
      + `fontsize=41:fontcolor=0xf2f4ff:expansion=none`,
    '-frames:v', '1', out], { maxBuffer: 1 << 26 });
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // The sphere: the logo's orb, redrawn big enough to fill a phone.
  await svg('orb', 1400, `
    <defs>
      <radialGradient id="g" cx="42%" cy="36%" r="70%">
        <stop offset="0%"  stop-color="#eafcff"/>
        <stop offset="16%" stop-color="#57e0ff"/>
        <stop offset="42%" stop-color="#3b6bff"/>
        <stop offset="68%" stop-color="#a935e8"/>
        <stop offset="100%" stop-color="#ff2d78"/>
      </radialGradient>
      <radialGradient id="halo" cx="50%" cy="50%" r="50%">
        <stop offset="55%" stop-color="#7a3cff" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#7a3cff" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="spec" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="700" cy="700" r="690" fill="url(#halo)"/>
    <circle cx="700" cy="700" r="420" fill="url(#g)"/>
    <ellipse cx="600" cy="560" rx="150" ry="96" fill="url(#spec)"/>`);

  // Two orbit rings. They are SEPARATE files so they can turn at different
  // speeds and in opposite directions — one ring rotating alone reads as a
  // spinning image, two reads as a system.
  const ring = (rx, ry, tilt, dash, col, wdt) => `
    <ellipse cx="700" cy="700" rx="${rx}" ry="${ry}" fill="none"
      stroke="${col}" stroke-width="${wdt}" stroke-dasharray="${dash}"
      transform="rotate(${tilt} 700 700)"/>`;
  await svg('ring-a', 1400,
    ring(620, 250, -18, '34 26', '#7cc9ff', 7)
    + `<circle cx="1320" cy="700" r="16" fill="#7cc9ff" transform="rotate(-18 700 700)"/>`
    + `<circle cx="80" cy="700" r="11" fill="#ff5fa2" transform="rotate(-18 700 700)"/>`);
  await svg('ring-b', 1400,
    ring(560, 300, 34, '12 30', '#c07bff', 6)
    + `<circle cx="1260" cy="700" r="13" fill="#ffb057" transform="rotate(34 700 700)"/>`);

  // The chips that orbit through the middle shot — what OrbUp actually does.
  await chip('c1', 'Answers on the first ring');
  await chip('c2', 'Books the appointment');
  await chip('c3', 'Takes the message');
  await chip('c4', 'English or Spanish');
  await chip('c5', 'Nights and weekends');

  console.log('  assets:');
  for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).sort()) {
    const { size } = fs.statSync(path.join(OUT, f));
    console.log(`    ${f.padEnd(12)} ${(size / 1024).toFixed(0)} KB`);
  }
})().catch((e) => { console.error('FAILED:', String(e.stderr || e.message).slice(0, 400)); process.exit(1); });

/* ---- appended: the constellation, which is OrbUp's own visual language ---- */
