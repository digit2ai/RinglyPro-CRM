'use strict';
/**
 * The 83-agent constellation — 8 core nodes on an inner ring, 75 specialist
 * dots on an outer one, each linked back to the brain at the centre.
 *
 * The counts are the site's own (8 core + 75 specialists = 83) and the nodes
 * are deliberately UNLABELLED: the site names only a handful of agents, and
 * putting invented names on the other seventy-something would be fabricating
 * the most checkable thing in the picture.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = '/tmp/orbup';
const S = 1400, C = S / 2;
const CORE = 8, SPEC = 75;
const R_CORE = 430, R_SPEC = 610;

async function png(name, body) {
  const f = path.join(OUT, `${name}.svg`);
  fs.writeFileSync(f, `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>`);
  await run(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--default-background-color=00000000', `--window-size=${S},${S}`,
    `--screenshot=${path.join(OUT, name + '.png')}`, `file://${f}`], { maxBuffer: 1 << 26 });
}

const at = (r, i, n, off = 0) => {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2 + off;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // The static web: links first so nodes sit on top of them.
  let links = '', nodes = '';
  for (let i = 0; i < CORE; i++) {
    const [x, y] = at(R_CORE, i, CORE);
    links += `<line x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#6f5bff" stroke-width="2.4" stroke-opacity="0.5"/>`;
    nodes += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="17" fill="#0b0e1c" stroke="#8b7bff" stroke-width="3"/>`;
  }
  for (let i = 0; i < SPEC; i++) {
    const [x, y] = at(R_SPEC, i, SPEC, 0.04);
    const [ix, iy] = at(R_CORE, Math.floor(i / (SPEC / CORE)) % CORE, CORE);
    links += `<line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#5a7cff" stroke-width="1.6" stroke-opacity="0.34"/>`;
    nodes += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="#8fc4ff" fill-opacity="0.95"/>`;
  }
  await png('web', links + nodes);

  // One highlight per core node, overlaid in sequence at composite time so the
  // brain visibly hands work out rather than the whole web glowing at once.
  for (let i = 0; i < CORE; i++) {
    const [x, y] = at(R_CORE, i, CORE);
    await png(`node${i}`, `
      <defs><radialGradient id="h"><stop offset="0%" stop-color="#bff0ff" stop-opacity="1"/>
      <stop offset="45%" stop-color="#57c8ff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#57c8ff" stop-opacity="0"/></radialGradient></defs>
      <line x1="${C}" y1="${C}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#9fe0ff" stroke-width="4" stroke-opacity="0.85"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="72" fill="url(#h)"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="17" fill="#eafcff"/>`);
  }
  console.log(`  constellation: web + ${CORE} node highlights (${CORE} core, ${SPEC} specialists)`);
})().catch((e) => { console.error('FAILED:', String(e.stderr || e.message).slice(0, 400)); process.exit(1); });
