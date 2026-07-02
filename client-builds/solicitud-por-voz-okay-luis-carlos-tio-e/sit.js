// =====================================================
// SIT harness — in-process, self-hosted. Boots the sub-app on an ephemeral
// port, mints a JWT with JWT_SECRET, and exercises every acceptance criterion
// (1-8, 10). Exits 0 (all pass) or non-zero (any fail) + prints a markdown
// summary of failed checks.
//   run: node client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/sit.js
// =====================================================

require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('./index');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const TOKEN = jwt.sign({ tenant_id: 1, email: 'sit@digit2ai.com' }, JWT_SECRET);
const OTHER = jwt.sign({ tenant_id: 999999, email: 'other@digit2ai.com' }, JWT_SECRET);

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
    // AC1 — health
    const h = await req('GET', '/health');
    check('AC1 health 200 + shape',
      h.status === 200 && h.json && h.json.status === 'ok' &&
      h.json.service === 'solicitud-por-voz-okay-luis-carlos-tio-e' && !!h.json.version,
      'status=' + h.status + ' body=' + h.text);

    // AC2 — ES page with <video and Spanish <h1>
    const es = await req('GET', '/');
    check('AC2 ES page has <video + "Medición Facial"',
      es.status === 200 && /<video/i.test(es.text) && /<h1[^>]*>\s*Medición Facial/i.test(es.text),
      'status=' + es.status);

    // AC3 — EN page with English <h1>
    const en = await req('GET', '/?lang=en');
    check('AC3 EN page has English <h1> "Facial Measurement"',
      en.status === 200 && /<h1[^>]*>\s*Facial Measurement/i.test(en.text),
      'status=' + en.status);

    // AC4 — POST valid reading with JWT -> 201 + created row
    const c = await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 72, confidence: 0.8, duration_s: 20 } });
    const row = c.json && c.json.data;
    check('AC4 POST valid -> 201 + row(id,tenant_id,bpm,created_at)',
      c.status === 201 && row && Number.isInteger(row.id) && row.tenant_id === 1 && row.bpm === 72 && !!row.created_at,
      'status=' + c.status + ' body=' + c.text);

    // AC5 — POST without JWT -> 401
    const noauth = await req('POST', '/api/v1/readings', { body: { bpm: 72 } });
    check('AC5 POST without JWT -> 401', noauth.status === 401, 'status=' + noauth.status);

    // AC6 — POST bpm:"abc" -> 400
    const bad = await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 'abc' } });
    check('AC6 POST bpm:"abc" -> 400', bad.status === 400, 'status=' + bad.status + ' body=' + bad.text);
    const oob = await req('POST', '/api/v1/readings', { token: TOKEN, body: { bpm: 500 } });
    check('AC6b POST bpm out-of-range -> 400', oob.status === 400, 'status=' + oob.status);

    // AC7 — GET readings scoped to caller's tenant only
    // Seed a row for a different tenant, then confirm tenant 1 never sees it.
    await req('POST', '/api/v1/readings', { token: OTHER, body: { bpm: 88, duration_s: 20 } });
    const list = await req('GET', '/api/v1/readings', { token: TOKEN });
    const arr = list.json && list.json.data;
    const scoped = Array.isArray(arr) && arr.every((r) => r.tenant_id === 1) && arr.some((r) => r.bpm === 72);
    check('AC7 GET readings 200 + array scoped to caller tenant',
      list.status === 200 && scoped, 'status=' + list.status + ' n=' + (arr ? arr.length : 'null'));

    // AC8 — disclaimer route
    const disc = await req('GET', '/disclaimer');
    const discOk = disc.status === 200 && /(no es un dispositivo médico|not a medical device|Aviso Legal|Disclaimer)/i.test(disc.text);
    check('AC8 /disclaimer 200 + non-medical text', discOk, 'status=' + disc.status);

    // AC10 — no regression: a sibling client-build still requires without throwing.
    let siblingOk = true, siblingErr = '';
    try { require('../solicitud-por-voz-contexto-del-cliente-e/index'); }
    catch (e) { siblingOk = false; siblingErr = e.message; }
    check('AC10 sibling client-build still loads (no regression)', siblingOk, siblingErr);
  } catch (e) {
    check('harness', false, 'threw: ' + (e && e.message));
  } finally {
    server.close();
    const failed = results.filter((r) => !r.ok);
    const pass = results.length - failed.length;
    console.log('\n## SIT — solicitud-por-voz-okay-luis-carlos-tio-e\n');
    console.log('| # | Check | Result | Detail |');
    console.log('|---|-------|--------|--------|');
    results.forEach((r, i) => console.log(`| ${i + 1} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.ok ? '' : r.detail} |`));
    console.log(`\n**${pass}/${results.length} passed.**`);
    if (failed.length) {
      console.log('\n### Failed checks\n');
      failed.forEach((r) => console.log(`- ${r.name} — ${r.detail}`));
    }
    process.exit(failed.length ? 1 : 0);
  }
});
