'use strict';

// =============================================================
// VIDEO RENDER — runs an approved spec through the vidgen pipeline.
//
// NEVER IN THE REQUEST. A render is 2-4 minutes of model calls and ffmpeg, and
// this app sits behind Cloudflare's ~100s ceiling: a synchronous render would
// 524 in the operator's face while the backend carried on spending money. The
// route starts a job and returns; the console polls.
//
// NOTHING HERE RUNS WITHOUT AN APPROVED BRIEF. Approval is a status transition
// a human performs after reading the spec, and `start()` refuses any brief that
// is not in it. That is the difference between a tool and a way to spend $3 by
// mis-clicking.
//
// The binaries come from the root app's own ffmpeg (@ffmpeg-installer, which
// carries libass — checked, not assumed), injected via the env vars vidgen
// already honours, so this works on Render with no extra binary.
// =============================================================

const fs = require('fs');
const os = require('os');
const path = require('path');

const cards = require('./video-cards');

const PLATFORM_TENANT = parseInt(process.env.JOBUP_PLATFORM_TENANT_ID || '0', 10);
const LIBRARY_DIR = process.env.JOBUP_VIDEO_DIR || path.join(os.tmpdir(), 'jobup-videos');
// The specific name wins; MAX_COST_USD is accepted because that is what
// vidgen's own .env.example calls it, and a ceiling that is silently ignored
// is worse than no ceiling.
const MAX_COST_USD = parseFloat(
  process.env.JOBUP_VIDEO_MAX_COST_USD || process.env.MAX_COST_USD || '4.00'
);
const VIDGEN = path.join(__dirname, '..', '..', '..', '..', 'digit2ai-projects', 'vidgen');

/** Point vidgen at the root app's binaries before it resolves its own. */
function bindBinaries() {
  if (!process.env.FFMPEG_PATH) {
    try { process.env.FFMPEG_PATH = require('@ffmpeg-installer/ffmpeg').path; } catch (_) {}
  }
  if (!process.env.FFPROBE_PATH) {
    try { process.env.FFPROBE_PATH = require('@ffprobe-installer/ffprobe').path; } catch (_) {}
  }
}

let pipelineCache;
/**
 * Resolve the pipeline, or say plainly that it is not here. A missing pipeline
 * is a deployment fact, not a crash: the console still composes and reviews
 * briefs, it just cannot render them.
 */
function pipeline() {
  if (pipelineCache !== undefined) return pipelineCache;
  bindBinaries();
  try {
    pipelineCache = {
      runner: require(path.join(VIDGEN, 'src', 'pipeline', 'runner')),
      script: require(path.join(VIDGEN, 'src', 'pipeline', 'script')),
      providers: require(path.join(VIDGEN, 'src', 'providers')),
      http: require(path.join(VIDGEN, 'src', 'http')),
      score: require(path.join(VIDGEN, 'demo', 'score')),
      probe: require(path.join(VIDGEN, 'src', 'pipeline', 'assemble')).probe,
      assemble: require(path.join(VIDGEN, 'src', 'pipeline', 'assemble')).assemble,
    };
  } catch (e) {
    pipelineCache = null;
    console.warn('[video-render] pipeline unavailable:', e.message);
  }
  return pipelineCache;
}

function creds() {
  return {
    fishKey: process.env.FISH_API_KEY, fishVoice: process.env.FISH_VOICE_ID,
    imageKey: process.env.IMAGE_API_KEY,
    imageEndpoint: process.env.IMAGE_ENDPOINT || 'https://api.openai.com/v1/images/generations',
    imageModel: process.env.IMAGE_MODEL || 'gpt-image-1',
    videoKey: process.env.VIDEO_API_KEY,
    videoEndpoint: process.env.VIDEO_ENDPOINT || 'https://api.dev.runwayml.com/v1/image_to_video',
    videoModel: process.env.VIDEO_MODEL || 'gen4_turbo',
  };
}

/** What is missing before a render could possibly work. */
function readiness() {
  const p = pipeline();
  const c = creds();
  const missing = [];
  if (!p) missing.push('render pipeline not installed on this host');
  if (!c.fishKey) missing.push('FISH_API_KEY (voiceover)');
  if (!c.imageKey) missing.push('IMAGE_API_KEY (character sheet)');
  if (!c.videoKey) missing.push('VIDEO_API_KEY (clips)');
  return { ready: missing.length === 0, missing, library_dir: LIBRARY_DIR, max_cost_usd: MAX_COST_USD };
}

/** Spec -> the beats array vidgen's planner expects. */
function toBeats(spec) {
  return (spec.beats || []).map((b) => {
    const beat = { text: b.text, scene: b.scene || 'three-quarter view' };
    if (b.source === 'screen_recording') beat.source = 'screen_recording';
    else {
      beat.emotion = b.emotion || 'neutral';
      if (b.pose) beat.pose = b.pose;
    }
    return beat;
  });
}

/**
 * Plan and price WITHOUT spending anything. This is what the operator signs
 * off on, so it has to be the same planner the render uses — not a second
 * estimate that can drift from it.
 */
function estimate(spec) {
  const p = pipeline();
  if (!p) return { available: false, reason: 'render pipeline not installed on this host' };

  const beats = toBeats(spec);
  if (!beats.length) return { available: false, reason: 'the spec has no beats' };

  const plan = p.script.planShots({ beats, targetSeconds: spec.targetSeconds || 30 });
  // No character beat means no character sheet — the price the operator signs
  // off on has to say so, not just the render.
  const cfg = Object.assign({}, p.runner.DEFAULTS, {
    ttsCostPerMillion: 15,
    imageCount: plan.generatedShots > 0 ? p.runner.DEFAULTS.angles.length : 0,
  });
  const cost = p.runner.estimateCost(plan, cfg);
  const missingPoses = (spec.beats || [])
    .map((b, i) => ({ i, b })).filter((x) => x.b.source !== 'screen_recording' && !x.b.pose).map((x) => x.i);

  // A product beat is SUPPLIED footage. Without a file — or a card to stand in
  // for one — the render reaches that beat and dies, having already paid for
  // the character sheet. That has to surface here, before approval.
  const productBeats = (spec.beats || []).filter((b) => b.source === 'screen_recording').length;
  const screensSupplied = Object.keys((spec.screenRecordings || {})).length;
  const cardsOk = cards.available();

  return {
    available: true,
    seconds: plan.totalSeconds,
    clips: plan.shots.length,
    generated_clips: plan.generatedShots,
    screen_clips: plan.shots.length - plan.generatedShots,
    caption_cues: plan.captionCues.length,
    billed_video_seconds: plan.billedVideoSeconds,
    words: plan.wordCount,
    meets_target: plan.meetsTarget,
    shortfall_seconds: plan.shortfallSeconds,
    cost,
    over_ceiling: cost.total > MAX_COST_USD,
    max_cost_usd: MAX_COST_USD,
    // A generated beat with no pose animates a setting, not a body — which is
    // how "phone in hand" became a phone pressed to an ear.
    beats_missing_pose: missingPoses,
    product_beats: productBeats,
    screens_supplied: screensSupplied,
    // Cards stand in for un-supplied product screens; if they cannot be made
    // this plan is unrenderable and must not be approvable.
    product_screens_ready: productBeats === 0 || screensSupplied > 0 || cardsOk,
    product_screens_are_cards: productBeats > 0 && screensSupplied === 0 && cardsOk,
  };
}

// ---- the job ---------------------------------------------------------------

const jobs = new Map();          // brief_id -> {status, step, pct, note}

function mark(models, id, patch) {
  jobs.set(id, Object.assign({}, jobs.get(id), patch));
  const row = { progress: jobs.get(id), updated_at: new Date() };
  if (patch.status) row.status = patch.status;
  if (patch.reason !== undefined) row.status_reason = patch.reason;
  models.video_briefs.update(row, { where: { id } }).catch(() => {});
}

/**
 * Start a render for an APPROVED brief. Returns immediately.
 * @returns {started:boolean, reason?:string}
 */
function start(models, brief, { onDone } = {}) {
  if (brief.status !== 'approved') {
    return { started: false, reason: `brief is ${brief.status}, not approved` };
  }
  if (jobs.get(brief.id) && jobs.get(brief.id).status === 'rendering') {
    return { started: false, reason: 'already rendering' };
  }
  const r = readiness();
  if (!r.ready) return { started: false, reason: r.missing.join('; ') };

  const est = estimate(brief.spec);
  if (!est.available) return { started: false, reason: est.reason };
  if (est.over_ceiling) {
    return { started: false, reason: `estimated $${est.cost.total} is over the $${MAX_COST_USD} ceiling` };
  }
  if (!est.product_screens_ready) {
    return { started: false, reason: `${est.product_beats} product beat(s) have no screen recording and cards cannot be rendered on this host` };
  }

  mark(models, brief.id, { status: 'rendering', step: 'starting', pct: 1, note: null, reason: null });
  setImmediate(() => run(models, brief, est).then(
    (v) => { if (onDone) onDone(null, v); },
    (e) => { if (onDone) onDone(e); }
  ));
  return { started: true, estimate: est };
}

async function run(models, brief, est) {
  const p = pipeline();
  const c = creds();
  const spec = brief.spec;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `jobup-vid-${brief.id}-`));
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });

  const filename = `jobup-${brief.id}-${Date.now()}.mp4`;
  const outPath = path.join(LIBRARY_DIR, filename);
  let keepWork = false;

  try {
    const tts = p.providers.fishAudio({ http: p.http, apiKey: c.fishKey, voiceId: c.fishVoice });
    const images = p.providers.imageProvider({
      http: p.http, apiKey: c.imageKey, endpoint: c.imageEndpoint, model: c.imageModel,
    });
    const video = p.providers.runwayVideo({
      http: p.http, apiKey: c.videoKey, endpoint: c.videoEndpoint, model: c.videoModel,
    });

    let done = 0;
    const total = Math.max(1, est.generated_clips);

    const screens = await screensFor(spec, workDir, models, brief.id);

    const result = await p.runner.render({
      beats: toBeats(spec),
      character: spec.character,
      screenRecordings: screens,
      musicPath: musicFor(spec, workDir, p),
      config: {
        targetSeconds: spec.targetSeconds || 30,
        maxCostUsd: MAX_COST_USD,
        sheetDir: path.join(LIBRARY_DIR, 'character-sheets'),
      },
    }, {
      tts, images,
      video: {
        animate: async (a) => {
          mark(models, brief.id, { step: 'clips', pct: 25 + Math.round((done / total) * 60),
            note: `clip ${done + 1} of ${total}` });
          const out = await video.animate(a);
          done++;
          return out;
        },
      },
      download: async (url, dest) => {
        const res = await p.http.get(url, {});
        if (!res.ok || !res.buffer.length) throw new Error(`clip download failed: HTTP ${res.status}`);
        fs.writeFileSync(dest, res.buffer);
      },
      logger: {
        info: (o) => {
          if (o.voSeconds) mark(models, brief.id, { step: 'voiceover', pct: 12, note: `${o.voSeconds}s read` });
          if (o.characterSheet) {
            mark(models, brief.id, {
              step: 'character', pct: 22,
              note: o.characterSheet === 'reused' ? 'reused the saved character' : 'character sheet generated',
            });
          }
        },
      },
      workDir, outPath,
    });

    mark(models, brief.id, { step: 'assembling', pct: 92, note: null });
    const info = await p.probe(result.path);
    const v = (info.streams || []).find((s) => s.codec_type === 'video') || {};
    const stat = fs.statSync(result.path);

    const row = await models.videos.create({
      tenant_id: PLATFORM_TENANT,
      brief_id: brief.id,
      title: spec.title || brief.title || 'Untitled video',
      filename, path: result.path,
      seconds: Math.round((result.seconds || 0) * 100) / 100,
      width: v.width || null, height: v.height || null,
      bytes: stat.size,
      caption: (spec.beats || []).map((b) => b.text).join(' ').slice(0, 2000),
      ledger: Object.assign({}, result.ledger, {
        estimate: result.estimate, actual_spend_usd: result.actualSpend,
        character_sheet_reused: result.characterSheetReused,
      }),
    });

    mark(models, brief.id, { status: 'done', step: 'done', pct: 100, note: null, reason: null });
    return row;
  } catch (e) {
    keepWork = true;
    console.error('[video-render] brief', brief.id, 'failed:', e.message);
    mark(models, brief.id, { status: 'failed', step: 'failed', pct: 100, reason: reasonOf(e) });
    // DO NOT DELETE THE WORK. Reaching clip 8 of 8 and then failing at the mux
    // means every clip was paid for; wiping the directory throws that money
    // away and makes a retry cost full price again.
    console.error('[video-render] artifacts kept at', workDir);
    throw e;
  } finally {
    // Only clean up a run that actually succeeded.
    if (!keepWork) { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {} }
  }
}

/**
 * One clip per distinct product scene: the operator's own file where they
 * supplied one, otherwise a branded card built from that beat's spoken line.
 */
async function screensFor(spec, workDir, models, briefId) {
  const supplied = spec.screenRecordings || {};
  const out = {};
  const beats = (spec.beats || []).filter((b) => b.source === 'screen_recording');
  const longest = Math.max(6, Math.ceil((spec.targetSeconds || 30) / Math.max(1, beats.length)) + 2);

  for (const b of beats) {
    const key = b.scene || 'app interface';
    if (out[key]) continue;
    if (supplied[key]) { out[key] = supplied[key]; continue; }
    const file = path.join(workDir, `screen-${Object.keys(out).length}.mp4`);
    // Report it. Building screens used to sit silently on "starting", which is
    // indistinguishable from a hang.
    if (models && briefId) {
      mark(models, briefId, {
        step: 'screens', pct: 4 + Math.round((Object.keys(out).length / Math.max(1, beats.length)) * 6),
        note: `building screen ${Object.keys(out).length + 1} of ${beats.length}`,
      });
    }
    await cards.card(file, {
      text: b.text,
      label: (spec.title || '').split(/[—-]/)[0].trim().slice(0, 24),
      footer: spec.footer || '',
      seconds: longest,
    });
    out[key] = file;
  }
  return out;
}

/** An original score, written to this cut's shape. Never a licensed track. */
function musicFor(spec, workDir, p) {
  try {
    const seconds = Math.max(8, Math.min(60, spec.targetSeconds || 30));
    const f = path.join(workDir, 'score.wav');
    fs.writeFileSync(f, p.score.score(seconds));
    return f;
  } catch (e) {
    console.warn('[video-render] score generation failed, rendering without music:', e.message);
    return null;
  }
}

/**
 * execFile rejects with a message that is "Command failed: <the entire command>"
 * followed by stderr. The command alone runs past 400 characters, so slicing
 * the message head threw away the only part that explains anything — which is
 * exactly what happened on the first failed mux.
 */
function reasonOf(e) {
  const err = String((e && e.stderr) || '').trim();
  if (err) {
    const lines = err.split('\n').filter(Boolean);
    return lines.slice(-6).join(' | ').slice(0, 900);
  }
  const msg = String((e && e.message) || 'render failed');
  // Drop the echoed command; keep whatever follows it.
  const after = msg.split('\n').slice(1).filter(Boolean).join(' | ');
  return (after || msg.split('\n')[0]).slice(0, 900);
}


/**
 * A render lives in memory. A deploy, a crash or an idle-restart kills it, but
 * the row still says "rendering" — and that status blocks editing, re-running
 * AND deleting, so the brief is wedged forever with no way back.
 *
 * Nothing that was rendering can still be rendering after a boot, by
 * definition. Reclaim them and say why.
 */
async function recoverInterrupted(models) {
  try {
    const stuck = await models.video_briefs.findAll({ where: { status: 'rendering' } });
    if (!stuck.length) return 0;
    await models.video_briefs.update({
      status: 'failed',
      status_reason: 'the server restarted while this was rendering — nothing was lost except the run itself; approve and create again',
      progress: null,
      updated_at: new Date(),
    }, { where: { status: 'rendering' } });
    console.log(`[video-render] reclaimed ${stuck.length} interrupted render(s)`);
    return stuck.length;
  } catch (e) {
    console.warn('[video-render] recovery failed:', e.message);
    return 0;
  }
}

function progress(id) {
  return jobs.get(id) || null;
}

/**
 * Exercise the real assembly path on synthetic inputs, so a host problem is
 * found for free instead of at the end of a paid render.
 *
 * IT CALLS assemble() ITSELF. The first version of this hand-copied the mux
 * command, which meant it kept testing an `amix normalize=0` the assembler had
 * already stopped using — a self-test that passes or fails independently of the
 * code it is meant to be checking is worse than none.
 */
async function selfTest() {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const run = promisify(execFile);
  bindBinaries();
  const p = pipeline();
  const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobup-selftest-'));
  const steps = [];
  const step = async (name, fn) => {
    try { await fn(); steps.push({ name, ok: true }); return true; }
    catch (e) { steps.push({ name, ok: false, error: reasonOf(e) }); return false; }
  };

  try {
    if (!p) {
      steps.push({ name: 'render pipeline', ok: false, error: 'not installed on this host' });
      return { ffmpeg: FFMPEG, font: cards.font(), steps, ok: false };
    }
    const v = path.join(dir, 'v.mp4'), a = path.join(dir, 'a.mp3'), m = path.join(dir, 'm.wav');

    await step('video source', () => run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
      '-i', 'color=c=navy:s=540x960:d=4:r=30', '-c:v', 'libx264', '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p', v]));
    await step('mp3 encode (libmp3lame)', () => run(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
      '-i', 'sine=frequency=300:duration=6', '-c:a', 'libmp3lame', a]));
    await step('score', () => { fs.writeFileSync(m, p.score.score(6)); });
    await step('product card', () => cards.card(path.join(dir, 'card.mp4'), { text: 'self test', seconds: 3 }));

    // The whole assembly, exactly as a render runs it: normalise, concat,
    // burn captions, mix voice under music, mux.
    const cues = [{ start: 0, end: 3, text: 'self test one' }, { start: 3, end: 6, text: 'self test two' }];
    const out = path.join(dir, 'out.mp4');
    const assembled = await step('assemble (captions + voice + music)', () => p.assemble({
      clips: [{ path: v, seconds: 3 }, { path: v, seconds: 3 }],
      cues, voiceover: a, music: m, musicVolume: 0.22,
      outPath: out, workDir: path.join(dir, 'w'),
    }));

    if (assembled) {
      await step('output has video and audio', async () => {
        const info = await p.probe(out);
        const vs = (info.streams || []).find((x) => x.codec_type === 'video');
        const as = (info.streams || []).find((x) => x.codec_type === 'audio');
        if (!vs) throw new Error('no video stream');
        if (!as) throw new Error('no audio stream — the voiceover did not survive the mux');
        if (Math.abs(parseFloat(as.duration) - 6) > 1) {
          throw new Error(`audio is ${as.duration}s against a 6s voiceover`);
        }
      });
    }

    return {
      ffmpeg: FFMPEG, ffprobe: process.env.FFPROBE_PATH || 'ffprobe',
      font: cards.font(), steps, ok: steps.every((x) => x.ok),
    };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  estimate, start, progress, readiness, toBeats, selfTest, reasonOf, recoverInterrupted,
  PLATFORM_TENANT, LIBRARY_DIR, MAX_COST_USD,
};
