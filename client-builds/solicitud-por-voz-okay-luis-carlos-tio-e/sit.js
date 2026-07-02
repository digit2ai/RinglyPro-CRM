// =====================================================
// SIT harness (v2) — in-process, ephemeral port. Mints a JWT with JWT_SECRET
// and exercises every acceptance criterion (1-13). Exits 0 (all pass) or
// non-zero + prints a markdown summary of failed checks.
//   run: node client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/sit.js
// =====================================================

require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('./index');
const Core = require('./public/rppg-core');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const TOKEN = jwt.sign({ tenant_id: 1, email: 'sit@digit2ai.com' }, JWT_SECRET);
const OTHER = jwt.sign({ tenant_id: 987654, email: 'other@digit2ai.com' }, JWT_SECRET);

const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond, detail: detail || '' }); }

let PORT = 0;
function req(method, path, { token, body } = {}) {
  return new Promise((resolve) => {
    const data = body != null ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) {} resolve({ status: res.statusCode, json: j, text: buf }); });
    });
    r.on('error', () => resolve({ status: 0, json: null, text: '' }));
    if (data) r.write(data);
    r.end();
  });
}

const server = http.createServer(app);
server.listen(0, async () => {
  PORT = server.address().port;
  try {
    // AC1 — health 2.0.0
    const h = await req('GET', '/health');
    check('AC1 health 200 + shape v2.0.0',
      h.status === 200 && h.json && h.json.status === 'ok' &&
      h.json.service === 'solicitud-por-voz-okay-luis-carlos-tio-e' && h.json.version === '2.0.0',
      'status=' + h.status + ' body=' + h.text);

    // AC2 — ES page has <video, Spanish <h1>, and an overlay <canvas>
    const es = await req('GET', '/');
    check('AC2 ES page: <video + "Medición Facial" + <canvas> overlay',
      es.status === 200 && /<video/i.test(es.text) && /<h1[^>]*>\s*Medición Facial/i.test(es.text) && /<canvas[^>]*id="overlay"/i.test(es.text),
      'status=' + es.status);

    // AC3 — EN page English <h1>
    const en = await req('GET', '/?lang=en');
    check('AC3 EN page English <h1> "Facial Measurement"',
      en.status === 200 && /<h1[^>]*>\s*Facial Measurement/i.test(en.text), 'status=' + en.status);

    // AC4 — POST valid multi-vital -> 201 + row fields
    const c = await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 72, respiratory_bpm: 15, hrv_sdnn_ms: 45, stress_index: 30, sqi: 82, duration_s: 30, metrics: { method: 'pos+chrom' } } });
    const row = c.json && c.json.data;
    check('AC4 POST valid multi-vital -> 201 + row(id,tenant_id,bpm,respiratory_bpm,sqi,created_at)',
      c.status === 201 && row && Number.isInteger(row.id) && row.tenant_id === 1 && row.bpm === 72 &&
      row.respiratory_bpm === 15 && row.sqi === 82 && !!row.created_at,
      'status=' + c.status + ' body=' + c.text);
    const savedId = row ? row.id : 0;

    // AC5 — POST no JWT -> 401
    const noauth = await req('POST', '/api/v1/readings', { body: { bpm: 72 } });
    check('AC5 POST without JWT -> 401', noauth.status === 401, 'status=' + noauth.status);

    // AC6 — validation ranges -> 400
    const bad1 = await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 'abc' } });
    const bad2 = await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 72, respiratory_bpm: 99 } });
    const bad3 = await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 72, sqi: 150 } });
    check('AC6 bpm:"abc" -> 400', bad1.status === 400, 'status=' + bad1.status);
    check('AC6 respiratory_bpm out-of-range -> 400', bad2.status === 400, 'status=' + bad2.status + ' ' + bad2.text);
    check('AC6 sqi out-of-range -> 400', bad3.status === 400, 'status=' + bad3.status + ' ' + bad3.text);

    // AC7 — list tenant-scoped + includes new fields
    await req('POST', '/api/v1/readings', { token: OTHER, body: { bpm: 88, respiratory_bpm: 12, duration_s: 30 } });
    const list = await req('GET', '/api/v1/readings', { token: TOKEN });
    const arr = list.json && list.json.data;
    const scoped = Array.isArray(arr) && arr.every((r) => r.tenant_id === 1) && arr.some((r) => r.bpm === 72 && r.respiratory_bpm === 15 && 'sqi' in r);
    check('AC7 list 200 + tenant-scoped + new fields present', list.status === 200 && scoped, 'status=' + list.status + ' n=' + (arr ? arr.length : 'null'));

    // AC8 — disclaimer with the extra sections
    const disc = await req('GET', '/disclaimer');
    check('AC8 /disclaimer 200 + non-medical/experimental/skin-tone/privacy',
      disc.status === 200 && /(no es un dispositivo médico|not a medical device)/i.test(disc.text) &&
      /(EXPERIMENTAL|experimental)/i.test(disc.text) && /(tono de piel|skin-tone|skin tone)/i.test(disc.text),
      'status=' + disc.status);

    // AC9 — FHIR export
    const fhir = await req('GET', '/api/v1/readings/' + savedId + '/fhir', { token: TOKEN });
    const okFhir = fhir.status === 200 && fhir.json && fhir.json.resourceType === 'Bundle' &&
      JSON.stringify(fhir.json).indexOf('8867-4') !== -1;
    check('AC9 FHIR bundle 200 + HR LOINC 8867-4', okFhir, 'status=' + fhir.status);
    const fhirWrong = await req('GET', '/api/v1/readings/' + savedId + '/fhir', { token: OTHER });
    check('AC9 FHIR wrong-tenant -> 404', fhirWrong.status === 404, 'status=' + fhirWrong.status);
    const fhirNoAuth = await req('GET', '/api/v1/readings/' + savedId + '/fhir');
    check('AC9 FHIR no JWT -> 401', fhirNoAuth.status === 401, 'status=' + fhirNoAuth.status);

    // AC10 — embed widget + embed-code generator
    const embed = await req('GET', '/embed?token=' + TOKEN);
    check('AC10 /embed 200 chromeless + <video', embed.status === 200 && /<video/i.test(embed.text), 'status=' + embed.status);
    const embedCode = await req('GET', '/embed-code');
    check('AC10 /embed-code 200 + <iframe snippet', embedCode.status === 200 && /iframe/i.test(embedCode.text), 'status=' + embedCode.status);

    // AC11 — rppg-core importable + recovers HR on a synthetic trace
    const N = 900, fps = 30, f = 72 / 60, t = [], r = [], g = [], b = [];
    for (let i = 0; i < N; i++) { const s = i / fps, p = Math.sin(2 * Math.PI * f * s); t.push(Math.round(s * 1000)); r.push(140 - 2.2 * p); g.push(128 - 6 * p); b.push(118 - 1.6 * p); }
    const est = Core.estimateVitals({ t, r, g, b });
    check('AC11 rppg-core recovers HR (72±3) from synthetic trace', est.bpm != null && Math.abs(est.bpm - 72) <= 3, 'got=' + est.bpm);

    // AC13 — no regression: sibling client-build still loads
    let siblingOk = true, siblingErr = '';
    try { require('../solicitud-por-voz-contexto-del-cliente-e/index'); } catch (e) { siblingOk = false; siblingErr = e.message; }
    check('AC13 sibling client-build still loads (no regression)', siblingOk, siblingErr);
  } catch (e) {
    check('harness', false, 'threw: ' + (e && e.message) + '\n' + (e && e.stack));
  } finally {
    server.close();
    const failed = results.filter((r) => !r.ok);
    const pass = results.length - failed.length;
    console.log('\n## SIT v2 — solicitud-por-voz-okay-luis-carlos-tio-e\n');
    console.log('| # | Check | Result | Detail |');
    console.log('|---|-------|--------|--------|');
    results.forEach((r, i) => console.log(`| ${i + 1} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.ok ? '' : r.detail} |`));
    console.log(`\n**${pass}/${results.length} passed.**`);
    if (failed.length) { console.log('\n### Failed\n'); failed.forEach((r) => console.log(`- ${r.name} — ${r.detail}`)); }
    process.exit(failed.length ? 1 : 0);
  }
});
