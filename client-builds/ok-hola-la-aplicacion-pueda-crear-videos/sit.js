'use strict';
// =====================================================
// SIT harness for OK Hola. Deterministic: forces the in-memory store and the
// mock prompt-builder (no DB, no live LLM). Exits 0 on all-pass, non-zero otherwise.
// Covers acceptance criteria 1-9. Run: `node sit.js`
// =====================================================
process.env.OKHOLA_INMEM = '1';   // in-memory store, no DB
process.env.OKHOLA_FORCE_MOCK = '1'; // deterministic prompt builder
process.env.NODE_ENV = 'test';    // non-prod -> magic-link returns token
process.env.JWT_SECRET = process.env.JWT_SECRET || 'okhola-sit-secret';

const http = require('http');
const app = require('./index');
const store = require('./models');

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail && !cond ? ('  [' + detail + ']') : ''));
}

async function req(server, method, path, { token, body } = {}) {
  const port = server.address().port;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });
  let json = null; try { json = await res.json(); } catch (e) {}
  return { status: res.status, body: json };
}

(async () => {
  const server = http.createServer(app).listen(0);
  await new Promise(r => server.on('listening', r));
  const MOUNT = ''; // app is mounted at root in SIT (no parent prefix)

  try {
    // C1 — health
    let r = await req(server, 'GET', MOUNT + '/health');
    check('C1 health 200 + shape', r.status === 200 && r.body && r.body.status === 'ok' && r.body.service === 'ok-hola-la-aplicacion-pueda-crear-videos' && !!r.body.version, JSON.stringify(r.body));

    // C2 — magic-link returns token in non-prod
    r = await req(server, 'POST', MOUNT + '/api/v1/auth/magic-link', { body: { email: 'samuel@okhola.test' } });
    const loginToken = r.body && r.body.loginToken;
    check('C2 magic-link 200 + token', r.status === 200 && !!loginToken, JSON.stringify(r.body));

    // C3a — verify valid -> JWT
    r = await req(server, 'POST', MOUNT + '/api/v1/auth/verify', { body: { token: loginToken } });
    const JWT = r.body && r.body.jwt;
    check('C3 verify valid -> JWT', r.status === 200 && !!JWT, JSON.stringify(r.body));

    // C3b — verify invalid -> 401
    r = await req(server, 'POST', MOUNT + '/api/v1/auth/verify', { body: { token: 'bogus-token' } });
    check('C3 verify invalid -> 401', r.status === 401, 'status ' + r.status);

    // C4a — generate without JWT -> 401
    r = await req(server, 'POST', MOUNT + '/api/v1/prompts/generate', { body: { rawText: 'algo' } });
    check('C4 generate no-JWT -> 401', r.status === 401, 'status ' + r.status);

    // C4b — generate with JWT -> 201 + structured shape + id
    r = await req(server, 'POST', MOUNT + '/api/v1/prompts/generate', { token: JWT, body: { rawText: 'Un video 3D animado de 30 segundos para TikTok sobre una cafetería.' } });
    const p = r.body && r.body.prompt;
    const s = p && p.structured;
    const shapeOk = s && Array.isArray(s.scenes) && typeof s.style === 'string' && typeof s.durationSec === 'number' && typeof s.aspectRatio === 'string' && typeof s.platform === 'string';
    check('C4 generate 201 + structured + id', r.status === 201 && shapeOk && !!r.body.id, JSON.stringify(r.body).slice(0, 200));
    const promptId = r.body && r.body.id;

    // C5 — rawText >= 2000 chars accepted without truncation
    const big = ('Escena detallada del video. ').repeat(120); // ~3360 chars
    r = await req(server, 'POST', MOUNT + '/api/v1/prompts/generate', { token: JWT, body: { rawText: big } });
    const savedRaw = r.body && r.body.prompt && r.body.prompt.raw_text;
    check('C5 rawText >= 2000 no truncation', r.status === 201 && big.length >= 2000 && savedRaw === big, 'len ' + (savedRaw ? savedRaw.length : 'n/a') + '/' + big.length);

    // C6 — tenant isolation: seed a cross-tenant row, confirm it is NOT returned
    await store._seedPrompt({ tenant_id: 999999, raw_text: 'otro tenant', structured: { scenes: [], style: 'x', durationSec: 5, aspectRatio: '1:1', platform: 'general', title: 'FOREIGN' }, title: 'FOREIGN', source: 'mock' });
    r = await req(server, 'GET', MOUNT + '/api/v1/prompts', { token: JWT });
    const rows = (r.body && r.body.prompts) || [];
    const leak = rows.some(row => row.tenant_id === 999999 || row.title === 'FOREIGN');
    check('C6 tenant-scoped list (no cross-tenant leak)', r.status === 200 && rows.length >= 1 && !leak, 'rows ' + rows.length + ' leak ' + leak);

    // C7 — PATCH updates structured
    r = await req(server, 'PATCH', MOUNT + '/api/v1/prompts/' + promptId, { token: JWT, body: { structured: { scenes: [{ n: 1, description: 'nueva', camera: 'x', action: 'y' }], style: 'anime', durationSec: 45, aspectRatio: '16:9', platform: 'youtube', title: 'Editado' }, title: 'Editado' } });
    check('C7 PATCH 200 + updated', r.status === 200 && r.body.prompt && r.body.prompt.structured.style === 'anime' && r.body.prompt.title === 'Editado', JSON.stringify(r.body).slice(0, 160));

    // C8 — render mocked 202
    r = await req(server, 'POST', MOUNT + '/api/v1/prompts/' + promptId + '/render', { token: JWT });
    check('C8 render 202 mocked', r.status === 202 && r.body.status === 'mocked' && !!r.body.jobId, JSON.stringify(r.body));

    // C9 — publish mocked 202
    r = await req(server, 'POST', MOUNT + '/api/v1/prompts/' + promptId + '/publish', { token: JWT, body: { platform: 'instagram' } });
    check('C9 publish 202 mocked', r.status === 202 && r.body.status === 'mocked' && r.body.platform === 'instagram', JSON.stringify(r.body));

    // Bonus — landing es/en + privacy (criteria 10/11, cheap to include)
    r = await req(server, 'GET', MOUNT + '/');
    const esOk = r.status === 200;
    r = await req(server, 'GET', MOUNT + '/privacy');
    check('C11 privacy 200', r.status === 200, 'status ' + r.status);
    check('C10 landing 200', esOk, '');

  } catch (e) {
    check('harness exception', false, e.message);
  } finally {
    server.close();
  }

  // ---- markdown summary ----
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log('\n## SIT Summary — OK Hola\n');
  console.log('| Result | Check |');
  console.log('|---|---|');
  results.forEach(r => console.log(`| ${r.pass ? 'PASS' : 'FAIL'} | ${r.name} |`));
  console.log(`\n**${passed}/${total} passed**`);

  process.exit(passed === total ? 0 : 1);
})();
