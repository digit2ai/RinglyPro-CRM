'use strict';

/**
 * SpeakUp icons — ONE SOURCE, REGENERATED, NEVER HAND-EDITED PER SIZE.
 *
 *   node verticals/speakup/scripts/make-icons.js          write the SVGs and PNGs
 *   node verticals/speakup/scripts/make-icons.js --check   fail if anything is out of date
 *
 * THE MARK IS THE COMPANY BRAND: Digit2AI. "D2" in the wordmark's own letterforms, white
 * with the brand cyan on the brand ink, plus the full DIGIT2AI lockup for the header.
 * The full wordmark cannot BE the icon — at 32px it is a grey smear — so the icon is the
 * two characters that identify it. A lone "2" was tried and is ambiguous; the stacked
 * DIGIT/2AI was tried and turns to mush.
 *
 * Decisions that are load-bearing, not taste:
 *  - FULL-BLEED SQUARE, no rounded corners in the source. iOS rounds apple-touch-icon
 *    itself and a pre-rounded source gets double-rounded.
 *  - EVERYTHING INSIDE THE CENTRAL 80%, so the same file works as a `maskable` icon.
 *    Android crops to a circle inscribed in that box; the rays sat outside it at first
 *    and would have been shaved off.
 *  - NO GRADIENT, NO OPACITY. The first thing to disappear when the icon is small.
 *  - The cyan is the ONE fixed colour. The letters follow the theme in the header
 *    (currentColor) so the lockup reads on paper and on the brand ink alike; the 2 does
 *    not, because that cyan is the brand.
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public');
const INK = '#0d1117', WHITE = '#ffffff', CYAN = '#4fc3e3';
// Helvetica/Arial everywhere, Roboto on Android. A wordmark ideally ships as outlines, but
// there is no font-to-path tool here, so the stack is named and the difference accepted.
const SANS = "'Helvetica Neue',Helvetica,Arial,'Liberation Sans',sans-serif";
const S = 512, CX = 256, R = 78, W = 52, RAY = 32;
const SAFE = [S * 0.1, S * 0.9]; // the maskable safe box

// The mark: the two characters that identify the wordmark, set the way it sets them.
function mark(size, y) {
  return `<text x="256" y="${y}" text-anchor="middle" font-family="${SANS}" font-size="${size}" font-weight="700" letter-spacing="4" fill="${WHITE}">D<tspan fill="${CYAN}">2</tspan></text>`;
}

// Full bleed: the app icon. Rounded: the browser tab, where there is no OS mask.
const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${INK}"/>
  ${mark(230, 336)}
</svg>
`;
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="108" fill="${INK}"/>
  ${mark(230, 336)}
</svg>
`;
// The header lockup. The letters take the page's colour so one file serves both grounds.
const wordmarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 96" width="520" height="96" role="img" aria-label="Digit2AI">
  <text x="6" y="66" font-family="${SANS}" font-size="62" font-weight="700" letter-spacing="9" fill="currentColor">DIGIT<tspan fill="${CYAN}">2</tspan>AI</text>
</svg>
`;

const PNGS = [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['favicon-32.png', 32]];

/**
 * THE SAFE ZONE IS MEASURED, NOT ASSUMED.
 *
 * Android crops a maskable icon to a circle inscribed in the central 80%, so anything
 * outside that box is shaved off on someone's home screen and nowhere else. The previous
 * version computed the box from the shape's own coordinates, which only works while the
 * shape is made of coordinates — it cannot see where a glyph actually lands. This renders
 * the real icon and finds the bounding box of every pixel that is not the background, so
 * it is true for a curve, a letterform, or anything drawn later.
 */
async function safeZoneViolations(sharp) {
  const size = 256, lo = size * 0.1, hi = size * 0.9;
  const { data, info } = await sharp(Buffer.from(masterSvg)).resize(size, size).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const bg = [data[0], data[1], data[2]];
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * ch;
      // A generous threshold: antialiasing at the edge of a glyph is not ink.
      if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < 90) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return ['the icon renders as a blank tile'];
  const bad = [];
  if (minX < lo || minY < lo || maxX > hi || maxY > hi) {
    bad.push(`ink spans ${minX},${minY} to ${maxX},${maxY} of ${size}; the safe box is ${lo}..${hi}`);
  }
  return bad;
}

async function main() {
  const check = process.argv.includes('--check');
  const files = [['icon-master.svg', masterSvg], ['favicon.svg', faviconSvg], ['wordmark.svg', wordmarkSvg]];
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
  const bad = await safeZoneViolations(sharp);
  if (bad.length) { console.error('The mark leaves the maskable safe box: ' + bad.join(', ')); process.exit(1); }

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
