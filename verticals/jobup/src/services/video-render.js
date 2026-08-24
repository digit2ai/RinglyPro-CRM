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
const store = require('./video-store');

const PLATFORM_TENANT = parseInt(process.env.JOBUP_PLATFORM_TENANT_ID || '0', 10);
const CONFIGURED_DIR = (process.env.JOBUP_VIDEO_DIR || '').trim() || null;
const TMP_LIBRARY = path.join(os.tmpdir(), 'jobup-videos');
// The library actually written to. It starts at the configured path and is
// re-resolved by libraryState() — a JOBUP_VIDEO_DIR pointing at a disk that was
// never mounted falls back to temp rather than taking the console down with it.
let LIBRARY_DIR = CONFIGURED_DIR || TMP_LIBRARY;
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

/**
 * The two engines, side by side. Neither replaces the other: Runway is cheap
 * motion on a locked character, Veo is the only one that can put SOUND in a
 * clip — which is what a talking head needs.
 *
 * Every figure below was measured against the live APIs, not read off a page.
 */
const ENGINES = {
  runway: {
    id: 'runway',
    label: 'Runway + OpenAI',
    note: 'Cheapest motion. No audio in the clips — the voiceover is added separately.',
    clipSeconds: 5,
    generationSeconds: [5, 10],
    costPerVideoSecond: 0.05,      // measured: 25 credits per 5s clip
    costPerImage: 0.0634,          // measured: 1,584 output tokens at quality medium
    clipAudio: false,
  },
  veo: {
    id: 'veo',
    label: 'Veo + Nano Banana',
    note: 'Clips come back WITH audio, and it can lip-sync. Roughly 3x the cost per second.',
    clipSeconds: 8,
    generationSeconds: [8],        // measured: Veo returns 8s clips, not 5 or 10
    // NOT YET CONFIRMED against a bill. The published rate for veo-3.1-fast is
    // the basis; the API returns no cost and Google's billing lags by hours.
    costPerVideoSecond: parseFloat(process.env.JOBUP_VEO_COST_PER_SECOND || '0.15'),
    costPerImage: 0.039,           // measured: 1,290 image output tokens
    clipAudio: true,
    costUnverified: true,
  },
};

/** Which credentials a given engine still needs. */
function engineMissing(eng, c) {
  const out = [];
  if (eng.id === 'veo') {
    if (!c.geminiKey) out.push('GEMINI_API_KEY');
  } else {
    if (!c.imageKey) out.push('IMAGE_API_KEY');
    if (!c.videoKey) out.push('VIDEO_API_KEY');
  }
  // Every engine needs a voiceover; the clips carry no narration either way.
  if (!c.fishKey) out.push('FISH_API_KEY');
  return out;
}

function engineFor(spec) {
  const id = String((spec && spec.engine) || process.env.JOBUP_VIDEO_ENGINE || 'runway').toLowerCase();
  return ENGINES[id] || ENGINES.runway;
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
    geminiKey: process.env.GEMINI_API_KEY,
    geminiImageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
    veoModel: process.env.VEO_MODEL || 'veo-3.1-fast-generate-preview',
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

  return Object.assign(
    {
      ready: missing.length === 0, missing, max_cost_usd: MAX_COST_USD,
      engines: Object.values(ENGINES).map((e) => ({
        id: e.id, label: e.label, note: e.note,
        clip_seconds: e.clipSeconds, clip_audio: e.clipAudio,
        cost_per_video_second: e.costPerVideoSecond,
        cost_unverified: !!e.costUnverified,
        // Each engine names ITS OWN missing keys. Reporting "unavailable" with
        // an empty list tells the operator nothing they can act on.
        available: engineMissing(e, c).length === 0,
        missing: engineMissing(e, c),
      })),
    },
    libraryState()
  );
}

/** Create the directory and prove a file can actually be written into it. */
function probeDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return null;
  } catch (e) {
    return e;
  }
}

/**
 * Whether finished videos will actually still be there tomorrow.
 *
 * The default library lives under the system temp dir, which on Render is wiped
 * by every deploy and restart. The DB row survives, so the video keeps showing
 * in the console while the file underneath is gone — a rendered video that
 * quietly stops existing is worth saying out loud, not discovering on download.
 */
function libraryState() {
  const tmp = os.tmpdir();
  const durable = store.state();
  let dir = CONFIGURED_DIR || TMP_LIBRARY;
  let fallbackFrom = null;
  let fallbackError = null;

  let e = probeDir(dir);
  if (e && CONFIGURED_DIR) {
    // The overwhelmingly common cause is JOBUP_VIDEO_DIR pointing at a Render
    // disk mount path (/var/data/...) on a service that has no disk attached.
    // Refusing every render for that is worse than rendering to temp and saying
    // so — the operator can still get the video out today, and the banner tells
    // them exactly what to fix to keep tomorrow's.
    fallbackFrom = CONFIGURED_DIR;
    fallbackError = e.message; // already carries the errno code
    dir = TMP_LIBRARY;
    e = probeDir(dir);
  }

  LIBRARY_DIR = dir;
  const writable = !e;
  const persistent = writable && !dir.startsWith(tmp);

  let note = null;
  if (!writable) {
    note = `cannot write to ${dir} — renders will fail at the last step`;
  } else if (fallbackFrom) {
    // What to DO about it depends entirely on whether a durable copy exists.
    // Telling an operator with S3 on that their videos are lost is false, and
    // recommending a Render disk contradicts why the S3 path was built: a disk
    // pins this whole service to one instance.
    note = `${fallbackFrom} cannot be written to (${fallbackError}). `
      + `Videos are being written to ${dir} instead. `
      + (durable.durable
        ? `The durable copy still goes to S3 (${durable.bucket}), so nothing is lost — `
          + 'unset JOBUP_VIDEO_DIR to clear this warning.'
        : 'They are lost on every deploy or restart. Unset JOBUP_VIDEO_DIR and set '
          + durable.missing.join(' + ') + ' to keep them in S3.');
  } else if (!persistent && !durable.durable) {
    // Only a warning when there is NO durable copy anywhere. With S3 on, a
    // temp render directory is a cache, not a risk, and saying otherwise
    // trains the operator to ignore the banner.
    note = 'videos are on ephemeral storage and are lost on every deploy or restart. '
      + 'Set ' + durable.missing.join(' + ') + ' to keep them in S3 '
      + '(cheaper than a Render disk, and it does not pin this service to one instance).';
  }

  return {
    library_dir: dir,
    library_writable: writable,
    library_persistent: persistent,
    // Only a library that cannot be written to AT ALL is an error. A fallback
    // is a working library with a warning, and conflating the two would have the
    // console shouting 'not writable' at a host that is rendering fine.
    library_error: writable ? null : (e && e.message) || null,
    library_configured: CONFIGURED_DIR,
    // The local directory is a cache when this is on: the copy that survives a
    // deploy is the object in S3.
    storage_backend: durable.backend,
    storage_durable: durable.durable,
    storage_bucket: durable.bucket,
    storage_missing: durable.missing,
    library_fallback_from: fallbackFrom,
    library_fallback_error: fallbackError,
    library_note: note,
  };
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

  const eng = engineFor(spec);
  const plan = p.script.planShots({
    beats, targetSeconds: spec.targetSeconds || 30,
    clipSeconds: eng.clipSeconds, generationSeconds: eng.generationSeconds,
  });
  // No character beat means no character sheet — the price the operator signs
  // off on has to say so, not just the render.
  const cfg = Object.assign({}, p.runner.DEFAULTS, {
    ttsCostPerMillion: 15,
    costPerVideoSecond: eng.costPerVideoSecond,
    costPerImage: eng.costPerImage,
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
    engine: eng.id,
    engine_label: eng.label,
    clip_audio: eng.clipAudio,
    cost_unverified: !!eng.costUnverified,
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
  const eng = engineFor(brief.spec);
  const r = readiness();
  const chosen = (r.engines || []).find((e) => e.id === eng.id);
  if (chosen && !chosen.available) {
    return { started: false, reason: `${eng.label} needs ${chosen.missing.join(', ')}` };
  }
  if (!r.library_writable) {
    return { started: false, reason: r.library_note || `cannot write to ${r.library_dir}` };
  }

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
  // EVERY failure path must mark the brief, including the setup below.
  //
  // mkdtemp and the library mkdir used to sit OUTSIDE the try. When the library
  // directory could not be created — a mis-set JOBUP_VIDEO_DIR, a disk mounted
  // somewhere else, a permissions problem — the job threw before anything had
  // marked it, the rejection was swallowed by the caller's handler, and the
  // brief sat on "starting" forever with no error anywhere.
  try {
    return await runInner(models, brief, est);
  } catch (e) {
    console.error('[video-render] brief', brief.id, 'failed:', e.message);
    mark(models, brief.id, { status: 'failed', step: 'failed', pct: 100, reason: reasonOf(e) });
    throw e;
  }
}

async function runInner(models, brief, est) {
  const p = pipeline();
  const c = creds();
  const spec = brief.spec;

  mark(models, brief.id, { step: 'preparing', pct: 2, note: 'opening the video library' });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `jobup-vid-${brief.id}-`));
  // Re-resolve rather than trusting the module variable: this also applies the
  // temp fallback when a configured JOBUP_VIDEO_DIR is unreachable.
  const lib = libraryState();
  try {
    if (!lib.library_writable) throw new Error(lib.library_error || 'not writable');
    fs.accessSync(LIBRARY_DIR, fs.constants.W_OK);
  } catch (e) {
    throw Object.assign(
      new Error(`the video library at ${LIBRARY_DIR} is not writable (${e.code || e.message}). `
        + 'Check the Render disk mount path and JOBUP_VIDEO_DIR.'),
      { code: 'library_unwritable' }
    );
  }

  const filename = `jobup-${brief.id}-${Date.now()}.mp4`;
  const outPath = path.join(LIBRARY_DIR, filename);
  let keepWork = false;

  try {
    const eng = engineFor(spec);
    const tts = p.providers.fishAudio({ http: p.http, apiKey: c.fishKey, voiceId: c.fishVoice });

    // The two engines are picked here and NOWHERE ELSE — everything downstream
    // (planner, continuity lock, captions, assembly, ledger) is identical.
    const images = eng.id === 'veo'
      ? p.providers.geminiImage({ http: p.http, apiKey: c.geminiKey, model: c.geminiImageModel })
      : p.providers.imageProvider({
        http: p.http, apiKey: c.imageKey, endpoint: c.imageEndpoint, model: c.imageModel,
      });
    const video = eng.id === 'veo'
      ? p.providers.veoVideo({ http: p.http, apiKey: c.geminiKey, model: c.veoModel })
      : p.providers.runwayVideo({
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
        clipSeconds: eng.clipSeconds,
        generationSeconds: eng.generationSeconds,
        costPerVideoSecond: eng.costPerVideoSecond,
        costPerImage: eng.costPerImage,
        // A sheet made by one engine is not the other's character, so they are
        // kept apart — otherwise switching engines would silently reuse frames
        // the new model never made.
        sheetDir: path.join(LIBRARY_DIR, 'character-sheets', eng.id),
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

    // Durable copy BEFORE the row exists, so what the row claims about storage
    // is what actually happened. A failed upload keeps the render — the file is
    // on local disk either way — and is recorded as 'local', never as kept.
    let kept = { storage: 'local', bucket: null, object_key: null, error: null };
    if (store.configured()) {
      mark(models, brief.id, { step: 'storing', pct: 96, note: 'copying to the video library' });
      kept = await store.keep(result.path, filename);
      if (kept.error) {
        mark(models, brief.id, { step: 'storing', pct: 96, note: 'kept on local disk only: ' + kept.error });
      }
    }

    const row = await models.videos.create({
      tenant_id: PLATFORM_TENANT,
      brief_id: brief.id,
      title: spec.title || brief.title || 'Untitled video',
      filename, path: result.path,
      storage: kept.storage, bucket: kept.bucket, object_key: kept.object_key,
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
  estimate, start, progress, readiness, libraryState, toBeats, selfTest, reasonOf, recoverInterrupted,
  ENGINES, engineFor,
  PLATFORM_TENANT, LIBRARY_DIR, MAX_COST_USD,
};
