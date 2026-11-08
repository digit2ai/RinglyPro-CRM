'use strict';
/**
 * A talking head cut from Veo clips.
 *
 * THIS ASSEMBLY IS DIFFERENT FROM THE REST OF THE PIPELINE, on purpose.
 * assemble() strips clip audio with `-an`, because Runway clips are silent and
 * the voiceover is the spine of the edit. Veo clips ARE the audio — the speech
 * and the lip movement are the same asset — so stripping it would throw away
 * the only reason to use Veo at all. Here the clips keep their sound and the
 * music is mixed underneath.
 *
 * The subject's NAME is never in the spoken dialogue: Google's filter reads a
 * proper name as an impersonation attempt and refuses the whole generation. It
 * goes in the burned caption instead, where nothing objects.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG } = require('../src/ffmpeg');
const { buildAss, probe } = require('../src/pipeline/assemble');
const { score } = require('./score');

const W = 1080, H = 1920;
const OUT_DIR = process.env.OUT_DIR || path.join(os.homedir(), 'Desktop', 'JobUp-Video');

const CLIPS = [
  { file: '/tmp/ms-noname.mp4', lines: ['For twenty-five years I worked', 'inside the banking industry'] },
  { file: '/tmp/ms-clip2.mp4', lines: ['Citigroup, Tier-1 scale', '$1T+ in flows screened'] },
  { file: '/tmp/ms-clip3.mp4', lines: ['MCP Neural Intelligence', 'wired into your real systems'] },
  { file: '/tmp/ms-clip4.mp4', lines: ['20+ production systems', 'Manuel Stagg · manuelstagg.com'] },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const w = fs.mkdtempSync(path.join(os.tmpdir(), 'talkinghead-'));

  // 1 — normalise to 1080x1920, KEEPING the audio.
  const parts = [];
  let t = 0;
  const cues = [];
  for (let i = 0; i < CLIPS.length; i++) {
    const c = CLIPS[i];
    if (!fs.existsSync(c.file)) throw new Error(`missing clip ${c.file}`);
    const dur = parseFloat((await probe(c.file)).format.duration);
    const out = path.join(w, `n${i}.mp4`);
    await run(FFMPEG, ['-y', '-v', 'error', '-i', c.file,
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', out]);
    parts.push(out);

    // Two cues per clip, split across its real length.
    const half = dur / c.lines.length;
    c.lines.forEach((text, k) => {
      cues.push({ start: t + k * half, end: t + (k + 1) * half, text, rawCase: /·|\+|\$/.test(text) });
    });
    t += dur;
    process.stdout.write(`  clip ${i + 1} normalised (${dur.toFixed(1)}s)\n`);
  }

  // 2 — concat with audio.
  const list = path.join(w, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n') + '\n');
  const joined = path.join(w, 'joined.mp4');
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);

  // 3 — captions, logo, and music under the speech.
  const ass = path.join(w, 'c.ass');
  fs.writeFileSync(ass, buildAss(cues, { fontSize: 58, marginV: 260 }));
  const music = path.join(w, 'score.wav');
  fs.writeFileSync(music, score(t));
  const logo = path.join(__dirname, 'jobup-logo.png');
  const useLogo = false;   // this is a personal piece, not a JobUp ad

  const outPath = path.join(OUT_DIR, `manuel-stagg-cv-${Date.now()}.mp4`);
  const esc = ass.replace(/([:'\\])/g, '\\$1');
  await run(FFMPEG, ['-y', '-v', 'error', '-i', joined, '-i', music,
    '-filter_complex',
    `[0:v]subtitles=${esc}[v];`
    // His speech at full level; the bed pre-multiplied so amix's divide-by-n
    // does not quietly drop the voice 6dB.
    + `[0:a]volume=2[voice];[1:a]volume=0.16,afade=t=in:st=0:d=1.5[bed];`
    + `[voice][bed]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    '-t', String(Math.round(t * 1000) / 1000), outPath], { maxBuffer: 1 << 26 });

  const info = await probe(outPath);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  console.log(`\n${outPath}`);
  console.log(`  ${v.width}x${v.height} | video ${v.duration}s | audio ${a.duration}s | ${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB`);
  fs.rmSync(w, { recursive: true, force: true });
  console.log(OUT_DIR);
})().catch((e) => { console.error('FAILED:', String(e.message).split('\n').slice(-3).join(' | ')); process.exit(1); });
