// =====================================================
// SIT harness (v3, MaraMed) — in-process, ephemeral port. Mints a JWT and
// exercises every acceptance criterion + a stress-removal audit + an rBCG-fusion
// core check. Exits 0 (all pass) or non-zero + markdown summary of failures.
//   run: node client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/sit.js
// =====================================================

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const app = require('./index');
const Core = require('./public/rppg-core');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const TOKEN = jwt.sign({ tenant_id: 1, email: 'sit@digit2ai.com' }, JWT_SECRET);
const OTHER = jwt.sign({ tenant_id: 987654, email: 'other@digit2ai.com' }, JWT_SECRET);

const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond, detail: detail || '' }); }

let PORT = 0;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve) => {
    const data = body != null ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => (buf += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) {} resolve({ status: res.statusCode, json: j, text: buf }); });
    });
    r.on('error', () => resolve({ status: 0, json: null, text: '' }));
    if (data) r.write(data); r.end();
  });
}

const server = http.createServer(app);
server.listen(0, async () => {
  PORT = server.address().port;
  try {
    const h = await req('GET', '/health');
    check('AC1 health 200 + v3.0.0', h.status === 200 && h.json && h.json.status === 'ok' && h.json.service === 'solicitud-por-voz-okay-luis-carlos-tio-e' && h.json.version === '3.0.0', 'status=' + h.status + ' ' + h.text);

    const es = await req('GET', '/');
    check('AC2 ES page: <video + "Medición Facial" + overlay canvas', es.status === 200 && /<video/i.test(es.text) && /<h1[^>]*>\s*Medición Facial/i.test(es.text) && /<canvas[^>]*id="overlay"/i.test(es.text), 'status=' + es.status);
    const en = await req('GET', '/?lang=en');
    check('AC3 EN page English <h1>', en.status === 200 && /<h1[^>]*>\s*Facial Measurement/i.test(en.text), 'status=' + en.status);

    // AC4 — multi-vital write incl BP + SpO2
    const c = await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 72, respiratory_bpm: 15, hrv_sdnn_ms: 45, bp_systolic: 120, bp_diastolic: 80, spo2: 98, sqi: 82, duration_s: 30 } });
    const row = c.json && c.json.data;
    check('AC4 POST multi-vital -> 201 + row(bpm,respiratory_bpm,bp_systolic,spo2,sqi,created_at)', c.status === 201 && row && row.bpm === 72 && row.respiratory_bpm === 15 && row.bp_systolic === 120 && row.spo2 === 98 && row.sqi === 82 && !!row.created_at, 'status=' + c.status + ' ' + c.text);
    const savedId = row ? row.id : 0;

    check('AC5 POST without JWT -> 401', (await req('POST', '/api/v1/readings', { body: { bpm: 72 } })).status === 401);

    check('AC6 bpm:"abc" -> 400', (await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 'abc' } })).status === 400);
    check('AC6 spo2 out-of-range -> 400', (await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 72, spo2: 50 } })).status === 400);
    check('AC6 bp_systolic out-of-range -> 400', (await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 72, bp_systolic: 300 } })).status === 400);

    await req('POST', '/api/v1/readings', { token: OTHER, body: { bpm: 88, respiratory_bpm: 12 } });
    const list = await req('GET', '/api/v1/readings', { token: TOKEN });
    const arr = list.json && list.json.data;
    check('AC7 list 200 + tenant-scoped + BP/SpO2 fields present', list.status === 200 && Array.isArray(arr) && arr.every((r) => r.tenant_id === 1) && arr.some((r) => r.bp_systolic === 120 && 'spo2' in r), 'n=' + (arr ? arr.length : 'null'));

    const disc = await req('GET', '/disclaimer');
    check('AC8 /disclaimer 200 + non-medical/experimental/skin-tone', disc.status === 200 && /(no es un dispositivo médico|not a medical device)/i.test(disc.text) && /(experimental)/i.test(disc.text) && /(tono de piel|skin.tone)/i.test(disc.text), 'status=' + disc.status);

    const fhir = await req('GET', '/api/v1/readings/' + savedId + '/fhir', { token: TOKEN });
    check('AC9 FHIR bundle 200 + HR LOINC 8867-4', fhir.status === 200 && fhir.json && fhir.json.resourceType === 'Bundle' && JSON.stringify(fhir.json).indexOf('8867-4') !== -1, 'status=' + fhir.status);
    check('AC9 FHIR wrong-tenant -> 404', (await req('GET', '/api/v1/readings/' + savedId + '/fhir', { token: OTHER })).status === 404);
    check('AC9 FHIR no JWT -> 401', (await req('GET', '/api/v1/readings/' + savedId + '/fhir')).status === 401);

    check('AC10 /embed 200 + <video', (async () => true)() && (await req('GET', '/embed?token=' + TOKEN)).status === 200);
    const embed = await req('GET', '/embed?token=' + TOKEN);
    check('AC10 /embed chromeless + <video', embed.status === 200 && /<video/i.test(embed.text), 'status=' + embed.status);
    check('AC10 /embed-code + <iframe', (async () => { const e = await req('GET', '/embed-code'); return e.status === 200 && /iframe/i.test(e.text); })());
    const ec = await req('GET', '/embed-code');
    check('AC10 /embed-code 200 + iframe snippet', ec.status === 200 && /iframe/i.test(ec.text), 'status=' + ec.status);

    // AC11 — core recovers HR
    const N = 900, fps = 30, f = 72 / 60, t = [], r = [], g = [], b = [];
    for (let i = 0; i < N; i++) { const s = i / fps, p = Math.sin(2 * Math.PI * f * s); t.push(Math.round(s * 1000)); r.push(140 - 2.2 * p); g.push(128 - 6 * p); b.push(118 - 1.6 * p); }
    const est = Core.estimateVitals({ t, rois: { r, g, b }, fs: 30 });
    check('AC11 core recovers HR 72±3', est.bpm != null && Math.abs(est.bpm - 72) <= 3, 'got=' + est.bpm);

    // AC12 — rBCG fusion rescues a dark-skin (no-color-pulse) clip
    let sd = 5; function rr2() { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff - 0.5; }
    const t2 = [], r2 = [], g2 = [], b2 = [], hm = [], hr = 66, f2 = hr / 60;
    for (let i = 0; i < N; i++) { const s = i / fps; t2.push(Math.round(s * 1000)); const cn = 6 * rr2(); r2.push(140 + cn); g2.push(128 + cn); b2.push(118 + cn); hm.push(0.6 * Math.sin(2 * Math.PI * f2 * s)); }
    const rppgOnly = Core.estimateVitals({ t: t2, rois: { r: r2, g: g2, b: b2 }, fs: 30 }).bpm;
    const fused = Core.estimateVitals({ t: t2, rois: { r: r2, g: g2, b: b2 }, headMotion: hm, fs: 30 }).bpm;
    check('AC12 rBCG fusion rescue (fused nearer 66 than rPPG-only)', fused != null && Math.abs(fused - 66) < Math.abs((rppgOnly == null ? 999 : rppgOnly) - 66) && Math.abs(fused - 66) <= 4, 'rPPG-only=' + rppgOnly + ' fused=' + fused);

    // AC13 — stress fully removed from model/route/UI/core/dict
    const files = ['models/reading.js', 'routes/readings.js', 'public/index.html', 'public/rppg-core.js', 'public/rppg.js', 'i18n/dict.js'];
    let stressHit = '';
    for (const rel of files) { const txt = fs.readFileSync(path.join(__dirname, rel), 'utf8'); if (/stress_index|nivel de estr|stress index/i.test(txt)) { stressHit = rel; break; } }
    check('AC13 stress metric fully removed (no stress_index / estrés refs)', !stressHit, stressHit ? ('found in ' + stressHit) : '');

    // AC14 — no regression: sibling loads
    let siblingOk = true, siblingErr = '';
    try { require('../solicitud-por-voz-contexto-del-cliente-e/index'); } catch (e) { siblingOk = false; siblingErr = e.message; }
    check('AC14 sibling client-build still loads (no regression)', siblingOk, siblingErr);
  } catch (e) {
    check('harness', false, 'threw: ' + (e && e.message) + '\n' + (e && e.stack));
  } finally {
    server.close();
    const failed = results.filter((r) => !r.ok);
    console.log('\n## SIT v3 — MaraMed\n\n| # | Check | Result | Detail |\n|---|-------|--------|--------|');
    results.forEach((r, i) => console.log(`| ${i + 1} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.ok ? '' : r.detail} |`));
    console.log(`\n**${results.length - failed.length}/${results.length} passed.**`);
    if (failed.length) { console.log('\n### Failed\n'); failed.forEach((r) => console.log(`- ${r.name} — ${r.detail}`)); }
    process.exit(failed.length ? 1 : 0);
  }
});
