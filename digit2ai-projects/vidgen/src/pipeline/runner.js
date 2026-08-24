'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { planShots, assertGeneratable } = require('./script');
const { assemble, probe } = require('./assemble');

async function audioDuration(file) {
  let info;
  try {
    info = await probe(file);
  } catch (e) {
    // ffprobe exits non-zero on a truncated or empty file. That is the same
    // condition as an unmeasurable read, not a crash.
    throw Object.assign(new Error(`voiceover is unreadable: ${String(e.message).split('\n')[0]}`),
      { code: 'vo_unmeasurable', terminal: true });
  }
  const d = parseFloat(info.format && info.format.duration);
  if (!isFinite(d) || d <= 0) {
    throw Object.assign(new Error('could not measure the voiceover'),
      { code: 'vo_unmeasurable', terminal: true });
  }
  return Math.round(d * 100) / 100;
}

/**
 * Video pipeline runner.
 *
 * Two things this enforces that a naive "prompt N clips and stitch them"
 * script does not:
 *
 *   1. CONTINUITY LOCK — every generated shot animates a frame from one
 *      character sheet produced once at the start. No shot is ever generated
 *      from a bare text prompt. This is the difference between the RYZE ad
 *      and forty clips of forty different women.
 *
 *   2. BUDGET GUARD — cost is estimated before the first API call and
 *      enforced during. A 60-second video is ~40 generations; without a
 *      ceiling one bad run can cost more than a month of a user's plan.
 */

const DEFAULTS = {
  targetSeconds: 60,
  maxCostUsd: 4.00,
  // VIDEO IS BILLED BY THE SECOND GENERATED, NOT BY THE SHOT. Runway
  // gen4_turbo is 5 credits/s at $0.01/credit, and it only produces 5s or 10s
  // clips — so a 1.5s shot costs the same as a 5s one. Pricing per shot hid
  // that entirely and under-estimated a render by ~3x.
  costPerVideoSecond: 0.05,
  // MEASURED, not from docs: a live gpt-image-1 probe on 2026-08-22 reported
  // usage.output_tokens = 1584 for one 1024x1536 frame at quality 'medium',
  // which is $0.0634 at the published $40/1M image-output-token rate. The
  // previous 0.04 was a guess, and the default quality ('high', 6240 tokens,
  // $0.2496) made it a 6x under-estimate. Image tokens depend only on size and
  // quality tier, so this holds for any prompt.
  costPerImage: 0.0634,
  clipSeconds: 5,
  generationSeconds: [5, 10],
  angles: ['front three-quarter view', 'side profile', 'close-up on face', 'medium wide shot']
};

function estimateCost(plan, cfg) {
  // imageCount is 0 when a saved character sheet is being reused: the budget
  // should reflect what this run will actually buy.
  // 0 when a saved sheet is reused, or when no beat needs a character at all.
  const imageCount = cfg.imageCount != null ? cfg.imageCount : cfg.angles.length;
  const images = imageCount * cfg.costPerImage;
  const video = plan.billedVideoSeconds * cfg.costPerVideoSecond;
  const ttsChars = plan.voiceoverText.length;
  const tts = (ttsChars / 1e6) * (cfg.ttsCostPerMillion || 15);
  return {
    images: round(images),
    video: round(video),
    tts: round(tts),
    total: round(images + video + tts),
    generations: imageCount + plan.generatedShots,
    billedVideoSeconds: plan.billedVideoSeconds
  };
}
const round = n => Math.round(n * 100) / 100;

/**
 * The character sheet is a saved asset, not a cache.
 *
 * gpt-image-1 offers no seed (verified live), so regenerating does not
 * reproduce the character — it invents a new one. A re-render that quietly
 * bought a fresh sheet would therefore ship a DIFFERENT PERSON in the same ad,
 * having charged for the privilege. Keyed on the character's identity, so
 * editing the description is what mints a new sheet.
 */
function sheetPathFor(spec, cfg, outPath) {
  if (cfg.characterSheetPath) return cfg.characterSheetPath;
  const id = crypto.createHash('sha256').update(JSON.stringify({
    description: spec.character.description,
    styleTokens: spec.character.styleTokens,
    angles: cfg.angles
  })).digest('hex').slice(0, 12);
  const dir = cfg.sheetDir || path.dirname(outPath);
  return path.join(dir, `character-sheet-${id}.json`);
}

function loadSheet(file) {
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const frames = Array.isArray(doc) ? doc : doc.frames;
    if (!Array.isArray(frames) || !frames.length) return null;
    // A saved frame is only usable if a video model can actually FETCH it.
    // The stub demo persists `locked://character/...` placeholders, and
    // handing one of those to Runway is a paid 400 — or worse, a sheet that
    // looks cached so the real one is never generated.
    const usable = (u) => /^(data:image\/|https?:\/\/)/i.test(u);
    if (!frames.every((f) => f && typeof f.angle === 'string' &&
      typeof f.url === 'string' && usable(f.url))) return null;
    return frames;
  } catch (_) {
    // Absent or unreadable is not an error: it just means generate one.
    return null;
  }
}

function saveSheet(file, frames, spec, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    savedAt: new Date().toISOString(),
    reproducible: false,
    note: 'gpt-image-1 accepts no seed. Deleting this file loses the character permanently.',
    character: { description: spec.character.description, styleTokens: spec.character.styleTokens },
    angles: cfg.angles,
    frames
  }, null, 2));
}

async function render(spec, deps) {
  const cfg = Object.assign({}, DEFAULTS, spec.config || {});
  const { tts, images, video, download, logger, workDir, outPath } = deps;

  const plan = planShots({
    beats: spec.beats,
    targetSeconds: cfg.targetSeconds,
    wordsPerLine: cfg.wordsPerLine,
    clipSeconds: cfg.clipSeconds,
    generationSeconds: cfg.generationSeconds
  });

  // Before the budget, before the voiceover, before anything is paid for.
  assertGeneratable(plan, cfg.generationSeconds);

  // Resolved before the estimate so the budget knows whether images are
  // actually going to be bought on this run.
  const sheetPath = sheetPathFor(spec, cfg, outPath);
  const savedSheet = cfg.reuseCharacterSheet === false ? null : loadSheet(sheetPath);

  const anyGenerated = plan.shots.some((sh) => sh.source !== 'screen_recording');
  const estimate = estimateCost(plan, Object.assign({}, cfg, {
    ttsCostPerMillion: (tts && tts.costPerMillionChars) || 15,
    imageCount: (savedSheet || !anyGenerated) ? 0 : cfg.angles.length
  }));

  if (estimate.total > cfg.maxCostUsd) {
    throw Object.assign(
      new Error(
        `estimated $${estimate.total} over the $${cfg.maxCostUsd} ceiling ` +
        `(${estimate.generations} generations). Shorten the script or raise maxCostUsd.`
      ),
      { code: 'budget_exceeded', estimate, terminal: true }
    );
  }

  fs.mkdirSync(workDir, { recursive: true });

  // 1 — the voiceover comes FIRST and sets the timeline.
  //
  // Planning from a words-per-second estimate and then muxing real audio
  // means the two disagree, and whichever is shorter silently truncates the
  // other. The read is the spine of the edit, so measure it and cut to it.
  const voPath = path.join(workDir, 'vo.mp3');
  const spoken = await tts.speak(plan.voiceoverText);
  fs.writeFileSync(voPath, spoken.audio);

  const voSeconds = await audioDuration(voPath);
  const timed = planShots({
    beats: spec.beats,
    targetSeconds: voSeconds,
    wordsPerLine: cfg.wordsPerLine,
    clipSeconds: cfg.clipSeconds,
    generationSeconds: cfg.generationSeconds
  });
  // The re-plan against the measured read is a different plan, so it gets the
  // same check — still before the character sheet, the first paid call here.
  assertGeneratable(timed, cfg.generationSeconds);
  if (logger) logger.info({ voSeconds, replannedShots: timed.shots.length });

  // 2 — the continuity lock, generated exactly once, then kept.
  //
  // Unless nothing needs it: a product tour is every beat a supplied screen,
  // and buying a character sheet for a video with no character on it is pure
  // waste. This is not hypothetical — a live run paid for one and then failed.
  const needsCharacter = timed.shots.some((sh) => sh.source !== 'screen_recording');
  let sheet = savedSheet;
  if (!needsCharacter) {
    sheet = [];
    if (logger) logger.info({ characterSheet: 'skipped', reason: 'no character beats' });
  } else if (sheet) {
    if (logger) logger.info({ characterSheet: 'reused', path: sheetPath, frames: sheet.length });
  } else {
    sheet = await images.characterSheet({
      description: spec.character.description,
      styleTokens: spec.character.styleTokens,
      angles: cfg.angles
    });
    if (!sheet.length) {
      throw Object.assign(new Error('character sheet came back empty'), { code: 'no_character' });
    }
    // Written before a single clip is generated: the sheet is the expensive,
    // unrepeatable part, and a crash mid-render must not cost the character.
    saveSheet(sheetPath, sheet, spec, cfg);
    if (logger) logger.info({ characterSheet: 'generated', path: sheetPath, frames: sheet.length });
  }

  // What the providers SAY they charged, as opposed to what the rate card
  // predicted. `actualSpend` below is still derived from rates; this is
  // measured, and the two are worth comparing after a run.
  const ledger = {
    imageTokens: savedSheet ? 0 : sheet.reduce((n, f) => n + (f.outputTokens || 0), 0),
    imagesGenerated: savedSheet ? 0 : sheet.length,
    videoCredits: 0,
    clips: []
  };

  // 3 — one clip per shot, each animating a locked frame.
  const clips = [];
  let spent = (savedSheet || !anyGenerated) ? 0 : estimate.images;
  for (const shot of timed.shots) {
    if (shot.source === 'screen_recording') {
      const asset = spec.screenRecordings && spec.screenRecordings[shot.scene];
      if (!asset) {
        throw Object.assign(
          new Error(`shot ${shot.index} wants screen recording "${shot.scene}" and none was supplied`),
          { code: 'missing_screen_recording' }
        );
      }
      clips.push({ path: asset, seconds: shot.seconds });
      continue;   // costs nothing — this is why UI beats belong here
    }

    const shotCost = shot.generateSeconds * cfg.costPerVideoSecond;
    if (spent + shotCost > cfg.maxCostUsd) {
      throw Object.assign(
        new Error(`budget exhausted at shot ${shot.index} of ${timed.shots.length}`),
        { code: 'budget_exceeded_midrun', spent: round(spent) }
      );
    }

    const ref = pickAngle(sheet, shot);
    // Ask for the QUANTUM, cut to the EDIT length. These differ by design:
    // the model bills 5s whether the edit uses 5s of it or 3.
    const out = await video.animate({
      referenceImageUrl: ref.url,
      motionPrompt: motionFor(shot, spec),
      seconds: shot.generateSeconds
    });
    const local = path.join(workDir, `shot${String(shot.index).padStart(3, '0')}.mp4`);
    await download(out.url, local);
    clips.push({ path: local, seconds: shot.seconds });
    spent += shotCost;
    if (out.credits != null) ledger.videoCredits += out.credits;
    ledger.clips.push({
      shot: shot.index, taskId: out.taskId || null, credits: out.credits != null ? out.credits : null,
      generatedSeconds: shot.generateSeconds, usedSeconds: shot.seconds
    });
    if (logger) logger.info({ shot: shot.index, angle: ref.angle, spent: round(spent) });
  }

  // 4 — assembly. Video and audio now agree on length by construction.
  const final = await assemble({
    clips,
    cues: timed.captionCues,
    voiceover: voPath,
    music: spec.musicPath || null,
    logo: spec.logoPath || null,
    outPath,
    workDir: path.join(workDir, 'assembly'),
    style: spec.captionStyle
  });

  return {
    path: final,
    plan: timed,
    estimate,
    actualSpend: round(spent + estimate.tts),
    voSeconds,
    shots: timed.shots.length,
    generatedShots: timed.generatedShots,
    billedVideoSeconds: timed.billedVideoSeconds,
    captionCues: timed.captionCues.length,
    characterSheetPath: sheetPath,
    characterSheetReused: !!savedSheet,
    ledger,
    seconds: timed.totalSeconds,
    meetsTarget: timed.meetsTarget,
    shortfallSeconds: timed.shortfallSeconds
  };
}

/** Close-up emotions get the close-up reference; wide beats get the wide one. */
function pickAngle(sheet, shot) {
  // An explicitly named frame always wins. Keyword-matching the framing is a
  // heuristic for a generated sheet; when the operator names the still, guessing
  // is not just unnecessary, it is wrong.
  if (shot.image) {
    const named = sheet.find((f) => f.angle === shot.image);
    if (named) return named;
  }
  const wants = /close|tight|face|eyes/i.test(shot.scene || '') ? 'close-up'
    : /wide|room|full/i.test(shot.scene || '') ? 'medium wide'
    : 'three-quarter';
  return sheet.find(f => f.angle.includes(wants)) || sheet[shot.index % sheet.length];
}

/**
 * The motion prompt describes WHAT THE BODY DOES, and nothing else.
 *
 * Two things were in here that hurt more than they helped, both established by
 * the reference frame rather than by words:
 *
 *   LIGHTING — a live 5s generation ignored "morning light" entirely and kept
 *   the reference frame's warm amber. The frame wins, so asking is noise at
 *   best and fights the sheet at worst. Lighting belongs in the CHARACTER
 *   SHEET prompt, which is where it actually takes.
 *
 *   STYLE — same story: styleTokens are already baked into the frame being
 *   animated. Repeating them spends prompt on what the image already says.
 *
 * And scene descriptions are not poses. "phone in hand" came back as a phone
 * pressed to her ear, because the model was told a SETTING and left to invent
 * the body. `pose` states the body position literally; `scene` stays behind as
 * framing for angle selection.
 */
function motionFor(shot, spec) {
  return [
    shot.pose || shot.scene,
    `${shot.emotion} expression`,
    shot.camera || 'subtle camera movement'
  ].filter(Boolean).join(', ');
}

module.exports = {
  render, estimateCost, pickAngle, motionFor, DEFAULTS,
  // Exported so tooling can pre-generate or inspect a character sheet without
  // driving a whole render.
  sheetPathFor, loadSheet, saveSheet
};
