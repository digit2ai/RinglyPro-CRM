// =====================================================
// Core GS operations, shared by the REST routes and the MCP tool wrappers.
// Every op is tenant-scoped (tenantId passed explicitly). Credit charge happens
// at dispatch; refund is automatic on job failure (see queue.js).
// =====================================================
'use strict';

const store = require('../models/gs');
const pricing = require('./pricing');
const credits = require('./credits');
const queue = require('./queue');
const storage = require('./storage');
const provider = require('./provider');

async function createSession(tenantId, { kind, source_type, title, horse_id, report } = {}) {
  const k = ['course_walk', 'conformation', 'scene'].includes(kind) ? kind : 'course_walk';
  const meta = {};
  const clean = sanitizeReport(report);
  if (clean) meta.report = clean;
  return store.repo.create('sessions', {
    tenant_id: tenantId, kind: k, source_type: source_type === 'photos' ? 'photos' : 'video',
    status: 'created', title: title ? String(title).slice(0, 180) : null, horse_id: horse_id || null,
    frame_count: 0, source_bytes: 0, source_seconds: 0, meta
  });
}

// Attach/replace the analysis report payload on a session (measurements + findings
// + horse identity). This is the REAL analysis output the report renders; the 3D
// shape is generated from it. Callable before dispatch (so the procedural provider
// can scale the model to the measurements) or after (to enrich an existing report).
async function attachReport(tenantId, sessionId, report) {
  const s = await getSession(tenantId, sessionId);
  if (!s) return { error: 'session not found', code: 404 };
  const clean = sanitizeReport(report);
  if (!clean) return { error: 'empty or invalid report', code: 400 };
  await store.repo.update('sessions', { id: s.id }, { meta: Object.assign({}, s.meta || {}, { report: clean }) });
  return { ok: true, report: clean };
}

// Whitelist + cap the report shape so nothing unbounded reaches storage/render.
function sanitizeReport(report) {
  if (!report || typeof report !== 'object') return null;
  const str = (v, n) => (v == null ? null : String(v).slice(0, n));
  const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
  const meas = Array.isArray(report.measurements) ? report.measurements.slice(0, 24).map((m) => ({
    key: str(m.key, 40), label: str(m.label, 80), value: str(m.value, 40), cm: num(m.cm),
    lo: num(m.lo), hi: num(m.hi), ideal_lo: num(m.ideal_lo), ideal_hi: num(m.ideal_hi),
    at: num(m.at), status: ['ok', 'watch', 'info'].includes(m.status) ? m.status : 'info'
  })) : [];
  const find = Array.isArray(report.findings) ? report.findings.slice(0, 20).map((f) => ({
    kind: ['ok', 'watch', 'info'].includes(f.kind) ? f.kind : 'info', title: str(f.title, 160), detail: str(f.detail, 600)
  })) : [];
  // Rich Neural Intelligence findings (severity, code, action, estimate) — the
  // full analysis output, rendered professionally in the report.
  const neural = Array.isArray(report.neural_findings) ? report.neural_findings.slice(0, 30).map((f) => ({
    impact: ['critical', 'high', 'medium', 'low', 'info'].includes(f.impact) ? f.impact : 'info',
    code: str(f.code, 40), title: str(f.title, 200), summary: str(f.summary, 700),
    action: str(f.action, 400), estimate: str(f.estimate, 140), anchor: str(f.anchor, 24)
  })).filter((f) => f.title || f.summary) : [];
  const out = {
    horse_name: str(report.horse_name, 80), breed: str(report.breed, 80),
    owner: str(report.owner, 120), report_date: str(report.report_date, 40),
    capture_seconds: num(report.capture_seconds), height_cm: num(report.height_cm), length_cm: num(report.length_cm),
    measurements: meas, findings: find, neural_findings: neural,
    gait: sanitizeGait(report.gait), conformation: sanitizeConformation(report.conformation)
  };
  const has = out.horse_name || out.breed || meas.length || find.length || neural.length || out.height_cm || out.length_cm || out.gait || out.conformation;
  return has ? out : null;
}

// The real gait analysis (from the juez engine) — the crown-jewel data the report
// leans on for credibility. Whitelisted + capped; free-text bounded.
function sanitizeGait(g) {
  if (!g || typeof g !== 'object') return null;
  const str = (v, n) => (v == null ? null : String(v).slice(0, n));
  const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
  const scores = Array.isArray(g.scores) ? g.scores.slice(0, 12).map((s) => ({ label: str(s.label, 60), pct: num(s.pct), weight: num(s.weight) })) : [];
  const sec = Array.isArray(g.sections) ? g.sections.slice(0, 12).map((s) => ({ titulo: str(s.titulo, 120), cuerpo: str(s.cuerpo, 700), nivel: ['ok', 'watch', 'info'].includes(s.nivel) ? s.nivel : 'info' })) : [];
  const reco = Array.isArray(g.recomendaciones) ? g.recomendaciones.slice(0, 12).map((r) => str(r, 300)) : [];
  const out = {
    modalidad: str(g.modalidad, 60), puntaje_total: num(g.puntaje_total), confianza: num(g.confianza), tiempos: str(g.tiempos, 20),
    cadencia_ppm: num(g.cadencia_ppm), cadencia_band: Array.isArray(g.cadencia_band) ? g.cadencia_band.slice(0, 2).map(num) : null,
    cv_intervalos: num(g.cv_intervalos), simetria_pct: num(g.simetria_pct), elevacion_ant: num(g.elevacion_ant), elevacion_post: num(g.elevacion_post),
    claridad_pct: num(g.claridad_pct), pisadas_count: num(g.pisadas_count), simulado: !!g.simulado,
    resumen: str(g.resumen, 700), veredicto: str(g.veredicto, 400), firma: str(g.firma, 300),
    scores: scores, sections: sec, recomendaciones: reco
  };
  return (out.modalidad || scores.length || out.puntaje_total != null) ? out : null;
}

// Conformation geometry (angles/measures). Every field carries a source so the
// report can label measured vs estimated vs entered — essential for federations.
function sanitizeConformation(c) {
  if (!c || typeof c !== 'object') return null;
  const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
  const str = (v, n) => (v == null ? null : String(v).slice(0, n));
  const items = Array.isArray(c.items) ? c.items.slice(0, 16).map((i) => ({
    key: str(i.key, 40), label: str(i.label, 80), value: num(i.value), unit: str(i.unit, 12),
    ideal_lo: num(i.ideal_lo), ideal_hi: num(i.ideal_hi), anchor: str(i.anchor, 24),
    source: ['measured', 'estimated', 'entered'].includes(i.source) ? i.source : 'entered'
  })) : [];
  return items.length ? { items: items } : null;
}

async function getSession(tenantId, id) {
  const s = await store.repo.find('sessions', { id: parseInt(id, 10) });
  if (!s || String(s.tenant_id) !== String(tenantId)) return null;
  return s;
}

// Register uploaded source (frames/video). buffers optional (disk/S3 already has
// bytes); we validate coverage and stamp counts. Returns the updated session.
async function attachSource(tenantId, sessionId, { frame_count = 0, source_bytes = 0, source_seconds = 0, buffers = [] } = {}) {
  const s = await getSession(tenantId, sessionId);
  if (!s) return { error: 'session not found', code: 404 };
  const frames = frame_count || buffers.length;
  const bytes = source_bytes || buffers.reduce((a, b) => a + (b.length || 0), 0);
  // Coverage validation (min frames / size / duration guards).
  if (s.source_type === 'photos' && frames < pricing.CFG.min_frames) {
    return { error: 'insufficient coverage: need >= ' + pricing.CFG.min_frames + ' frames', code: 422 };
  }
  if (source_seconds > pricing.CFG.max_source_seconds) return { error: 'source too long (max ' + pricing.CFG.max_source_seconds + 's)', code: 422 };
  if (bytes > pricing.CFG.max_source_bytes) return { error: 'source too large', code: 422 };
  await store.repo.update('sessions', { id: s.id }, { status: 'ready', frame_count: frames, source_bytes: bytes, source_seconds: source_seconds || estSeconds(frames) });
  return await store.repo.find('sessions', { id: s.id });
}

function estSeconds(frames) { return Math.round((frames / 5) * 10) / 10; } // ~5fps sample assumption

// Charge credits + enqueue a processing job. Quota-guarded. Returns { job } or error.
async function dispatchJob(tenantId, sessionId, { runInline = false } = {}) {
  const s = await getSession(tenantId, sessionId);
  if (!s) return { error: 'session not found', code: 404 };
  if (!['ready', 'failed'].includes(s.status)) return { error: 'session not ready (status=' + s.status + ')', code: 409 };
  // Concurrency guard.
  const active = await store.repo.findAll('jobs', { tenant_id: tenantId, status: 'running' });
  const queued = await store.repo.findAll('jobs', { tenant_id: tenantId, status: 'queued' });
  if (active.length + queued.length >= pricing.CFG.max_concurrent_jobs_per_tenant) {
    return { error: 'max concurrent jobs reached (' + pricing.CFG.max_concurrent_jobs_per_tenant + ')', code: 429 };
  }
  // Flat 2-credit report fee for the procedural/mock path (no GPU); real Luma
  // scans keep duration-based pricing.
  const providerName = provider.name();
  const cost = (providerName === 'luma')
    ? pricing.jobCredits({ source_seconds: s.source_seconds, storage_bytes: s.source_bytes })
    : pricing.CFG.report_credits;
  const charge = await credits.charge(tenantId, cost, { label: '3D report (' + s.kind + ')' });
  if (!charge.ok) return { error: 'Sin créditos suficientes (necesita ' + cost + ').', code: 402, credits: charge.balance, needed: cost };
  const job = await store.repo.create('jobs', {
    tenant_id: tenantId, session_id: s.id, provider: provider.name(), status: 'queued',
    attempts: 0, credits_charged: charge.charged
  });
  await store.repo.update('sessions', { id: s.id }, { status: 'processing' });
  if (runInline) { try { await queue.processJob(job); } catch (e) { /* refunded inside */ } return { job: await store.repo.find('jobs', { id: job.id }), credits: charge.balance }; }
  return { job, credits: charge.balance };
}

async function jobStatus(tenantId, jobId) {
  const j = await store.repo.find('jobs', { id: parseInt(jobId, 10) });
  if (!j || String(j.tenant_id) !== String(tenantId)) return null;
  return j;
}

async function sceneWithAssets(scene, base) {
  const assets = await store.repo.findAll('assets', { scene_id: scene.id });
  const urls = {};
  for (const a of assets) urls[a.role] = await storage.signedGetUrl(a.object_key, { base, expiresSec: 3600 });
  // The analysis report lives on the originating session's meta (1:1 with scene);
  // surface it here so the shareable report page (public via token) can render it.
  let report = null;
  try { const s = await store.repo.find('sessions', { id: scene.session_id }); report = (s && s.meta && s.meta.report) || null; } catch (e) { report = null; }
  return {
    id: scene.id, kind: scene.kind, title: scene.title, status: scene.status,
    splat_count: Number(scene.splat_count), storage_bytes: Number(scene.storage_bytes),
    is_simulated: !!scene.is_simulated, waypoints: scene.waypoints || [],
    share_token: scene.share_token, created_at: scene.created_at,
    report_code: 'GS-' + String(scene.id).padStart(6, '0'),
    report, provider: (scene.is_simulated ? 'procedural' : 'luma'),
    assets: urls
  };
}

async function sceneGet(tenantId, sceneId, base) {
  const sc = await store.repo.find('scenes', { id: parseInt(sceneId, 10) });
  if (!sc || String(sc.tenant_id) !== String(tenantId)) return null;
  await store.repo.update('scenes', { id: sc.id }, { last_viewed_at: new Date() });
  return sceneWithAssets(sc, base);
}

// Public read via the scene's share token (no account) — for Course Walk links.
async function scenePublic(sceneId, token, base) {
  const sc = await store.repo.find('scenes', { id: parseInt(sceneId, 10) });
  if (!sc || sc.share_token !== token) return null;
  return sceneWithAssets(sc, base);
}

async function sceneList(tenantId) {
  const rows = await store.repo.findAll('scenes', { tenant_id: tenantId }, ['id', 'DESC']);
  const out = [];
  for (const s of rows) {
    let horse_name = null, puntaje = null;
    try { const ses = await store.repo.find('sessions', { id: s.session_id }); const rep = ses && ses.meta && ses.meta.report; if (rep) { horse_name = rep.horse_name || null; puntaje = (rep.gait && rep.gait.puntaje_total != null) ? rep.gait.puntaje_total : null; } } catch (e) {}
    out.push({
      id: s.id, report_code: 'GS-' + String(s.id).padStart(6, '0'), kind: s.kind, title: s.title, status: s.status,
      splat_count: Number(s.splat_count), storage_bytes: Number(s.storage_bytes), is_simulated: !!s.is_simulated,
      share_token: s.share_token, created_at: s.created_at, horse_name: horse_name, puntaje_total: puntaje
    });
  }
  return out;
}

async function sceneDelete(tenantId, sceneId) {
  const sc = await store.repo.find('scenes', { id: parseInt(sceneId, 10) });
  if (!sc || String(sc.tenant_id) !== String(tenantId)) return { error: 'not found', code: 404 };
  const assets = await store.repo.findAll('assets', { scene_id: sc.id });
  for (const a of assets) { try { await storage.remove(a.object_key); } catch (e) {} await store.repo.remove('assets', { id: a.id }); }
  await store.repo.remove('scenes', { id: sc.id });
  return { ok: true, deleted: sc.id };
}

async function setWaypoints(tenantId, sceneId, waypoints) {
  const sc = await store.repo.find('scenes', { id: parseInt(sceneId, 10) });
  if (!sc || String(sc.tenant_id) !== String(tenantId)) return { error: 'not found', code: 404 };
  await store.repo.update('scenes', { id: sc.id }, { waypoints: Array.isArray(waypoints) ? waypoints.slice(0, 100) : [] });
  return { ok: true };
}

// Admin/ops snapshot for the tenant (or all if admin).
async function opsSnapshot(tenantId) {
  const jobs = await store.repo.findAll('jobs', { tenant_id: tenantId });
  const scenes = await store.repo.findAll('scenes', { tenant_id: tenantId });
  const inFlight = jobs.filter((j) => ['queued', 'running'].includes(j.status)).length;
  const failed = jobs.filter((j) => j.status === 'failed').length;
  const done = jobs.filter((j) => j.status === 'done').length;
  const creditsCharged = jobs.reduce((a, j) => a + Number(j.credits_charged || 0), 0);
  const creditsRefunded = jobs.reduce((a, j) => a + Number(j.credits_refunded || 0), 0);
  const storedBytes = scenes.reduce((a, s) => a + Number(s.storage_bytes || 0), 0);
  return {
    jobs_in_flight: inFlight, jobs_done: done, jobs_failed: failed,
    failure_rate_pct: jobs.length ? Number(((failed / jobs.length) * 100).toFixed(1)) : 0,
    credits_charged: creditsCharged, credits_refunded: creditsRefunded, net_credits: creditsCharged - creditsRefunded,
    scenes: scenes.length, stored_gb: Number((storedBytes / (1024 * 1024 * 1024)).toFixed(3)),
    storage_backend: storage.backend(), provider: provider.name()
  };
}

module.exports = {
  createSession, getSession, attachSource, attachReport, dispatchJob, jobStatus,
  sceneGet, scenePublic, sceneList, sceneDelete, setWaypoints, opsSnapshot
};
