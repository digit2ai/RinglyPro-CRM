'use strict';
/**
 * JobUp — 15s vertical social cut.
 *
 * Three capabilities, three real screens, bookended by the Orb:
 *   your own site  ·  two agents working around the clock  ·  search near you
 *
 * The Orb sheet is REUSED from disk, so the character costs nothing and stays
 * the same creature. The product screens are the operator's own captures,
 * fitted whole (never cropped — a 2328x1450 map cropped to 9:16 loses the map)
 * and given a slow drift so they are not frozen frames.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const httpClient = require('../src/http');
const { fishAudio, imageProvider, runwayVideo } = require('../src/providers');
const { render } = require('../src/pipeline/runner');
const { kenBurns } = require('./stills');
const { score } = require('./score');
const { CHARACTER, ANGLES } = require('./orb-character');

const SHOTS = '/tmp/jobup-shots';
const SHEET_DIR = path.join(__dirname, '..', 'character-sheets');
const OUT_DIR = process.env.OUT_DIR || path.join(os.homedir(), 'Desktop', 'JobUp', 'JobUp-Video');

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const [WIDE, MEDIUM, , CORE] = ANGLES;

// 15s of voiceover is ~39 words. Every claim is one JobUp actually makes.
const BEATS = [
  { text: 'Still hunting for a job on your own?',
    scene: 'wide', image: WIDE, emotion: 'searching',
    camera: 'slow lateral tracking',
    pose: 'he walks slowly forward, the head-core turning side to side as if scanning for something, arms hanging low' },

  { text: 'JobUp gives you your own site, and the numbers to prove it works.',
    scene: 'your analytics', source: 'screen_recording' },

  { text: 'Two AI agents work around the clock, scoring every match.',
    scene: 'your matches', source: 'screen_recording' },

  { text: 'And you can search what is open near you, right now.',
    scene: 'search near you', source: 'screen_recording' },

  { text: 'JobUp dot dev.',
    caption: 'JobUp.dev',
    scene: 'medium', image: MEDIUM, emotion: 'confident',
    camera: 'slow push in',
    pose: 'he plants both feet, squares his shoulders to the camera and raises one open palm toward the lens' },
];

// Which capture plays under which beat, and which way the frame drifts.
// COVER, not fit: these are wide desktop captures, and fitting them whole
// leaves a thin unreadable band across a phone screen.
const SCREENS = [
  ['your analytics', 'S3.png', 'right'],  // 1182 views · 332 AI agent reads
  ['your matches', 'S4.png', 'left'],     // 100 matches, a 92 score
  ['search near you', 'S1.png', 'right'], // the Tampa map
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jobup15-'));

  // Screens first: fitted whole onto the brand background, drifting.
  const screenRecordings = {};
  for (const [scene, file, from] of SCREENS) {
    const src = path.join(SHOTS, file);
    if (!fs.existsSync(src)) throw new Error(`missing capture ${src}`);
    const out = path.join(work, file.replace('.png', '.mp4'));
    process.stdout.write(`  screen "${scene}" <- ${file} (${from}) ... `);
    await kenBurns(out, src, 8, { from, zoom: true, zoomWidth: 1.55 });
    console.log('ok');
    screenRecordings[scene] = out;
  }

  const musicPath = path.join(work, 'score.wav');
  fs.writeFileSync(musicPath, score(16));

  let n = 0;
  const video = runwayVideo({
    http: httpClient, apiKey: env.VIDEO_API_KEY,
    endpoint: env.VIDEO_ENDPOINT, model: env.VIDEO_MODEL,
  });

  const t0 = Date.now();
  const outPath = path.join(OUT_DIR, `jobup-15s-${Date.now()}.mp4`);
  const result = await render({
    beats: BEATS,
    character: CHARACTER,
    screenRecordings,
    musicPath,
    logoPath: path.join(__dirname, 'jobup-logo.png'),
    config: { targetSeconds: 15, maxCostUsd: 3.0, angles: ANGLES, sheetDir: SHEET_DIR },
  }, {
    tts: fishAudio({ http: httpClient, apiKey: env.FISH_API_KEY, voiceId: env.FISH_VOICE_ID }),
    images: imageProvider({
      http: httpClient, apiKey: env.IMAGE_API_KEY, endpoint: env.IMAGE_ENDPOINT, model: env.IMAGE_MODEL,
    }),
    video: {
      animate: async (a) => {
        process.stdout.write(`  orb clip ${++n} ... `);
        const o = await video.animate(a);
        console.log(`ok ${o.credits} credits`);
        return o;
      },
    },
    download: async (url, dest) => {
      const res = await httpClient.get(url, {});
      if (!res.ok || !res.buffer.length) throw new Error(`download failed: HTTP ${res.status}`);
      fs.writeFileSync(dest, res.buffer);
    },
    logger: { info: (o) => console.log('  ' + JSON.stringify(o)) },
    workDir: work, outPath,
  });

  const l = result.ledger;
  console.log(`\nrendered in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${outPath}`);
  console.log(`  ${result.seconds}s · ${result.shots} clips (${result.generatedShots} animated, `
    + `${result.shots - result.generatedShots} screens) · ${result.captionCues} caption cues`);
  console.log(`  character sheet: ${result.characterSheetReused ? 'REUSED (free)' : 'generated'}`);
  console.log(`  ACTUAL: ${l.videoCredits} credits = $${(l.videoCredits * 0.01).toFixed(2)}`);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`\n${OUT_DIR}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
