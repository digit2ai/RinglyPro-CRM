'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const run = promisify(execFile);
const { FFMPEG, FFPROBE } = require('../ffmpeg');

const W = 1080, H = 1920, FPS = 30;

/**
 * Assembly. This is the stage that turns N short clips + one voiceover into
 * a single 9:16 video with burned captions.
 *
 * Captions are written as an ASS subtitle file rather than chained drawtext
 * filters: 40 drawtext filters in one graph is where ffmpeg command lines go
 * to die, and ASS gives real styling, outlines, and timing for free.
 */

function assTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds - Math.floor(seconds)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAss(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');
}

/**
 * @param cues [{start, end, text}]
 * @param style { fontName, fontSize, primary, outline, marginV }
 */
function buildAss(cues, style = {}) {
  const s = Object.assign({
    fontName: 'DejaVu Sans',
    fontSize: 72,
    primary: '&H00FFFFFF',      // ASS is &HAABBGGRR
    outline: '&H00000000',
    marginV: 420
  }, style);

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Caption,${s.fontName},${s.fontSize},${s.primary},${s.outline},&H80000000,1,0,1,4,2,2,80,80,${s.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];
  const events = cues.map(c =>
    `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,${escapeAss(c.text.toUpperCase())}`
  );
  return header.concat(events).join('\n') + '\n';
}

/**
 * Normalize each clip to identical geometry/fps before concat.
 * Mismatched clips are the number-one cause of a concat that silently
 * produces a 3-second file — the demuxer needs identical streams.
 */
async function normalize(inputPath, outPath, seconds) {
  await run(FFMPEG, [
    '-y', '-v', 'error',
    '-i', inputPath,
    '-t', String(seconds),
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1`,
    '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    outPath
  ]);
  return outPath;
}

/**
 * @param opts.clips     [{path, seconds}] in cut order
 * @param opts.cues      caption cues from planShots
 * @param opts.voiceover path to the VO audio, or null
 * @param opts.music     path to a bed track, or null
 * @param opts.outPath   final mp4
 */
async function assemble(opts) {
  const { clips, cues, voiceover = null, music = null, outPath, workDir, style } = opts;
  if (!clips || !clips.length) {
    throw Object.assign(new Error('nothing to assemble'), { code: 'no_clips' });
  }
  fs.mkdirSync(workDir, { recursive: true });

  const normalized = [];
  for (let i = 0; i < clips.length; i++) {
    const out = path.join(workDir, `n${String(i).padStart(3, '0')}.mp4`);
    normalized.push(await normalize(clips[i].path, out, clips[i].seconds));
  }

  const listFile = path.join(workDir, 'concat.txt');
  fs.writeFileSync(listFile, normalized.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');

  const silent = path.join(workDir, 'silent.mp4');
  await run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);

  const assPath = path.join(workDir, 'captions.ass');
  fs.writeFileSync(assPath, buildAss(cues, style));

  const args = ['-y', '-v', 'error', '-i', silent];
  const filters = [`subtitles=${assPath.replace(/([:'\\])/g, '\\$1')}`];

  let audioMap = [];
  if (voiceover && music) {
    args.push('-i', voiceover, '-i', music);
    // Duck the bed under the voice so the read stays legible.
    //
    // `normalize=0` IS LOAD-BEARING. amix divides every input by the number of
    // inputs by default, so the voiceover would come out 6dB quieter than it
    // goes in — the bed gets ducked and the voice gets ducked with it, which
    // reads as "the music buried the read". With normalize off, the bed sits
    // at `musicVolume` under a voice that is untouched.
    filters.push(null);
    const bedVol = opts.musicVolume != null ? opts.musicVolume : 0.18;
    audioMap = ['-filter_complex',
      `[0:v]subtitles=${assPath.replace(/([:'\\])/g, '\\$1')}[v];` +
      `[2:a]volume=${bedVol},afade=t=in:st=0:d=1.5[bed];` +
      `[1:a][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
      '-map', '[v]', '-map', '[a]'];
  } else if (voiceover) {
    args.push('-i', voiceover);
    audioMap = ['-vf', filters[0], '-map', '0:v', '-map', '1:a'];
  } else {
    audioMap = ['-vf', filters[0]];
  }

  // NEVER `-shortest` HERE. It truncated the voiceover by ~8s on every render
  // that used it — a 33.0s read muxed as 24.7s — while the video stayed full
  // length, so the ad played on in silence and nothing errored. ffmpeg ends the
  // output when the first ENCODER drains, and with libass filtering the video
  // the audio encoder gets cut off inside the default shortest_buf_duration
  // window. The lengths are known here, so state the duration outright.
  const videoSeconds = clips.reduce((n, c) => n + c.seconds, 0);
  let stopAt = videoSeconds;
  if (voiceover) {
    const voSeconds = await audioSeconds(voiceover);
    // The read is the spine of the edit; if it is shorter, the edit ends with it.
    if (voSeconds > 0) stopAt = Math.min(videoSeconds, voSeconds);
  }

  args.push(...audioMap,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    '-t', String(Math.round(stopAt * 1000) / 1000),
    outPath);

  await run(FFMPEG, args, { maxBuffer: 1024 * 1024 * 32 });
  return outPath;
}

/** Decoded length of an audio file, or 0 if it cannot be read. */
async function audioSeconds(file) {
  try {
    const info = await probe(file);
    const d = parseFloat(info.format && info.format.duration);
    return isFinite(d) && d > 0 ? d : 0;
  } catch (_) {
    return 0;
  }
}

async function probe(file) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,duration',
    '-of', 'json', file
  ]);
  return JSON.parse(stdout);
}

module.exports = { assemble, buildAss, assTime, normalize, probe, audioSeconds, W, H, FPS };
