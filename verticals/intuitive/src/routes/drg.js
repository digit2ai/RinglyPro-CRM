'use strict';
const router = require('express').Router();

let drgLib;
try { drgLib = require('../services/drg-reimbursement'); } catch (e) { console.error('DRG lib load error:', e.message); }

// GET /api/v1/drg/procedures - List all procedures with DRG codes
router.get('/procedures', (req, res) => {
  if (!drgLib) return res.status(500).json({ error: 'DRG library not loaded' });
  const procedures = drgLib.getAllProcedures();
  res.json({ success: true, data: procedures, count: procedures.length });
});

// GET /api/v1/drg/specialties/:specialty - Get procedures for a specialty
router.get('/specialties/:specialty', (req, res) => {
  if (!drgLib) return res.status(500).json({ error: 'DRG library not loaded' });
  const procedures = drgLib.getSpecialtyProcedures(req.params.specialty);
  if (!procedures || procedures.length === 0) {
    return res.status(404).json({ error: `No procedures found for specialty '${req.params.specialty}'` });
  }
  res.json({ success: true, data: procedures });
});

// GET /api/v1/drg/lookup?procedure_type=X - Lookup by procedure type
router.get('/lookup', (req, res) => {
  if (!drgLib) return res.status(500).json({ error: 'DRG library not loaded' });
  const { procedure_type, drg_code } = req.query;

  if (drg_code) {
    const entry = drgLib.lookupByDRG(drg_code);
    if (!entry) return res.status(404).json({ error: `DRG code '${drg_code}' not found` });
    return res.json({ success: true, data: entry });
  }

  if (procedure_type) {
    const entry = drgLib.lookupByProcedure(procedure_type);
    if (!entry) return res.status(404).json({ error: `Procedure type '${procedure_type}' not found` });
    return res.json({ success: true, data: entry });
  }

  res.status(400).json({ error: 'procedure_type or drg_code query parameter required' });
});

// POST /api/v1/drg/calculate-reimbursement - Calculate weighted reimbursement
router.post('/calculate-reimbursement', (req, res) => {
  if (!drgLib) return res.status(500).json({ error: 'DRG library not loaded' });
  const { procedure_type, payer_mix } = req.body;

  if (!procedure_type || !payer_mix) {
    return res.status(400).json({ error: 'procedure_type and payer_mix required' });
  }

  const result = drgLib.calculateReimbursement(procedure_type, payer_mix);
  if (!result) return res.status(404).json({ error: `Procedure type '${procedure_type}' not found` });
  res.json({ success: true, data: result });
});

module.exports = router;
