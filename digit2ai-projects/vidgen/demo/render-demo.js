'use strict';
/**
 * Renders the JobUp promo through the actual pipeline.
 *
 *   node demo/render-demo.js           stubbed models, $0, colour-field clips
 *   node demo/render-demo.js --live    REAL PAID RENDER against .env creds
 *
 * Without --live the video/voice models are stubbed and everything else
 * (planning, timing, captions, concat, voiceover mux) is the production path.
 * With --live the providers are the real ones and this SPENDS MONEY.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');
const { render } = require('../src/pipeline/runner');
const { planShots } = require('../src/pipeline/script');
const httpClient = require('../src/http');
const { fishAudio, imageProvider, runwayVideo } = require('../src/providers');

const LIVE = process.argv.includes('--live');
const BEATS_ARG = (process.argv.find((a) => a.startsWith('--beats=')) || '').split('=')[1] || null;

function loadEnv() {
  const out = {};
  try {
    for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (_) { /* no .env: only the stub path will work */ }
  return Object.assign(out, process.env);
}
const ENV = loadEnv();

const OUT = process.env.VIDGEN_OUT || __dirname;
const WORK = process.env.VIDGEN_WORK || path.join(os.tmpdir(), 'vidgen-demo');

// The inverted RYZE structure: the frustration is with the process, not the person.
// Each beat carries THREE things and they do different jobs:
//   scene   framing only — picks the reference angle, and keys screen recordings
//   pose    the literal body position the video model animates
//   emotion the face
// Lighting and style appear in NEITHER: both are established by the character
// sheet, and a live generation proved the frame overrides the words anyway.
const BEATS = [
  { text: 'You sent forty applications last month.',
    scene: 'close-up on her face', emotion: 'weary',
    pose: 'she sits at a table with both hands resting flat on either side of an open laptop, shoulders slumped, head tilted down toward the screen' },
  { text: 'Thirty of them went into a keyword filter.',
    scene: 'close-up on her face', emotion: 'frustrated',
    pose: 'her head stays still while her eyes track left to right across the screen, jaw tight' },
  { text: 'It never saw the eight years you spent on the floor.',
    scene: 'medium wide', emotion: 'defeated',
    pose: 'she leans back away from the table, one forearm still flat on the tabletop, the other arm hanging straight down at her side' },
  { text: 'It never saw the team you trained.',
    scene: 'side profile', emotion: 'reflective',
    pose: 'seen from her left side, she turns her head slowly away from the laptop and lifts her chin' },
  { text: 'That silence is not a verdict on you.',
    scene: 'close-up on her face', emotion: 'steady',
    pose: 'she raises her head and looks straight down the lens, shoulders squaring' },
  { text: 'It is a broken filter between you and the work.',
    scene: 'medium wide', emotion: 'resolved',
    pose: 'she pushes the chair back and rises to stand, one hand pressed flat on the table taking her weight' },
  { text: 'Job Up reads your history instead of your keywords.', scene: 'app interface', source: 'screen_recording' },
  { text: 'It builds the profile you never had time to write.', scene: 'app interface', source: 'screen_recording' },
  { text: 'Then it goes and finds the roles that match it.', scene: 'app interface', source: 'screen_recording' },
  { text: 'The roles it finds already know what you can do.', scene: 'app interface', source: 'screen_recording' },
  { text: 'No cover letter rewritten for the ninth time.',
    scene: 'close-up on her hands', emotion: 'relieved',
    pose: 'both of her hands close a notebook flat on the table, fingers spreading across the cover' },
  { text: 'No guessing which keyword the machine wanted.',
    scene: 'side profile', emotion: 'calm',
    pose: 'seen from her side, she stands still facing a window with both arms hanging loose at her sides' },
  { text: 'Just your history, read properly, by something that was built to read it.',
    scene: 'three-quarter view', emotion: 'assured',
    pose: 'she settles back into the chair and lets both hands come to rest in her lap, shoulders dropping' },
  { text: 'You stop applying into the void.',
    scene: 'three-quarter view', emotion: 'hopeful',
    // The one that misfired live: "phone in hand" produced a phone pressed to
    // her ear. The arm position is now stated outright.
    pose: 'she holds a phone flat in her open palm at chest height with her elbow bent at her side, looking down at the screen in her hand' },
  { text: 'You start hearing back from people.',
    scene: 'close-up on her face', emotion: 'warm',
    pose: 'her mouth curves into a small closed-lip smile and her head lifts a few degrees' },
  { text: 'Job Up. Free to try, at jobup dot dev.',
    scene: 'medium wide', emotion: 'confident',
    pose: 'she walks forward toward the camera with one hand extended ahead pushing a door open' }
];

// The default pack is the 60s promo above; --beats=<module> swaps in another
// (a module exporting { CHARACTER, BEATS, TARGET?, NAME? }).
const PACK = BEATS_ARG
  ? Object.assign({ NAME: path.basename(BEATS_ARG).replace(/\.js$/, '') },
      require(path.resolve(__dirname, BEATS_ARG)))
  : {
      NAME: 'jobup-60s',
      TARGET: 60,
      BEATS,
      CHARACTER: {
        description: 'a woman in her early thirties, warm brown skin, dark hair in a loose bun, navy t-shirt',
        styleTokens: '3d animated feature film style, soft volumetric lighting, shallow depth of field, saturated warm palette'
      }
    };

const PALETTE = ['#1a2744', '#243a5e', '#2d1f3d', '#3a2a1f', '#1f3330', '#2b2438'];
const UI = '#0d1b2a';

/**
 * drawtext needs a font FILE, and there is no path that exists on every OS —
 * DejaVu on Debian, Helvetica/Arial on macOS. Take the first one that is
 * actually there, and if none is, render the card without its label rather
 * than failing a whole demo over text nobody ships.
 */
const FONT = [
  process.env.VIDGEN_FONT,
  '/System/Library/Fonts/Supplemental/Arial.ttf',      // macOS
  '/System/Library/Fonts/Helvetica.ttc',              // macOS, always present
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',  // Debian / Ubuntu
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',           // Fedora / RHEL
  '/usr/share/fonts/TTF/DejaVuSans.ttf',              // Arch
  'C:\\Windows\\Fonts\\arial.ttf'                       // Windows
].filter(Boolean).find(f => fs.existsSync(f)) || null;

async function placeholder(file, seconds, color, label) {
  const args = ['-y', '-v', 'error', '-f', 'lavfi',
    '-i', `color=c=${color}:s=1080x1920:d=${seconds}:r=30`];
  if (FONT) {
    // A Windows font path carries a colon and backslashes, both of which are
    // filtergraph syntax.
    const fontArg = FONT.replace(/([:\\])/g, '\\$1');
    args.push('-vf', `drawtext=fontfile=${fontArg}:` +
      `text='${label.replace(/[':\\]/g, '')}':fontcolor=white@0.25:fontsize=34:` +
      `x=(w-text_w)/2:y=280`);
  }
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file);
  await run(FFMPEG, args);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(WORK, { recursive: true });
  if (!FONT) console.log('note: no usable font found — placeholder cards render unlabelled');

  const preview = planShots({ beats: PACK.BEATS, targetSeconds: PACK.TARGET || 60 });
  console.log(`plan: ${preview.shots.length} shots, ${preview.totalSeconds}s, ` +
              `${preview.generatedShots} generated, meetsTarget=${preview.meetsTarget}`);

  // Screen recordings the pipeline expects to be supplied, not generated.
  const uiClip = path.join(WORK, 'ui.mp4');
  await placeholder(uiClip, 6, UI, '[ JobUp screen recording ]');

  const spec = {
    beats: PACK.BEATS,
    character: PACK.CHARACTER,
    screenRecordings: { 'app interface': uiClip },
    config: {
      targetSeconds: PACK.TARGET || 60,
      maxCostUsd: 6.0,
      // Stub frames are not real frames; keep them out of the live sheet's way.
      sheetDir: LIVE ? path.join(__dirname, '..', 'character-sheets') : WORK
    }
  };

  let n = 0;

  const stubDeps = {
    tts: {
      costPerMillionChars: 15,
      speak: async (text) => {
        const words = text.trim().split(/\s+/).length;
        const secs = Math.max(1, words / 2.6);   // real ad-read pace
        const f = path.join(WORK, 'vo.mp3');
        await run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
          '-i', `anoisesrc=d=${secs}:c=pink:a=0.05`, '-c:a', 'libmp3lame', f]);
        return { audio: fs.readFileSync(f), chars: text.length };
      }
    },
    images: {
      characterSheet: async ({ angles }) =>
        angles.map(a => ({ angle: a, url: `locked://character/${a.replace(/\s+/g, '-')}` }))
    },
    video: {
      animate: async ({ referenceImageUrl, seconds }) => {
        const f = path.join(WORK, `gen${n++}.mp4`);
        await placeholder(f, seconds, PALETTE[n % PALETTE.length],
          '[ generated from ' + referenceImageUrl.split('/').pop() + ' ]');
        return { url: 'file://' + f, seconds };
      }
    },
    download: async (url, dest) => fs.copyFileSync(url.replace('file://', ''), dest)
  };

  const liveDeps = {
    tts: fishAudio({ http: httpClient, apiKey: ENV.FISH_API_KEY, voiceId: ENV.FISH_VOICE_ID }),
    images: imageProvider({
      http: httpClient, apiKey: ENV.IMAGE_API_KEY,
      endpoint: ENV.IMAGE_ENDPOINT, model: ENV.IMAGE_MODEL
    }),
    video: runwayVideo({
      http: httpClient, apiKey: ENV.VIDEO_API_KEY,
      endpoint: ENV.VIDEO_ENDPOINT, model: ENV.VIDEO_MODEL
    }),
    download: async (url, dest) => {
      // Runway's artifact urls are signed and expire — fetch on the spot.
      const res = await httpClient.get(url, {});
      if (!res.ok || !res.buffer.length) {
        throw new Error(`download failed: HTTP ${res.status} for ${url.slice(0, 60)}`);
      }
      fs.writeFileSync(dest, res.buffer);
    }
  };

  const t0 = Date.now();
  const result = await render(spec, Object.assign(LIVE ? liveDeps : stubDeps, {
    logger: { info: (o) => LIVE && console.log('  ', JSON.stringify(o)) },
    workDir: WORK,
    outPath: path.join(OUT, `${PACK.NAME}${LIVE ? '-live' : ''}.mp4`)
  }));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);

  console.log(`\nrendered in ${elapsed}s -> ${result.path}`);
  console.log(`  ${result.seconds}s, ${result.shots} clips ` +
              `(${result.generatedShots} generated, ${result.shots - result.generatedShots} screen recording), ` +
              `${result.captionCues} caption cues`);
  console.log(`  voiceover measured at ${result.voSeconds}s`);
  console.log(`  character sheet: ${result.characterSheetReused ? 'REUSED' : 'generated'} ${result.characterSheetPath}`);
  console.log(`\nESTIMATE  $${result.estimate.total} ` +
              `(images $${result.estimate.images}, video $${result.estimate.video}, tts $${result.estimate.tts})`);
  if (LIVE) {
    const l = result.ledger;
    const videoUsd = l.videoCredits * 0.01;          // Runway: $0.01/credit
    const imageUsd = (l.imageTokens * 40) / 1e6;     // OpenAI: $40/1M image-output tokens
    console.log('ACTUAL    (as reported by the providers)');
    console.log(`  video : ${l.videoCredits} Runway credits across ${l.clips.length} clips = $${videoUsd.toFixed(2)}`);
    console.log(`  images: ${l.imageTokens} output tokens across ${l.imagesGenerated} frames = $${imageUsd.toFixed(4)}`);
    console.log(`  total : $${(videoUsd + imageUsd).toFixed(2)} (tts not itemised by the provider)`);
    for (const c of l.clips) {
      console.log(`    clip ${String(c.shot).padStart(2)}: ${c.credits} credits ` +
                  `| generated ${c.generatedSeconds}s, used ${c.usedSeconds}s | ${c.taskId}`);
    }
  }
})();
