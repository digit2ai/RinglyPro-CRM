'use strict';
/**
 * JobUp — 30s vertical social cut, built from the REAL product screenshots.
 *
 * Every shot is one of the operator's own screens, fitted whole (never cropped)
 * onto the brand background and given a slow drift. Nothing is generated: no
 * character sheet, no Runway clips. The only spend is the voiceover.
 *
 *   node demo/render-jobup-stills.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const httpClient = require('../src/http');
const { fishAudio } = require('../src/providers');
const { planShots } = require('../src/pipeline/script');
const { assemble, probe } = require('../src/pipeline/assemble');
const { kenBurns } = require('./stills');
const { score } = require('./score');

const REFS = '/tmp/orb-refs';
const OUT_DIR = process.env.JOBUP_OUT || path.join(os.homedir(), 'Desktop', 'JobUp-Video');

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

// Each beat names the screen it plays over, and the direction the frame drifts.
// Lines 1-4 are the operator's own; 5-7 are written from JobUp's published copy.
const BEATS = [
  { text: 'Stop searching for jobs. Let AI find them for you.',
    img: 'IMG1', from: 'down' },                       // the landing hero
  { text: 'Talk to the orb, or just upload your resume.',
    img: 'IMG3', from: 'in' },                         // the orb + attach resume
  { text: 'Your Opportunity Hunter scans eight job platforms. Every single day.',
    img: 'IMG4', from: 'up' },                         // dashboard: matches, pipeline
  { text: 'It ranks every opening, and tells you why it fits.',
    img: 'IMG5', from: 'left' },                       // analytics
  { text: 'Your Presence agent builds your public CV site.',
    img: 'IMG2', from: 'up' },                         // the live CV site
  { text: 'Recruiters and their AI can read it. So can a QR code.',
    img: 'IMG2', from: 'down' },
  { text: 'JobUp dot dev. Start free. No card.',
    img: 'IMG1', from: 'in' },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jobup-stills-'));

  for (const b of BEATS) {
    const f = path.join(REFS, b.img + '.png');
    if (!fs.existsSync(f)) throw new Error(`missing reference ${b.img} at ${f}`);
  }

  // 1 — the voiceover sets the timeline.
  const text = BEATS.map((b) => b.text).join(' ');
  const tts = fishAudio({ http: httpClient, apiKey: env.FISH_API_KEY, voiceId: env.FISH_VOICE_ID });
  process.stdout.write('voiceover ... ');
  const spoken = await tts.speak(text);
  const voPath = path.join(work, 'vo.mp3');
  fs.writeFileSync(voPath, spoken.audio);
  const voSeconds = parseFloat((await probe(voPath)).format.duration);
  console.log(voSeconds.toFixed(2) + 's');

  // 2 — plan captions and cuts against the measured read. Each beat is its own
  //     screen, so the scene name keys the still.
  const plan = planShots({
    beats: BEATS.map((b, i) => ({ text: b.text, scene: `s${i}`, source: 'screen_recording' })),
    targetSeconds: voSeconds,
  });
  console.log(`plan: ${plan.shots.length} clips, ${plan.captionCues.length} caption cues, ${plan.totalSeconds}s`);

  // 3 — one drifting still per clip.
  const clips = [];
  for (let i = 0; i < plan.shots.length; i++) {
    const c = plan.shots[i];
    const b = BEATS[Math.min(BEATS.length - 1, parseInt(String(c.scene).slice(1), 10) || 0)];
    const f = path.join(work, `clip${i}.mp4`);
    process.stdout.write(`  clip ${i + 1}/${plan.shots.length} ${b.img} (${b.from}) ... `);
    await kenBurns(f, path.join(REFS, b.img + '.png'), c.seconds, { from: b.from });
    console.log('ok');
    clips.push({ path: f, seconds: c.seconds });
  }

  // 4 — original score, then assemble.
  const musicPath = path.join(work, 'score.wav');
  fs.writeFileSync(musicPath, score(voSeconds));

  const out = path.join(OUT_DIR, `jobup-orb-walkthrough-${Date.now()}.mp4`);
  process.stdout.write('assembling ... ');
  await assemble({
    clips, cues: plan.captionCues, voiceover: voPath, music: musicPath,
    musicVolume: 0.20, outPath: out, workDir: path.join(work, 'asm'),
  });

  const info = await probe(out);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  console.log('done');
  console.log(`\n${out}`);
  console.log(`  ${v.width}x${v.height} | video ${v.duration}s | audio ${a.duration}s | ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
  console.log('  cost: voiceover only — no image or video generation');
  fs.rmSync(work, { recursive: true, force: true });
  console.log(OUT_DIR);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
