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

const evaluation = require('../models/evaluation');
const horse = require('../models/horse');
const gait = require('../lib/gaitAnalyzer');
const { diagnose } = require('../lib/diagnosis');
const { pickLang } = require('../lib/i18n');
const account = require('../models/account');
const { requireAccount, optionalAccount } = require('./account');

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

// POST — real AUDIO analysis: account required + costs 1 credit (audio).
router.post('/', requireAccount, upload.any(), async (req, res) => {
  req.tenantId = req.accountId;
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

  // Charge 1 credit (audio analysis) BEFORE running. Refund on failure.
  const debit = await account.debitOne(req.accountId, { analysis_type: 'audio', description: 'Evaluación por audio' });
  if (!debit.ok) return res.status(402).json({ error: 'Sin créditos. Recarga tu cuenta para continuar.', code: 'NO_CREDITS', credits: debit.balance });

  // Analyze. A decode failure means the bytes are not a usable WAV -> 415.
  let metrics;
  try {
    metrics = gait.analyze(file.buffer);
  } catch (e) {
    await account.refundOne(req.accountId, { description: 'refund: audio no válido' });
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
      created_at: row.created_at,
      credits: debit.balance,
      charged: true
    });
  } catch (e) {
    await account.refundOne(req.accountId, { description: 'refund: fallo al guardar' });
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'evaluation_persist_error', error: e.message }));
    res.status(500).json({ error: 'failed to persist evaluation' });
  }
});

// GET — history for one horse, newest first. Account-scoped (own horses only).
router.get('/', optionalAccount, (req, res, next) => {
  req.tenantId = req.accountId != null ? req.accountId : 0;
  next();
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
