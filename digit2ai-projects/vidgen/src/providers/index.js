'use strict';

const frames = require('../frames');

/**
 * Provider adapters. Every one takes an injected http client so the pipeline
 * is testable without network access and swappable without touching the runner.
 *
 * The injected client's `post(url, jsonBody, headers)` resolves to:
 *
 *   { ok, status, headers, buffer, body, error }
 *
 * where `headers` is a lower-cased-key object, `buffer` is the raw response
 * bytes accumulated from the stream (never sized from content-length — see
 * src/http.js), and `body` is the parsed JSON when the response was JSON.
 * Error responses carry a body too: providers signal WHY a call failed in it,
 * and that detail is the difference between debugging a billing problem and
 * debugging a code problem. src/http.js is the production implementation.
 *
 * Voice: Fish Audio for batch VO (cheap, open weights), ElevenLabs kept as an
 * option because RinglyPro already has the integration and the Rachel/Ana/Lina
 * voice IDs. Video VO is a batch job, so latency is irrelevant here — the only
 * thing that matters is quality per dollar.
 */

// ---------- text to speech ----------

/**
 * Pull the failure detail out of a response body that may arrive parsed,
 * as raw bytes, or not at all.
 */
function errorBody(res) {
  if (res.body && typeof res.body === 'object') return res.body;
  const raw = res.buffer || res.body;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
  } catch (_) {
    return null;
  }
}

/**
 * Fish Audio. Confirmed against the live API on 2026-08-22.
 *
 *   - POST https://api.fish.audio/v1/tts, auth `Authorization: Bearer <key>`,
 *     JSON request body.
 *   - A 200 returns THE RAW AUDIO BYTES with `content-type: audio/mpeg` — not
 *     a JSON envelope pointing at a file. `res.buffer` is the mp3, which is
 *     what `speak()` hands back. Observed: 34,271 bytes decoding to 2.1s of
 *     mono 44.1kHz 128kbps mp3, starting with an 0xFFFB frame sync.
 *   - The response is `transfer-encoding: chunked` with NO content-length.
 *     src/http.js accumulates chunks for exactly this reason.
 *   - Failures are JSON `{ status, message }` plus `x-fish-error-code`
 *     (e.g. `insufficient_balance`), `x-fish-error-source`, `x-fish-trace-id`.
 *   - Concurrency is capped server-side: `ratelimit-limit-concurrency: 5`.
 *     One VO per render stays well inside that; a fan-out would not.
 *   - `reference_id` selects the voice, confirmed against a control call with
 *     the field omitted: the default voice reads at a median 141.6 Hz F0
 *     (p25-p75 120-155), voice 9335... at 179.8 Hz (163-184). The quartile
 *     ranges do not overlap, so that is a different speaker rather than
 *     run-to-run variation. An undefined voiceId is dropped by JSON.stringify
 *     and silently yields the default voice, which is how a render ships in
 *     the wrong voice — the caller must pass one.
 *
 * SYNTHESIS IS NOT DETERMINISTIC. The identical request sent twice returned
 * 34,271 and 30,928 bytes (2.142s and 1.933s) of the same voice. Do not treat
 * byte length or duration as a fingerprint, do not cache on them, and expect a
 * re-render to produce a different edit: runner.js measures the VO and cuts
 * the shot list to it, so a second run of the same script yields different
 * shot boundaries.
 */
const fishAudio = ({ http, apiKey, voiceId, model = 's2' }) => ({
  name: 'fish-audio',
  costPerMillionChars: 15,
  async speak(text) {
    const res = await http.post('https://api.fish.audio/v1/tts', {
      text,
      reference_id: voiceId,
      format: 'mp3',
      model
    }, { Authorization: `Bearer ${apiKey}` });

    if (!res.ok) {
      const headers = res.headers || {};
      const body = errorBody(res);
      const fishCode = headers['x-fish-error-code'] || null;
      // 402 insufficient_balance is the one this actually returned, and no
      // amount of retrying adds funds to an account. Same for a rejected key.
      const terminal = res.status === 401 || res.status === 402 || res.status === 403;
      throw Object.assign(
        new Error(`fish-audio: ${(body && body.message) || res.error || `HTTP ${res.status}`}`),
        {
          code: 'tts_error',
          status: res.status,
          fishCode,
          traceId: headers['x-fish-trace-id'] || null,
          terminal
        }
      );
    }

    // A 200 with no bytes would sail through here and only surface four
    // stages later as "voiceover is unreadable" out of ffprobe, long after
    // the character sheet has been paid for.
    if (!res.buffer || !res.buffer.length) {
      throw Object.assign(new Error('fish-audio: returned no audio bytes'),
        { code: 'tts_error', status: res.status, terminal: true });
    }
    return { audio: res.buffer, chars: text.length };
  }
});

const elevenLabs = ({ http, apiKey, voiceId, model = 'eleven_multilingual_v2' }) => ({
  name: 'elevenlabs',
  costPerMillionChars: 165,
  async speak(text) {
    const res = await http.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      { text, model_id: model, output_format: 'mp3_44100_128' },
      { 'xi-api-key': apiKey }
    );
    if (!res.ok) throw Object.assign(new Error(res.error || 'tts failed'), { code: 'tts_error' });
    return { audio: res.buffer, chars: text.length };
  }
});

// ---------- character sheet (image) ----------

/**
 * The continuity lock. One character, generated once, at several angles.
 * Every downstream shot animates one of THESE stills — no shot is ever
 * generated from a bare text prompt, which is what causes face drift.
 *
 * THE SHEET IS NOT REPRODUCIBLE. Confirmed against the live API on
 * 2026-08-22: gpt-image-1 returns no seed, and accepts none. The same prompt
 * run twice gives a different person — not a variation, a different face. So
 * the sheet is a SAVED ASSET, not something regenerable on demand: once a
 * character exists, losing the file means losing the character, and every
 * render after that point features someone else. runner.js persists it to
 * disk and reuses it for exactly this reason. (The old adapter carried a
 * `seed` field that was silently always null, which read as though pinning
 * were possible. It is not, so the field is gone.)
 *
 * Also confirmed on that probe:
 *   - The image comes back as `data[0].b64_json`. There is no `url` key at
 *     all for this model, and never a `url` on the response root.
 *   - `quality` defaults to `high` — 6240 output tokens/image. `medium` is
 *     1584 tokens for the same 1024x1536 frame: 75% cheaper, 2x faster
 *     (25s vs 51s), and visually indistinguishable once recompressed to the
 *     720x1280 the video model actually consumes. medium is the default here.
 *   - One image takes 25-51s, so the angles are generated CONCURRENTLY.
 *     `n` does not help — it returns n variants of ONE prompt, and each angle
 *     is a different prompt — so concurrency means parallel requests, capped
 *     to stay under the account's images-per-minute limit.
 */
const imageProvider = ({
  http, apiKey, endpoint, model,
  size = '1024x1536',
  quality = 'medium',
  // One image took 51s at high quality; the default 120s leaves little room.
  timeoutMs = 300000,
  concurrency = 4,
  toDataUri = frames.toDataUri
}) => ({
  name: 'image',
  quality,
  async characterSheet({ description, styleTokens, angles }) {
    const one = async (angle) => {
      const res = await http.post(endpoint, {
        model,
        prompt: `${description}. ${angle}. ${styleTokens}`,
        size,
        quality
      }, { Authorization: `Bearer ${apiKey}` }, { timeoutMs });

      if (!res.ok) {
        const body = errorBody(res);
        throw Object.assign(
          new Error(`image (${angle}): ${(body && body.error && body.error.message) ||
            (body && body.message) || res.error || `HTTP ${res.status}`}`),
          {
            code: 'image_error',
            status: res.status,
            angle,
            terminal: res.status >= 400 && res.status < 500 && res.status !== 429
          }
        );
      }

      const item = res.body && res.body.data && res.body.data[0];
      const b64 = item && item.b64_json;
      if (!b64) {
        throw Object.assign(new Error(`image (${angle}): response carried no image data`),
          { code: 'image_error', angle, terminal: true });
      }

      // Recompressed to the video model's native frame size before encoding:
      // a 1024x1536 PNG is ~3.0MB as base64 and would sit at the edge of
      // Runway's data-uri limit for pixels it discards anyway.
      const url = await toDataUri(Buffer.from(b64, 'base64'));
      return {
        angle,
        url,
        // Lets a caller reconcile real spend against the plan's estimate
        // instead of assuming the published rate held.
        outputTokens: (res.body.usage && res.body.usage.output_tokens) || null
      };
    };

    const settled = await mapWithConcurrency(angles, concurrency, one);
    const done = settled.filter((r) => r.ok).map((r) => r.value);
    const failed = settled.map((r, i) => ({ angle: angles[i], r })).filter((x) => !x.r.ok);

    if (failed.length) {
      // A sheet missing an angle is not a smaller sheet — it silently hands
      // close-up shots a wide reference, which is the drift the lock exists to
      // stop. The frames that DID succeed were billed, so they ride along on
      // the error rather than vanishing.
      throw Object.assign(
        new Error(`character sheet incomplete: ${failed.length} of ${angles.length} angles failed ` +
          `(${failed.map((f) => f.angle).join(', ')}) — ${failed[0].r.error.message}`),
        { code: 'image_error', frames: done, billedFrames: done.length, cause: failed[0].r.error }
      );
    }
    return done;
  }
});

/** Runs fn over items with at most `limit` in flight, settling every one. */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

// ---------- image to video ----------

/**
 * Runway gen4_turbo. Confirmed against the live dev API on 2026-08-22.
 *
 * IT IS ASYNCHRONOUS. The submit returns a task id and NOTHING ELSE — there is
 * no video url on that response, so an adapter that reads one gets undefined
 * and the download fails a stage later with no clue why:
 *
 *   POST /v1/image_to_video  -> 200 {"id":"1beb...","estimatedCost":{"credits":25}}
 *   GET  /v1/tasks/{id}      -> {"id","createdAt","status","progress","output":[url],"cost":{"credits"}}
 *
 * Observed lifecycle: RUNNING (progress 0.1 -> 0.75) -> SUCCEEDED in ~19s for
 * a 5s clip. `output` is an ARRAY, and the finished clip is 720x1280 h264 24fps
 * — 720p is the ceiling, so assemble() upscales to 1080x1920.
 *
 * `X-Runway-Version` is required; without it the API rejects the call.
 *
 * THE OUTPUT URL EXPIRES. It is CloudFront plus a signed `_jwt` whose exp was
 * ~1.6 days out. Download it now — do not persist it in a job record and
 * expect it to resolve later.
 *
 * BILLING IS PER SECOND GENERATED, IN FIXED QUANTA: 25 credits for 5s = 5
 * credits/s, and only 5s or 10s can be asked for. `estimatedCost` comes back
 * on the submit, so real spend is reconcilable against the plan's estimate
 * rather than assumed.
 */
const RUNWAY_VERSION = '2024-11-06';
const RUNWAY_DURATIONS = [5, 10];
const TERMINAL = { SUCCEEDED: true, FAILED: true, CANCELLED: true };

const runwayVideo = ({
  http, apiKey, endpoint, model,
  ratio = '720:1280',
  durations = RUNWAY_DURATIONS,
  pollIntervalMs = 5000,
  pollTimeoutMs = 10 * 60 * 1000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms))
}) => ({
  name: 'runway',
  durations,
  async animate({ referenceImageUrl, motionPrompt, seconds }) {
    // Checked before the request, because Runway bills the whole quantum and a
    // rejected duration still costs the round trip and the operator's time.
    if (!durations.includes(seconds)) {
      throw Object.assign(
        new Error(`shot is ${seconds}s; ${model} generates only ${durations.join('s or ')}s`),
        { code: 'shot_too_long', terminal: true }
      );
    }

    const headers = { Authorization: `Bearer ${apiKey}`, 'X-Runway-Version': RUNWAY_VERSION };
    const res = await http.post(endpoint, {
      model,
      promptImage: referenceImageUrl,    // the locked character frame
      promptText: motionPrompt,
      ratio,
      duration: seconds
    }, headers);

    if (!res.ok) throw runwayError('submit failed', res);

    const taskId = res.body && res.body.id;
    if (!taskId) {
      throw Object.assign(new Error('runway accepted the job but returned no task id'),
        { code: 'video_error', status: res.status, terminal: true });
    }
    const estimatedCredits = res.body.estimatedCost && res.body.estimatedCost.credits;

    // Poll. The submit response carries no output, so this is not optional.
    const tasksUrl = endpoint.replace(/\/v1\/.*$/, '/v1/tasks/') + taskId;
    const deadline = Date.now() + pollTimeoutMs;
    let transientPolls = 0;

    for (;;) {
      await sleep(pollIntervalMs);
      let t;
      try {
        t = await http.get(tasksUrl, headers);
      } catch (netErr) {
        // A dropped connection while polling says nothing about the task.
        t = { ok: false, status: 0, headers: {}, buffer: Buffer.alloc(0), error: netErr.message };
      }

      // A POLL FAILURE IS NOT A TASK FAILURE. Runway returned HTTP 502 on one
      // poll of a job that was still running, and treating that as terminal
      // discarded eight clips that had already been paid for. Transient
      // gateway errors, rate limits and dropped connections are retried until
      // the deadline; only a 4xx (bad id, bad key) is fatal.
      if (!t.ok) {
        const transient = t.status === 0 || t.status === 429 || t.status >= 500;
        if (transient && Date.now() <= deadline) {
          transientPolls++;
          continue;
        }
        throw runwayError(`polling task ${taskId} failed`, t);
      }

      const task = t.body || {};
      if (!TERMINAL[task.status]) {
        if (Date.now() > deadline) {
          throw Object.assign(
            new Error(`task ${taskId} still ${task.status} after ${Math.round(pollTimeoutMs / 1000)}s`),
            { code: 'video_timeout', taskId, status: task.status }
          );
        }
        continue;
      }

      if (task.status !== 'SUCCEEDED') {
        throw Object.assign(
          new Error(`runway task ${taskId} ${task.status}: ${task.failure || task.failureCode || 'no reason given'}`),
          { code: 'video_error', taskId, status: task.status, terminal: true }
        );
      }

      const url = Array.isArray(task.output) ? task.output[0] : null;
      if (!url) {
        throw Object.assign(new Error(`runway task ${taskId} SUCCEEDED with no output url`),
          { code: 'video_error', taskId, terminal: true });
      }
      // The caller must download NOW — this url is signed and expires.
      return {
        url,
        seconds,
        taskId,
        transientPolls,
        credits: (task.cost && task.cost.credits) != null ? task.cost.credits : estimatedCredits
      };
    }
  }
});

function runwayError(what, res) {
  const body = errorBody(res);
  return Object.assign(
    new Error(`runway: ${what} — ${(body && (body.error || body.message)) || res.error || `HTTP ${res.status}`}`),
    {
      code: 'video_error',
      status: res.status,
      // 4xx other than rate-limiting is a bad request, not bad luck.
      terminal: res.status >= 400 && res.status < 500 && res.status !== 429
    }
  );
}

module.exports = {
  fishAudio, elevenLabs, imageProvider,
  runwayVideo,
  // The runner injects this as `video`; the shape is Runway's, not generic.
  videoProvider: runwayVideo,
  RUNWAY_DURATIONS, RUNWAY_VERSION
};
