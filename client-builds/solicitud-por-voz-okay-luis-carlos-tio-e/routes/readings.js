// POST /api/v1/readings  — persist a completed measurement (JWT + tenant)
// GET  /api/v1/readings  — list rows for the token's tenant only (JWT)
//
// Body: { bpm:int 30..220, confidence?:0..1, duration_s?:int, source?:'rppg'|'simulated' }
// PRIVACY: only the BPM integer + metadata are accepted/stored. No video, no
// raw PPG signal, no PII ever crosses this boundary.
const express = require('express');
const router = express.Router();
const store = require('../models/reading');
const { requireAuth } = require('../middleware/tenant');

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const bpm = Number(b.bpm);
    // AC6: bpm must be an integer 30..220 -> 400 otherwise.
    if (!Number.isInteger(bpm) || bpm < 30 || bpm > 220) {
      return res.status(400).json({ error: 'bpm must be an integer between 30 and 220' });
    }
    let confidence = null;
    if (b.confidence != null) {
      const c = Number(b.confidence);
      if (!Number.isFinite(c) || c < 0 || c > 1) {
        return res.status(400).json({ error: 'confidence must be a number between 0 and 1' });
      }
      confidence = c;
    }
    let duration_s = null;
    if (b.duration_s != null) {
      const d = Number(b.duration_s);
      if (!Number.isFinite(d) || d < 0) {
        return res.status(400).json({ error: 'duration_s must be a non-negative number' });
      }
      duration_s = Math.round(d);
    }
    const row = await store.create({
      tenant_id: req.tenantId,
      bpm,
      confidence,
      duration_s,
      source: b.source === 'simulated' ? 'simulated' : 'rppg'
    });
    // PII discipline: log tenant_id + id + source only — never the id claim or raw signal.
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
