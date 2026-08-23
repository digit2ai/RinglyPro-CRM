'use strict';

/**
 * Turns a voiceover script into a timed shot list.
 *
 * TWO LAYERS, DELIBERATELY DECOUPLED.
 *
 *   captionCues — the fast layer. ~4 words, ~1.5s each, one per caption cut.
 *   shots       — the slow layer. One CLIP, one paid generation.
 *
 * They used to be the same thing: one caption line, one shot, one generation.
 * That is wrong against every real image-to-video API, because they bill in
 * fixed quanta. Runway gen4_turbo only produces 5s or 10s clips, so a 1.5s
 * shot is a 5s generation with 3.5s thrown away — 29 shots became 145 billed
 * seconds to fill a 60s video.
 *
 * Now ~12 clips of 5s carry 3-4 caption cues each. The captions cut faster
 * than the camera does, which is also how the reference ad reads: the cut
 * rhythm comes from the edit and the captions, not from re-generating footage.
 */

const WORDS_PER_SECOND = 2.6;     // measured pace for ad-read voiceover
const MIN_SHOT = 1.2;             // below this a caption cut reads as a glitch
const MAX_SHOT = 6.0;             // beyond this, models drift within one clip

/**
 * What the video model is physically able to produce. Runway gen4_turbo
 * offers exactly these two; asking for anything else is a 400, and asking for
 * 10 buys a clip the model drifts through (see MAX_SHOT). Everything defaults
 * to 5.
 */
const GENERATION_SECONDS = [5, 10];
const DEFAULT_CLIP_SECONDS = 5;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Split a script into caption-sized lines. A caption line is what fits
 * comfortably burned across a 9:16 frame — roughly 4 words.
 */
function chunkCaptions(text, wordsPerLine = 4) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(' '));
  }
  return lines;
}

/**
 * Scale durations to hit `target` while keeping every cue inside
 * [MIN_SHOT, MAX_SHOT].
 *
 * ONE PASS OF SCALE-THEN-CLAMP DOES NOT CONVERGE, and the failure is
 * asymmetric: a short trailing line ("floor.") scales below the 1.2s floor and
 * gets clamped back UP, so the total overshoots the target even when the sum
 * of the floors would have fitted. Against a 41.8s read, 34 five-word cues
 * have a 40.8s floor — comfortably inside — yet clamped out to 45.2s, which
 * read as "too many lines" and pushed the autofit to 10-word captions. The
 * captions stopped cutting, which is the one thing they exist to do.
 *
 * So: lock the cues that hit a bound, redistribute the remaining budget across
 * the ones still free, and repeat. Each pass locks at least one cue or stops,
 * so it terminates. If everything ends up locked at the floor and the total
 * still overruns, the script genuinely has too many lines for the read — and
 * THAT is when widening the lines is the right answer.
 */
function fitToTarget(raw, target) {
  const out = raw.slice();
  const locked = new Array(raw.length).fill(false);

  for (let pass = 0; pass < 32; pass++) {
    let lockedTotal = 0;
    let freeRaw = 0;
    for (let i = 0; i < raw.length; i++) {
      if (locked[i]) lockedTotal += out[i];
      else freeRaw += raw[i];
    }
    if (freeRaw <= 0) break;

    const scale = (target - lockedTotal) / freeRaw;
    let newlyLocked = false;
    for (let i = 0; i < raw.length; i++) {
      if (locked[i]) continue;
      const v = raw[i] * scale;
      if (v < MIN_SHOT) { out[i] = MIN_SHOT; locked[i] = true; newlyLocked = true; }
      else if (v > MAX_SHOT) { out[i] = MAX_SHOT; locked[i] = true; newlyLocked = true; }
      else out[i] = v;
    }
    if (!newlyLocked) break;
  }
  return out;
}

function estimateSeconds(line) {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_SHOT, Math.max(MIN_SHOT, words / WORDS_PER_SECOND));
}

/**
 * @param spec.beats  [{ text, scene, emotion }] — narrative beats
 * @param spec.targetSeconds  desired total runtime
 * @param spec.clipSeconds    length of one generation (default 5)
 * @param spec.generationSeconds  lengths the model can produce (default [5,10])
 * @returns { shots, captionCues, totalSeconds, billedVideoSeconds, ... }
 */
function planShots(spec) {
  const { beats, targetSeconds = 60 } = spec;
  if (!Array.isArray(beats) || !beats.length) {
    throw Object.assign(new Error('a script needs at least one beat'), { code: 'empty_script' });
  }

  // Every caption cue has a floor (MIN_SHOT) below which a cut reads as a
  // glitch, so N cues can never be shorter than N * MIN_SHOT. If a short read
  // would overflow, widen the caption lines to produce fewer, longer cues
  // rather than letting the video run past the audio and get truncated.
  if (!spec.wordsPerLine) {
    for (const w of [4, 5, 6, 7, 8, 10, 12]) {
      const trial = layout(beats, targetSeconds, w);
      if (trial.total <= targetSeconds * 1.05) return finish(beats, trial, targetSeconds, w, spec);
    }
    const last = layout(beats, targetSeconds, 12);
    return finish(beats, last, targetSeconds, 12, spec);
  }
  const fixed = layout(beats, targetSeconds, spec.wordsPerLine);
  return finish(beats, fixed, targetSeconds, spec.wordsPerLine, spec);
}

/** Lays the caption cues — the fast layer — across the target runtime. */
function layout(beats, targetSeconds, wordsPerLine) {
  const cues = [];
  for (const beat of beats) {
    const lines = chunkCaptions(beat.text, wordsPerLine);
    for (const line of lines) {
      cues.push({
        index: cues.length,
        caption: line,
        scene: beat.scene,
        // The literal body position for this beat. `scene` stays as framing
        // (it keys the screen-recording lookup and picks the reference angle);
        // `pose` is what the video model is actually told to animate.
        pose: beat.pose || null,
        emotion: beat.emotion || 'neutral',
        source: beat.source || 'generated',   // 'generated' | 'screen_recording'
        seconds: estimateSeconds(line)
      });
    }
  }

  // Scale to hit the target runtime without letting any cue leave the safe band.
  const fitted = fitToTarget(cues.map((c) => c.seconds), targetSeconds);
  let total = 0;
  for (let i = 0; i < cues.length; i++) {
    cues[i].seconds = round2(fitted[i]);
    cues[i].startAt = round2(total);
    total = round2(total + cues[i].seconds);
  }

  return { shots: cues, total };
}

/**
 * Lays the CLIPS — the slow layer — over the same timeline.
 *
 * Clips never straddle a source boundary: half a clip cannot be a screen
 * recording. So the cue list is split into contiguous runs of one source and
 * each run is divided into as few clips as the model's quantum allows.
 *
 * A clip carries two lengths, and conflating them is the bug this exists to
 * prevent:
 *   generateSeconds — what the model is asked for and BILLS for (5 or 10)
 *   seconds         — how much of it lands in the edit (<= generateSeconds)
 */
function planClips(cues, clipSeconds, allowed) {
  const clips = [];
  let i = 0;

  while (i < cues.length) {
    const source = cues[i].source;
    let j = i;
    while (j < cues.length && cues[j].source === source) j++;
    const run = cues.slice(i, j);

    const start = run[0].startAt;
    const end = round2(run[run.length - 1].startAt + run[run.length - 1].seconds);
    const runSeconds = round2(end - start);

    // As few clips as will cover the run, then backed off if that would put a
    // clip under the readable floor.
    let n = Math.max(1, Math.ceil(runSeconds / clipSeconds - 1e-9));
    while (n > 1 && runSeconds / n < MIN_SHOT) n--;

    for (let k = 0; k < n; k++) {
      // Boundaries come from the cumulative position so rounding cannot drift
      // the clips off the end of the run.
      const segStart = round2(start + (runSeconds * k) / n);
      const segEnd = k === n - 1 ? end : round2(start + (runSeconds * (k + 1)) / n);
      const seconds = round2(segEnd - segStart);
      const mid = segStart + seconds / 2;
      const dominant = run.find(c => mid >= c.startAt && mid < c.startAt + c.seconds) || run[0];

      clips.push({
        index: clips.length,
        scene: dominant.scene,
        pose: dominant.pose,
        emotion: dominant.emotion,
        source,
        startAt: segStart,
        seconds,
        // A screen recording is supplied, not generated: it is trimmed to
        // `seconds` and costs nothing.
        generateSeconds: source === 'generated' ? smallestAllowed(seconds, allowed) : null,
        captions: run.filter(c => c.startAt < segEnd && c.startAt + c.seconds > segStart)
          .map(c => c.caption)
      });
    }
    i = j;
  }
  return clips;
}

/** The cheapest quantum that still covers what the edit needs. */
function smallestAllowed(seconds, allowed) {
  const fits = allowed.filter(a => a >= seconds - 1e-9).sort((a, b) => a - b);
  return fits.length ? fits[0] : Math.max(...allowed);
}

function finish(beats, laid, targetSeconds, wordsPerLine, spec) {
  const { shots: cues, total } = laid;
  const clipSeconds = spec.clipSeconds || DEFAULT_CLIP_SECONDS;
  const allowed = spec.generationSeconds || GENERATION_SECONDS;

  const clips = planClips(cues, clipSeconds, allowed);
  const wordCount = beats.reduce((n, b) => n + b.text.trim().split(/\s+/).length, 0);
  const shortfall = round2(targetSeconds - total);
  const generated = clips.filter(c => c.source === 'generated');

  return {
    shots: clips,
    wordsPerLine,
    totalSeconds: total,
    targetSeconds,
    // Every cue is clamped to MAX_SHOT because models drift past it, so a
    // short script physically cannot fill a long runtime. Say so instead of
    // quietly delivering 36 seconds when 60 was asked for.
    meetsTarget: shortfall <= 1.5,
    shortfallSeconds: shortfall > 1.5 ? shortfall : 0,
    wordsNeeded: shortfall > 1.5
      ? Math.ceil(targetSeconds * WORDS_PER_SECOND) - wordCount
      : 0,
    wordCount,
    generatedShots: generated.length,
    // What the provider actually charges for, which is NOT the runtime: a 5s
    // quantum is billed whole even where the edit uses 3s of it.
    billedVideoSeconds: round2(generated.reduce((n, c) => n + c.generateSeconds, 0)),
    clipSeconds,
    captionCues: cues.map(s => ({ start: s.startAt, end: s.startAt + s.seconds, text: s.caption })),
    voiceoverText: beats.map(b => b.text).join(' ')
  };
}

/**
 * Refuse a plan the model cannot produce, BEFORE anything is paid for.
 *
 * A wrong duration is not a soft failure: Runway rejects it outright, and by
 * then the character sheet has been bought and the voiceover synthesized. The
 * second check is subtler and worse — a clip whose edit length exceeds what
 * was generated does not error anywhere, it just freezes on the last frame.
 */
function assertGeneratable(plan, allowed = GENERATION_SECONDS) {
  const generated = plan.shots.filter(s => s.source === 'generated');

  const unsupported = generated.filter(s => !allowed.includes(s.generateSeconds));
  if (unsupported.length) {
    throw Object.assign(
      new Error(
        `${unsupported.length} shot(s) ask for a length the model cannot produce ` +
        `(${[...new Set(unsupported.map(s => s.generateSeconds))].join(', ')}s); ` +
        `it generates only ${allowed.join('s or ')}s`
      ),
      { code: 'unsupported_shot_length', terminal: true, lengths: unsupported.map(s => s.generateSeconds) }
    );
  }

  const overrun = generated.filter(s => s.seconds > s.generateSeconds + 1e-9);
  if (overrun.length) {
    throw Object.assign(
      new Error(
        `shot ${overrun[0].index} uses ${overrun[0].seconds}s of a ` +
        `${overrun[0].generateSeconds}s generation — the edit would freeze on the last frame`
      ),
      { code: 'shot_exceeds_generation', terminal: true }
    );
  }
  return true;
}

module.exports = {
  planShots, chunkCaptions, estimateSeconds, planClips, assertGeneratable,
  MIN_SHOT, MAX_SHOT, GENERATION_SECONDS, DEFAULT_CLIP_SECONDS
};
