// =====================================================
// SIT harness — AI Jump Coach Rider Pose Analyzer.
//
//   node sit.js                 -> boots the sub-app in-process on an ephemeral
//                                  port with AIJUMP_FORCE_MEMORY=1 and runs the
//                                  full acceptance suite.
//   SIT_BASE_URL=https://.../ai-jump-coach-rider-pose-analyzer node sit.js
//                               -> tests a remote running instance over HTTP
//                                  (signs tokens with JWT_SECRET, isolated test
//                                  tenants). Note: remote uses the live store.
//
// Exit 0 when every check passes; exit 1 with a markdown failure summary.
// =====================================================

'use strict';

process.env.AIJUMP_FORCE_MEMORY = process.env.AIJUMP_FORCE_MEMORY || '1';

const jwt = require('jsonwebtoken');
const http = require('http');
const { analyze } = require('./lib/faultEngine');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const TENANT_A = 990001;
const TENANT_B = 990002;
const ALLOWED = ['left_behind', 'dropped_rein', 'gaze_drop', 'forward_seat'];

function tokenFor(tenant_id) {
  return jwt.sign({ tenant_id, clientId: tenant_id, email: 'sit@digit2ai.com' }, JWT_SECRET, { expiresIn: '10m' });
}

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail || '' }); }

// ---- Fixture: a deterministic "bad" jump that trips dropped_rein +
// forward_seat. Travel is left->right; hands ride 0.08 below the elbows on the
// ascent (dropped rein); at landing the hip sits 0.10 ahead of the ankle.
function kp(map) {
  const arr = new Array(33).fill(null);
  Object.keys(map).forEach((k) => { arr[k] = map[k]; });
  return arr;
}
function buildFixture() {
  const N = 9, dt = 0.2, frames = [];
  for (let i = 0; i < N; i++) {
    const phase = i / (N - 1);
    const arc = Math.sin(phase * Math.PI);
    const x = 0.30 + 0.40 * phase;        // travel right (sign +1)
    const hipY = 0.60 - 0.18 * arc;       // rises to apex, lowest pos (max y) at ends
    const wristY = 0.10 + (1 - arc) * 0.10; // highest (min y) at apex
    const elbowY = wristY - 0.08;         // wrist 0.08 BELOW elbow -> dropped_rein
    const shoulderY = hipY - 0.15;
    const ankleY = hipY + 0.25;
    const P = (yx, yy) => ({ x: yx, y: yy, z: 0, visibility: 1 });
    frames.push({ t: Math.round(i * dt * 1000) / 1000, keypoints: kp({
      11: P(x, shoulderY), 12: P(x, shoulderY),
      13: P(x, elbowY),    14: P(x, elbowY),
      15: P(x, wristY),    16: P(x, wristY),
      23: P(x, hipY),      24: P(x, hipY),
      27: P(x - 0.10, ankleY), 28: P(x - 0.10, ankleY)  // ankle behind hip -> forward_seat at landing
    }) });
  }
  return frames;
}

async function req(base, method, path, { token, body } = {}) {
  const url = base + path;
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const resp = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: resp.status, json, text };
}

async function run(base) {
  const fixture = buildFixture();

  // 0. Pure fault engine against the fixture (no HTTP/DB).
  {
    const out = analyze(fixture);
    const types = out.faults.map((f) => f.type);
    const shaped = out.faults.every((f) => ALLOWED.indexOf(f.type) >= 0 && typeof f.timestampSec === 'number' && typeof f.confidence === 'number');
    check('0 faultEngine fixture -> shaped faults incl forward_seat',
      out.faults.length >= 1 && shaped && types.indexOf('forward_seat') >= 0,
      `faults=${JSON.stringify(out.faults)}`);
  }

  // 1. health
  {
    const r = await req(base, 'GET', '/health');
    check('1 GET /health 200 + JSON shape',
      r.status === 200 && r.json && r.json.status === 'ok' &&
      r.json.service === 'ai-jump-coach-rider-pose-analyzer' && typeof r.json.version === 'string',
      `status=${r.status} body=${JSON.stringify(r.json)}`);
  }

  // 2. no auth -> 401
  {
    const r = await req(base, 'POST', '/api/v1/analyses', { body: { frames: fixture } });
    check('2 POST /api/v1/analyses no auth -> 401', r.status === 401, `status=${r.status}`);
  }

  // 3. empty frames -> 422
  {
    const r = await req(base, 'POST', '/api/v1/analyses', { token: tokenFor(TENANT_A), body: { frames: [] } });
    check('3 POST empty frames -> 422', r.status === 422, `status=${r.status}`);
  }

  // 4. valid create -> 201 + faults[] shape + types
  let createdId = null;
  {
    const r = await req(base, 'POST', '/api/v1/analyses', { token: tokenFor(TENANT_A), body: { filename: 'jump.mp4', durationSec: 1.6, frames: fixture, lang: 'es' } });
    const ok = r.status === 201 && r.json && r.json.id != null && r.json.tenant_id === TENANT_A &&
      Array.isArray(r.json.faults) && r.json.faults.length >= 1 &&
      r.json.faults.every((f) => ALLOWED.indexOf(f.type) >= 0 && typeof f.timestampSec === 'number' && typeof f.confidence === 'number') &&
      r.json.faults.some((f) => f.type === 'forward_seat');
    createdId = r.json && r.json.id;
    check('4 POST valid -> 201 w/ id + shaped faults[] incl forward_seat', ok, `status=${r.status} body=${JSON.stringify(r.json)}`);
  }

  // 5. GET /:id owner -> 200 ; other tenant -> 404
  {
    const own = await req(base, 'GET', '/api/v1/analyses/' + createdId, { token: tokenFor(TENANT_A) });
    check('5a GET /:id owner -> 200', own.status === 200 && own.json && own.json.id === createdId, `status=${own.status}`);
    const other = await req(base, 'GET', '/api/v1/analyses/' + createdId, { token: tokenFor(TENANT_B) });
    check('5b GET /:id cross-tenant -> 404', other.status === 404, `status=${other.status}`);
  }

  // 6. list scoped to tenant
  {
    const a = await req(base, 'GET', '/api/v1/analyses', { token: tokenFor(TENANT_A) });
    const b = await req(base, 'GET', '/api/v1/analyses', { token: tokenFor(TENANT_B) });
    check('6 GET list tenant-scoped (A>=1, B has not A row)',
      a.status === 200 && a.json && a.json.count >= 1 &&
      b.status === 200 && b.json && !(b.json.data || []).some((x) => x.id === createdId),
      `A=${a.json && a.json.count} B=${b.json && b.json.count}`);
  }

  // 7. pages: / default ES h1, /?lang=en EN h1
  {
    const es = await req(base, 'GET', '/');
    const en = await req(base, 'GET', '/?lang=en');
    check('7a GET / default Spanish <h1>', es.status === 200 && /Analizador de Postura del Jinete/.test(es.text), `status=${es.status}`);
    check('7b GET /?lang=en English <h1>', en.status === 200 && /Rider Pose Analyzer/.test(en.text), `status=${en.status}`);
  }

  // 8. /privacy -> 200 HTML data-handling statement
  {
    const r = await req(base, 'GET', '/privacy');
    check('8 GET /privacy 200 + data-handling text', r.status === 200 && /(procesa|processed)/i.test(r.text) && /(Privacidad|Privacy)/i.test(r.text), `status=${r.status}`);
  }

  // 9. DELETE owner -> ok, cross-tenant -> 404
  {
    const other = await req(base, 'DELETE', '/api/v1/analyses/' + createdId, { token: tokenFor(TENANT_B) });
    check('9a DELETE cross-tenant -> 404', other.status === 404, `status=${other.status}`);
    const own = await req(base, 'DELETE', '/api/v1/analyses/' + createdId, { token: tokenFor(TENANT_A) });
    check('9b DELETE owner -> ok', own.status === 200 && own.json && own.json.ok === true, `status=${own.status}`);
  }
}

function report() {
  const failed = results.filter((r) => !r.pass);
  const lines = [];
  lines.push('# SIT — ai-jump-coach-rider-pose-analyzer');
  lines.push('');
  lines.push(`Result: **${failed.length === 0 ? 'PASS' : 'FAIL'}** (${results.length - failed.length}/${results.length})`);
  lines.push('');
  results.forEach((r) => lines.push(`- ${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`));
  console.log(lines.join('\n'));
  return failed.length === 0;
}

(async function main() {
  let server = null;
  let base = process.env.SIT_BASE_URL;
  try {
    if (!base) {
      const app = require('./index');
      await new Promise((resolve) => { server = http.createServer(app).listen(0, resolve); });
      const port = server.address().port;
      base = `http://127.0.0.1:${port}`;
      // give store.init() (in-memory) a tick
      await new Promise((r) => setTimeout(r, 150));
    } else {
      base = base.replace(/\/+$/, '');
    }
    await run(base);
  } catch (e) {
    check('harness', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : String(e));
  } finally {
    if (server) try { server.close(); } catch (e) {}
  }
  const ok = report();
  process.exit(ok ? 0 : 1);
})();
