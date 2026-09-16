'use strict';

/**
 * SpeakUp icons — ONE SOURCE, REGENERATED, NEVER HAND-EDITED PER SIZE.
 *
 *   node verticals/speakup/scripts/make-icons.js          write the SVGs and PNGs
 *   node verticals/speakup/scripts/make-icons.js --check   fail if anything is out of date
 *
 * THE MARK: an S drawn as one continuous stroke, knocked out of a solid clay tile, with two
 * short rays coming off the open end. The S is the product; the rays are the only thing that
 * says SPEECH rather than monogram. It replaced a purple microphone on a near-black plate,
 * which was wrong twice over — the palette went with the old theme, and a microphone
 * describes half an app whose other half is a build pipeline.
 *
 * Decisions that are load-bearing, not taste:
 *  - FULL-BLEED SQUARE, no rounded corners in the source. iOS rounds apple-touch-icon
 *    itself and a pre-rounded source gets double-rounded.
 *  - EVERYTHING INSIDE THE CENTRAL 80%, so the same file works as a `maskable` icon.
 *    Android crops to a circle inscribed in that box; the rays sat outside it at first
 *    and would have been shaved off.
 *  - NO GRADIENT, NO OPACITY. A faded stroke is the first thing to disappear at 32px —
 *    two of the four candidates died exactly there.
 *  - The curve is COMPUTED from two circles, not a hand-written bézier. The hand-written
 *    one collapsed into a lumpy ring, which is only visible if you actually look at it.
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public');
const CLAY = '#d97757', PAPER = '#faf9f5';
const S = 512, CX = 256, R = 78, W = 52, RAY = 32;
const SAFE = [S * 0.1, S * 0.9]; // the maskable safe box

const rad = (d) => (d * Math.PI) / 180;
function arc(cx, cy, r, from, to, n = 56) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    pts.push([cx + r * Math.cos(rad(t)), cy + r * Math.sin(rad(t))]);
  }
  return pts;
}
const d = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

// The two rays. Kept inside the safe box on purpose — see the note above.
const RAYS = [[376, 130, 408, 102], [406, 182, 440, 172]];

function mark(stroke) {
  return `<path d="${d(arc(CX, 256 - R, R, -60, -270))}" fill="none" stroke="${stroke}" stroke-width="${W}" stroke-linecap="round"/>` +
    `<path d="${d(arc(CX, 256 + R, R, -90, 150))}" fill="none" stroke="${stroke}" stroke-width="${W}" stroke-linecap="round"/>` +
    RAYS.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${RAY}" stroke-linecap="round"/>`).join('');
}

// Full bleed: the app icon. Rounded: the browser tab, where there is no OS mask.
const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <rect width="${S}" height="${S}" fill="${CLAY}"/>
  ${mark(PAPER)}
</svg>
`;
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <rect width="${S}" height="${S}" rx="108" fill="${CLAY}"/>
  ${mark(PAPER)}
</svg>
`;

const PNGS = [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['favicon-32.png', 32]];

function safeZoneViolations() {
  const bad = [];
  const half = W / 2;
  for (const [x1, y1, x2, y2] of RAYS) {
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      if (x - RAY / 2 < SAFE[0] || x + RAY / 2 > SAFE[1] || y - RAY / 2 < SAFE[0] || y + RAY / 2 > SAFE[1]) bad.push(`ray point ${x},${y}`);
    }
  }
  for (const [cy, from, to] of [[256 - R, -60, -270], [256 + R, -90, 150]]) {
    for (const [x, y] of arc(CX, cy, R, from, to, 24)) {
      if (x - half < SAFE[0] || x + half > SAFE[1] || y - half < SAFE[0] || y + half > SAFE[1]) { bad.push(`stroke at ${x.toFixed(0)},${y.toFixed(0)}`); break; }
    }
  }
  return bad;
}

async function main() {
  const check = process.argv.includes('--check');
  const bad = safeZoneViolations();
  if (bad.length) { console.error('The mark leaves the maskable safe box: ' + bad.join(', ')); process.exit(1); }

  const files = [['icon-master.svg', masterSvg], ['favicon.svg', faviconSvg]];
  let stale = [];
  for (const [name, body] of files) {
    const p = path.join(OUT, name);
    const now = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (now !== body) { stale.push(name); if (!check) fs.writeFileSync(p, body); }
  }

  let sharp = null;
  try { sharp = require('sharp'); } catch (e) {
    console.log('SKIPPED the PNGs: sharp is not installed. The SVGs are written; re-run where sharp is available.');
    console.log(stale.length ? ('svg updated: ' + stale.join(', ')) : 'svg already current');
    return;
  }
  for (const [name, size] of PNGS) {
    const p = path.join(OUT, name);
    const buf = await sharp(Buffer.from(masterSvg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
    const now = fs.existsSync(p) ? fs.readFileSync(p) : null;
    if (!now || !now.equals(buf)) { stale.push(name); if (!check) fs.writeFileSync(p, buf); }
  }
  if (check && stale.length) { console.error('Out of date, re-run without --check: ' + stale.join(', ')); process.exit(1); }
  console.log(stale.length ? ('wrote: ' + stale.join(', ')) : 'everything already current');
}

main().catch(e => { console.error(e.message); process.exit(1); });
