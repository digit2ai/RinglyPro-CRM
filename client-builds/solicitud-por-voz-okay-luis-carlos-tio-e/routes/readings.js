// POST /api/v1/readings  — persist a completed multi-vital measurement (JWT + tenant)
// GET  /api/v1/readings  — list rows for the token's tenant only (JWT)
//
// Body: { bpm:int 30..220, respiratory_bpm?:int 5..40, hrv_sdnn_ms?, hrv_rmssd_ms?,
//         bp_systolic?:60..260, bp_diastolic?:30..160, spo2?:70..100,
//         sqi?:0..100, confidence?:0..1, duration_s?:int,
//         is_validation?:bool, reference_bpm?:int 30..220, metrics?:object,
//         source?:'rppg'|'simulated' }
// PRIVACY: only computed metrics + metadata are accepted/stored. No video, no
// raw PPG signal, no PII ever crosses this boundary.
const express = require('express');
const router = express.Router();
const store = require('../models/reading');
const { requireAuth } = require('../middleware/tenant');

router.use(requireAuth);

// Optional numeric field validator: null/undefined passes; else must be finite + in [lo,hi].
function rangeErr(val, lo, hi, name, intOnly) {
  if (val == null) return null;
  const n = Number(val);
  if (!Number.isFinite(n) || (intOnly && !Number.isInteger(n)) || n < lo || n > hi) {
    return name + ' must be ' + (intOnly ? 'an integer' : 'a number') + ' between ' + lo + ' and ' + hi;
  }
  return null;
}

router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const bpm = Number(b.bpm);
    // AC6: bpm required integer 30..220 -> 400 otherwise.
    if (!Number.isInteger(bpm) || bpm < 30 || bpm > 220) {
      return res.status(400).json({ error: 'bpm must be an integer between 30 and 220' });
    }
    // AC6 extended: multi-vital ranges.
    const checks = [
      rangeErr(b.respiratory_bpm, 5, 40, 'respiratory_bpm', true),
      rangeErr(b.sqi, 0, 100, 'sqi', true),
      rangeErr(b.bp_systolic, 60, 260, 'bp_systolic', true),
      rangeErr(b.bp_diastolic, 30, 160, 'bp_diastolic', true),
      rangeErr(b.spo2, 70, 100, 'spo2', true),
      rangeErr(b.hrv_sdnn_ms, 0, 1000, 'hrv_sdnn_ms', false),
      rangeErr(b.hrv_rmssd_ms, 0, 1000, 'hrv_rmssd_ms', false),
      rangeErr(b.confidence, 0, 1, 'confidence', false),
      rangeErr(b.duration_s, 0, 3600, 'duration_s', false),
      rangeErr(b.reference_bpm, 30, 220, 'reference_bpm', true)
    ].filter(Boolean);
    if (checks.length) return res.status(400).json({ error: checks[0] });

    const row = await store.create({
      tenant_id: req.tenantId,
      bpm,
      respiratory_bpm: b.respiratory_bpm,
      hrv_sdnn_ms: b.hrv_sdnn_ms,
      hrv_rmssd_ms: b.hrv_rmssd_ms,
      bp_systolic: b.bp_systolic,
      bp_diastolic: b.bp_diastolic,
      spo2: b.spo2,
      sqi: b.sqi,
      confidence: b.confidence,
      duration_s: b.duration_s,
      is_validation: b.is_validation,
      reference_bpm: b.reference_bpm,
      metrics: b.metrics,
      source: b.source === 'simulated' ? 'simulated' : 'rppg'
    });
    // PII discipline: log tenant_id + id + source only — never raw signal or the id claim.
    console.log(JSON.stringify({ svc: 'solicitud-por-voz-rppg', event: 'reading_create', tenant_id: req.tenantId, id: row.id, source: row.source }));
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'solicitud-por-voz-rppg', event: 'reading_create_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const rows = await store.listByTenant(req.tenantId, 200);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'solicitud-por-voz-rppg', event: 'reading_list_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
