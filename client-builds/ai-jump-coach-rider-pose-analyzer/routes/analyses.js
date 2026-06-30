// =====================================================
// /api/v1/analyses — JWT-guarded, tenant-scoped CRUD over pose analyses.
//
//   POST   /            -> {filename, durationSec, frames:[{t,keypoints}], lang?}
//                          runs the fault engine, persists metadata+faults, 201
//   GET    /            -> list this tenant's analyses
//   GET    /:id         -> one analysis IF owned by this tenant, else 404
//   DELETE /:id         -> delete IF owned by this tenant, else 404
//
// PII: never log raw frames, filenames, or keypoints. Emails (if present in the
// JWT) are masked before any log line.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/auth');
const store = require('../models/analysis');
const { analyze } = require('../lib/faultEngine');

function maskEmail(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  if (at <= 0) return 'u***';
  return s[0] + '***' + s.slice(at);
}

// Every endpoint requires a valid CRM JWT.
router.use(requireAuth);

// POST /  -> analyze + persist
router.post('/', async (req, res) => {
  try {
    const { filename, durationSec, frames, lang } = req.body || {};
    if (!Array.isArray(frames) || frames.length === 0) {
      return res.status(422).json({ error: 'frames[] required (array of {t, keypoints})' });
    }
    // Defensive cap so a runaway client can't OOM the analyzer.
    if (frames.length > 5000) {
      return res.status(422).json({ error: 'too many frames (max 5000)' });
    }
    const result = analyze(frames);
    const safeName = typeof filename === 'string' ? filename.slice(0, 255) : null;
    const row = await store.create({
      tenant_id: req.tenantId,
      filename: safeName,
      duration_sec: typeof durationSec === 'number' ? durationSec : null,
      frame_count: result.frameCount,
      apex_sec: result.apexSec,
      faults: result.faults,
      lang: lang === 'en' ? 'en' : 'es'
    });
    console.log(JSON.stringify({
      svc: 'ai-jump-coach', event: 'analysis_created',
      tenant: req.tenantId, user: maskEmail(req.jwt && req.jwt.email),
      id: row.id, frames: result.frameCount, faults: result.faults.length
    }));
    return res.status(201).json(row);
  } catch (e) {
    console.error(JSON.stringify({ svc: 'ai-jump-coach', event: 'analysis_error', error: e.message }));
    return res.status(500).json({ error: 'analysis failed' });
  }
});

// GET /  -> list (tenant-scoped)
router.get('/', async (req, res) => {
  try {
    const rows = await store.listByTenant(req.tenantId);
    return res.json({ data: rows, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: 'list failed' });
  }
});

// GET /:id  -> one (404 if not owned by this tenant)
router.get('/:id', async (req, res) => {
  try {
    const row = await store.findForTenant(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: 'not found' });
    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: 'read failed' });
  }
});

// DELETE /:id  -> delete (404 if not owned by this tenant)
router.delete('/:id', async (req, res) => {
  try {
    const ok = await store.remove(req.params.id, req.tenantId);
    if (!ok) return res.status(404).json({ error: 'not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'delete failed' });
  }
});

module.exports = router;
