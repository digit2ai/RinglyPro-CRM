// =====================================================
// SIT — EquiMind 3DGS Engine. Runs fully in-memory (GS_FORCE_MEMORY=1 +
// ECPF_FORCE_MEMORY=1) with the MOCK provider, so it exercises the whole pipeline
// (session -> upload -> charge+job -> assets -> scene.get) plus the failure/refund
// path and the MCP tool layer, without a GPU or a DB. Run: node sit.js
// =====================================================
'use strict';

process.env.GS_FORCE_MEMORY = '1';
process.env.ECPF_FORCE_MEMORY = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'sit-secret';
process.env.NODE_ENV = 'test';
process.env.GS_DISABLE_WORKER = '1'; // deterministic: we run jobs inline

const http = require('http');
const jwt = require('jsonwebtoken');
const account = require('../evaluacion-del-caballo-de-paso-fino/models/account');
const gs = require('./models/gs');
const svc = require('./lib/service');
const app = require('./index');

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail || '' }); }

function reqJson(server, method, path, { token, body } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = Object.assign({}, server, { method, path, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, data ? { 'Content-Length': Buffer.byteLength(data) } : {}) });
    const req = http.request(opts, (res) => {
      let s = ''; res.on('data', (d) => s += d); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) {} resolve({ status: res.statusCode, json: j, text: s }); });
    });
    req.on('error', () => resolve({ status: 0 }));
    if (data) req.write(data); req.end();
  });
}

(async () => {
  await gs.init();
  await account.init();

  // Fund a test tenant (JWT signed directly; no password login needed).
  const user = await account.createUser({ email: 'gs-sit@equimind.com', password_hash: 'sit-hash', nombre: 'GS SIT', credits: 0 });
  await account.addCredits(user.id, 50, { kind: 'bonus', description: 'sit' });
  const tenantId = user.id;
  const token = jwt.sign({ uid: user.id, email: user.email }, process.env.JWT_SECRET);

  // ---- Service-level end-to-end (mock) ----
  const startBal = await account.getBalance(tenantId);
  const session = await svc.createSession(tenantId, { kind: 'course_walk', source_type: 'video', title: 'SIT walk' });
  check('createSession -> id + status created', session && session.id != null && session.status === 'created', JSON.stringify(session).slice(0, 80));

  const attached = await svc.attachSource(tenantId, session.id, { frame_count: 60, source_bytes: 4 * 1024 * 1024, source_seconds: 30 });
  check('attachSource -> ready + coverage stamped', attached && attached.status === 'ready' && attached.frame_count === 60, `status=${attached && attached.status}`);

  const disp = await svc.dispatchJob(tenantId, session.id, { runInline: true });
  check('dispatchJob (inline) -> job done', disp && disp.job && disp.job.status === 'done', `status=${disp && disp.job && disp.job.status} err=${disp && disp.error}`);
  const afterBal = await account.getBalance(tenantId);
  check('credit deduction fired (GS_PROCESSING)', afterBal < startBal, `before=${startBal} after=${afterBal}`);

  // scene.get returns playable asset URLs (ply + spz + thumbnail)
  const scenes = await svc.sceneList(tenantId);
  check('scene created + listed', scenes.length === 1 && scenes[0].kind === 'course_walk', `n=${scenes.length}`);
  const scene = await svc.sceneGet(tenantId, scenes[0].id, '/equimind-gs-engine/');
  const hasAssets = scene && scene.assets && scene.assets.ply && scene.assets.spz && scene.assets.thumbnail;
  check('scene.get -> playable asset URLs (ply/spz/thumbnail)', !!hasAssets, `assets=${scene && Object.keys(scene.assets || {})}`);
  check('scene flagged is_simulated (mock, honest)', scene && scene.is_simulated === true, `sim=${scene && scene.is_simulated}`);
  check('scene has report_code + splat_count', scene && /^GS-\d{6}$/.test(scene.report_code) && scene.splat_count > 0, `code=${scene && scene.report_code}`);

  // ---- Failed job auto-refunds credits ----
  process.env.GS_PROCESSING_PROVIDER = 'luma'; // Luma stub throws (no key) -> failure path
  const s2 = await svc.createSession(tenantId, { kind: 'conformation', source_type: 'video' });
  await svc.attachSource(tenantId, s2.id, { frame_count: 40, source_bytes: 2 * 1024 * 1024, source_seconds: 20 });
  const balBeforeFail = await account.getBalance(tenantId);
  const disp2 = await svc.dispatchJob(tenantId, s2.id, { runInline: true });
  const balAfterFail = await account.getBalance(tenantId);
  check('failed job (no provider key) -> job failed', disp2 && disp2.job && disp2.job.status === 'failed', `status=${disp2 && disp2.job && disp2.job.status}`);
  check('failed job AUTO-REFUNDS credits', balBeforeFail === balAfterFail, `before=${balBeforeFail} after=${balAfterFail}`);

  // Luma provider wired: with a key but no uploaded source, it fails at the
  // NO_SOURCE guard BEFORE any network call (proves source is threaded to the provider).
  process.env.LUMA_API_KEY = 'sit-fake-key';
  const prov = require('./lib/provider');
  let lumaErr = null;
  try { await prov.process({ session: { id: 1, kind: 'course_walk' }, sourceBuffers: [] }); } catch (e) { lumaErr = e; }
  check('LumaProvider selected + guards missing source (no network)', prov.name() === 'luma' && lumaErr && lumaErr.code === 'NO_SOURCE', `provider=${prov.name()} code=${lumaErr && lumaErr.code}`);
  delete process.env.LUMA_API_KEY;
  process.env.GS_PROCESSING_PROVIDER = '';

  // ---- MCP tool layer (schema-valid JSON, multi-tenant auth) ----
  const server = app.listen(0);
  const base = { host: '127.0.0.1', port: server.address().port };
  const list = await reqJson(base, 'GET', '/api/v1/mcp/tools/list');
  check('MCP tools/list -> 8 gs.* tools', list.status === 200 && list.json && Array.isArray(list.json.tools) && list.json.tools.length === 8, `n=${list.json && list.json.tools && list.json.tools.length}`);
  const noAuth = await reqJson(base, 'POST', '/api/v1/mcp/tools/call', { body: { tool: 'gs.scene.list' } });
  check('MCP tools/call without JWT -> 401', noAuth.status === 401, `status=${noAuth.status}`);
  const call = await reqJson(base, 'POST', '/api/v1/mcp/tools/call', { token, body: { tool: 'gs.scene.list', arguments: {} } });
  check('MCP gs.scene.list -> ok + schema-valid JSON', call.status === 200 && call.json && call.json.ok === true && Array.isArray(call.json.result), `body=${JSON.stringify(call.json).slice(0, 90)}`);
  const createT = await reqJson(base, 'POST', '/api/v1/mcp/tools/call', { token, body: { tool: 'gs.capture.createSession', arguments: { kind: 'conformation' } } });
  check('MCP gs.capture.createSession -> ok + session', createT.status === 200 && createT.json.ok && createT.json.result.id != null, `status=${createT.status}`);
  const health = await reqJson(base, 'GET', '/health');
  check('GET /health -> shape (db/storage/provider)', health.status === 200 && health.json && health.json.service === 'equimind-gs-engine' && health.json.db && health.json.provider, `status=${health.status}`);
  server.close();

  // ---- Procedural horse provider + report (the $0 report path) ----
  process.env.GS_PROCESSING_PROVIDER = 'procedural';
  const rep = {
    horse_name: 'Estrella de la Sierra', breed: 'Paso Fino', height_cm: 144, length_cm: 152, capture_seconds: 45,
    measurements: [{ key: 'withers', label: 'Alzada a la cruz', value: '14.2 manos', cm: 144, lo: 132, hi: 152, ideal_lo: 140, ideal_hi: 150, at: 144, status: 'ok' }],
    findings: [{ kind: 'watch', title: 'Aplomo anterior izquierdo', detail: 'Rodilla ~3° adelantada; monitorear.' }]
  };
  const s3 = await svc.createSession(tenantId, { kind: 'conformation', source_type: 'video', title: 'Report SIT', report: rep });
  check('createSession stores report on session meta', s3 && s3.meta && s3.meta.report && s3.meta.report.horse_name === 'Estrella de la Sierra', `hn=${s3 && s3.meta && s3.meta.report && s3.meta.report.horse_name}`);
  await svc.attachSource(tenantId, s3.id, { frame_count: 60, source_bytes: 4 * 1024 * 1024, source_seconds: 45 });
  const disp3 = await svc.dispatchJob(tenantId, s3.id, { runInline: true });
  check('procedural job -> done', disp3 && disp3.job && disp3.job.status === 'done', `status=${disp3 && disp3.job && disp3.job.status} err=${disp3 && disp3.error}`);
  const provScenes = await svc.sceneList(tenantId);
  const provScene = await svc.sceneGet(tenantId, provScenes[0].id, '/equimind-gs-engine/');
  check('procedural scene -> horse splat cloud (>1000 splats)', provScene && provScene.splat_count > 1000, `n=${provScene && provScene.splat_count}`);
  check('procedural scene is_simulated (honest) + report attached', provScene && provScene.is_simulated === true && provScene.report && provScene.report.horse_name === 'Estrella de la Sierra', `sim=${provScene && provScene.is_simulated}`);
  const pubScene = await svc.scenePublic(provScene.id, provScene.share_token, '/equimind-gs-engine/');
  check('public share (token) -> report visible without account', pubScene && pubScene.report && pubScene.report.findings.length === 1, `rep=${!!(pubScene && pubScene.report)}`);
  process.env.GS_PROCESSING_PROVIDER = '';

  // ---- report ----
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `# SIT FAIL — EquiMind 3DGS Engine\n${failed.length}/${results.length} checks failed.` : `# SIT PASS — EquiMind 3DGS Engine\nAll ${results.length} checks passed.`);
  results.forEach((r) => console.log(`- [${r.pass ? 'x' : ' '}] ${r.name}${r.pass ? '' : '\n      ↳ ' + r.detail}`));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SIT harness error:', e.stack || e.message); process.exit(1); });
