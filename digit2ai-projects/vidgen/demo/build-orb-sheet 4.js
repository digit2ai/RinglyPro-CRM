'use strict';
/** Generate (or reuse) the Orb character sheet, then write the frames out to look at. */
const fs = require('fs');
const path = require('path');
const httpClient = require('../src/http');
const { imageProvider } = require('../src/providers');
const { sheetPathFor, loadSheet, saveSheet, DEFAULTS } = require('../src/pipeline/runner');
const { CHARACTER, ANGLES } = require('./orb-character');

const SHEET_DIR = path.join(__dirname, '..', 'character-sheets');
const LOOK_DIR = process.env.ORB_OUT || path.join(require('os').homedir(), 'Desktop', 'JobUp-Video', 'orb-sheet');

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

(async () => {
  const cfg = Object.assign({}, DEFAULTS, { angles: ANGLES, sheetDir: SHEET_DIR });
  const sheetPath = sheetPathFor({ character: CHARACTER }, cfg, path.join(SHEET_DIR, 'x.mp4'));
  let frames = loadSheet(sheetPath);

  if (frames) {
    console.log('reusing the saved Orb:', sheetPath);
  } else {
    console.log('generating the Orb — 4 angles, concurrently ...');
    const t0 = Date.now();
    frames = await imageProvider({
      http: httpClient, apiKey: env.IMAGE_API_KEY,
      endpoint: env.IMAGE_ENDPOINT, model: env.IMAGE_MODEL,
    }).characterSheet({ description: CHARACTER.description, styleTokens: CHARACTER.styleTokens, angles: ANGLES });
    const tokens = frames.reduce((n, f) => n + (f.outputTokens || 0), 0);
    console.log(`  ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`
      + ` · ${tokens} output tokens · $${((tokens * 40) / 1e6).toFixed(4)}`);
    saveSheet(sheetPath, frames, { character: CHARACTER }, cfg);
    console.log('  saved ->', sheetPath);
  }

  fs.mkdirSync(LOOK_DIR, { recursive: true });
  frames.forEach((f, i) => {
    const out = path.join(LOOK_DIR, `orb-${i + 1}.jpg`);
    fs.writeFileSync(out, Buffer.from(f.url.split(',')[1], 'base64'));
    console.log(`  ${path.basename(out)}  ${f.angle}`);
  });
  console.log('\n' + LOOK_DIR);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
