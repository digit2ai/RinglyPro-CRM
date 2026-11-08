'use strict';
/**
 * JobUp.dev — 20s animated cartoon ad, to the supplied storyboard.
 *
 *   0-4   the problem      apply, apply, apply
 *   4-7   the change       meet JobUp.dev
 *   7-14  AI at work       72% · 86% · 94% match
 *   14-17 the result       they come to you
 *   17-20 the CTA          jobup.dev
 *
 * The character beats are generated; the two card beats are DRAWN, because the
 * percentages and the CTA are text a viewer has to read and a video model
 * cannot render text — it produces convincing-looking gibberish.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const httpClient = require('../src/http');
const { fishAudio, imageProvider, runwayVideo } = require('../src/providers');
const { render } = require('../src/pipeline/runner');
const { matchCards, ctaCard } = require('./jobup-cards');
const { score } = require('./score');
const { CHARACTER, ANGLES } = require('./jobup-cartoon-character');

const SHEET_DIR = path.join(__dirname, '..', 'character-sheets');
const OUT_DIR = process.env.OUT_DIR || path.join(os.homedir(), 'Desktop', 'JobUp', 'JobUp-Video');

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const [SLUMPED, HOPEFUL, PHONE, OPEN] = ANGLES;

const BEATS = [
  // 0-4 THE PROBLEM
  { text: 'Apply. Apply. Apply.',
    caption: 'Still looking for a job?',
    scene: 'seated close', image: SLUMPED, emotion: 'exhausted',
    camera: 'slow push in',
    pose: 'he sits at the laptop hammering the keyboard with both hands, then stops, drops his shoulders and lets his forehead fall into one open palm' },

  // 4-7 THE CHANGE
  { text: 'Meet JobUp dot dev. Let AI do the searching.',
    caption: 'Meet JobUp.dev',
    scene: 'medium', image: HOPEFUL, emotion: 'hopeful',
    camera: 'slow push in',
    pose: 'his head lifts, both eyebrows rise and he turns toward the laptop, one hand coming up off the desk' },

  // 7-14 AI AT WORK — drawn, not generated
  { text: 'JobUp uses AI to find opportunities that match your experience.',
    scene: 'match cards', source: 'screen_recording' },
  { text: 'Seventy-two. Eighty-six. Ninety-four percent match.',
    scene: 'match cards', source: 'screen_recording' },

  // 14-17 THE RESULT
  { text: 'Stop chasing jobs. They come to you.',
    caption: 'Stop chasing jobs.',
    scene: 'medium', image: PHONE, emotion: 'delighted',
    camera: 'locked off',
    pose: 'he holds a phone up in one hand at eye height, his other hand opening outward as his mouth widens into a grin' },

  // 17-20 CTA — drawn
  { text: 'Let AI find your next job. Create your profile free.',
    scene: 'cta', source: 'screen_recording' },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jobup20-'));

  process.stdout.write('  drawing the match cards ... ');
  const cards = path.join(work, 'match.mp4');
  await matchCards(cards, 8);
  console.log('ok');
  process.stdout.write('  drawing the CTA card ... ');
  const cta = path.join(work, 'cta.mp4');
  await ctaCard(cta, path.join(__dirname, 'jobup-logo.png'), 5);
  console.log('ok');

  const musicPath = path.join(work, 'score.wav');
  fs.writeFileSync(musicPath, score(21));

  let n = 0;
  const video = runwayVideo({
    http: httpClient, apiKey: env.VIDEO_API_KEY,
    endpoint: env.VIDEO_ENDPOINT, model: env.VIDEO_MODEL,
  });

  const t0 = Date.now();
  const outPath = path.join(OUT_DIR, `jobup-cartoon-20s-${Date.now()}.mp4`);
  const result = await render({
    beats: BEATS,
    character: CHARACTER,
    screenRecordings: { 'match cards': cards, cta },
    musicPath,
    logoPath: path.join(__dirname, 'jobup-logo.png'),
    config: { targetSeconds: 20, maxCostUsd: 3.0, angles: ANGLES, sheetDir: SHEET_DIR },
  }, {
    tts: fishAudio({ http: httpClient, apiKey: env.FISH_API_KEY, voiceId: env.FISH_VOICE_ID }),
    images: imageProvider({
      http: httpClient, apiKey: env.IMAGE_API_KEY, endpoint: env.IMAGE_ENDPOINT, model: env.IMAGE_MODEL,
    }),
    video: {
      animate: async (a) => {
        process.stdout.write(`  character clip ${++n} ... `);
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
    + `${result.shots - result.generatedShots} drawn) · ${result.captionCues} caption cues`);
  console.log(`  character sheet: ${result.characterSheetReused ? 'REUSED (free)' : 'generated'}`);
  console.log(`  ACTUAL: ${l.videoCredits} credits = $${(l.videoCredits * 0.01).toFixed(2)}`
    + ` + images $${((l.imageTokens * 40) / 1e6).toFixed(2)}`);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`\n${OUT_DIR}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
