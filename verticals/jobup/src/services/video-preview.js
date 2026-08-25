'use strict';

// =============================================================
// STORYBOARD PREVIEW — the free animatic you watch BEFORE spending money.
//
// The console could compose a spec, price it, and then ask an operator to
// approve three dollars of model calls on the strength of reading five lines of
// text. That is the wrong order. This renders the same beats as a real,
// playable, TIMED video — the voiceover paced exactly as it will be, each line
// on screen for exactly as long as it takes to say — for zero dollars, in about
// twenty seconds.
//
// EVERYTHING IN IT IS FREE AND LOCAL:
//   · voice  — Microsoft Edge neural TTS (the repo's own /api/tts/edge engine)
//   · frames — the branded ffmpeg cards already used for product beats
//   · mux    — the same ffmpeg binary the real assembler uses
// No Fish, no Runway, no Veo, no OpenAI. A preview that cost money would defeat
// the entire purpose of previewing.
//
// IT IS NOT A DRAFT OF THE FINAL VIDEO AND MUST NEVER BE PRESENTED AS ONE. The
// final render has a generated character, motion and a different (paid) voice.
// This is the storyboard: the words, the order, the pacing, the length. Those
// are the four things worth checking before paying, and the three the operator
// would otherwise only discover afterwards.
// =============================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);

const cards = require('./video-cards');

// The repo's own zero-key TTS. Reached by path because it belongs to the root
// app, not to jobup — the same engine every narrated page here already uses.
let edge;
try { edge = require('../../../../src/services/edge-tts'); } catch (e) {
  console.warn('[video-preview] edge-tts unavailable:', e.message);
  edge = null;
}

// One voice per language, chosen to match the paid read rather than to show off.
const VOICES = {
  en: process.env.JOBUP_PREVIEW_VOICE_EN || 'en-US-AvaNeural',
  es: process.env.JOBUP_PREVIEW_VOICE_ES || 'es-MX-DaliaNeural',
};

// A card is never shorter than this (video-cards enforces its own floor too),
// and a single beat is never allowed to run away with the preview.
const MIN_BEAT = 2.0;
const MAX_BEAT = 14.0;

function binaries() {
  let FFMPEG = process.env.FFMPEG_PATH;
  let FFPROBE = process.env.FFPROBE_PATH;
  if (!FFMPEG) { try { FFMPEG = require('@ffmpeg-installer/ffmpeg').path; } catch (_) { FFMPEG = 'ffmpeg'; } }
  if (!FFPROBE) { try { FFPROBE = require('@ffprobe-installer/ffprobe').path; } catch (_) { FFPROBE = 'ffprobe'; } }
  return { FFMPEG, FFPROBE };
}

/** Whether a preview can be produced at all on this host, and what is missing. */
function available() {
  const missing = [];
  if (!edge) missing.push('edge-tts engine');
  if (!cards.available()) missing.push('ffmpeg');
  if (!cards.font()) missing.push('a system font');
  return { ok: missing.length === 0, missing };
}

async function seconds(file) {
  const { FFPROBE } = binaries();
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file], { timeout: 30000 });
  const n = parseFloat(String(stdout).trim());
  return Number.isFinite(n) ? n : 0;
}

// ---- the job table ---------------------------------------------------------
//
// In memory on purpose: a preview is worth nothing after the operator has
// watched it, and a row per throwaway animatic is landfill in a table that
// exists to record things that cost money.
const jobs = new Map();

function progress(briefId) {
  return jobs.get(briefId) || null;
}

function set(briefId, patch) {
  const cur = jobs.get(briefId) || {};
  const next = Object.assign({}, cur, patch, { updated_at: new Date().toISOString() });
  jobs.set(briefId, next);
  return next;
}

/**
 * Start a preview. Returns immediately; the console polls progress().
 * @returns {{started:boolean, reason?:string}}
 */
function start(brief, { dir } = {}) {
  const cap = available();
  if (!cap.ok) return { started: false, reason: `preview needs ${cap.missing.join(', ')}` };
  const spec = (brief && brief.spec) || {};
  const beats = (spec.beats || []).filter((b) => b && b.text);
  if (!beats.length) return { started: false, reason: 'the spec has no beats to preview' };

  const cur = jobs.get(brief.id);
  if (cur && cur.status === 'running') return { started: false, reason: 'already previewing' };

  set(brief.id, { status: 'running', pct: 1, note: 'starting', file: null, error: null, beats: beats.length });
  setImmediate(() => build(brief, beats, dir).then(
    (out) => set(brief.id, { status: 'done', pct: 100, note: null, file: out.file, seconds: out.seconds }),
    (e) => {
      console.warn('[video-preview] brief', brief.id, 'failed:', e.message);
      set(brief.id, { status: 'failed', pct: 100, note: null, error: e.message });
    }
  ));
  return { started: true };
}

async function build(brief, beats, libraryDir) {
  const { FFMPEG } = binaries();
  const spec = brief.spec || {};
  const lang = String(brief.lang || 'en').slice(0, 2).toLowerCase();
  const voice = VOICES[lang] || VOICES.en;
  const accent = '#8b5cf6';
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `jobup-preview-${brief.id}-`));
  const segments = [];

  try {
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      const pct = 5 + Math.round((i / beats.length) * 85);
      set(brief.id, { pct, note: `beat ${i + 1} of ${beats.length}` });

      // ---- the read, which is what sets the pacing ----------------------
      const mp3 = path.join(work, `vo-${i}.mp3`);
      const buf = await edge.synthesize(b.text, { voice, lang: voice.slice(0, 5) });
      if (!buf || !buf.length) throw new Error(`no audio came back for beat ${i + 1}`);
      fs.writeFileSync(mp3, buf);
      const spoken = Math.min(MAX_BEAT, Math.max(MIN_BEAT, (await seconds(mp3)) + 0.5));

      // ---- the frame, timed to the read --------------------------------
      const cardFile = path.join(work, `card-${i}.mp4`);
      await cards.card(cardFile, {
        text: b.text,
        // The scene direction is the useful label here: it is the thing the
        // operator is deciding about, and it will not appear in the real video.
        label: b.source === 'screen_recording' ? 'product screen' : (b.scene || `beat ${i + 1}`),
        seconds: spoken,
        accent,
        footer: i === beats.length - 1 ? 'jobup.dev' : null,
      });

      // ---- one self-contained segment ----------------------------------
      // apad + shortest: the card is a touch longer than the read (it has to
      // finish its text animation), so the audio is padded to the frame rather
      // than the frame being cut to the audio.
      const seg = path.join(work, `seg-${i}.mp4`);
      await run(FFMPEG, ['-y', '-v', 'error',
        '-i', cardFile, '-i', mp3,
        '-filter_complex', '[1:a]adelay=250|250,apad[a]',
        '-map', '0:v', '-map', '[a]', '-shortest',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        seg], { maxBuffer: 1 << 26, timeout: 120000 });
      segments.push(seg);
    }

    set(brief.id, { pct: 92, note: 'assembling' });
    const listFile = path.join(work, 'list.txt');
    fs.writeFileSync(listFile, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));

    const outDir = libraryDir || os.tmpdir();
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, `preview-${brief.id}.mp4`);
    await run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c', 'copy', '-movflags', '+faststart', out], { maxBuffer: 1 << 26, timeout: 120000 });

    const total = await seconds(out);
    // The length the operator is really buying. A 30-second target that reads
    // as 47 seconds is the single most common thing wrong with a spec, and it
    // is invisible until something says it out loud.
    const target = Number(spec.targetSeconds) || null;
    set(brief.id, {
      target_seconds: target,
      over_target: target ? Math.round((total - target) * 10) / 10 : null,
    });
    return { file: out, seconds: Math.round(total * 10) / 10 };
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { start, progress, available, VOICES, MIN_BEAT, MAX_BEAT };
