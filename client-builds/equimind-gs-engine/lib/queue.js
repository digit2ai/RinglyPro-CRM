// =====================================================
// DB-backed job queue (Redis/BullMQ optional — see DECISIONS.md). A lightweight
// in-process worker claims 'queued' gs_jobs, dispatches to the ProcessingProvider,
// stores the resulting assets, and creates the playable gs_scene. On failure it
// AUTO-REFUNDS the charged credits and records the reason.
// processJob() is also callable synchronously (used by the SIT for determinism).
// =====================================================
'use strict';

const crypto = require('crypto');
const store = require('../models/gs');
const provider = require('./provider');
const storage = require('./storage');
const credits = require('./credits');

function shortToken(sceneId) {
  return crypto.createHmac('sha256', process.env.ECPF_JWT_SECRET || process.env.JWT_SECRET || 'gs')
    .update('gs-scene:' + sceneId).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}

// Run one job to completion. Returns the created scene (or throws).
async function processJob(job) {
  const { repo } = store;
  await repo.update('jobs', { id: job.id }, { status: 'running', attempts: (job.attempts || 0) + 1, started_at: new Date() });
  await repo.update('sessions', { id: job.session_id }, { status: 'processing' });
  const session = await repo.find('sessions', { id: job.session_id });
  try {
    // Load the uploaded source bytes (video/photos) so a real provider (Luma) can
    // process them. The mock ignores these. Keys are stamped on session.meta at upload.
    const keys = (session && session.meta && Array.isArray(session.meta.source_keys)) ? session.meta.source_keys : [];
    let sourceBuffers = [];
    if (keys.length) { try { sourceBuffers = await Promise.all(keys.map((k) => storage.getBuffer(k))); } catch (e) { sourceBuffers = []; } }
    const out = await provider.process({ session, sourceBuffers });
    // Persist assets (ply canonical, spz stream, thumbnail).
    const base = 'gs/' + job.tenant_id + '/' + session.id + '/';
    const ply = await storage.put(base + 'scene.ply', out.plyBuffer, 'application/octet-stream');
    const spz = await storage.put(base + 'scene.spz', out.spzBuffer, 'application/octet-stream');
    const thumb = await storage.put(base + 'poster.png', out.thumbBuffer, 'image/png');
    const bytes = ply.bytes + spz.bytes + thumb.bytes;

    const scene = await repo.create('scenes', {
      tenant_id: job.tenant_id, session_id: session.id, job_id: job.id, kind: session.kind,
      title: session.title || (session.kind === 'conformation' ? 'Conformation Scan' : 'Course Walk'),
      status: 'ready', splat_count: out.splat_count, storage_bytes: bytes,
      is_simulated: !!out.is_simulated, waypoints: []
    });
    await repo.update('scenes', { id: scene.id }, { share_token: shortToken(scene.id) });

    for (const [role, a, ct] of [['ply', ply, 'application/octet-stream'], ['spz', spz, 'application/octet-stream'], ['thumbnail', thumb, 'image/png']]) {
      await repo.create('assets', { tenant_id: job.tenant_id, scene_id: scene.id, role, storage: a.storage, bucket: a.bucket, object_key: a.object_key, content_type: ct, bytes: a.bytes });
    }
    await repo.update('jobs', { id: job.id }, { status: 'done', provider: out.provider, finished_at: new Date() });
    await repo.update('sessions', { id: session.id }, { status: 'done' });
    return await repo.find('scenes', { id: scene.id });
  } catch (err) {
    // AUTO-REFUND the credits charged for this job.
    const refunded = (job.credits_charged && Number(job.credits_charged)) || 0;
    if (refunded > 0) await credits.refund(job.tenant_id, refunded, { reason: err.code || err.message });
    await repo.update('jobs', { id: job.id }, { status: 'failed', error: String(err.message).slice(0, 500), credits_refunded: refunded, finished_at: new Date() });
    await repo.update('sessions', { id: job.session_id }, { status: 'failed' });
    console.error(JSON.stringify({ svc: 'equimind-gs-engine', event: 'gs_job_failed', job: job.id, code: err.code, error: err.message, refunded }));
    throw err;
  }
}

let ticking = false;
async function tick() {
  if (ticking) return; ticking = true;
  try {
    const queued = await store.repo.findAll('jobs', { status: 'queued' }, ['id', 'ASC']);
    for (const job of queued.slice(0, 3)) { try { await processJob(job); } catch (e) { /* logged in processJob */ } }
  } catch (e) { /* ignore tick errors */ } finally { ticking = false; }
}

let timer = null;
function startWorker(intervalMs = 4000) {
  if (timer || process.env.GS_DISABLE_WORKER === '1') return;
  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
}

module.exports = { processJob, tick, startWorker, shortToken };
