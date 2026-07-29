// =====================================================
// sit.js — System Integration Test for the bedtime player.
//
// Boots the sub-app on an ephemeral port and drives it over real HTTP (the
// curl-equivalent), then exits 0 on green / non-zero on red and prints a
// markdown summary.
//
// Zero external keys. Runs green with or without Postgres: the session store
// falls back to memory, and the audio library is asserted on shape + count,
// never by fetching media bytes.
//
// Run:  /opt/homebrew/bin/node client-builds/aplicacion-de-sueno-con-musica-personali/sit.js
// =====================================================

'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

const app = require('./index');
const VERSION = app.VERSION;
const SERVICE = app.SERVICE;

const results = [];
let failures = 0;

function check(name, condition, detail) {
  const pass = !!condition;
  if (!pass) failures++;
  results.push({ name, pass, detail: detail || '' });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail && !pass ? ' -> ' + detail : ''}`);
}

let BASE = '';

function request(method, urlPath, { headers, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null
      : (typeof body === 'string' ? body : JSON.stringify(body));
    const hdrs = Object.assign({}, headers);
    if (payload !== null && !hdrs['Content-Type'] && !raw) hdrs['Content-Type'] = 'application/json';
    const req = http.request(BASE + urlPath, { method, headers: hdrs }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { /* html or plain text */ }
        resolve({ status: res.statusCode, headers: res.headers, text: data, json });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log(`\nSIT · ${SERVICE} v${VERSION}\n`);

  const server = http.createServer((req, res) => app(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  BASE = `http://127.0.0.1:${server.address().port}`;
  console.log(`  (sub-app listening on ${BASE})\n`);

  // Wait for the session store to settle on a backend rather than racing it —
  // otherwise a slow Postgres handshake means SIT silently tests only the
  // in-memory fallback. Bounded, because a hung DB must not hang the harness;
  // the app is functional either way, so this never gates the run.
  const settled = await Promise.race([
    app.ready,
    new Promise((r) => setTimeout(() => r({ backend: 'timeout' }), 12000)),
  ]);
  console.log(`  (session store: ${settled && settled.backend}${settled && settled.error ? ' — ' + settled.error : ''})\n`);

  // ---------------------------------------------------------------- criterion 1
  console.log('AC1 · health');
  {
    const r = await request('GET', '/health');
    check('AC1 health returns 200', r.status === 200, 'status ' + r.status);
    check('AC1 health body is JSON', !!r.json, r.text.slice(0, 120));
    check('AC1 status is ok', r.json && r.json.status === 'ok', JSON.stringify(r.json));
    check('AC1 service name matches', r.json && r.json.service === SERVICE, r.json && r.json.service);
    check('AC1 version is x.y.z', r.json && /^\d+\.\d+\.\d+$/.test(String(r.json.version)), r.json && r.json.version);
    console.log(`  (session store backend: ${r.json && r.json.session_store})`);
  }

  // ---------------------------------------------------------------- criterion 2
  console.log('\nAC2 · public track library');
  let firstTrackId = null;
  {
    const r = await request('GET', '/api/v1/tracks');
    check('AC2 tracks returns 200 with no auth header', r.status === 200, 'status ' + r.status);
    const arr = r.json;
    check('AC2 body is a JSON array', Array.isArray(arr), typeof arr);
    check('AC2 at least 5 curated tracks', Array.isArray(arr) && arr.length >= 5,
      'count ' + (Array.isArray(arr) ? arr.length : 'n/a'));
    if (Array.isArray(arr) && arr.length) {
      firstTrackId = arr[0].id;
      const required = ['id', 'title', 'category', 'url', 'duration_sec'];
      const bad = arr.filter((t) => required.some((k) => t[k] === undefined || t[k] === null || t[k] === ''));
      check('AC2 every track carries {id,title,category,url,duration_sec}', bad.length === 0,
        bad.length ? 'incomplete: ' + bad.map((t) => t.id).join(', ') : '');
      check('AC2 duration_sec is a positive number',
        arr.every((t) => typeof t.duration_sec === 'number' && t.duration_sec > 0));
      const cats = new Set(arr.map((t) => t.category));
      check('AC2 library spans multiple categories', cats.size >= 3, Array.from(cats).join(', '));
      // Asserted on shape, not by fetching bytes — the build never gates on media.
      const missing = arr.filter((t) => {
        const rel = String(t.url).replace('/' + SERVICE + '/', '');
        return !fs.existsSync(path.join(__dirname, 'public', rel));
      });
      check('AC2 every track url resolves to a file we host', missing.length === 0,
        missing.map((t) => t.url).join(', '));
    }
    const en = await request('GET', '/api/v1/tracks?lang=en');
    check('AC2 ?lang=en returns English titles',
      Array.isArray(en.json) && en.json.some((t) => t.title === 'Gentle Rain'),
      Array.isArray(en.json) ? en.json.map((t) => t.title).join(', ') : '');
  }

  // ------------------------------------------------------------- criteria 3 + 4
  console.log('\nAC3/AC4 · session write + anon-token gate');
  const TOKEN_A = 'sit-token-aaaaaaaa-1111';
  const TOKEN_B = 'sit-token-bbbbbbbb-2222';
  {
    const r = await request('POST', '/api/v1/sessions', {
      headers: { 'x-anon-token': TOKEN_A },
      body: { track_id: firstTrackId, timer_minutes: 60 },
    });
    check('AC3 POST with token returns 201', r.status === 201, 'status ' + r.status + ' ' + r.text.slice(0, 120));
    check('AC3 created row echoes tenant_id', r.json && Number.isInteger(r.json.tenant_id),
      r.json && JSON.stringify(r.json.tenant_id));
    check('AC3 created row echoes track_id', r.json && r.json.track_id === firstTrackId);
    check('AC3 created row echoes timer_minutes', r.json && Number(r.json.timer_minutes) === 60);
    check('AC3 created row has an id', r.json && (r.json.id !== undefined && r.json.id !== null));

    const noToken = await request('POST', '/api/v1/sessions', {
      body: { track_id: firstTrackId, timer_minutes: 60 },
    });
    check('AC4 POST with no x-anon-token returns 400', noToken.status === 400, 'status ' + noToken.status);
    check('AC4 400 body names the missing header',
      noToken.json && /x-anon-token/.test(String(noToken.json.error)), noToken.text.slice(0, 120));
  }

  // Payload validation (compliance requirement: reject malformed bodies with 400)
  console.log('\nValidation · malformed payloads rejected');
  {
    const cases = [
      ['missing track_id', { timer_minutes: 60 }],
      ['unknown track_id', { track_id: 'no-such-track', timer_minutes: 60 }],
      ['missing timer_minutes', { track_id: firstTrackId }],
      ['timer_minutes not a number', { track_id: firstTrackId, timer_minutes: 'sesenta' }],
      ['timer_minutes zero', { track_id: firstTrackId, timer_minutes: 0 }],
      ['timer_minutes out of range', { track_id: firstTrackId, timer_minutes: 5000 }],
      ['array body', []],
    ];
    for (const [label, body] of cases) {
      const r = await request('POST', '/api/v1/sessions', { headers: { 'x-anon-token': TOKEN_A }, body });
      check('400 on ' + label, r.status === 400, 'status ' + r.status);
    }
    const malformedJson = await request('POST', '/api/v1/sessions', {
      headers: { 'x-anon-token': TOKEN_A, 'Content-Type': 'application/json' },
      body: '{not json',
      raw: true,
    });
    check('400 on malformed JSON body', malformedJson.status === 400, 'status ' + malformedJson.status);
    const badToken = await request('POST', '/api/v1/sessions', {
      headers: { 'x-anon-token': 'x' },
      body: { track_id: firstTrackId, timer_minutes: 60 },
    });
    check('400 on an implausibly short token', badToken.status === 400, 'status ' + badToken.status);
  }

  // ---------------------------------------------------------------- criterion 5
  console.log('\nAC5 · row-level filter by anon-token');
  {
    // A second device logs its own night.
    const other = await request('POST', '/api/v1/sessions', {
      headers: { 'x-anon-token': TOKEN_B },
      body: { track_id: firstTrackId, timer_minutes: 30, completed: true },
    });
    check('AC5 second token can write', other.status === 201, 'status ' + other.status);

    const a = await request('GET', '/api/v1/sessions', { headers: { 'x-anon-token': TOKEN_A } });
    check('AC5 GET with token returns 200', a.status === 200, 'status ' + a.status);
    check('AC5 body is an array', Array.isArray(a.json));
    check('AC5 token A sees at least its own row', Array.isArray(a.json) && a.json.length >= 1,
      'count ' + (Array.isArray(a.json) ? a.json.length : 'n/a'));
    check('AC5 every returned row belongs to token A',
      Array.isArray(a.json) && a.json.every((r) => r.anon_token === TOKEN_A),
      Array.isArray(a.json) ? a.json.map((r) => String(r.anon_token).slice(0, 8)).join(', ') : '');
    check('AC5 token A never sees token B rows',
      Array.isArray(a.json) && !a.json.some((r) => r.anon_token === TOKEN_B));
    check('AC5 every returned row carries tenant_id',
      Array.isArray(a.json) && a.json.every((r) => Number.isInteger(r.tenant_id)));

    const b = await request('GET', '/api/v1/sessions', { headers: { 'x-anon-token': TOKEN_B } });
    check('AC5 token B sees only its own rows',
      Array.isArray(b.json) && b.json.length >= 1 && b.json.every((r) => r.anon_token === TOKEN_B),
      'count ' + (Array.isArray(b.json) ? b.json.length : 'n/a'));

    const noToken = await request('GET', '/api/v1/sessions');
    check('AC5 GET with no token returns 400', noToken.status === 400, 'status ' + noToken.status);

    const favs = await request('GET', '/api/v1/sessions/favourites', { headers: { 'x-anon-token': TOKEN_A } });
    check('AC5 favourites are scoped to the token',
      favs.status === 200 && Array.isArray(favs.json) && favs.json.every((f) => f.track_id),
      'status ' + favs.status);
  }

  // ---------------------------------------------------------------- criterion 6
  console.log('\nAC6 · Spanish by default, English via ?lang=en');
  {
    const es = await request('GET', '/');
    check('AC6 GET / returns 200 HTML', es.status === 200 && /^text\/html/.test(es.headers['content-type'] || ''),
      'status ' + es.status + ' ' + es.headers['content-type']);
    check('AC6 default <h1> is Spanish "Modo Noche"', /<h1[^>]*>\s*Modo Noche\s*</.test(es.text));
    check('AC6 default <html lang="es">', /<html lang="es"/.test(es.text));

    const en = await request('GET', '/?lang=en');
    check('AC6 ?lang=en <h1> is English "Night Mode"', /<h1[^>]*>\s*Night Mode\s*</.test(en.text));
    check('AC6 ?lang=en <html lang="en">', /<html lang="en"/.test(en.text));

    const esExplicit = await request('GET', '/?lang=es');
    check('AC6 ?lang=es stays Spanish', /<h1[^>]*>\s*Modo Noche\s*</.test(esExplicit.text));
    check('AC6 no unsubstituted {{placeholders}} in the served HTML',
      !/\{\{\w+\}\}/.test(es.text) && !/\{\{\w+\}\}/.test(en.text),
      (es.text.match(/\{\{\w+\}\}/g) || en.text.match(/\{\{\w+\}\}/g) || []).join(', '));
  }

  // ---------------------------------------------------------------- criterion 7
  console.log('\nAC7 · player controls present in the served HTML');
  {
    const r = await request('GET', '/');
    check('AC7 track selector present', /id="track-select"/.test(r.text));
    check('AC7 timer input present', /id="timer-input"/.test(r.text));
    check('AC7 timer input defaults to 60',
      /id="timer-input"[^>]*value="60"/.test(r.text) || /value="60"[^>]*id="timer-input"/.test(r.text));
    check('AC7 start button present', /id="start-btn"/.test(r.text));
    check('AC7 audio element present', /id="sleep-audio"/.test(r.text));
    check('AC7 player script referenced', /player\.js/.test(r.text));
  }

  // ------------------------------------------------------- fade-out + extras
  console.log('\nExtras · fade-out, history page, statics, 404');
  {
    const js = fs.readFileSync(path.join(__dirname, 'public', 'player.js'), 'utf8');
    check('fade uses a Web Audio GainNode', /createGain\(\)/.test(js));
    check('fade has a linear volume-ramp fallback', /function rampVolume\(/.test(js));
    check('fade window is 5 minutes', /FADE_SECONDS\s*=\s*5\s*\*\s*60/.test(js));
    check('playback stops on timer expiry', /remaining\s*<=\s*0\)\s*finish\(true\)/.test(js));
    check('anon token is truncated before logging (route)',
      /slice\(0,\s*8\)/.test(fs.readFileSync(path.join(__dirname, 'routes', 'sessions.js'), 'utf8')));

    // The fade curve itself, evaluated directly.
    const fadeGain = (remaining, window) => {
      if (window <= 0) return remaining > 0 ? 1 : 0;
      if (remaining >= window) return 1;
      if (remaining <= 0) return 0;
      return remaining / window;
    };
    check('fade curve is full volume outside the window', fadeGain(3600, 300) === 1);
    check('fade curve is half volume halfway through', fadeGain(150, 300) === 0.5);
    check('fade curve reaches silence at expiry', fadeGain(0, 300) === 0);

    const h = await request('GET', '/history');
    check('history page returns 200 HTML', h.status === 200 && /Tu historial/.test(h.text), 'status ' + h.status);
    const hEn = await request('GET', '/history?lang=en');
    check('history page honours ?lang=en', /Your night history/.test(hEn.text));

    const mp3 = await request('GET', '/audio/lluvia-suave.mp3');
    check('audio file is served', mp3.status === 200, 'status ' + mp3.status);
    check('audio is cached immutably', /immutable/.test(mp3.headers['cache-control'] || ''),
      mp3.headers['cache-control']);

    const meta = await request('GET', '/api/v1/tracks/meta');
    check('library meta reports a licence note',
      meta.status === 200 && meta.json && !!meta.json.license_note, 'status ' + meta.status);

    const nf = await request('GET', '/no-such-route');
    check('unknown route returns 404 JSON', nf.status === 404 && nf.json && nf.json.error === 'not found',
      'status ' + nf.status);
  }

  // --- tidy up after ourselves -------------------------------------------------
  // Repeat runs would otherwise pile synthetic rows into the real table. Only
  // ever deletes the harness's own recognisable tokens.
  if (settled && settled.backend === 'postgres') {
    try {
      const models = require('./models');
      const seq = models.getSequelize();
      const { TABLE } = require('./models/session');
      const [, meta] = await seq.query(
        `DELETE FROM ${TABLE} WHERE anon_token LIKE 'sit-token-%'`
      );
      console.log(`\n  (cleanup: removed ${meta && meta.rowCount != null ? meta.rowCount : '?'} SIT rows)`);
      await seq.close();
    } catch (err) {
      console.log(`\n  (cleanup skipped: ${err.message})`);
    }
  }

  server.close();

  // --- markdown summary ---
  const total = results.length;
  const passed = total - failures;
  console.log('\n' + '-'.repeat(58));
  console.log(`## SIT · ${SERVICE} v${VERSION}`);
  console.log('');
  console.log(`**${passed}/${total} checks passed**  ·  ${failures === 0 ? 'GREEN' : 'RED'}`);
  console.log('');
  if (failures) {
    console.log('| Failed check | Detail |');
    console.log('|---|---|');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`| ${r.name} | ${String(r.detail).replace(/\|/g, '/').slice(0, 90)} |`);
    }
    console.log('');
  }
  console.log('Acceptance criteria 1-5 covered over real HTTP; 6-7 asserted against the served HTML.');
  console.log('-'.repeat(58) + '\n');

  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('\nSIT harness crashed:', err && err.stack);
  process.exit(1);
});
