'use strict';
/**
 * JobUp — "Orb Walk-Through". The Orb character, ANIMATED.
 *
 * Every shot animates a frame from the saved Orb sheet, so it is the same
 * creature throughout — that continuity lock is the whole reason the sheet is
 * generated once and kept. Poses are the operator's, written as literal body
 * positions; the camera move is per beat.
 *
 *   node demo/render-orb-walkthrough.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const httpClient = require('../src/http');
const { fishAudio, imageProvider, runwayVideo } = require('../src/providers');
const { render } = require('../src/pipeline/runner');
const { score } = require('./score');
const { CHARACTER, ANGLES } = require('./orb-character');

const SHEET_DIR = path.join(__dirname, '..', 'character-sheets');
const OUT_DIR = process.env.JOBUP_OUT || path.join(os.homedir(), 'Desktop', 'JobUp-Video');

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const [WIDE, MEDIUM, HANDS, CORE] = ANGLES;

// Beats 1-4 are the operator's. 5-7 are written from JobUp's published copy.
const BEATS = [
  { text: 'Stop searching for jobs. Let AI find them for you.',
    scene: 'wide', image: WIDE, emotion: 'confident',
    camera: 'slow lateral tracking shot keeping pace with him',
    pose: 'he walks left to right in a purposeful stride, arms swinging naturally at his sides, the head-core held upright and level' },

  { text: 'Your Opportunity Hunter scans eight job platforms. Every single day.',
    scene: 'medium', image: MEDIUM, emotion: 'revealing',
    camera: 'slow push in',
    pose: 'he stops mid-stride and turns to face the camera, raising both hands to chest height with palms open and fingers spread, the light in his palms brightening as he turns' },

  { text: 'It ranks every opening, and tells you why it fits.',
    scene: 'close-up on his hands', image: HANDS, emotion: 'precise',
    camera: 'locked off, shallow focus',
    pose: 'his hands sweep downward in a sorting motion, fingers curling as if stacking invisible cards into order' },

  { text: 'Your Presence agent builds your public CV site.',
    scene: 'three-quarter view', image: MEDIUM, emotion: 'assured',
    camera: 'slow arc around him',
    pose: 'he extends one arm outward and opens the hand, palm turning upward as if presenting something standing beside him' },

  { text: 'Recruiters and their AI can read it, and so can a QR code.',
    scene: 'close-up on his face', image: CORE, emotion: 'steady',
    camera: 'slow push in',
    pose: 'the head-core turns toward the camera and settles, the horizontal light band steadying and brightening' },

  { text: 'It tailors your resume to that one posting. You review it, and you hit send.',
    scene: 'medium', image: MEDIUM, emotion: 'resolved',
    camera: 'locked off',
    pose: 'one hand rises to chest height and presses forward once, decisively, then lowers' },

  { text: 'JobUp dot dev. Start free. No card.',
    // Spoken "dot dev" so the read is right; PRINTED as the brand.
    caption: 'JobUp.dev — start free. No card.',
    scene: 'wide', image: WIDE, emotion: 'confident',
    camera: 'slow pull back',
    pose: 'he turns away from the camera and strides off into the dark, arms swinging' },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'orb-walk-'));
  const outPath = path.join(OUT_DIR, `jobup-orb-animated-${Date.now()}.mp4`);

  const words = BEATS.reduce((n, b) => n + b.text.trim().split(/\s+/).length, 0);
  console.log(`${BEATS.length} beats, ${words} words -> ~${(words / 2.6).toFixed(0)}s\n`);

  let done = 0;
  const video = runwayVideo({
    http: httpClient, apiKey: env.VIDEO_API_KEY,
    endpoint: env.VIDEO_ENDPOINT, model: env.VIDEO_MODEL,
  });

  const t0 = Date.now();
  const result = await render({
    beats: BEATS,
    character: CHARACTER,
    musicPath: (() => { const f = path.join(work, 'score.wav'); fs.writeFileSync(f, score(30)); return f; })(),
    logoPath: path.join(__dirname, 'jobup-logo.png'),
    config: { targetSeconds: 30, maxCostUsd: 4.0, angles: ANGLES, sheetDir: SHEET_DIR },
  }, {
    tts: fishAudio({ http: httpClient, apiKey: env.FISH_API_KEY, voiceId: env.FISH_VOICE_ID }),
    images: imageProvider({
      http: httpClient, apiKey: env.IMAGE_API_KEY, endpoint: env.IMAGE_ENDPOINT, model: env.IMAGE_MODEL,
    }),
    video: {
      animate: async (a) => {
        process.stdout.write(`  clip ${++done} (${a.seconds}s) ... `);
        const out = await video.animate(a);
        console.log(`ok ${out.credits} credits${out.transientPolls ? ` (${out.transientPolls} retried polls)` : ''}`);
        return out;
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
  console.log(`  ${result.seconds}s · ${result.shots} clips (${result.generatedShots} animated) · ${result.captionCues} caption cues`);
  console.log(`  character sheet: ${result.characterSheetReused ? 'REUSED (free)' : 'generated'}`);
  console.log(`  ACTUAL: ${l.videoCredits} Runway credits = $${(l.videoCredits * 0.01).toFixed(2)}`
    + ` + images $${((l.imageTokens * 40) / 1e6).toFixed(2)}`);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`\n${OUT_DIR}`);
})().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
