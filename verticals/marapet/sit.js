'use strict';
/**
 * MaraPet SIT — the acceptance gate.
 *
 * Zero external keys, no Postgres, no network. It attacks the invariants
 * rather than the happy path: every rule stated in CAPS in the vertical's
 * CLAUDE.md section gets the input that rule exists to refuse.
 *
 *   node verticals/marapet/sit.js
 */
process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY;              // the keyless path is the one under test
process.env.MARAPET_SESSION_SECRET = 'sit-only-secret-not-a-real-one-0123456789';

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const fake = require('./test/fake-db').install();   // BEFORE anything requires ./src/db
const express = require('express');

let pass = 0, fail = 0;
const failures = [];
const skipped = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return true; }
  fail++; failures.push(name + (extra ? ' — ' + extra : ''));
  return false;
}
function section(t) { console.log('\n── ' + t); }

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** Comments explain WHY a thing is absent, so a grep must not flag the explanation. */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else out.push(p);
  }
  return out;
}

/* ═══════════════════ 1. the ingest contract ═══════════════════ */
section('The ingest contract');
const ingest = require('./src/ingest');

ok('a known metric is accepted', ingest.validateSample(
  { metric: 'heart_rate_bpm', value: 80, source: 'device' }).ok);

const unknown = ingest.validateSample({ metric: 'blood_pressure_systolic', value: 120, source: 'device' });
ok('an unknown metric is REFUSED', !unknown.ok && unknown.reason === 'unknown_metric');
ok('and the refusal NAMES the metric, never drops it silently', unknown.metric === 'blood_pressure_systolic');

ok('blood pressure is not in the allow-list at all',
  !ingest.metricNames().some((m) => /blood|bp_|systol|diastol/i.test(m)),
  ingest.metricNames().join(','));

const badSrc = ingest.validateSample({ metric: 'heart_rate_bpm', value: 80, source: 'guess' });
ok('an unknown source is refused', !badSrc.ok && badSrc.reason === 'unknown_source');

ok('a physically impossible value is refused',
  !ingest.validateSample({ metric: 'heart_rate_bpm', value: 9000, source: 'device' }).ok);

ok('a video sample with no confidence is refused',
  !ingest.validateSample({ metric: 'resp_rate_bpm', value: 20, source: 'video' }).ok);
ok('a video sample WITH confidence is accepted',
  ingest.validateSample({ metric: 'resp_rate_bpm', value: 20, source: 'video', confidence: 'high' }).ok);

ok('a reading from the future is refused (a device with a wrong clock)',
  !ingest.validateSample({ metric: 'heart_rate_bpm', value: 80, source: 'device',
    recorded_at: new Date(Date.now() + 86400000).toISOString() }).ok);
ok('a buffered reading from this morning IS accepted',
  ingest.validateSample({ metric: 'heart_rate_bpm', value: 80, source: 'device',
    recorded_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString() }).ok);

/* ═══════════════════ 2. normal bands ═══════════════════ */
section('Normal bands');
const bands = require('./src/bands');

const chihuahua = bands.forPet({ breed_size: 'toy', birth_date: '2020-01-01' });
const dane = bands.forPet({ breed_size: 'giant', birth_date: '2020-01-01' });
ok('a toy dog and a giant dog do NOT share a heart-rate band',
  chihuahua.heart_rate_bpm.max !== dane.heart_rate_bpm.max);
ok('120 bpm is normal for the toy dog', bands.classify('heart_rate_bpm', 120, chihuahua) === 'ok');
ok('120 bpm is high for the giant dog', bands.classify('heart_rate_bpm', 120, dane) === 'high');

const noInfo = bands.forPet({ name: 'Unknown' });
ok('with no size and no weight there is NO heart-rate band, rather than an average',
  !noInfo.heart_rate_bpm);
ok('and classify() returns null rather than a verdict',
  bands.classify('heart_rate_bpm', 120, noInfo) === null);

ok('a band carries its basis to the screen', typeof noInfo.resp_rate_bpm.basis === 'string'
  && /reference range, not a MaraPet measurement/i.test(noInfo.resp_rate_bpm.basis));
ok('heart rate variability gets NO band, because no published one can be cited', !noInfo.hrv_ms);
ok('activity gets no band either', !noInfo.activity);
ok('a puppy gets a wider ceiling than an adult of the same size',
  bands.forPet({ breed_size: 'small', birth_date: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10) })
    .heart_rate_bpm.max > bands.forPet({ breed_size: 'small', birth_date: '2020-01-01' }).heart_rate_bpm.max);

/* ═══════════════════ 3. the report verifier ═══════════════════ */
section('The report verifier');
const report = require('./src/report');

const FACTS = {
  pet_name: 'Rufo', date: '2026-10-17', has_data: true, readings_count: 12, days_with_data: 1,
  metrics: [{ metric: 'resp_rate_bpm', label_en: 'breathing rate', label_es: 'frecuencia respiratoria',
    samples: 12, avg: 22, min: 18, max: 26, unit: 'breaths/min',
    band_min: 10, band_max: 30, band_basis: 'x', status: 'ok', source: 'video', confidence: 'high' }],
  alerts: []
};

ok('the deterministic report passes its own verifier',
  report.verify(report.deterministic(FACTS, 'en'), FACTS) === null,
  String(report.verify(report.deterministic(FACTS, 'en'), FACTS)));
ok('the Spanish deterministic report passes too',
  report.verify(report.deterministic(FACTS, 'es'), FACTS) === null,
  String(report.verify(report.deterministic(FACTS, 'es'), FACTS)));
// The disclaimer deliberately contains a forbidden word ("diagnoses"), which is
// exactly why it is appended AFTER verification rather than written into the
// prose. If it were part of the body the verifier would reject its own output.
ok('the disclaimer would fail the verifier, which is why code appends it',
  report.verify(report.withDisclaimer(report.deterministic(FACTS, 'en'), 'en'), FACTS) !== null);

ok('a draft with an INVENTED number is discarded',
  /^unverified_number/.test(String(report.verify(
    'Rufo breathed 22 times a minute, and his heart rate was 86 beats per minute, which is fine.', FACTS))));
ok('a draft naming a CONDITION is discarded',
  /^forbidden_term/.test(String(report.verify(
    'Rufo breathed 22 times a minute. This can be a sign of heart failure.', FACTS))));
ok('a draft recommending a MEDICATION is discarded',
  /^forbidden_term/.test(String(report.verify(
    'Rufo breathed 22 times a minute. Consider a medication to settle him.', FACTS))));
ok('a draft GUARANTEEING something is discarded',
  /^forbidden_term/.test(String(report.verify(
    'Rufo breathed 22 times a minute and we guarantee he is healthy.', FACTS))));
ok('a draft quoting an ACCURACY figure is discarded',
  /^forbidden_term/.test(String(report.verify(
    'Rufo breathed 22 times a minute, measured with 95 percent accuracy.', FACTS))));
ok('a draft calling MaraPet a medical device is discarded',
  /^forbidden_term/.test(String(report.verify(
    'Rufo breathed 22 times a minute, as read by this medical device.', FACTS))));
ok('an emoji is discarded',
  report.verify('Rufo breathed 22 times a minute today and is doing well \u{1F436}', FACTS) === 'contains_emoji');
ok('markup is discarded',
  report.verify('<b>Rufo</b> breathed 22 times a minute today and that is inside the range.', FACTS) === 'contains_markup');
ok('a figure that IS in the facts is allowed',
  report.verify('Rufo breathed 22 times a minute today, between 18 and 26, and that is inside the range.', FACTS) === null);

ok('with no readings the report says so rather than inventing a day',
  /nothing to summarise/i.test(report.deterministic(
    { pet_name: 'Rufo', date: '2026-10-17', has_data: false, metrics: [], alerts: [], readings_count: 0, days_with_data: 0 }, 'en')));

ok('a video figure is labelled an estimate in the prose',
  /estimate from video/i.test(report.deterministic(FACTS, 'en')));
ok('and in Spanish, with the confidence word translated too',
  /estimaci[oó]n a partir de video/i.test(report.deterministic(FACTS, 'es'))
  && !/confianza (high|medium|low)/i.test(report.deterministic(FACTS, 'es')),
  report.deterministic(FACTS, 'es').slice(-90));
ok('the disclaimer is in every report',
  /not a medical device/i.test(report.withDisclaimer(report.deterministic(FACTS, 'en'), 'en')));
ok('and in the Spanish one',
  /no un dispositivo m[eé]dico/i.test(report.withDisclaimer(report.deterministic(FACTS, 'es'), 'es')));

/* ═══════════════════ 4. the breathing estimator ═══════════════════ */
section('The breathing estimator');
const breath = require('./src/services/breathing');

function sine(bpm, secs, fps, amp, seed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const out = [];
  for (let i = 0; i < secs * fps; i++) {
    out.push(amp * Math.sin(2 * Math.PI * (bpm / 60) * (i / fps)) + (rnd() - 0.5) * 1.2);
  }
  return out;
}
const good = breath.estimate(sine(24, 30, 30, 1.2, 7), 30);
ok('a clean 24 bpm signal is recovered', good.ok && Math.abs(good.bpm - 24) <= 2, JSON.stringify(good));
ok('and it carries a confidence', ['high', 'medium', 'low'].includes(good.confidence));

let noiseAccepted = 0;
for (let s = 0; s < 120; s++) {
  let a = (999 + s) >>> 0;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const noise = [];
  for (let i = 0; i < 900; i++) noise.push(rnd() - 0.5 + 0.4 * Math.sin(2 * Math.PI * 0.012 * i / 30));
  if (breath.estimate(noise, 30).ok) noiseAccepted++;
}
// THE DEFECT THIS TEST EXISTS FOR: the first version of the estimator returned
// a confident 102 bpm from pure noise, because its threshold was a picked
// constant rather than a false-alarm bound.
ok('pure noise is refused at least 90% of the time', noiseAccepted <= 12,
  noiseAccepted + '/120 accepted');

const short = breath.estimate(sine(24, 8, 30, 1.2, 3), 30);
ok('a clip under twenty seconds is refused', !short.ok && short.reason === 'clip_too_short');
const flat = breath.estimate(new Array(900).fill(0.5), 30);
ok('a frozen frame is refused', !flat.ok && flat.reason === 'no_variation');
ok('a refusal always carries a reason a person can act on',
  typeof short.reason === 'string' && short.reason.length > 3);

/* ═══════════════════ 5. structural promises a runtime test cannot see ═══════════════════ */
section('Structural promises');
const srcFiles = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js'));

const sdkImporters = srcFiles.filter((f) => /@anthropic-ai\/sdk/.test(stripComments(fs.readFileSync(f, 'utf8'))));
ok('exactly ONE file in the vertical reaches a model', sdkImporters.length === 1,
  sdkImporters.map((f) => path.relative(ROOT, f)).join(', '));
ok('and it is src/llm.js', sdkImporters.length === 1 && /llm\.js$/.test(sdkImporters[0]));

const allFiles = walk(ROOT).filter((f) => /\.(js|html)$/.test(f) && !/\/test\//.test(f) && !/sit\.js$/.test(f));
const mailers = allFiles.filter((f) =>
  /(sendgrid|nodemailer|smtp\.|createTransport|twilio)/i.test(stripComments(fs.readFileSync(f, 'utf8'))));
ok('no mail or SMS transport exists anywhere in the vertical', mailers.length === 0,
  mailers.map((f) => path.relative(ROOT, f)).join(', '));

const manifestFiles = walk(path.join(ROOT, 'public')).filter((f) => /manifest(\.webmanifest|\.json)$/.test(f));
ok('there is NO manifest on disk — it is generated per root', manifestFiles.length === 0,
  manifestFiles.join(', '));

const pagesDir = walk(path.join(ROOT, 'public')).filter((f) => f.endsWith('.html'));
const hardcoded = pagesDir.filter((f) => /["'(]\/marapet\//.test(fs.readFileSync(f, 'utf8')));
ok('no page hardcodes the /marapet/ mount prefix', hardcoded.length === 0,
  hardcoded.map((f) => path.basename(f)).join(', '));

const clientJs = walk(path.join(ROOT, 'public', 'js'));
const hardcodedJs = clientJs.filter((f) => /["'(]\/marapet\//.test(fs.readFileSync(f, 'utf8')));
ok('no client script hardcodes it either', hardcodedJs.length === 0,
  hardcodedJs.map((f) => path.basename(f)).join(', '));

const swSrc = require('./src/pwa').serviceWorker({ baseUrl: '' });
ok('the service worker never caches /api/', /includes\('\/api\/'\)/.test(swSrc));
// Comments stripped first: the worker EXPLAINS why it does not use addAll, and
// the first version of this check flagged its own explanation.
const swCode = stripComments(swSrc);
ok('the service worker caches entry by entry, never addAll',
  !/addAll/.test(swCode) && /c\.add\(/.test(swCode));

const ingestSrc = stripComments(read('src/ingest.js'));
ok('ingest.accept refuses a non-integer tenant from a caller',
  /tenant_id and pet_id must be integers from the session/.test(ingestSrc));

const reportSrc = stripComments(read('src/report.js'));
ok('the verifier runs on the deterministic path too, not only the model one',
  /const selfCheck = verify\(fallback, facts\)/.test(reportSrc));

const breathSrc = read('public/js/breathing-core.js');
ok('the breathing threshold is derived from a false-alarm bound, not a constant',
  /FALSE_ALARM/.test(breathSrc) && /Math\.log\(neff\)/.test(breathSrc));

/* no accuracy claim anywhere on a customer surface */
const claimy = pagesDir.filter((f) => {
  const s = stripComments(fs.readFileSync(f, 'utf8'));
  return /\b\d{1,3}\s*%\s*(accurate|accuracy|precis)/i.test(s) ||
         /(sensitivity|specificity|clinically proven|cl[ií]nicamente comprobado)/i.test(s);
});
ok('no page claims an accuracy, sensitivity or specificity figure', claimy.length === 0,
  claimy.map((f) => path.basename(f)).join(', '));

const deviceWords = pagesDir.filter((f) => {
  const s = stripComments(fs.readFileSync(f, 'utf8'));
  return /\bis a medical device\b/i.test(s) || /\bdiagnoses your dog\b/i.test(s);
});
ok('no page calls MaraPet a medical device', deviceWords.length === 0);

const landing = read('public/index.html');
ok('the landing names the alliance ISTC x Digit2AI, in that order',
  /ISTC\s*&times;\s*Digit2AI/.test(landing));
ok('the landing never claims blood pressure', !/blood pressure monitor|mide la presi[oó]n/i.test(landing));
ok('the landing states what is NOT done', /What it does not do/.test(landing));

/* the reference product is a design reference, not a source of copy */
const allText = pagesDir.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
ok('no page mentions the reference product by name',
  !/cotons|caresix/i.test(allText));
ok('no page borrows its award claim', !/CES\s*20\d\d/i.test(allText));
ok('no page borrows its university validation', !/jeju/i.test(allText));

/* ═══════════════════ 5b. the hero artwork ═══════════════════ */
section('The hero artwork');
const heroJpg = path.join(ROOT, 'public', 'hero.jpg');
ok('the hero image ships with the vertical', fs.existsSync(heroJpg));
ok('and its SOURCE ships beside it, so it can be re-rendered rather than re-drawn',
  fs.existsSync(path.join(ROOT, 'public', 'hero-source.svg')));
const heroBytes = fs.existsSync(heroJpg) ? fs.statSync(heroJpg).size : 0;
ok('it is a reasonable weight for an above-the-fold background',
  heroBytes > 20 * 1024 && heroBytes < 400 * 1024, heroBytes + ' bytes');

const css = read('public/theme.css');
ok('the hero references its own image, same-origin',
  /background-image:\s*url\('hero\.jpg'\)/.test(css));
ok('nothing in the vertical hotlinks an image from another host',
  !/url\(\s*['"]?https?:\/\//.test(stripComments(css)));

// THE SCRIM IS WHAT MAKES THE HEADLINE WIN. A percentage-only fade cannot be
// trusted: the text column is centred and fixed-width while the fade is a
// share of the viewport, so they diverge as the window grows — the first
// version measured 1.12:1 on the line that reaches furthest across.
const heroBlock = css.slice(css.indexOf('.mp-hero::before'), css.indexOf('.mp-hero > *'));
ok('the hero scrim has a FLAT layer, not only a directional fade',
  /rgba\([^)]+\);\s*$/m.test(heroBlock) || /,\s*\n\s*rgba\([^)]+\);/.test(heroBlock),
  heroBlock.slice(0, 120));
ok('and the hero declares its own ink rather than reusing the page text tokens',
  /\.mp-hero \.mp-alliance\s*\{\s*color:\s*#/.test(css));

ok('the landing points its canonical and og:url at the live domain',
  /<link rel="canonical" href="https:\/\/marapet\.app\/">/.test(landing) &&
  /og:url" content="https:\/\/marapet\.app\/"/.test(landing));
ok('and offers a share image', /og:image" content="https:\/\/marapet\.app\/og-image\.jpg"/.test(landing));
ok('the share image ships', fs.existsSync(path.join(ROOT, 'public', 'og-image.jpg')));

// The hero is full-bleed: a boxed hero with the page showing either side reads
// as a broken image rather than as a design.
ok('the hero section is full-bleed, with the column nested inside it',
  /<section class="mp-hero">\s*\n\s*<div class="mp-wrap">/.test(landing));

/* ═══════════════════ 6. contrast ═══════════════════ */
section('Contrast, computed from the tokens');
const contrast = require('./scripts/contrast');
const c = contrast.check();
ok('every declared text/background pair passes WCAG AA in both themes',
  c.failures.length === 0,
  c.failures.map((f) => `${f.mode} ${f.fg}/${f.bg} ${f.ratio}`).join('; '));
ok('the brand orange still fails as text, so it stays a fill',
  !c.brand_fill_is_text_safe, String(c.brand_fill_as_text_ratio));
const themeCss = read('public/theme.css');
ok('no rule paints white on the brand fill',
  !/background:\s*var\(--mp-accent\)[^}]*color:\s*#fff/i.test(themeCss));
ok('inputs are never under 16px (below that iPhone Safari zooms the page)',
  /\.mp-input[^{]*\{[^}]*font-size:\s*16px/.test(themeCss.replace(/\s+/g, ' ')));
ok('[hidden] is forced, so a display rule cannot leave a dead control on screen',
  /\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(themeCss));

/* ═══════════════════ 7. the HTTP surface ═══════════════════ */
section('The HTTP surface');
const app = express();
app.use('/marapet', require('./src/index'));
const server = app.listen(0);
const PORT = server.address().port;

function req(method, p, { body, headers, cookie } = {}) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({
      host: '127.0.0.1', port: PORT, method, path: '/marapet' + p,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0
      }, cookie ? { Cookie: cookie } : {}, headers || {})
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (_) {}
        resolve({ status: res.statusCode, json: j, text: b, headers: res.headers });
      });
    });
    r.on('error', () => resolve({ status: 0, json: null, text: '' }));
    if (data) r.write(data);
    r.end();
  });
}
function cookieOf(res) {
  const sc = res.headers['set-cookie'] || [];
  const hit = sc.find((c) => c.startsWith('marapet_session='));
  return hit ? hit.split(';')[0] : null;
}

(async function run() {
  const h = await req('GET', '/health');
  ok('health answers', h.status === 200 && h.json.service === 'marapet');
  ok('health states it is not a medical device', h.json.is_medical_device === false);
  ok('health lists what is not built', Array.isArray(h.json.not_built) && h.json.not_built.length >= 3);
  ok('health names no accuracy figure', !/\d+\s*%/.test(JSON.stringify(h.json)));

  const man = await req('GET', '/manifest.webmanifest');
  ok('the manifest is generated', man.status === 200 && man.json.scope === '/marapet/');
  ok("the manifest's start_url is inside its own scope", man.json.start_url.startsWith(man.json.scope));
  ok('the manifest id matches the root', man.json.id === '/marapet/');

  const sw = await req('GET', '/sw.js');
  ok('the worker is generated per root', sw.status === 200 && sw.text.includes('"/marapet/"'));

  // --- signup / signin ---
  const weak = await req('POST', '/api/v1/auth/signup', { body: { email: 'a@b.co', password: 'short' } });
  ok('a short password is refused', weak.status === 400 && weak.json.error === 'password_too_short');
  const published = await req('POST', '/api/v1/auth/signup', { body: { email: 'a@b.co', password: 'Palindrome@7' } });
  ok('a password published in this repo is refused', published.status === 400
    && published.json.error === 'password_is_published');

  const upA = await req('POST', '/api/v1/auth/signup',
    { body: { email: 'owner-a@example.test', password: 'a-long-enough-password' } });
  ok('an owner can sign up', upA.status === 201);
  const ckA = cookieOf(upA);
  ok('signup sets a session cookie', Boolean(ckA));
  ok('the cookie is HttpOnly', (upA.headers['set-cookie'] || []).join(';').includes('HttpOnly'));
  ok('the cookie is scoped to the mount, not the whole origin',
    (upA.headers['set-cookie'] || []).join(';').includes('Path=/marapet/'));

  const upB = await req('POST', '/api/v1/auth/signup',
    { body: { email: 'owner-b@example.test', password: 'another-long-password' } });
  const ckB = cookieOf(upB);

  const dupe = await req('POST', '/api/v1/auth/signup',
    { body: { email: 'owner-a@example.test', password: 'a-long-enough-password' } });
  ok('a duplicate email is refused', dupe.status === 400 && dupe.json.error === 'email_taken');

  ok('an unauthenticated read is 401', (await req('GET', '/api/v1/pets')).status === 401);

  // --- pets ---
  const petA = await req('POST', '/api/v1/pets',
    { cookie: ckA, body: { name: 'Rufo', breed_size: 'medium', weight_kg: 18, birth_date: '2021-04-02' } });
  ok('a pet is created', petA.status === 201 && petA.json.pet.id);
  const PA = petA.json.pet.id;
  const petB = await req('POST', '/api/v1/pets', { cookie: ckB, body: { name: 'Luna', breed_size: 'toy', weight_kg: 3 } });
  const PB = petB.json.pet.id;

  ok('an unanswered yes/no stays null rather than defaulting to false',
    petA.json.pet.neutered === null || petA.json.pet.neutered === undefined);

  const cross = await req('GET', `/api/v1/pets/${PB}/today`, { cookie: ckA });
  ok("reading another owner's pet is 404, not 403", cross.status === 404);
  const crossPatch = await req('PATCH', `/api/v1/pets/${PB}`, { cookie: ckA, body: { name: 'Stolen' } });
  ok("writing another owner's pet is 404", crossPatch.status === 404);

  // --- today with nothing recorded ---
  const empty = await req('GET', `/api/v1/pets/${PA}/today`, { cookie: ckA });
  ok('with no readings, has_data is false', empty.status === 200 && empty.json.has_data === false);
  ok('and NO metric value is returned', empty.json.metrics.length === 0);
  ok('and no sample number appears anywhere in the response',
    !/\b(72|80|95|120)\b/.test(JSON.stringify(empty.json.metrics)));

  // --- devices + ingest ---
  const dev = await req('POST', '/api/v1/devices', { cookie: ckA, body: { label: 'Collar', pet_id: PA } });
  ok('a device key is minted', dev.status === 201 && /^mp_dev_/.test(dev.json.key));
  ok('the key is flagged as shown once', dev.json.key_shown_once === true);
  const KEY = dev.json.key;

  const list = await req('GET', '/api/v1/devices', { cookie: ckA });
  ok('the key is NEVER returned again by a read',
    !JSON.stringify(list.json).includes(KEY));

  const ping = await req('GET', '/api/v1/ingest/ping', { headers: { Authorization: 'Bearer ' + KEY } });
  ok('a device key authenticates for ingest', ping.status === 200 && ping.json.ok);

  const readBack = await req('GET', '/api/v1/pets', { headers: { Authorization: 'Bearer ' + KEY } });
  ok('a device key can read NOTHING back', readBack.status === 401);

  const post1 = await req('POST', '/api/v1/readings', {
    headers: { Authorization: 'Bearer ' + KEY },
    body: { recorded_at: '2026-10-17T03:00:00.000Z', metrics: { heart_rate_bpm: 78, resp_rate_bpm: 22 } }
  });
  ok('a device posts readings', post1.status === 201 && post1.json.stored === 2);

  const post2 = await req('POST', '/api/v1/readings', {
    headers: { Authorization: 'Bearer ' + KEY },
    body: { recorded_at: '2026-10-17T03:00:00.000Z', metrics: { heart_rate_bpm: 78, resp_rate_bpm: 22 } }
  });
  ok('an identical retry stores nothing (idempotent on device+instant+metric)',
    post2.json.stored === 0 && post2.json.duplicates === 2);

  const mixed = await req('POST', '/api/v1/readings', {
    headers: { Authorization: 'Bearer ' + KEY },
    body: { recorded_at: '2026-10-17T04:00:00.000Z',
      metrics: { heart_rate_bpm: 80, blood_pressure_systolic: 120, paw_temperature: 31 } }
  });
  ok('unknown metrics are rejected while the known one is stored', mixed.json.stored === 1);
  ok('and every rejection is NAMED back to the device',
    mixed.json.rejected.length === 2 &&
    mixed.json.rejected.every((r) => r.reason === 'unknown_metric' && r.metric));

  const lying = await req('POST', '/api/v1/readings', {
    headers: { Authorization: 'Bearer ' + KEY },
    body: { samples: [{ metric: 'resp_rate_bpm', value: 21, source: 'video', confidence: 'high',
      recorded_at: '2026-10-17T05:00:00.000Z' }] }
  });
  const after = await req('GET', `/api/v1/pets/${PA}/today`, { cookie: ckA });
  const respRow = after.json.metrics.find((m) => m.metric === 'resp_rate_bpm');
  ok('a device cannot label its own reading as a video estimate',
    lying.json.stored === 1 && respRow && respRow.source === 'device');

  const badKey = await req('POST', '/api/v1/readings', {
    headers: { Authorization: 'Bearer mp_dev_notarealkey' },
    body: { metrics: { heart_rate_bpm: 80 } }
  });
  ok('an unknown device key is refused', badKey.status === 401);

  const noKey = await req('POST', '/api/v1/readings', { body: { metrics: { heart_rate_bpm: 80 } } });
  ok('ingest with no key at all is refused', noKey.status === 401);

  // a device bound to pet A cannot write to pet B even if it asks
  const crossIngest = await req('POST', '/api/v1/readings', {
    headers: { Authorization: 'Bearer ' + KEY },
    body: { pet_id: PB, recorded_at: '2026-10-17T06:00:00.000Z', metrics: { heart_rate_bpm: 99 } }
  });
  const bToday = await req('GET', `/api/v1/pets/${PB}/today`, { cookie: ckB });
  ok("a bound device cannot write into another owner's pet",
    !bToday.json.metrics.some((m) => Number(m.value) === 99));

  const rev = await req('DELETE', '/api/v1/devices/' + dev.json.device.id, { cookie: ckA });
  ok('a key can be revoked', rev.status === 200);
  const afterRev = await req('GET', '/api/v1/ingest/ping', { headers: { Authorization: 'Bearer ' + KEY } });
  ok('a revoked key stops working immediately', afterRev.status === 401);

  // --- today with data ---
  const today = await req('GET', `/api/v1/pets/${PA}/today`, { cookie: ckA });
  ok('readings now appear', today.json.has_data === true && today.json.metrics.length > 0);
  const hr = today.json.metrics.find((m) => m.metric === 'heart_rate_bpm');
  ok('a reading carries its band', hr && hr.band && hr.band.min);
  ok('and the band carries its basis', hr && /reference range/i.test(hr.band.basis));

  // --- breathing ---
  const lowConf = await req('POST', `/api/v1/pets/${PA}/breathing`, {
    cookie: ckA, body: { series: new Array(900).fill(0.5), fps: 30 }
  });
  ok('a flat video returns NO number and says why',
    lowConf.status === 200 && lowConf.json.measured === false && lowConf.json.reason);
  ok('and no bpm field is present at all', lowConf.json.bpm === undefined);

  const realClip = await req('POST', `/api/v1/pets/${PA}/breathing`, {
    cookie: ckA, body: { series: sine(26, 30, 30, 1.5, 11), fps: 30 }
  });
  ok('a readable clip returns a figure', realClip.json.measured === true && realClip.json.bpm > 0);
  ok('labelled as an estimate from video', realClip.json.source === 'video'
    && realClip.json.label_key === 'estimate_from_video');
  ok('with a confidence', ['high', 'medium', 'low'].includes(realClip.json.confidence));

  const crossBreath = await req('POST', `/api/v1/pets/${PB}/breathing`, {
    cookie: ckA, body: { series: sine(26, 30, 30, 1.5, 11), fps: 30 }
  });
  ok("a breathing check cannot be written to another owner's pet", crossBreath.status === 404);

  // --- alerts ---
  const rule = await req('POST', `/api/v1/pets/${PA}/alert-rules`,
    { cookie: ckA, body: { metric: 'heart_rate_bpm', max_value: 70 } });
  ok('an owner sets their own limit', rule.status === 200 && rule.json.rule.max_value === 70);
  const badRule = await req('POST', `/api/v1/pets/${PA}/alert-rules`,
    { cookie: ckA, body: { metric: 'blood_pressure_systolic', max_value: 180 } });
  ok('a rule on an unsupported metric is refused', badRule.status === 400);
  const noLimit = await req('POST', `/api/v1/pets/${PA}/alert-rules`,
    { cookie: ckA, body: { metric: 'hrv_ms' } });
  ok('a rule with neither limit is refused', noLimit.status === 400);

  // --- report ---
  const rep = await req('GET', `/api/v1/pets/${PA}/report?lang=en`, { cookie: ckA });
  ok('a report is produced with no model configured', rep.status === 200 && rep.json.body.length > 40);
  ok('and it is LABELLED as written without one',
    rep.json.composed_by === 'heuristic' && rep.json.is_simulated === true);
  ok('the report names no condition', !/heart failure|disease|cancer/i.test(rep.json.body));
  ok('the report carries the disclaimer, appended by code after verification',
    /not a medical device/i.test(rep.json.body));
  ok('the disclaimer is not something the model could have been asked to write',
    /withDisclaimer/.test(stripComments(read('src/report.js'))));
  const repEs = await req('GET', `/api/v1/pets/${PA}/report?lang=es`, { cookie: ckA });
  ok('the Spanish report uses full orthography',
    /[áéíóúñ]/.test(repEs.json.body), repEs.json.body.slice(0, 80));

  const crossRep = await req('GET', `/api/v1/pets/${PB}/report`, { cookie: ckA });
  ok("another owner's report is 404", crossRep.status === 404);

  // --- share link ---
  const share = await req('POST', `/api/v1/pets/${PA}/share`, { cookie: ckA, body: { days: 14 } });
  ok('a vet share link is minted', share.status === 201 && share.json.url.includes('/r/'));
  const token = share.json.url.split('/r/')[1];
  const pub = await req('GET', '/api/v1/public/share/' + token);
  ok('the link reads without a session', pub.status === 200 && pub.json.pet);
  const blob = JSON.stringify(pub.json);
  ok('the shared view carries NO owner email', !blob.includes('owner-a@example.test'));
  ok('no account id', !/"account_id"/.test(blob));
  ok('and it carries the disclaimer', /not a medical device/i.test(blob));
  const badToken = await req('GET', '/api/v1/public/share/aaaaaaaaaaaaaaaaaaaa');
  ok('an unknown share token is 404', badToken.status === 404);

  // --- 404 is MaraPet's, never the CRM's ---
  const nf = await req('GET', '/definitely-not-a-page');
  ok('an unowned path returns a branded 404', nf.status === 404 && /MaraPet/.test(nf.text));
  const nfApi = await req('GET', '/api/v1/nope');
  ok('an unowned API path returns JSON 404', nfApi.status === 404 && nfApi.json.error === 'not_found');

  /* ── what the security review found, each with the test that keeps it fixed ── */
  section('Security review regressions');

  // 1. A non-string name threw a TypeError inside an async handler, which
  //    Express 4 cannot catch and src/server.js escalates to process.exit —
  //    taking down the whole CRM from an unauthenticated endpoint.
  for (const bad of [{}, 123, [], true]) {
    const r = await req('POST', '/api/v1/auth/signup',
      { body: { email: `crash-${Math.random().toString(36).slice(2)}@example.test`,
                password: 'a-long-enough-password', name: bad } });
    ok(`a ${Array.isArray(bad) ? 'array' : typeof bad} name does not crash the process`,
      r.status === 201 || r.status === 400, 'status ' + r.status);
  }
  ok('the server is still up after those', (await req('GET', '/health')).status === 200);

  // 2. tenant_id was assigned in two statements with a literal 0 placeholder.
  //    A failure between them left a usable account in a SHARED tenant 0.
  const authSrc = stripComments(read('src/auth.js'));
  ok('the account insert is ONE atomic statement, with no placeholder tenant',
    /WITH new_id AS/.test(authSrc) && !/VALUES \(0, :email/.test(authSrc));
  ok('and a row whose tenant is not its own id fails closed',
    /row\.tenant_id !== row\.id/.test(authSrc));
  ok('the schema makes that structurally impossible too',
    /ck_mp_accounts_self_tenant/.test(read('migrations/20261017_marapet_tables.sql')));
  const everyAccount = fake._tables.mp_accounts;
  ok('every account created in this run has tenant_id === id',
    everyAccount.length > 0 && everyAccount.every((a) => a.tenant_id === a.id));
  ok('and none landed in the shared tenant 0',
    everyAccount.every((a) => a.tenant_id !== 0));

  // 3. An alert could fire on a value the ingest contract had just REFUSED.
  const dev2 = await req('POST', '/api/v1/devices', { cookie: ckA, body: { label: 'C2', pet_id: PA } });
  await req('POST', `/api/v1/pets/${PA}/alert-rules`,
    { cookie: ckA, body: { metric: 'heart_rate_bpm', max_value: 100 } });
  const beforeAlerts = (await req('GET', `/api/v1/pets/${PA}/alerts`, { cookie: ckA })).json.alerts.length;
  const impossible = await req('POST', '/api/v1/readings', {
    headers: { Authorization: 'Bearer ' + dev2.json.key },
    body: { recorded_at: new Date(Date.now() - 60000).toISOString(), metrics: { heart_rate_bpm: 50000 } }
  });
  const afterAlerts = (await req('GET', `/api/v1/pets/${PA}/alerts`, { cookie: ckA })).json.alerts.length;
  ok('a physically impossible value is refused', impossible.json.stored === 0);
  ok('and it fires NO alert, because alerts run on validated rows only',
    afterAlerts === beforeAlerts, `${beforeAlerts} -> ${afterAlerts}`);
  const realAlert = await req('POST', '/api/v1/readings', {
    headers: { Authorization: 'Bearer ' + dev2.json.key },
    body: { recorded_at: new Date(Date.now() - 30000).toISOString(), metrics: { heart_rate_bpm: 140 } }
  });
  ok('a real reading past the limit DOES fire one', realAlert.json.alerts_fired === 1);
  ok('the validated rows are not leaked back to the device',
    realAlert.json.stored_rows === undefined);

  // 4. window=constructor reached the query through prototype inheritance.
  const proto = await req('GET', `/api/v1/pets/${PA}/trends?metric=heart_rate_bpm&window=constructor`,
    { cookie: ckA });
  ok('an inherited property is not a valid window', proto.status === 400);

  // 5. ?date=9999-99-99 matched the shape check and then threw in Postgres.
  const badDate = await req('GET', `/api/v1/pets/${PA}/report?date=9999-99-99`, { cookie: ckA });
  ok('an impossible calendar date is refused, not sent to the database',
    badDate.status === 400 && badDate.json.error === 'date_invalid');

  // 6. /health echoed the driver's error message to the open internet.
  ok('health never echoes a database error message',
    !/database_error/.test(stripComments(read('src/index.js'))));

  // 7. The share page promises a link can be revoked, so it must be revocable.
  const share2 = await req('POST', `/api/v1/pets/${PA}/share`, { cookie: ckA, body: { days: 7 } });
  const tok2 = share2.json.url.split('/r/')[1];
  ok('a fresh share link reads', (await req('GET', '/api/v1/public/share/' + tok2)).status === 200);
  const links = await req('GET', `/api/v1/pets/${PA}/share`, { cookie: ckA });
  ok('an owner can list their links', links.status === 200 && links.json.links.length >= 1);
  ok('and the listing never returns a token', !JSON.stringify(links.json).includes(tok2));
  const revoked = await req('DELETE', '/api/v1/share/' + links.json.links[0].id, { cookie: ckA });
  ok('an owner can revoke a link', revoked.status === 200);
  ok('and the revoked link stops reading immediately',
    (await req('GET', '/api/v1/public/share/' + tok2)).status === 404);
  const crossRevoke = await req('DELETE', '/api/v1/share/' + links.json.links[0].id, { cookie: ckB });
  ok("another owner cannot revoke someone else's link", crossRevoke.status === 404);

  // 8. One throw must not take the CRM down with it.
  const indexSrc = stripComments(read('src/index.js'));
  ok('every route registration is wrapped once, at the router',
    /router\[method\] = \(path, \.\.\.handlers\) => original\(path, \.\.\.handlers\.map\(safe\)\)/.test(indexSrc));
  ok('and the router carries its own last-resort error handler',
    /router\.use\(\(err, req, res, next\)/.test(indexSrc));

  // 9. The body cap: the comment used to claim a protection that never ran.
  ok('a hard body ceiling is enforced in the router, not only declared',
    /body_too_large/.test(indexSrc));
  const huge = await req('POST', `/api/v1/pets/${PA}/readings`,
    { cookie: ckA, body: { samples: [], padding: 'x'.repeat(200 * 1024) } });
  ok('an oversized body is refused with 413', huge.status === 413, 'status ' + huge.status);

  // 10. The open redirect, fixed in src/app.js for all three brand domains.
  //     `/marapet//evil.example/x` captured `//evil.example/x`, which is a
  //     protocol-relative URL every browser resolves against the current
  //     scheme — a phishing link starting on the product's own domain.
  const appSrc = stripComments(fs.readFileSync(path.join(ROOT, '..', '..', 'src', 'app.js'), 'utf8'));
  const rawRedirects = appSrc.match(/res\.redirect\(301, \(legacy\[\d\] \|\| '\/'\)/g) || [];
  ok('no host handler echoes a captured path straight into a redirect',
    rawRedirects.length === 0, rawRedirects.join(' '));

  // BEHAVIOUR, NOT THE PRESENCE OF A NAME. The first version of this check was
  // `/replace\(.../.test(src) || /toPath/.test(src)`, which still passed after
  // the normaliser was gutted, because the gutted version is still CALLED
  // toPath. An assertion that survives deleting the guard is not an assertion.
  const defs = appSrc.match(/const toPath = [^;]+;/g) || [];
  ok('every host handler defines the path normaliser', defs.length >= 3, String(defs.length));
  let normalisersOk = defs.length >= 3;
  for (const def of defs) {
    let fn;
    try { fn = new Function(def + ' return toPath;')(); } catch (_) { normalisersOk = false; continue; }
    for (const hostile of ['//evil.example.com/x', '///evil.example.com', '//evil.example.com']) {
      const out = String(fn(hostile));
      if (out.startsWith('//') || !out.startsWith('/')) normalisersOk = false;
    }
    if (fn('/ok/path') !== '/ok/path') normalisersOk = false;   // still works normally
    if (fn(undefined) !== '/') normalisersOk = false;
  }
  ok('and each one turns a protocol-relative path into a rooted one',
    normalisersOk, defs.map((d) => d.slice(0, 60)).join(' | '));

  // --- tenant_id from a body is never honoured ---
  const inject = await req('POST', '/api/v1/pets',
    { cookie: ckA, body: { name: 'Injected', tenant_id: 999999, account_id: 999999 } });
  ok('a tenant_id in the body is ignored', inject.status === 201
    && fake._tables.mp_pets.find((p) => p.name === 'Injected').tenant_id !== 999999);

  server.close();

  /* ═══════════════════ summary ═══════════════════ */
  console.log('\n' + '─'.repeat(64));
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  ✗ ' + f));
  }
  console.log(`\nMaraPet SIT: ${pass}/${pass + fail}`);
  console.log('\nNOT COVERED, and only verifiable elsewhere:');
  console.log('  - A real Anthropic call. The model path is verifiable only against');
  console.log('    production (GET /marapet/health -> model_configured).');
  console.log('  - Real Postgres. This run uses an in-memory stand-in.');
  console.log('  - A real device, a real camera, and a real dog.');
  console.log('  - Whether the video estimate matches a vet with a stopwatch. That');
  console.log('    study has not been run, which is why the figure is labelled an');
  console.log('    estimate everywhere it appears.');
  process.exit(fail ? 1 : 0);
}());
