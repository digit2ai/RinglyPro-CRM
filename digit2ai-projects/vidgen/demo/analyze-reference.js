'use strict';
/**
 * node demo/analyze-reference.js <video> [--out DIR]
 *
 * Prints the recipe and writes recipe.json plus a numbered contact sheet, one
 * frame per detected shot, so the timings can be checked against what is
 * actually on screen rather than taken on faith.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');
const { analyze } = require('../src/analyze');

const FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';

async function contactSheet(file, shots, out) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-'));
  const tiles = [];
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const at = Math.min(s.start + s.seconds / 2, s.end - 0.05);
    const p = path.join(dir, `s${String(i).padStart(2, '0')}.png`);
    const label = `${i + 1}  ${s.start}s  ${s.seconds}s  ${s.motion}`;
    const vf = fs.existsSync(FONT)
      ? `scale=300:-1,drawtext=fontfile=${FONT}:text='${label}':x=10:y=8:fontsize=17:`
        + `fontcolor=white:box=1:boxcolor=0x000000cc:boxborderw=6`
      : 'scale=300:-1';
    await run(FFMPEG, ['-v', 'error', '-i', file, '-ss', String(at), '-frames:v', '1',
      '-vf', vf, p, '-y'], { maxBuffer: 1 << 26 });
    tiles.push(p);
  }
  if (!tiles.length) return null;
  const cols = Math.min(4, tiles.length);
  const rows = Math.ceil(tiles.length / cols);
  const args = ['-v', 'error'];
  tiles.forEach((p) => args.push('-i', p));
  // tile needs a uniform grid; pad the last row with copies of the last tile
  // rather than letting the filter fail on a short input list.
  while (tiles.length < cols * rows) { args.push('-i', tiles[tiles.length - 1]); tiles.push(tiles[tiles.length - 1]); }
  const chain = tiles.map((_, i) => `[${i}:v]`).join('') + `xstack=inputs=${tiles.length}:layout=`
    + tiles.map((_, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      return `${c === 0 ? '0' : Array.from({ length: c }, (_, k) => `w${k}`).join('+')}_`
        + `${r === 0 ? '0' : Array.from({ length: r }, (_, k) => `h${k * cols}`).join('+')}`;
    }).join('|');
  args.push('-filter_complex', chain, '-frames:v', '1', out, '-y');
  await run(FFMPEG, args, { maxBuffer: 1 << 26 });
  return out;
}

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('usage: node demo/analyze-reference.js <video> [--out DIR]'); process.exit(1); }
  if (!fs.existsSync(file)) { console.error(`no such file: ${file}`); process.exit(1); }
  const oi = process.argv.indexOf('--out');
  const outDir = oi > -1 ? process.argv[oi + 1]
    : path.join(os.homedir(), 'Desktop', 'JobUp', 'JobUp-Video', 'references');
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(file).replace(/\.[^.]+$/, '');

  process.stdout.write('  analysing ... ');
  const r = await analyze(file);
  console.log('ok');

  const jsonPath = path.join(outDir, `${base}.recipe.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(r, null, 2));
  const sheetPath = await contactSheet(file, r.shots, path.join(outDir, `${base}.shots.png`));

  const f = r.format;
  console.log(`\n  ${f.width}x${f.height}  ${f.aspect}  ${f.fps}fps  ${f.seconds}s`);
  console.log(`  ${r.pacing.shots} shots · mean ${r.pacing.meanShotSeconds}s `
    + `(${r.pacing.shortestShotSeconds}-${r.pacing.longestShotSeconds}s) · ${r.pacing.cutsPerMinute} cuts/min`);
  console.log(`  cuts: ${r.cutsFoundBy.sceneScore} by scene score, `
    + `${r.cutsFoundBy.thumbnailDiff} by thumbnail diff, ${r.cutsFoundBy.kept} kept`);
  if (r.audio) {
    const spoken = r.audio.speech.reduce((n, s) => n + s.seconds, 0);
    console.log(`  audio: ${r.audio.loudnessLufs} LUFS · ${r.audio.speech.length} speech spans, `
      + `${Math.round(spoken)}s of ${Math.round(f.seconds)}s`);
  } else console.log('  audio: none');
  console.log('');
  r.shots.forEach((s, i) => console.log(
    `   ${String(i + 1).padStart(2)}  ${String(s.start).padStart(6)}s  ${String(s.seconds).padStart(5)}s  `
    + `${s.motion.padEnd(9)} delta ${s.meanDelta}`));
  console.log(`\n  ${jsonPath}`);
  if (sheetPath) console.log(`  ${sheetPath}`);
})().catch((e) => {
  console.error('FAILED:', String(e.stderr || e.message).split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 500));
  process.exit(1);
});
