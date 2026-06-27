// =====================================================
// SIT harness — health, auth, CRUD, mock forward, i18n, tenant scoping.
//
//   node sit.js                  -> boots the sub-app in-process on an ephemeral
//                                   port (forced in-memory store + unset forward
//                                   URL) and runs the full suite.
//   SIT_BASE_URL=https://... node sit.js  -> tests a remote running instance over
//                                   HTTP (signs tokens with JWT_SECRET, uses an
//                                   isolated high test tenant_id).
//
// Exit 0 when every check passes; exit 1 with a markdown failure summary.
// =====================================================

const jwt = require('jsonwebtoken');
const http = require('http');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const TENANT_A = 990001;
const TENANT_B = 990002;

function tokenFor(tenant_id) {
  return jwt.sign({ tenant_id, clientId: tenant_id }, JWT_SECRET, { expiresIn: '10m' });
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || '' });
}

async function req(base, method, path, { token, body } = {}) {
  const url = base + path;
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const resp = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* non-JSON */ }
  return { status: resp.status, json, text };
}

async function run(base) {
  // 1. health
  {
    const r = await req(base, 'GET', '/health');
    check('1 GET /health 200 + JSON shape',
      r.status === 200 && r.json && r.json.status === 'ok' &&
      r.json.service === 'voice-to-intake-transcript-direct-pipeli' && typeof r.json.version === 'string',
      `status=${r.status} body=${JSON.stringify(r.json)}`);
  }

  // 3. no auth -> 401
  {
    const r = await req(base, 'POST', '/api/v1/intake', { body: { transcript: 'hello' } });
    check('3 POST /api/v1/intake no auth -> 401', r.status === 401, `status=${r.status}`);
  }

  // 4. empty transcript -> 422
  {
    const r = await req(base, 'POST', '/api/v1/intake', { token: tokenFor(TENANT_A), body: { transcript: '   ' } });
    check('4 POST empty transcript -> 422', r.status === 422, `status=${r.status}`);
  }

  // 2 + 5. valid create -> 201, triage_bypass true, forward_status mocked (env unset)
  let createdId = null;
  {
    const r = await req(base, 'POST', '/api/v1/intake', { token: tokenFor(TENANT_A), body: { transcript: 'hola mundo', lang: 'es' } });
    const ok = r.status === 201 && r.json && r.json.id != null &&
      r.json.tenant_id === TENANT_A && r.json.triage_bypass === true &&
      typeof r.json.forward_status === 'string';
    createdId = r.json && r.json.id;
    check('2 POST valid -> 201 w/ id, tenant_id, triage_bypass, forward_status', ok,
      `status=${r.status} body=${JSON.stringify(r.json)}`);
    // 5 only meaningful when the forward env is unset (local/in-process run)
    if (!process.env.DIGIT2AI_INTAKE_URL) {
      check('5 forward_status = mocked when DIGIT2AI_INTAKE_URL unset',
        r.json && r.json.forward_status === 'mocked', `forward_status=${r.json && r.json.forward_status}`);
    } else {
      check('5 forward_status = mocked when DIGIT2AI_INTAKE_URL unset (skipped: env set)', true, 'skipped');
    }
  }

  // 6. tenant scoping: tenant B sees none of tenant A's rows
  {
    await req(base, 'POST', '/api/v1/intake', { token: tokenFor(TENANT_B), body: { transcript: 'tenant b row', lang: 'en' } });
    const a = await req(base, 'GET', '/api/v1/intake', { token: tokenFor(TENANT_A) });
    const b = await req(base, 'GET', '/api/v1/intake', { token: tokenFor(TENANT_B) });
    const aOk = a.status === 200 && Array.isArray(a.json) && a.json.every((x) => x.tenant_id === TENANT_A);
    const bOk = b.status === 200 && Array.isArray(b.json) && b.json.every((x) => x.tenant_id === TENANT_B);
    const noLeak = Array.isArray(a.json) && !a.json.some((x) => x.transcript === 'tenant b row');
    check('6 GET /api/v1/intake tenant-scoped (200, array, no cross-tenant)', aOk && bOk && noLeak,
      `aStatus=${a.status} bStatus=${b.status} aCount=${a.json && a.json.length} bCount=${b.json && b.json.length}`);
  }

  // 7. ?lang=es serves Spanish h1 + Send button
  {
    const r = await req(base, 'GET', '/?lang=es');
    const html = r.text || '';
    const hasEsH1 = /Voz a Recepci/.test(html);
    const hasEsBtn = /Enviar a Recepci/.test(html);
    check('7 GET /?lang=es renders Spanish h1 + Send label', r.status === 200 && hasEsH1 && hasEsBtn,
      `status=${r.status} h1=${hasEsH1} btn=${hasEsBtn}`);
  }

  // 8. main page wires SpeechRecognition + fallback message
  {
    const idx = await req(base, 'GET', '/');
    const appjs = await req(base, 'GET', '/app.js');
    const wiresSR = /SpeechRecognition\s*\|\|\s*window\.webkitSpeechRecognition/.test(appjs.text || '');
    const hasFallback = /not supported/i.test(idx.text + appjs.text) || /notSupported/.test(appjs.text || '');
    check('8 app.js initializes SpeechRecognition w/ fallback message', appjs.status === 200 && wiresSR && hasFallback,
      `appjsStatus=${appjs.status} wiresSR=${wiresSR} fallback=${hasFallback}`);
  }
}

function report() {
  const failed = results.filter((r) => !r.pass);
  if (failed.length === 0) {
    console.log(`SIT PASS — ${results.length}/${results.length} checks green`);
    results.forEach((r) => console.log(`  [PASS] ${r.name}`));
    return 0;
  }
  const lines = [];
  lines.push('# SIT FAILURE — voice-to-intake-transcript-direct-pipeli');
  lines.push('');
  lines.push(`**${failed.length} of ${results.length} checks failed.**`);
  lines.push('');
  results.forEach((r) => {
    lines.push(`- ${r.pass ? 'PASS' : '**FAIL**'} — ${r.name}${r.pass ? '' : `  \n    ${r.detail}`}`);
  });
  console.error(lines.join('\n'));
  return 1;
}

(async () => {
  let server = null;
  let base = process.env.SIT_BASE_URL;
  try {
    if (!base) {
      // In-process mode: force in-memory store + mock forward for a clean, deterministic run.
      delete process.env.DATABASE_URL;
      delete process.env.DIGIT2AI_INTAKE_URL;
      delete process.env.DIGIT2AI_INTAKE_TOKEN;
      const app = require('./index');
      await new Promise((resolve) => {
        server = http.createServer(app).listen(0, () => resolve());
      });
      const port = server.address().port;
      base = `http://127.0.0.1:${port}`;
      // give the async store.init() a tick to settle (it falls back to memory)
      await new Promise((r) => setTimeout(r, 200));
    }
    base = base.replace(/\/$/, '');
    await run(base);
  } catch (err) {
    check('harness ran without throwing', false, err.message + '\n' + (err.stack || ''));
  } finally {
    if (server) server.close();
  }
  process.exit(report());
})();
