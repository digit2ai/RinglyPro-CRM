'use strict';
/**
 * Rebuilds the JobUp social spot REUSING the Runway clips already paid for.
 * New voiceover (a few hundredths of a cent), new animated UI cards (free),
 * new captions. No image or video generation.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const httpClient = require('../src/http');
const { fishAudio } = require('../src/providers');
const { assemble, probe } = require('../src/pipeline/assemble');
const { planShots } = require('../src/pipeline/script');
const { card } = require('./ui-cards');
const { score } = require('./score');
const { BEATS } = require('./jobup-social-v2');

const W = path.join(os.tmpdir(), 'vidgen-demo');
const FONT = '/System/Library/Fonts/Supplemental/Arial.ttf';
// The four generated clips already bought, in story order.
const PAID = ['shot000', 'shot001', 'shot006', 'shot007'].map((n) => path.join(W, n + '.mp4'));
const CARD_FOR = { 'ui hunter': 'hunter', 'ui presence': 'presence', 'ui match': 'scored' };

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

(async () => {
  const dir = path.join(W, 'v2');
  fs.mkdirSync(dir, { recursive: true });

  const text = BEATS.map((b) => b.text).join(' ');
  const tts = fishAudio({ http: httpClient, apiKey: env.FISH_API_KEY, voiceId: env.FISH_VOICE_ID });
  const spoken = await tts.speak(text);
  const voPath = path.join(dir, 'vo.mp3');
  fs.writeFileSync(voPath, spoken.audio);
  const voSeconds = parseFloat((await probe(voPath)).format.duration);
  console.log('voiceover:', voSeconds.toFixed(2) + 's');

  const plan = planShots({ beats: BEATS, targetSeconds: voSeconds });
  const gen = plan.shots.filter((c) => c.source === 'generated');
  console.log('clips:', plan.shots.length, '| generated:', gen.length,
    '| use-lengths:', gen.map((c) => c.seconds).join(', '));

  if (gen.length !== PAID.length || gen.some((c) => c.seconds > 5.001)) {
    console.log('PLAN NO LONGER FITS THE PAID FOOTAGE — would need new generations. Stopping.');
    process.exit(2);
  }

  // Build one animated card per UI clip, at exactly the length it occupies.
  let g = 0;
  const clips = [];
  for (const c of plan.shots) {
    if (c.source === 'generated') {
      clips.push({ path: PAID[g++], seconds: c.seconds });
    } else {
      const kind = CARD_FOR[c.scene] || 'hunter';
      const f = path.join(dir, `card-${kind}.mp4`);
      await card(f, kind, Math.max(2, c.seconds + 0.3), FONT);
      clips.push({ path: f, seconds: c.seconds });
    }
  }

  // Original score, written to this cut's length so its lift lands on the turn.
  const musicPath = path.join(dir, 'score.wav');
  fs.writeFileSync(musicPath, score(voSeconds));

  const out = path.join(__dirname, 'jobup-social-v2.mp4');
  await assemble({
    clips, cues: plan.captionCues, voiceover: voPath, music: musicPath,
    musicVolume: 0.22, outPath: out, workDir: path.join(dir, 'asm')
  });

  const info = await probe(out);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  console.log(`\nDONE -> ${out}`);
  console.log(`  ${v.width}x${v.height} | video ${v.duration}s | audio ${a.duration}s`);
  console.log(`  ${plan.captionCues.length} caption cues | original score, ducked to 0.22`);
  console.log('  cost: voiceover only, no generations');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
