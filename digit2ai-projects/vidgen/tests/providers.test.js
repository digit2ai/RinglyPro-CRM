'use strict';
/**
 * Provider-adapter and http-client tests. No external network: the adapters
 * run against a fake client, and the one test that needs a real socket binds a
 * throwaway server on loopback.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const nodeHttp = require('http');

const { fishAudio, runwayVideo, imageProvider } = require('../src/providers');
const { toDataUri } = require('../src/frames');
const { FFMPEG } = require('../src/ffmpeg');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileP = promisify(execFile);
const { post } = require('../src/http');
const { probe } = require('../src/pipeline/assemble');

const TMP = '/tmp/vidgen-provider-test';

const tests = [];
const test = (n, f) => tests.push({ name: n, fn: f });

/** A client that replays one canned response, and records what it was sent. */
function fakeHttp(response) {
  const calls = [];
  return {
    calls,
    post: async (url, body, headers) => { calls.push({ url, body, headers }); return response; }
  };
}

/**
 * The real thing starts `ff fb 90 c4`. An MPEG audio frame sync is eleven set
 * bits: the whole first byte, then the top three of the second.
 */
const MP3_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xfb, 0x90, 0xc4]),
  Buffer.alloc(2048)
]);

const OK_RESPONSE = {
  ok: true,
  status: 200,
  headers: {
    'content-type': 'audio/mpeg',
    'transfer-encoding': 'chunked',
    'ratelimit-limit-concurrency': '5',
    'x-fish-trace-id': '3bf74555033e23b972d3b406675199cf'
  },
  buffer: MP3_BYTES,
  body: null,
  error: null
};

test('fish-audio hands back raw mp3 bytes, not a JSON envelope', async () => {
  const http = fakeHttp(OK_RESPONSE);
  const res = await fishAudio({ http, apiKey: 'sk-test', voiceId: 'voice-1' }).speak('testing one two three');

  assert.ok(Buffer.isBuffer(res.audio), 'audio is not a Buffer');
  assert.strictEqual(res.audio[0], 0xff, 'first byte is not 0xFF — not an MPEG frame sync');
  assert.strictEqual(res.audio[1] & 0xe0, 0xe0,
    'top three bits of the second byte are not set — not an MPEG frame sync');
  assert.strictEqual(res.audio.length, MP3_BYTES.length, 'audio was truncated on the way through');
  assert.strictEqual(res.chars, 'testing one two three'.length);
});

test('fish-audio sends the voice id it was given', async () => {
  const http = fakeHttp(OK_RESPONSE);
  await fishAudio({ http, apiKey: 'sk-test', voiceId: 'voice-1' }).speak('hello');
  assert.strictEqual(http.calls.length, 1);
  assert.strictEqual(http.calls[0].url, 'https://api.fish.audio/v1/tts');
  assert.strictEqual(http.calls[0].headers.Authorization, 'Bearer sk-test');
  // An undefined voiceId is dropped by JSON.stringify and the API quietly uses
  // its default voice, which is how a render ships in the wrong voice.
  assert.strictEqual(http.calls[0].body.reference_id, 'voice-1');
});

test('a Fish failure surfaces the provider code, not a bare "tts failed"', async () => {
  const http = fakeHttp({
    ok: false,
    status: 402,
    headers: {
      'content-type': 'application/json',
      'x-fish-error-code': 'insufficient_balance',
      'x-fish-trace-id': '0749a83567fa481f733109f2a81b0bde'
    },
    buffer: Buffer.from(JSON.stringify({ status: 402, message: 'Insufficient API credit.' })),
    body: { status: 402, message: 'Insufficient API credit.' },
    error: 'Insufficient API credit.'
  });

  await assert.rejects(
    () => fishAudio({ http, apiKey: 'sk-test' }).speak('hi'),
    (e) => {
      assert.strictEqual(e.code, 'tts_error');
      assert.strictEqual(e.status, 402);
      assert.strictEqual(e.fishCode, 'insufficient_balance');
      assert.strictEqual(e.traceId, '0749a83567fa481f733109f2a81b0bde');
      assert.ok(e.terminal, 'a credit failure was marked retryable');
      assert.ok(/Insufficient API credit/.test(e.message), `lost the billing detail: ${e.message}`);
      return true;
    }
  );
});

test('a 200 carrying no audio is refused instead of becoming an empty voiceover', async () => {
  const http = fakeHttp({ ok: true, status: 200, headers: {}, buffer: Buffer.alloc(0), body: null });
  await assert.rejects(() => fishAudio({ http, apiKey: 'sk-test' }).speak('hi'),
    (e) => e.code === 'tts_error' && /no audio bytes/.test(e.message));
});

test('HTTP CLIENT — a chunked response with no content-length arrives whole', async () => {
  // Exactly the shape Fish returns audio in. A client that sizes its buffer
  // from content-length reads nothing here.
  const server = nodeHttp.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'audio/mpeg' });   // node chunks this
    res.write(MP3_BYTES.subarray(0, 4));
    res.write(MP3_BYTES.subarray(4, 900));
    res.end(MP3_BYTES.subarray(900));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  try {
    const res = await post(`http://127.0.0.1:${port}/v1/tts`, { text: 'x' }, { Authorization: 'Bearer k' });
    assert.strictEqual(res.headers['transfer-encoding'], 'chunked', 'test did not exercise a chunked response');
    assert.strictEqual(res.headers['content-length'], undefined, 'test did not exercise a missing content-length');
    assert.ok(res.ok && res.status === 200);
    assert.ok(Buffer.isBuffer(res.buffer));
    assert.strictEqual(res.buffer.length, MP3_BYTES.length,
      'chunks were not accumulated — the buffer is short');
    assert.ok(res.buffer.equals(MP3_BYTES), 'accumulated bytes do not match what was sent');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('HTTP CLIENT — a JSON error body is parsed and surfaced', async () => {
  const server = nodeHttp.createServer((req, res) => {
    res.writeHead(402, { 'content-type': 'application/json', 'x-fish-error-code': 'insufficient_balance' });
    res.end(JSON.stringify({ status: 402, message: 'Insufficient API credit.' }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  try {
    const res = await post(`http://127.0.0.1:${port}/v1/tts`, { text: 'x' }, {});
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.status, 402);
    assert.strictEqual(res.body.message, 'Insufficient API credit.');
    assert.strictEqual(res.error, 'Insufficient API credit.');
    assert.strictEqual(res.headers['x-fish-error-code'], 'insufficient_balance');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('HTTP CLIENT — the adapter runs end to end against a real socket', async () => {
  let received = null;
  const server = nodeHttp.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      res.end(MP3_BYTES);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  try {
    const client = { post: (url, body, headers) => post(`http://127.0.0.1:${port}/v1/tts`, body, headers) };
    const out = await fishAudio({ http: client, apiKey: 'sk-test', voiceId: 'voice-1' }).speak('testing one two three');
    assert.strictEqual(received.text, 'testing one two three');
    assert.strictEqual(received.reference_id, 'voice-1');
    assert.strictEqual(out.audio[0], 0xff);
    assert.strictEqual(out.audio[1] & 0xe0, 0xe0);
    assert.strictEqual(out.audio.length, MP3_BYTES.length);
  } finally {
    await new Promise((r) => server.close(r));
  }
});


// ---------- runway image-to-video (async task API) ----------

/** Replays a submit response then a scripted sequence of task polls. */
function fakeRunway(submit, polls) {
  const calls = { posts: [], gets: [] };
  let i = 0;
  return {
    calls,
    post: async (url, body, headers) => { calls.posts.push({ url, body, headers }); return submit; },
    get: async (url, headers) => { calls.gets.push({ url, headers }); return polls[Math.min(i++, polls.length - 1)]; }
  };
}
const json = (status, body) => ({
  ok: status >= 200 && status < 300, status,
  headers: { 'content-type': 'application/json' },
  buffer: Buffer.from(JSON.stringify(body)), body,
  error: status >= 300 ? (body.error || body.message || `HTTP ${status}`) : null
});

// The exact payloads the live API returned on 2026-08-22.
const SUBMIT_OK = json(200, { id: '1beb8118-2f8d-49a4-823d-505ef4cb69e3', estimatedCost: { credits: 25 } });
const RUNNING = json(200, { id: '1beb8118', status: 'RUNNING', progress: 0.75 });
const SUCCEEDED = json(200, {
  id: '1beb8118', createdAt: '2026-08-22T15:04:36.328Z', status: 'SUCCEEDED',
  output: ['https://dnznrvs05pmza.cloudfront.net/adb722ad.mp4?_jwt=abc'],
  cost: { credits: 25 }
});

const runway = (http, over) => runwayVideo(Object.assign({
  http, apiKey: 'key_test', model: 'gen4_turbo',
  endpoint: 'https://api.dev.runwayml.com/v1/image_to_video',
  pollIntervalMs: 0, sleep: async () => {}
}, over));

test('RUNWAY — the submit carries no video url, so the adapter polls for one', async () => {
  const http = fakeRunway(SUBMIT_OK, [RUNNING, RUNNING, SUCCEEDED]);
  const out = await runway(http).animate({
    referenceImageUrl: 'data:image/png;base64,AAAA', motionPrompt: 'slow push in', seconds: 5
  });

  assert.strictEqual(out.url, 'https://dnznrvs05pmza.cloudfront.net/adb722ad.mp4?_jwt=abc');
  assert.strictEqual(out.seconds, 5);
  assert.strictEqual(out.taskId, '1beb8118-2f8d-49a4-823d-505ef4cb69e3');
  assert.strictEqual(out.credits, 25);
  assert.strictEqual(http.calls.gets.length, 3, 'stopped polling before the task finished');
  assert.ok(/\/v1\/tasks\/1beb8118-2f8d-49a4-823d-505ef4cb69e3$/.test(http.calls.gets[0].url),
    `polled the wrong url: ${http.calls.gets[0].url}`);
});

test('RUNWAY — the request uses Runway field names and the version header', async () => {
  const http = fakeRunway(SUBMIT_OK, [SUCCEEDED]);
  await runway(http).animate({ referenceImageUrl: 'IMG', motionPrompt: 'push in', seconds: 5 });
  const { body, headers } = http.calls.posts[0];

  assert.strictEqual(body.promptImage, 'IMG', 'sent image_url — Runway reads promptImage');
  assert.strictEqual(body.promptText, 'push in', 'sent prompt — Runway reads promptText');
  assert.strictEqual(body.ratio, '720:1280', 'sent aspect_ratio — Runway reads ratio');
  assert.strictEqual(body.duration, 5);
  assert.strictEqual(body.model, 'gen4_turbo');
  assert.strictEqual(headers['X-Runway-Version'], '2024-11-06', 'the version header is required');
  assert.strictEqual(headers.Authorization, 'Bearer key_test');
  // Both poll and submit must carry auth.
  assert.strictEqual(http.calls.gets[0].headers['X-Runway-Version'], '2024-11-06');
});

test('RUNWAY — a duration the model cannot produce never reaches the network', async () => {
  const http = fakeRunway(SUBMIT_OK, [SUCCEEDED]);
  await assert.rejects(
    () => runway(http).animate({ referenceImageUrl: 'IMG', motionPrompt: 'x', seconds: 1.5 }),
    (e) => e.code === 'shot_too_long' && e.terminal && /5s or 10s/.test(e.message)
  );
  assert.strictEqual(http.calls.posts.length, 0, 'billed a request for an impossible duration');
});

test('RUNWAY — a FAILED task raises the reason instead of returning undefined', async () => {
  const http = fakeRunway(SUBMIT_OK, [json(200, {
    id: '1beb8118', status: 'FAILED', failure: 'SAFETY.INPUT.IMAGE'
  })]);
  await assert.rejects(
    () => runway(http).animate({ referenceImageUrl: 'IMG', motionPrompt: 'x', seconds: 5 }),
    (e) => e.code === 'video_error' && /FAILED/.test(e.message) && /SAFETY/.test(e.message)
  );
});

test('RUNWAY — a SUCCEEDED task with no output is an error, not an undefined url', async () => {
  const http = fakeRunway(SUBMIT_OK, [json(200, { id: 'x', status: 'SUCCEEDED', output: [] })]);
  await assert.rejects(
    () => runway(http).animate({ referenceImageUrl: 'IMG', motionPrompt: 'x', seconds: 5 }),
    (e) => e.code === 'video_error' && /no output url/.test(e.message)
  );
});

test('RUNWAY — a task that never finishes times out rather than polling forever', async () => {
  const http = fakeRunway(SUBMIT_OK, [RUNNING]);
  await assert.rejects(
    () => runway(http, { pollTimeoutMs: -1 }).animate({ referenceImageUrl: 'IMG', motionPrompt: 'x', seconds: 5 }),
    (e) => e.code === 'video_timeout' && e.status === 'RUNNING'
  );
});

test('RUNWAY — a rejected submit surfaces the API error and is not retried', async () => {
  const http = fakeRunway(json(400, { error: 'Invalid duration' }), []);
  await assert.rejects(
    () => runway(http).animate({ referenceImageUrl: 'IMG', motionPrompt: 'x', seconds: 5 }),
    (e) => e.code === 'video_error' && e.status === 400 && e.terminal && /Invalid duration/.test(e.message)
  );
});


// ---------- character sheet: base64 in, recompressed data uri out ----------

/**
 * A real PNG at the size gpt-image-1 returns. Deliberately DETAILED: a flat
 * colour compresses to a few KB as PNG and would make the recompression look
 * like it does nothing, which is a property of the fixture, not the code.
 */
async function makePng(file, w = 1024, h = 1536) {
  await execFileP(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi',
    '-i', `mandelbrot=s=${w}x${h}`, '-frames:v', '1', file]);
  return fs.readFileSync(file);
}

test('FRAMES — a PNG becomes a 720x1280 jpeg data uri', async () => {
  const png = await makePng(path.join(TMP, 'frame-src.png'));
  const uri = await toDataUri(png);

  assert.ok(uri.startsWith('data:image/jpeg;base64,'), `wrong prefix: ${uri.slice(0, 40)}`);
  const jpeg = Buffer.from(uri.split(',')[1], 'base64');
  assert.strictEqual(jpeg[0], 0xff);
  assert.strictEqual(jpeg[1], 0xd8, 'not a JPEG SOI marker');

  const out = path.join(TMP, 'frame-out.jpg');
  fs.writeFileSync(out, jpeg);
  const info = await probe(out);
  const v = info.streams.find((st) => st.codec_type === 'video');
  assert.strictEqual(v.width, 720);
  assert.strictEqual(v.height, 1280);
  // The whole point: the payload has to fit in a request. Mandelbrot is
  // high-frequency and so a worst case for JPEG — it measures ~5.8x here,
  // where the live photographic frame measured 26.3x. Both are far inside
  // any data-uri limit, which is the property that actually matters.
  assert.ok(uri.length < 600 * 1024,
    `data uri is ${Math.round(uri.length / 1024)}KB — too big to inline`);
  assert.ok(uri.length < png.toString('base64').length / 2,
    `only shrank to ${(uri.length / png.toString('base64').length * 100).toFixed(0)}% — recompression is not working`);
});

test('FRAMES — a non-image is refused, not passed through as a data uri', async () => {
  await assert.rejects(() => toDataUri(Buffer.from('this is not an image')),
    (e) => e.code === 'frame_convert_failed');
});

/** The live response shape, with a real PNG standing in for the model output. */
function imageResponse(png, tokens = 1584) {
  return json(200, {
    created: 1787412242, background: 'opaque', output_format: 'png',
    quality: 'medium', size: '1024x1536',
    data: [{ b64_json: png.toString('base64') }],
    usage: { input_tokens: 55, output_tokens: tokens, total_tokens: 55 + tokens }
  });
}

test('IMAGES — b64_json becomes a recompressed data uri, and there is no seed', async () => {
  const png = await makePng(path.join(TMP, 'sheet-src.png'));
  const calls = [];
  const http = {
    post: async (url, body, headers, opts) => { calls.push({ url, body, headers, opts }); return imageResponse(png); }
  };
  const sheet = await imageProvider({
    http, apiKey: 'sk-test', model: 'gpt-image-1',
    endpoint: 'https://api.openai.com/v1/images/generations'
  }).characterSheet({ description: 'a woman, 30s', styleTokens: '3d', angles: ['close-up on face'] });

  assert.strictEqual(sheet.length, 1);
  assert.strictEqual(sheet[0].angle, 'close-up on face');
  assert.ok(sheet[0].url.startsWith('data:image/jpeg;base64,'),
    `url is not a data uri: ${String(sheet[0].url).slice(0, 40)}`);
  assert.strictEqual(sheet[0].outputTokens, 1584, 'lost the usage figure that makes spend reconcilable');
  assert.ok(!('seed' in sheet[0]), 'seed is back — gpt-image-1 has none, and null read as pinnable');

  // Runway has to accept this payload; the raw PNG would be ~3MB of base64.
  assert.ok(sheet[0].url.length < 600 * 1024,
    `data uri is ${Math.round(sheet[0].url.length / 1024)}KB — too big for a data uri`);
  assert.strictEqual(calls[0].body.quality, 'medium', 'not sending the cheaper quality tier');
  assert.strictEqual(calls[0].body.size, '1024x1536');
  assert.ok(calls[0].opts && calls[0].opts.timeoutMs >= 120000,
    'no explicit timeout — one image took 51s live');
});

test('IMAGES — angles are generated concurrently, not one after another', async () => {
  const png = await makePng(path.join(TMP, 'conc-src.png'));
  let inFlight = 0, peak = 0;
  const http = {
    post: async () => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight--;
      return imageResponse(png);
    }
  };
  const angles = ['a', 'b', 'c', 'd'];
  const sheet = await imageProvider({
    http, apiKey: 'k', model: 'gpt-image-1', endpoint: 'https://x/v1/images/generations'
  }).characterSheet({ description: 'd', styleTokens: 's', angles });

  assert.strictEqual(sheet.length, 4);
  assert.ok(peak > 1, `peak concurrency was ${peak} — the angles ran sequentially (~3.4 min for four)`);
  assert.deepStrictEqual(sheet.map((f) => f.angle), angles, 'concurrency scrambled the angle order');
});

test('IMAGES — a partial sheet fails loudly and reports what was already billed', async () => {
  const png = await makePng(path.join(TMP, 'part-src.png'));
  let n = 0;
  const http = {
    post: async () => (++n === 2
      ? json(429, { error: { message: 'Rate limit reached' } })
      : imageResponse(png))
  };
  await assert.rejects(
    () => imageProvider({
      http, apiKey: 'k', model: 'gpt-image-1', endpoint: 'https://x/v1/images/generations', concurrency: 1
    }).characterSheet({ description: 'd', styleTokens: 's', angles: ['a', 'b', 'c'] }),
    (e) => {
      assert.strictEqual(e.code, 'image_error');
      assert.strictEqual(e.billedFrames, 2, 'hid the frames that were paid for');
      assert.ok(/Rate limit reached/.test(e.message), `lost the API reason: ${e.message}`);
      return true;
    }
  );
});

test('IMAGES — a response with no image data is an error, not an undefined url', async () => {
  const http = { post: async () => json(200, { created: 1, data: [{}] }) };
  await assert.rejects(
    () => imageProvider({ http, apiKey: 'k', model: 'gpt-image-1', endpoint: 'https://x' })
      .characterSheet({ description: 'd', styleTokens: 's', angles: ['a'] }),
    (e) => e.code === 'image_error' && /no image data/.test(e.message)
  );
});


test('RUNWAY — a 502 while polling is retried, not treated as a dead task', async () => {
  // A live render lost eight paid clips to exactly one transient 502.
  const http = fakeRunway(SUBMIT_OK, [
    json(502, { error: 'Bad Gateway' }),
    json(503, { error: 'Service Unavailable' }),
    RUNNING,
    SUCCEEDED,
  ]);
  const out = await runway(http).animate({ referenceImageUrl: 'IMG', motionPrompt: 'x', seconds: 5 });
  assert.strictEqual(out.url, SUCCEEDED.body.output[0], 'gave up on a task that was still running');
  assert.strictEqual(out.transientPolls, 2, 'did not record the transient failures');
});

test('RUNWAY — a dropped connection while polling is also retried', async () => {
  let n = 0;
  const http = {
    post: async () => SUBMIT_OK,
    get: async () => { if (++n === 1) throw new Error('socket hang up'); return SUCCEEDED; },
  };
  const out = await runway(http).animate({ referenceImageUrl: 'IMG', motionPrompt: 'x', seconds: 5 });
  assert.strictEqual(out.url, SUCCEEDED.body.output[0]);
});

test('RUNWAY — a 4xx while polling IS fatal (bad id or key will never recover)', async () => {
  const http = fakeRunway(SUBMIT_OK, [json(404, { error: 'Task not found' })]);
  await assert.rejects(
    () => runway(http).animate({ referenceImageUrl: 'IMG', motionPrompt: 'x', seconds: 5 }),
    (e) => e.code === 'video_error' && e.status === 404
  );
});

test('RUNWAY — endless transient errors still stop at the deadline', async () => {
  const http = fakeRunway(SUBMIT_OK, [json(502, { error: 'Bad Gateway' })]);
  await assert.rejects(
    () => runway(http, { pollTimeoutMs: -1 }).animate({ referenceImageUrl: 'IMG', motionPrompt: 'x', seconds: 5 }),
    (e) => e.code === 'video_error' && e.status === 502
  );
});

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  let pass = 0, fail = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`  PASS  ${t.name}`); pass++; }
    catch (e) { console.log(`  FAIL  ${t.name}\n        ${e.message}`); fail++; }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
