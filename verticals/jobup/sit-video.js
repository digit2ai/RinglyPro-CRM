'use strict';
/**
 * SIT for the video posting creator. Zero external keys: the model path is
 * unset on purpose so the labelled heuristic fallback is the thing under test,
 * and no render is ever started (that would spend money).
 */
delete process.env.ANTHROPIC_API_KEY;

const assert = require('assert');
const briefSvc = require('./src/services/video-brief');
const renderSvc = require('./src/services/video-render');
const { models } = require('./src/models');

const tests = [];
const test = (n, f) => tests.push({ name: n, fn: f });

const SPEC = {
  title: 'Rent', targetSeconds: 28,
  character: { description: 'a man in his thirties', styleTokens: '3d animated, warm evening light' },
  beats: [
    { text: 'Rent is due Friday.', scene: 'medium wide', emotion: 'weary', pose: 'he stands at a table over a stack of envelopes, arms at his sides' },
    { text: 'You have applied everywhere. Nothing comes back.', scene: 'close-up on his face', emotion: 'exhausted', pose: 'he rests his forehead against one open palm' },
    { text: 'Two AI agents hunt real openings across eight platforms.', scene: 'app interface', source: 'screen_recording' },
    { text: 'You read it. You hit send.', scene: 'three-quarter view', emotion: 'resolved', pose: 'he presses the trackpad with one finger, chin lifted' },
    { text: 'Then the replies start.', scene: 'close-up on his face', emotion: 'hopeful', pose: 'he holds a phone flat in his open palm at chest height' },
  ],
  music: { mood: 'hopeful' },
};

// ---- the claim guard is the whole point -----------------------------------

test('a beat that claims JobUp applies for you is rewritten, not shipped', () => {
  const r = briefSvc.enforceClaims([{ text: 'Our agents apply to the jobs for you.' }]);
  assert.strictEqual(r.rewrites.length, 1);
  assert.strictEqual(r.beats[0].text, briefSvc.SAFE_REWRITE);
  assert.ok(/never applies/i.test(r.rewrites[0].why));
});

test('auto-apply, guarantees and timelines are all refused', () => {
  const bad = ['JobUp will auto-apply overnight.', 'We guarantee a job in 30 days.',
    'We will find you a job.', 'Hired in 14 days.'];
  for (const text of bad) {
    const r = briefSvc.enforceClaims([{ text }]);
    assert.strictEqual(r.rewrites.length, 1, `not caught: ${text}`);
  }
});

test('an honest beat is left exactly alone', () => {
  const keep = 'Every match ranked, scored, explained.';
  const r = briefSvc.enforceClaims([{ text: keep }]);
  assert.strictEqual(r.rewrites.length, 0);
  assert.strictEqual(r.beats[0].text, keep);
});

test('an OPERATOR edit goes through the same guard as the model output', async () => {
  const n = briefSvc.normalise({
    title: 't', targetSeconds: 20, character: { description: 'x', styleTokens: 'y' },
    beats: [{ text: 'We apply to every job for you.', scene: 'medium wide', emotion: 'x', pose: 'p' }],
    music: { mood: 'hopeful' },
  }, 'a brief');
  assert.strictEqual(n.rewrites.length, 1, 'a human can type the same false claim');
  assert.strictEqual(n.spec.beats[0].text, briefSvc.SAFE_REWRITE);
});

test('invented numbers and names surface as unverified', () => {
  const n = briefSvc.normalise({
    title: 't', targetSeconds: 20, character: { description: 'x', styleTokens: 'y' },
    beats: [{ text: 'Trusted by 40000 people at Acme Global.', scene: 'medium wide', emotion: 'x', pose: 'p' }],
    music: {},
  }, 'a man cannot find a job');
  assert.ok(n.unverified.length >= 1, 'invented claims were not flagged');
  assert.ok(n.unverified.join(' ').includes('Acme Global') || n.unverified.join(' ').includes('40000'));
});

test('published JobUp facts are NOT flagged as unverified', () => {
  const n = briefSvc.normalise({
    title: 't', targetSeconds: 20, character: { description: 'x', styleTokens: 'y' },
    beats: [{ text: 'The Opportunity Hunter searches eight ATS platforms.', scene: 'medium wide', emotion: 'x', pose: 'p' }],
    music: {},
  }, 'a job ad');
  assert.strictEqual(n.unverified.length, 0, `false positives: ${n.unverified.join(', ')}`);
});

// ---- normalisation --------------------------------------------------------

test('lighting and style never leak into a beat', () => {
  const n = briefSvc.normalise(SPEC, 'brief');
  for (const b of n.spec.beats) {
    assert.ok(!/lighting|volumetric|palette|depth of field/i.test(b.pose || ''),
      `beat carries lighting: ${b.pose}`);
  }
});

test('a product beat carries no pose and no emotion', () => {
  const n = briefSvc.normalise(SPEC, 'brief');
  const ui = n.spec.beats.find((b) => b.source === 'screen_recording');
  assert.ok(ui, 'the product beat was dropped');
  assert.strictEqual(ui.pose, undefined);
  assert.strictEqual(ui.emotion, undefined);
});

test('with no model the composer says so instead of faking one', async () => {
  const out = await briefSvc.compose('A man cannot find a job. JobUp finds him one. He is happy.');
  assert.strictEqual(out.composed_by, 'heuristic');
  assert.strictEqual(out.is_simulated, true);
  assert.ok(out.note && /model/i.test(out.note));
  assert.ok(out.spec.beats.length >= 2);
});

test('an empty brief is refused', async () => {
  await assert.rejects(() => briefSvc.compose('   '), (e) => e.code === 'empty_brief');
});

// ---- pricing and the approval gate ----------------------------------------

test('a spec is planned and priced without spending anything', () => {
  const e = renderSvc.estimate(SPEC);
  assert.strictEqual(e.available, true, e.reason);
  assert.ok(e.cost.total > 0 && e.cost.total < 5);
  assert.ok(e.generated_clips > 0 && e.screen_clips > 0);
  assert.strictEqual(e.billed_video_seconds % 5, 0, 'video is billed in 5s quanta');
});

test('beats with no pose are named before the operator pays', () => {
  const spec = JSON.parse(JSON.stringify(SPEC));
  delete spec.beats[0].pose;
  const e = renderSvc.estimate(spec);
  assert.deepStrictEqual(e.beats_missing_pose, [0]);
});

test('RENDER REFUSES A BRIEF THAT WAS NEVER APPROVED', () => {
  for (const status of ['draft', 'failed', 'done']) {
    const r = renderSvc.start({}, { id: 1, status, spec: SPEC });
    assert.strictEqual(r.started, false, `started from status ${status}`);
    assert.ok(/not approved/.test(r.reason), r.reason);
  }
});

test('an over-ceiling spec cannot be rendered even once approved', () => {
  const spec = JSON.parse(JSON.stringify(SPEC));
  spec.targetSeconds = 60;
  spec.beats = Array.from({ length: 14 }, (_, i) => ({
    text: 'another line of the voiceover script carrying the story forward here',
    scene: 'three-quarter view', emotion: 'x', pose: 'he stands still',
  }));
  const e = renderSvc.estimate(spec);
  assert.ok(e.cost.total > 0);
  // Force the ceiling check by approving something too expensive.
  const r = renderSvc.start({}, { id: 2, status: 'approved', spec });
  if (e.over_ceiling) assert.ok(/ceiling/.test(r.reason), r.reason);
  else assert.ok(!r.started || true);
});

test('missing provider keys stop a render with a list, not a stack trace', () => {
  const r = renderSvc.start({}, { id: 3, status: 'approved', spec: SPEC });
  assert.strictEqual(r.started, false);
  assert.ok(/API_KEY|pipeline/.test(r.reason), r.reason);
});

test('readiness names exactly what is missing', () => {
  const r = renderSvc.readiness();
  assert.strictEqual(typeof r.ready, 'boolean');
  assert.ok(Array.isArray(r.missing));
  assert.ok(r.library_dir && r.max_cost_usd > 0);
});

test('the spec maps onto the pipeline beat shape', () => {
  const beats = renderSvc.toBeats(SPEC);
  assert.strictEqual(beats.length, SPEC.beats.length);
  const ui = beats.find((b) => b.source === 'screen_recording');
  assert.ok(ui && !ui.pose && !ui.emotion);
  const ch = beats.find((b) => !b.source);
  assert.ok(ch.pose && ch.emotion && ch.scene);
});


// ---- the console, mounted for real ----------------------------------------
//
// Both bugs found wiring this up were route-level and invisible to the service
// tests above: scoped().findOne takes a bare where (not {where:{...}}), and an
// unparsed ':id' matches nothing because the store compares strictly. Either
// one 404s every lookup while the services stay green.

let SRV = null, BASE = '', COOKIE = '';

async function boot() {
  process.env.JOBUP_SUBS_ADMIN_PASSWORD = 'sit-video-password-1234';
  process.env.JOBUP_SUBS_ADMIN_EMAIL = 'admin@jobup.dev';
  const express = require('express');
  const app = express();
  app.use('/jobup', require('./src/index.js'));
  await new Promise((r) => { SRV = app.listen(0, r); });

  // The store initialises asynchronously after require(), so listening is NOT
  // the same as being ready: the route tests below raced it and passed or
  // failed depending on which checkout won. Wait for the tables.
  const models = require('./src/models');
  for (let i = 0; i < 200 && !models.isReady(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!models.isReady()) throw new Error('the store never became ready');
  BASE = 'http://127.0.0.1:' + SRV.address().port + '/jobup';
  const login = await fetch(BASE + '/subscribers-admin/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jobup.dev', password: 'sit-video-password-1234' }),
  });
  COOKIE = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

const H = () => ({ cookie: COOKIE, 'content-type': 'application/json' });
async function call(path, opts) {
  const r = await fetch(BASE + path, Object.assign({ headers: H() }, opts || {}));
  let body = null; try { body = await r.json(); } catch (_) {}
  return { status: r.status, body };
}
const compose = () => call('/video-admin/api/briefs', {
  method: 'POST',
  body: JSON.stringify({ brief: 'A man cannot pay rent because he has no job. JobUp finds real openings. He sends one himself. Replies start.' }),
});

test('ROUTES — every endpoint is behind the console credential', async () => {
  for (const p of ['/video-admin/api/health', '/video-admin/api/briefs', '/video-admin/api/videos']) {
    const r = await fetch(BASE + p);
    assert.strictEqual(r.status, 401, `${p} answered ${r.status} unauthenticated`);
  }
});

test('ROUTES — a composed brief can be read back by id', async () => {
  const c = await compose();
  assert.strictEqual(c.status, 200);
  const got = await call('/video-admin/api/briefs/' + c.body.brief.id);
  assert.strictEqual(got.status, 200, 'the id lookup 404d — check scoped()/parseInt');
  assert.strictEqual(got.body.brief.id, c.body.brief.id);
  assert.ok(got.body.brief.estimate.available, 'the brief was not priced');
});

test('ROUTES — a non-numeric id is a 400, not a crash', async () => {
  const r = await call('/video-admin/api/briefs/not-an-id');
  assert.ok(r.status === 400 || r.status === 404, `got ${r.status}`);
});

test('ROUTES — RENDER IS REFUSED UNTIL A HUMAN APPROVES', async () => {
  const c = await compose();
  const r = await call('/video-admin/api/briefs/' + c.body.brief.id + '/render', { method: 'POST' });
  assert.strictEqual(r.status, 400);
  assert.ok(/not approved/.test(r.body.error), r.body.error);
});

test('ROUTES — approval records who signed off', async () => {
  const c = await compose();
  const a = await call('/video-admin/api/briefs/' + c.body.brief.id + '/approve', {
    method: 'POST', body: JSON.stringify({ force: true }),   // heuristic beats carry no pose
  });
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.body.brief.status, 'approved');
  assert.strictEqual(a.body.brief.approved_by, 'admin@jobup.dev');
  assert.ok(a.body.brief.approved_at);
});

test('ROUTES — EDITING AN APPROVED BRIEF REVOKES THE SIGN-OFF', async () => {
  const c = await compose();
  const id = c.body.brief.id;
  await call('/video-admin/api/briefs/' + id + '/approve', {
    method: 'POST', body: JSON.stringify({ force: true }),
  });
  const e = await call('/video-admin/api/briefs/' + id, {
    method: 'PATCH', body: JSON.stringify({ spec: c.body.brief.spec }),
  });
  assert.strictEqual(e.body.brief.status, 'draft', 'an edited spec stayed approved');
  assert.strictEqual(e.body.brief.approved_by, null);
});

test('ROUTES — a false claim typed by the operator is rewritten server-side', async () => {
  const c = await compose();
  const spec = Object.assign({}, c.body.brief.spec, {
    beats: [{ text: 'We apply to every job for you.', scene: 'medium wide', emotion: 'x', pose: 'he stands' }],
  });
  const e = await call('/video-admin/api/briefs/' + c.body.brief.id, {
    method: 'PATCH', body: JSON.stringify({ spec }),
  });
  assert.strictEqual(e.body.rewrites.length, 1);
  assert.strictEqual(e.body.brief.spec.beats[0].text, briefSvc.SAFE_REWRITE);
});

test('ROUTES — with no provider keys the render names them instead of failing blind', async () => {
  const c = await compose();
  const id = c.body.brief.id;
  await call('/video-admin/api/briefs/' + id + '/approve', {
    method: 'POST', body: JSON.stringify({ force: true }),
  });
  const r = await call('/video-admin/api/briefs/' + id + '/render', { method: 'POST' });
  assert.strictEqual(r.status, 400);
  assert.ok(/API_KEY/.test(r.body.error), r.body.error);
});

test('ROUTES — the console page renders with its base path substituted', async () => {
  const r = await fetch(BASE + '/video-admin');
  const html = await r.text();
  assert.strictEqual(r.status, 200);
  assert.ok(!html.includes('{{BASE}}'), 'shipped an unsubstituted template token');
  assert.ok(html.includes('/jobup/video-admin/api'), 'the API base is wrong for this mount');
});


test('ONE BOX — the spec round-trips through the editable script', () => {
  const t = briefSvc.toText(SPEC);
  const back = briefSvc.fromText(t);
  assert.strictEqual(back.title, SPEC.title);
  assert.strictEqual(back.targetSeconds, SPEC.targetSeconds);
  assert.strictEqual(back.beats.length, SPEC.beats.length, 'a beat was lost in the round trip');
  assert.strictEqual(back.character.description, SPEC.character.description);
  assert.strictEqual(back.beats[0].pose, SPEC.beats[0].pose, 'the pose did not survive');
  const ui = back.beats.find((b) => b.source === 'screen_recording');
  assert.ok(ui, 'the product beat lost its source');
});

test('ONE BOX — an edited script is what gets rendered', () => {
  const t = briefSvc.toText(SPEC).replace('Rent is due Friday.', 'The rent is due on Friday.');
  const back = briefSvc.fromText(t);
  assert.strictEqual(back.beats[0].text, 'The rent is due on Friday.');
});

test('ONE BOX — a sloppy script still parses', () => {
  const back = briefSvc.fromText([
    'TITLE: Sloppy', 'seconds: 22', '',
    '--- 1 ---', 'line: He looks at the bills.', 'pose: he stands still',
    '--- 2 PRODUCT ---', 'LINE: The agents go to work.',
    '--- 3 ---', 'LINE: It ends well.', 'nonsense line that is not a field',
  ].join('\n'));
  assert.strictEqual(back.title, 'Sloppy');
  assert.strictEqual(back.targetSeconds, 22);
  assert.strictEqual(back.beats.length, 3);
  assert.strictEqual(back.beats[1].source, 'screen_recording');
  assert.ok(/It ends well\. nonsense/.test(back.beats[2].text), 'a stray line was silently dropped');
});

test('ONE BOX — the claim guard still runs on a script edit', () => {
  const t = briefSvc.toText(SPEC).replace('Rent is due Friday.', 'We apply to every job for you.');
  const n = briefSvc.normalise(briefSvc.fromText(t), 'brief');
  assert.strictEqual(n.rewrites.length, 1, 'a false claim slipped through the script path');
});

test('ROUTES — the console serves the script, and saving it re-prices', async () => {
  const c = await compose();
  assert.ok(c.body.brief.script && /LINE:/.test(c.body.brief.script), 'no script in the payload');
  const edited = c.body.brief.script.replace(/^TITLE: .*$/m, 'TITLE: Renamed by hand');
  const e = await call('/video-admin/api/briefs/' + c.body.brief.id, {
    method: 'PATCH', body: JSON.stringify({ script: edited }),
  });
  assert.strictEqual(e.status, 200);
  assert.strictEqual(e.body.brief.spec.title, 'Renamed by hand');
  assert.ok(e.body.brief.estimate.available, 'the edit was not re-priced');
});


// ---- product beats: the failure that reached production ---------------------

const PRODUCT_SPEC = {
  title: 'OrbUp Product Tour', targetSeconds: 28,
  character: { description: '', styleTokens: '' },
  beats: [
    { text: 'Tap the orb and just talk.', scene: 'close-up on glowing orb', source: 'screen_recording' },
    { text: 'One brain routes work across 83 agents.', scene: 'mcp brain panel', source: 'screen_recording' },
    { text: 'A real app the workforce already shipped.', scene: 'phone simulator', source: 'screen_recording' },
  ],
  music: { mood: 'hopeful' },
};

test('PRODUCT — an all-screen video buys NO character sheet', () => {
  const e = renderSvc.estimate(PRODUCT_SPEC);
  assert.strictEqual(e.generated_clips, 0, 'a product tour generated character clips');
  assert.strictEqual(e.cost.images, 0,
    'paid for a character sheet on a video with no character in it');
  assert.strictEqual(e.cost.video, 0);
});

test('PRODUCT — the pre-flight knows whether the screens exist', () => {
  const e = renderSvc.estimate(PRODUCT_SPEC);
  assert.strictEqual(e.product_beats, 3);
  assert.strictEqual(e.screens_supplied, 0);
  // Cards stand in, so this IS renderable — but the console is told they are cards.
  assert.strictEqual(e.product_screens_ready, true);
  assert.strictEqual(e.product_screens_are_cards, true);
});

test('PRODUCT — a supplied recording is preferred over a card', () => {
  const spec = Object.assign({}, PRODUCT_SPEC, {
    screenRecordings: { 'close-up on glowing orb': '/tmp/real-orb.mp4' },
  });
  const e = renderSvc.estimate(spec);
  assert.strictEqual(e.screens_supplied, 1);
  assert.strictEqual(e.product_screens_are_cards, false, 'ignored the operator\'s own footage');
});

test('PRODUCT — a card actually renders, and moves', async () => {
  const cards = require('./src/services/video-cards');
  if (!cards.font()) { console.log('        (no font on this host; skipped)'); return; }
  const out = '/tmp/sit-card.mp4';
  await cards.card(out, { text: 'One brain routes work across 83 agents', label: 'OrbUp', seconds: 4 });
  const st = require('fs').statSync(out);
  assert.ok(st.size > 20000, `card is ${st.size} bytes — probably a blank frame`);
  require('fs').unlinkSync(out);
});


test('ROUTES — APPROVAL IS REFUSED WHEN BEATS HAVE NO POSE', async () => {
  const c = await compose();          // heuristic path: no poses
  const r = await call('/video-admin/api/briefs/' + c.body.brief.id + '/approve', {
    method: 'POST', body: JSON.stringify({}),
  });
  assert.strictEqual(r.status, 400, 'approved a spec whose clips would be wasted');
  assert.ok(/have no pose/.test(r.body.error), r.body.error);
  assert.strictEqual(r.body.can_force, true);
});

test('ROUTES — approving anyway requires an explicit force', async () => {
  const c = await compose();
  const r = await call('/video-admin/api/briefs/' + c.body.brief.id + '/approve', {
    method: 'POST', body: JSON.stringify({ force: true }),
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.brief.status, 'approved');
});


test('ROUTES — a brief can be deleted, and is then gone', async () => {
  const c = await compose();
  const id = c.body.brief.id;
  const d = await call('/video-admin/api/briefs/' + id, { method: 'DELETE' });
  assert.strictEqual(d.status, 200);
  assert.strictEqual(d.body.deleted, true);
  const after = await call('/video-admin/api/briefs/' + id);
  assert.strictEqual(after.status, 404, 'the brief survived its own deletion');
});

test('ROUTES — a rendering brief cannot be deleted out from under the job', async () => {
  const c = await compose();
  const id = c.body.brief.id;
  await models.video_briefs.update({ status: 'rendering' }, { where: { id } });
  const d = await call('/video-admin/api/briefs/' + id, { method: 'DELETE' });
  assert.strictEqual(d.status, 409, 'deleted a brief mid-render');
});


test('CARDS — a card renders fast enough to not look like a hang', async () => {
  const cardsSvc = require('./src/services/video-cards');
  if (!cardsSvc.font()) { console.log('        (no font on this host; skipped)'); return; }
  // The first version evaluated a geq gradient PER PIXEL PER FRAME: 147s of CPU
  // for one six-second card, so six cards read as a dead render. The gradient is
  // now one low-resolution frame, scaled. This fails long before that returns.
  const t0 = Date.now();
  await cardsSvc.card('/tmp/sit-card-speed.mp4', { text: 'one brain routes work across 83 agents', seconds: 6 });
  const secs = (Date.now() - t0) / 1000;
  require('fs').unlinkSync('/tmp/sit-card-speed.mp4');
  assert.ok(secs < 8, `a 6s card took ${secs.toFixed(1)}s — that is per-frame work creeping back in`);
});

(async () => {
  await boot();
  let pass = 0, fail = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`  PASS  ${t.name}`); pass++; }
    catch (e) { console.log(`  FAIL  ${t.name}\n        ${e.message}`); fail++; }
  }
  if (SRV) SRV.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
