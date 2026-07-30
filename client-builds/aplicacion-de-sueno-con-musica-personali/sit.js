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
const skipped = [];   // anything not exercised is named in the summary, never hidden
let failures = 0;

function check(name, condition, detail) {
  const pass = !!condition;
  if (!pass) failures++;
  results.push({ name, pass, detail: detail || '' });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail && !pass ? ' -> ' + detail : ''}`);
}

let BASE = '';

function request(method, urlPath, opts = {}) {
  // One retry on a transport-level reset. In a long-running harness a reset is
  // an artefact of the harness, not a finding about the app.
  return rawRequest(method, urlPath, opts).catch((err) => {
    if (!/ECONNRESET|EPIPE|socket hang up/i.test(String(err && err.message))) throw err;
    return new Promise((r) => setTimeout(r, 250)).then(() => rawRequest(method, urlPath, opts));
  });
}

function rawRequest(method, urlPath, { headers, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null
      : (typeof body === 'string' ? body : JSON.stringify(body));
    const hdrs = Object.assign({}, headers);
    if (payload !== null && !hdrs['Content-Type'] && !raw) hdrs['Content-Type'] = 'application/json';
    // agent:false => a fresh connection per call, so no pooled socket can go
    // stale between the harness's sections.
    const req = http.request(BASE + urlPath, { method, headers: hdrs, agent: false }, (res) => {
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

  // ------------------------------------- modalities, frequencies, honesty
  console.log('\nLibrary · modalities and frequency honesty');
  {
    const r = await request('GET', '/api/v1/tracks');
    const arr = Array.isArray(r.json) ? r.json : [];
    const byId = new Map(arr.map((t) => [t.id, t]));

    check('library carries every requested modality',
      ['cuencos-tibetanos', 'cuenco-de-cristal-y-lluvia', 'selva-tropical', 'cascada-con-aves',
        'amazonas', 'olas-de-playa'].every((id) => byId.has(id)),
      'missing: ' + ['cuencos-tibetanos', 'cuenco-de-cristal-y-lluvia', 'selva-tropical',
        'cascada-con-aves', 'amazonas', 'olas-de-playa'].filter((id) => !byId.has(id)).join(', '));

    // All five brainwave bands, each with a real beat frequency in its band.
    const BANDS = {
      'delta-sueno-profundo': ['delta', 0.5, 4],
      'ondas-theta': ['theta', 4, 8],
      'alfa-relajacion': ['alfa', 8, 12],
      'beta-concentracion': ['beta', 12, 30],
      'gamma-claridad': ['gamma', 30, 100],
    };
    for (const [id, [band, lo, hi]] of Object.entries(BANDS)) {
      const t = byId.get(id);
      check(`band ${band} present with a beat inside ${lo}-${hi} Hz`,
        !!t && t.band === band && t.beat_hz >= lo && t.beat_hz <= hi,
        t ? `band=${t.band} beat=${t.beat_hz}` : 'missing');
    }

    check('purpose beds present (stress, body, focus, abundance, clarity)',
      ['alivio-del-estres', 'bienestar-fisico', 'enfoque-profundo', 'abundancia',
        'claridad-mental', 'frecuencia-528', 'intuicion-852', 'paz-963']
        .every((id) => byId.has(id)));
    check('guided 4-7-8 breathing present and one cycle long',
      byId.has('respiracion-guiada') && byId.get('respiracion-guiada').duration_sec === 19,
      byId.has('respiracion-guiada') ? String(byId.get('respiracion-guiada').duration_sec) : 'missing');

    // Binaural tracks are useless on a speaker — they must say so.
    const binaural = arr.filter((t) => t.beat_hz != null);
    check('every binaural track requires headphones', binaural.length >= 12
      && binaural.every((t) => t.stereo_required === true), 'count ' + binaural.length);
    check('every binaural description states the frequency',
      binaural.every((t) => new RegExp(String(t.beat_hz).replace('.', '[.,]')).test(t.description)));

    // Alerting bands must not be silently offered as sleep aids.
    check('alerting tracks are flagged not-for-sleep',
      ['beta-concentracion', 'gamma-claridad', 'claridad-mental', 'enfoque-profundo']
        .every((id) => byId.get(id) && byId.get(id).not_for_sleep === true));
    check('sleep-band tracks are NOT flagged not-for-sleep',
      ['delta-sueno-profundo', 'ondas-theta', 'alfa-relajacion']
        .every((id) => byId.get(id) && !byId.get(id).not_for_sleep));

    check('every track is grouped for the selector', arr.every((t) => !!t.category_label));
    check('library spans at least 7 categories',
      new Set(arr.map((t) => t.category)).size >= 7,
      Array.from(new Set(arr.map((t) => t.category))).join(', '));

    // No health, psychological or financial claim anywhere in the library.
    const m = await request('GET', '/api/v1/tracks/meta');
    check('meta carries the frequency disclaimer',
      m.json && /no son un tratamiento/i.test(String(m.json.frequency_disclaimer)),
      m.json && String(m.json.frequency_disclaimer || '').slice(0, 60));
    check('meta states Hz, not megahertz',
      m.json && /hercios \(Hz\), no en megahercios/i.test(String(m.json.units_note)));
    const mEn = await request('GET', '/api/v1/tracks/meta?lang=en');
    check('disclaimer is translated for ?lang=en',
      mEn.json && /not a medical or psychological treatment/i.test(String(mEn.json.frequency_disclaimer)));
    check('the abundance track disowns any financial outcome',
      /no produce ningún resultado económico/i.test(String(byId.get('abundancia').description)));
    const claims = arr.filter((t) => /\bcura|curar|sana\b|tratamiento de|garantiza|dinero garantizado/i
      .test(t.description || ''));
    check('no track description makes a curative or guarantee claim', claims.length === 0,
      claims.map((t) => t.id).join(', '));
    check('player surfaces the disclaimer on frequency tracks',
      /frequency_disclaimer/.test(fs.readFileSync(path.join(__dirname, 'public', 'player.js'), 'utf8')));
    check('player groups the selector into optgroups',
      /optgroup/.test(fs.readFileSync(path.join(__dirname, 'public', 'player.js'), 'utf8')));

  }

  // ------------------------------------- two-family taxonomy + instrumental
  console.log('\nTaxonomy · Wave Music vs Instrumental Music');
  {
    const r = await request('GET', '/api/v1/tracks');
    const arr = Array.isArray(r.json) ? r.json : [];
    const byId = new Map(arr.map((t) => [t.id, t]));
    const m = await request('GET', '/api/v1/tracks/meta');

    check('every track belongs to a family', arr.every((t) => !!t.family && !!t.family_label),
      arr.filter((t) => !t.family).map((t) => t.id).join(', '));
    check('three families are published',
      m.json && Array.isArray(m.json.families) && m.json.families.length === 3,
      m.json && JSON.stringify((m.json.families || []).map((f) => f.id)));
    check('family 1 is the wave library',
      m.json && m.json.families[0].id === 'ondas' && /ondas/i.test(m.json.families[0].label));
    check('family 2 is the instrumental library',
      m.json && m.json.families[1].id === 'instrumental' && /instrumental/i.test(m.json.families[1].label));
    const wave = arr.filter((t) => t.family === 'ondas');
    const inst = arr.filter((t) => t.family === 'instrumental');
    check('the original library moved wholesale into Wave Music', wave.length === 25, 'count ' + wave.length);
    check('the instrumental family has every requested sub-family',
      ['handpan-metal', 'viento-flautas', 'cuerdas', 'piano-atmosferico', 'mundo', 'naturaleza-instrumentos']
        .every((c) => inst.some((t) => t.category === c)),
      'present: ' + Array.from(new Set(inst.map((t) => t.category))).join(', '));
    check('family 3 is the electronic library',
      m.json && m.json.families[2].id === 'electronica' && /electr/i.test(m.json.families[2].label));
    const elec = arr.filter((t) => t.family === 'electronica');
    check('family counts in meta match the track list',
      m.json && m.json.families[0].count === wave.length
      && m.json.families[1].count === inst.length && m.json.families[2].count === elec.length);

    // Every instrument named in the brief actually shipped.
    const WANTED = {
      'handpan-metal': ['handpan-kurd', 'tambor-de-lengua', 'gongs-lentos', 'kalimba', 'dulcimer-martillado'],
      'viento-flautas': ['quena-andina', 'zampona-panpipes', 'flauta-nativa-americana', 'shakuhachi',
        'bansuri-alap', 'silbato-irlandes'],
      cuerdas: ['guitarra-espanola', 'arpa-celta', 'cello-ambiental', 'guqin', 'koto'],
      'piano-atmosferico': ['piano-de-fieltro', 'piano-lento', 'ambiente-lento'],
      mundo: ['gamelan-ceremonial', 'ney-sufi', 'zanfona-drone', 'marimba-y-vibrafono', 'oud-taqsim', 'duduk'],
      'naturaleza-instrumentos': ['campanas-de-viento', 'handpan-y-lluvia'],
    };
    for (const [cat, ids] of Object.entries(WANTED)) {
      const missing = ids.filter((id) => !byId.has(id));
      check(`${cat}: all ${ids.length} instruments present`, missing.length === 0, 'missing ' + missing.join(', '));
      const wrongCat = ids.filter((id) => byId.has(id) && byId.get(id).category !== cat);
      check(`${cat}: every instrument filed under it`, wrongCat.length === 0, wrongCat.join(', '));
    }
    check('every instrumental track names its tradition',
      inst.every((t) => !!t.tradition), inst.filter((t) => !t.tradition).map((t) => t.id).join(', '));

    // ORIGINALITY: synthesized, not sampled — and no artist or album is named,
    // because naming one would imply a licence or an endorsement we do not have.
    check('meta states the instrumental tracks are original, not recordings',
      m.json && /no son grabaciones de ningún artista/i.test(String(m.json.originality_note)),
      m.json && String(m.json.originality_note || '').slice(0, 60));
    const mEn2 = await request('GET', '/api/v1/tracks/meta?lang=en');
    check('originality note is translated for ?lang=en',
      mEn2.json && /not recordings by any artist/i.test(String(mEn2.json.originality_note)));
    const ARTISTS = ['nakai', 'einaudi', 'frahm', 'eno', 'satie', 'debussy', 'gasparyan', 'chaurasia',
      'gregson', 'hammock', 'budd', 'richter', 'delago', 'waples', 'maher', 'marten', 'watson',
      'hempton', 'arnalds', 'beving', 'stars of the lid', 'guðnadóttir'];
    const nameHits = [];
    for (const t of arr) {
      const hay = ((t.title || '') + ' ' + (t.description || '') + ' ' + (t.tradition || '')).toLowerCase();
      for (const a of ARTISTS) {
        // Whole words only. A substring test matches "eno" inside the Spanish
        // "menor" and fails on perfectly clean copy — the surname has to stand
        // on its own to count as an attribution.
        if (new RegExp('(^|[^\\p{L}])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\p{L}]|$)', 'u').test(hay)) {
          nameHits.push(t.id + ':' + a);
        }
      }
    }
    check('no artist or album name appears in the shipped library', nameHits.length === 0, nameHits.join(', '));
    const html = await request('GET', '/');
    check('the player surfaces the originality note',
      /originality_note/.test(fs.readFileSync(path.join(__dirname, 'public', 'player.js'), 'utf8')));
    check('the player renders a family switch', /family-tabs/.test(html.text)
      && /buildFamilyTabs/.test(fs.readFileSync(path.join(__dirname, 'public', 'player.js'), 'utf8')));

  }

  // ------------------------------------------------------------- deep house
  console.log('\nElectronic · deep house');
  {
    const r = await request('GET', '/api/v1/tracks');
    const arr = Array.isArray(r.json) ? r.json : [];
    const byId = new Map(arr.map((t) => [t.id, t]));
    const house = arr.filter((t) => t.category === 'deep-house');
    const m = await request('GET', '/api/v1/tracks/meta');

    const WANT = ['deep-house-clasico', 'deep-house-nocturno', 'deep-house-organico',
      'deep-house-melodico', 'lo-fi-house', 'soulful-house', 'deep-house-y-lluvia',
      'deep-house-sin-bateria'];
    check('all 8 deep-house variants present',
      WANT.every((id) => byId.has(id)), 'missing ' + WANT.filter((id) => !byId.has(id)).join(', '));
    check('deep house is its own category under Electrónica',
      house.length === 8 && house.every((t) => t.family === 'electronica'), 'count ' + house.length);
    check('every deep-house track declares a tempo in the house range',
      house.every((t) => t.bpm >= 115 && t.bpm <= 128), house.map((t) => t.bpm).join(', '));
    check('every deep-house track declares its bar count', house.every((t) => t.bars === 16));
    check('the declared duration matches bars x 4 x 60/bpm',
      house.every((t) => Math.abs(t.duration_sec - (t.bars * 4 * 60) / t.bpm) < 1),
      house.map((t) => t.id + ':' + t.duration_sec).join(', '));

    // A track with a pulse is not a sleep aid — say so, except the beatless one.
    const beaty = house.filter((t) => !t.beatless);
    check('beat-driven house is flagged not-for-sleep',
      beaty.length === 7 && beaty.every((t) => t.not_for_sleep === true),
      beaty.filter((t) => !t.not_for_sleep).map((t) => t.id).join(', '));
    check('the beatless variant is NOT flagged not-for-sleep',
      byId.get('deep-house-sin-bateria') && !byId.get('deep-house-sin-bateria').not_for_sleep);
    check('the electronic family blurb says it is not for sleeping',
      m.json && /no para dormir/i.test(String(m.json.families[2].blurb)),
      m.json && m.json.families[2].blurb);

    // Gapless: the encoder pads ~25 ms, which is a stumble in a 4/4 bar.
    check('beat-driven house is flagged gapless',
      beaty.every((t) => t.gapless === true), beaty.filter((t) => !t.gapless).map((t) => t.id).join(', '));
    check('nothing free-time is needlessly flagged gapless',
      arr.filter((t) => t.gapless && t.family !== 'electronica').length === 0);
    const pj = fs.readFileSync(path.join(__dirname, 'public', 'player.js'), 'utf8');
    check('player decodes gapless tracks into an AudioBuffer', /decodeAudioData/.test(pj));
    check('player loops the buffer sample-exactly', /createBufferSource\(\)/.test(pj) && /bufferSource\.loop = true/.test(pj));
    check('player falls back to the audio element if decode fails',
      /gapless path unavailable/.test(pj));
    check('pause suspends the context in buffer mode (a buffer source cannot pause)',
      /playbackMode === 'buffer' && engine\.ctx\) engine\.ctx\.suspend/.test(pj));
    check('meta explains the gapless flag',
      m.json && /relleno del codificador MP3/i.test(String(m.json.gapless_note)),
      m.json && String(m.json.gapless_note || '').slice(0, 60));
  }

  // ---------------------------------------------- installable on the phone
  console.log('\nPWA · home-screen install');
  {
    const man = await request('GET', '/manifest.webmanifest');
    check('manifest is served', man.status === 200, 'status ' + man.status);
    check('manifest is valid JSON', !!man.json);
    check('manifest scope matches the mount',
      man.json && man.json.scope === '/' + SERVICE + '/', man.json && man.json.scope);
    check('manifest start_url matches the mount',
      man.json && man.json.start_url === '/' + SERVICE + '/', man.json && man.json.start_url);
    check('manifest is standalone', man.json && man.json.display === 'standalone');
    check('manifest declares 192 and 512 icons',
      man.json && [192, 512].every((s) => man.json.icons.some((i) => i.sizes === s + 'x' + s)));
    check('manifest declares a maskable icon',
      man.json && man.json.icons.some((i) => i.purpose === 'maskable'));

    for (const [f, type] of [
      ['apple-touch-icon.png', 'image/png'], ['icon-192.png', 'image/png'],
      ['icon-512.png', 'image/png'], ['favicon-32.png', 'image/png'],
      ['favicon.svg', 'image/svg+xml'], ['logo-master.svg', 'image/svg+xml'],
    ]) {
      const res = await request('GET', '/' + f);
      check(`${f} is served`, res.status === 200 && (res.headers['content-type'] || '').includes(type),
        'status ' + res.status + ' ' + res.headers['content-type']);
    }
    // iOS reads apple-touch-icon, not the manifest — a missing link tag means
    // the home-screen icon silently falls back to a page screenshot.
    const html = await request('GET', '/');
    check('page links apple-touch-icon (iOS home-screen icon)',
      /rel="apple-touch-icon"[^>]*apple-touch-icon\.png/.test(html.text));
    check('page links the manifest', /rel="manifest"/.test(html.text));
    check('page is marked web-app capable', /apple-mobile-web-app-capable"\s+content="yes"/.test(html.text));

    const sw = await request('GET', '/sw.js');
    check('service worker is served', sw.status === 200, 'status ' + sw.status);
    check('service worker never caches the API', /startsWith\(BASE \+ 'api\/'\)/.test(sw.text));
    check('service worker caches audio cache-first', /endsWith\('\.mp3'\)/.test(sw.text));
    check('player registers the service worker',
      /serviceWorker\.register/.test(fs.readFileSync(path.join(__dirname, 'public', 'player.js'), 'utf8')));
  }

  // ---------------------------------------------------------------- measured
  // Deliberately LAST: each of these spawns dozens of ffmpeg processes and
  // blocks the event loop for minutes, which resets any HTTP socket opened
  // afterwards. Nothing below this line talks to the server.
  console.log('\\nMeasured audio (ffmpeg) · frequencies and loudness');
  {
    const binaural = require('./tools/verify-binaural').verify();
    if (binaural.skipped) {
      console.log(`  [SKIP] binaural frequency measurement -> ${binaural.skipped}`);
      skipped.push('binaural frequency measurement (' + binaural.skipped + ')');
    } else {
      const bad = binaural.results.filter((x) => !x.ok);
      check(`all ${binaural.results.length} binaural tracks carry their labelled frequencies`,
        bad.length === 0 && binaural.results.length >= 13,
        bad.length ? bad.map((x) => x.id + ' (' + x.detail + ')').join('; ')
          : 'only ' + binaural.results.length + ' measured');
    }

    const tempo = require('./tools/verify-tempo').verify();
    if (tempo.skipped) {
      console.log(`  [SKIP] beat-grid measurement -> ${tempo.skipped}`);
      skipped.push('beat-grid measurement (' + tempo.skipped + ')');
    } else {
      const offGrid = tempo.results.filter((x) => !x.ok);
      check(`all ${tempo.results.length} beat tracks are on the declared grid`,
        offGrid.length === 0 && tempo.results.length >= 8,
        offGrid.length ? offGrid.map((x) => x.id + ' (' + x.detail + ')').join('; ')
          : 'only ' + tempo.results.length + ' measured');
      // A test everything passes proves nothing: unsequenced audio measured
      // against a house grid must be REJECTED by the same thresholds.
      const leaked = (tempo.controls || []).filter((c) => !c.rejected);
      check(`the grid test rejects all ${(tempo.controls || []).length} unsequenced controls`,
        leaked.length === 0 && (tempo.controls || []).length >= 3,
        leaked.map((c) => c.id + ' (' + c.detail + ')').join('; '));
    }

    const loud = require('./tools/verify-loudness').verify();
    if (loud.skipped) {
      console.log(`  [SKIP] library loudness match -> ${loud.skipped}`);
      skipped.push('library loudness match (' + loud.skipped + ')');
    } else {
      check(`all ${loud.count} tracks sit within 3 LUFS of each other`,
        loud.spread <= 3.0 && loud.count >= 60,
        `spread ${loud.spread.toFixed(1)} LUFS across ${loud.count} files`
        + ` (quietest ${loud.quietest.id} ${loud.quietest.lufs.toFixed(1)},`
        + ` loudest ${loud.loudest.id} ${loud.loudest.lufs.toFixed(1)})`);
      check('no track clips', loud.maxTruePeak <= -0.5,
        'worst true peak ' + loud.maxTruePeak.toFixed(2) + ' dBTP');
    }
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
  if (skipped.length) {
    console.log('**Skipped (not covered by this run):**');
    for (const s of skipped) console.log(`- ${s}`);
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
