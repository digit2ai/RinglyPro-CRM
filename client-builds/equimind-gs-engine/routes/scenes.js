// =====================================================
// REST API for the GS engine (/api/v1/*). All write/read-own endpoints require a
// multi-tenant EquiMind account (requireAccount). Public scene read is gated by
// the scene share token only. Disk-backed files served via HMAC-signed /files.
// =====================================================
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAccount, optionalAccount } = require('../lib/auth');
const svc = require('../lib/service');
const storage = require('../lib/storage');
const store = require('../models/gs');
const pricing = require('../lib/pricing');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: pricing.CFG.max_source_bytes } });
function baseOf(req) { return (req.baseUrl.replace(/\/api\/v1$/, '') || '') + '/'; }
function err(res, code, msg, extra) { return res.status(code).json(Object.assign({ error: msg }, extra || {})); }

// Sessions
router.post('/sessions', requireAccount, async (req, res) => {
  try { res.status(201).json(await svc.createSession(req.tenantId, req.body || {})); }
  catch (e) { err(res, 500, 'could not create session'); }
});

router.post('/sessions/:id/upload', requireAccount, upload.any(), async (req, res) => {
  try {
    const buffers = (req.files || []).map((f) => f.buffer);
    // Persist raw source to storage (source role) for reprocessing/audit.
    const s = await svc.getSession(req.tenantId, req.params.id);
    if (!s) return err(res, 404, 'session not found');
    let stored = 0; const source_keys = [];
    for (let i = 0; i < buffers.length; i++) {
      const key = 'gs/' + req.tenantId + '/' + s.id + '/source/' + i + '_' + (req.files[i].originalname || 'frame').replace(/[^a-zA-Z0-9._-]/g, '');
      const put = await storage.put(key, buffers[i], req.files[i].mimetype || 'application/octet-stream');
      await store.repo.create('assets', { tenant_id: req.tenantId, scene_id: 0, role: 'source', storage: put.storage, bucket: put.bucket, object_key: put.object_key, content_type: req.files[i].mimetype, bytes: put.bytes });
      source_keys.push(put.object_key); stored += put.bytes;
    }
    // Stamp source keys on the session so the worker can hand the real bytes to a
    // provider (Luma) at process time.
    await store.repo.update('sessions', { id: s.id }, { meta: Object.assign({}, s.meta || {}, { source_keys }) });
    const source_seconds = parseFloat((req.body || {}).source_seconds) || 0;
    const upd = await svc.attachSource(req.tenantId, s.id, { frame_count: buffers.length, source_bytes: stored, source_seconds, buffers });
    if (upd.error) return err(res, upd.code || 400, upd.error);
    res.status(201).json(upd);
  } catch (e) { err(res, 500, 'upload failed: ' + e.message); }
});

// Attach/replace the analysis report (measurements + findings + horse identity)
// on a session. Do this BEFORE /process so the procedural provider scales the 3D
// model to the measurements. Accepts { report: {...} } or a bare report object.
router.patch('/sessions/:id/report', requireAccount, async (req, res) => {
  try {
    const r = await svc.attachReport(req.tenantId, req.params.id, (req.body && req.body.report) || req.body);
    if (r.error) return err(res, r.code || 400, r.error);
    res.json(r);
  } catch (e) { err(res, 500, 'could not attach report'); }
});

// Dispatch a processing job (charges credits). ?inline=1 runs synchronously.
router.post('/sessions/:id/process', requireAccount, async (req, res) => {
  try {
    const r = await svc.dispatchJob(req.tenantId, req.params.id, { runInline: req.query.inline === '1' });
    if (r.error) return err(res, r.code || 400, r.error, { credits: r.credits, needed: r.needed });
    res.status(202).json(r);
  } catch (e) { err(res, 500, 'dispatch failed'); }
});

router.get('/jobs/:id', requireAccount, async (req, res) => {
  const j = await svc.jobStatus(req.tenantId, req.params.id);
  if (!j) return err(res, 404, 'job not found');
  res.json({ id: j.id, status: j.status, provider: j.provider, attempts: j.attempts, credits_charged: Number(j.credits_charged), credits_refunded: Number(j.credits_refunded), error: j.error, session_id: j.session_id });
});

// Scenes
router.get('/scenes', requireAccount, async (req, res) => res.json(await svc.sceneList(req.tenantId)));
router.get('/scenes/:id', requireAccount, async (req, res) => {
  const sc = await svc.sceneGet(req.tenantId, req.params.id, baseOf(req));
  if (!sc) return err(res, 404, 'scene not found');
  res.json(sc);
});
router.delete('/scenes/:id', requireAccount, async (req, res) => {
  const r = await svc.sceneDelete(req.tenantId, req.params.id);
  if (r.error) return err(res, r.code || 400, r.error);
  res.json(r);
});
router.patch('/scenes/:id/waypoints', requireAccount, async (req, res) => {
  const r = await svc.setWaypoints(req.tenantId, req.params.id, (req.body || {}).waypoints);
  if (r.error) return err(res, r.code || 400, r.error);
  res.json(r);
});

// Public read-only scene by share token (Course Walk shareable link, no login).
router.get('/public/scenes/:id', async (req, res) => {
  const sc = await svc.scenePublic(req.params.id, (req.query || {}).k, baseOf(req));
  if (!sc) return err(res, 403, 'Enlace no válido o expirado.');
  res.json(sc);
});

// Ops snapshot for the tenant.
router.get('/ops', requireAccount, async (req, res) => res.json(await svc.opsSnapshot(req.tenantId)));

// Unit-economics helper (pricing preview).
router.get('/pricing', (req, res) => res.json({ config: pricing.CFG, example: pricing.unitEconomics({ source_seconds: parseFloat(req.query.seconds) || 60 }) }));

module.exports = router;

// Disk-backed signed file serving (only used when storage backend = disk).
const filesRouter = express.Router();
filesRouter.get('/', async (req, res) => {
  const { k, e, s } = req.query || {};
  if (!storage.verifyDiskSig(k, e, s)) return res.status(403).send('invalid');
  try { const buf = await storage.getBuffer(k); res.set('Content-Type', k.endsWith('.png') ? 'image/png' : 'application/octet-stream').send(buf); }
  catch (err2) { res.status(404).send('not found'); }
});
module.exports.filesRouter = filesRouter;
