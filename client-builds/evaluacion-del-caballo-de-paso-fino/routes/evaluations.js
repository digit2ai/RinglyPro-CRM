// =====================================================
// Evaluations — upload a hoof-beat WAV, analyze it, persist, return the verdict.
//   POST /api/v1/evaluations         -> JWT required (acceptance #4). multipart
//                                        WAV + horse_id. Non-WAV => 415 (#5).
//   GET  /api/v1/evaluations?horse_id -> tenant-scoped history, newest first (#7).
//
// PII discipline (Ley 1581): we never persist or log the uploaded filename (it
// could carry an owner's name) — only a generated evaluation id is logged. The
// raw audio bytes are analyzed in memory and discarded; only metrics are stored.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');

const { requireAuth, getToken, extractTenantId, JWT_SECRET } = require('../lib/auth');
const { resolveTenant } = require('../lib/tenant');
const jwt = require('jsonwebtoken');
const evaluation = require('../models/evaluation');
const horse = require('../models/horse');
const gait = require('../lib/gaitAnalyzer');
const { diagnose } = require('../lib/diagnosis');
const { pickLang } = require('../lib/i18n');

// In-memory upload — we only need the bytes long enough to run the analyzer.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function looksLikeWav(file) {
  if (!file) return false;
  const name = (file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (name.endsWith('.wav')) return true;
  if (mime === 'audio/wav' || mime === 'audio/x-wav' || mime === 'audio/wave' || mime === 'audio/vnd.wave') return true;
  // Some clients send octet-stream; let the decoder be the final arbiter.
  if (mime === 'application/octet-stream' || mime === '') return true;
  return false;
}

// POST — write endpoint => JWT required.
router.post('/', requireAuth, upload.any(), async (req, res) => {
  const file = (req.files && req.files[0]) || null;
  const horse_id = (req.body && req.body.horse_id) || null;
  const lang = pickLang(req.body && req.body.lang);

  if (!file) return res.status(400).json({ error: 'audio file is required (field: audio)' });
  if (!horse_id) return res.status(400).json({ error: 'horse_id is required' });

  // Format gate -> 415 for anything that isn't a WAV (acceptance #5).
  if (!looksLikeWav(file)) {
    return res.status(415).json({ error: 'Unsupported media type: only 16-bit PCM mono WAV is accepted' });
  }

  // Confirm the horse exists for this tenant (no cross-tenant evaluations).
  let owner = null;
  try { owner = await horse.findForTenant(horse_id, req.tenantId); }
  catch (e) { /* DB hiccup — fall through, allow eval to proceed in demo */ }
  if (owner === null) {
    return res.status(404).json({ error: 'horse not found for this tenant' });
  }

  // Analyze. A decode failure means the bytes are not a usable WAV -> 415.
  let metrics;
  try {
    metrics = gait.analyze(file.buffer);
  } catch (e) {
    if (e instanceof gait.UnsupportedWavError) {
      return res.status(415).json({ error: 'Unsupported media type: ' + e.message });
    }
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'analyze_error', error: e.message }));
    return res.status(500).json({ error: 'failed to analyze audio' });
  }

  const dx = diagnose(metrics, lang);

  try {
    const row = await evaluation.create({
      tenant_id: req.tenantId,
      horse_id,
      cadence_bpm: metrics.cadence_bpm,
      regularity_cv: metrics.regularity_cv,
      verdict: dx.verdict,
      recommendation: dx.recommendation,
      beat_count: metrics.beat_count
    });
    // Log the generated id, NOT the filename (PII discipline).
    console.log(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'evaluation_created', evaluation_id: row.id, verdict: row.verdict }));
    res.status(201).json({
      id: row.id,
      horse_id: row.horse_id,
      cadence_bpm: row.cadence_bpm,
      regularity_cv: row.regularity_cv,
      beat_count: row.beat_count,
      verdict: row.verdict,
      recommendation: row.recommendation,
      confidence: dx.confidence,
      created_at: row.created_at
    });
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'evaluation_persist_error', error: e.message }));
    res.status(500).json({ error: 'failed to persist evaluation' });
  }
});

// GET — tenant-scoped history for one horse, newest first. Public read OK; use
// the JWT tenant if present, else ?tenant_id / default 1.
router.get('/', (req, res, next) => {
  const token = getToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const t = extractTenantId(decoded);
      req.tenantId = t != null ? t : 1;
      return next();
    } catch (e) { /* fall through */ }
  }
  resolveTenant(req, res, next);
}, async (req, res) => {
  const horse_id = req.query.horse_id;
  if (!horse_id) return res.status(400).json({ error: 'horse_id query param is required' });
  try {
    const rows = await evaluation.listByHorse(horse_id, req.tenantId);
    res.json(rows);
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'evaluation_list_error', error: e.message }));
    res.status(500).json({ error: 'failed to list evaluations' });
  }
});

module.exports = router;
