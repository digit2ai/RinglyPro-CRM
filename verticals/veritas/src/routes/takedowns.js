'use strict';

const express = require('express');
const router = express.Router();
const { Takedown, Detection } = require('../models');

function tenantId(req) {
  return parseInt(req.query.tenant_id || req.body.tenant_id || 1, 10);
}

const STATUS_FLOW = ['draft', 'submitted', 'acknowledged', 'removed', 'rejected'];

// GET /api/v1/takedowns?tenant_id=N&status=submitted
router.get('/', async (req, res) => {
  try {
    const where = { tenant_id: tenantId(req) };
    if (req.query.status) where.status = req.query.status;
    const takedowns = await Takedown.findAll({
      where,
      include: [{ model: Detection }],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: takedowns });
  } catch (e) {
    console.error('Veritas takedowns GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/v1/takedowns  — file a takedown for a detection
router.post('/', async (req, res) => {
  try {
    const { detection_id, method } = req.body;
    if (!detection_id) return res.status(400).json({ error: 'detection_id required' });
    const tid = tenantId(req);
    const det = await Detection.findOne({ where: { id: detection_id, tenant_id: tid } });
    if (!det) return res.status(404).json({ error: 'detection not found' });

    const asset = await det.getVeritasAsset();
    const takedown = await Takedown.create({
      tenant_id: tid,
      detection_id,
      platform: asset ? asset.source_platform : null,
      method: method || 'impersonation',
      status: 'draft',
      notes: `${(method || 'impersonation').toUpperCase()} request for ${det.targeted_person || 'protected party'}`
    });
    res.status(201).json({ success: true, data: takedown });
  } catch (e) {
    console.error('Veritas takedowns POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/v1/takedowns/:id  — advance status
router.patch('/:id', async (req, res) => {
  try {
    const tid = tenantId(req);
    const takedown = await Takedown.findOne({ where: { id: req.params.id, tenant_id: tid } });
    if (!takedown) return res.status(404).json({ error: 'not found' });
    const next = req.body.status;
    if (next && !STATUS_FLOW.includes(next)) return res.status(400).json({ error: 'invalid status' });
    if (next) {
      takedown.status = next;
      if (next === 'submitted' && !takedown.submitted_at) takedown.submitted_at = new Date();
      if (next === 'removed') takedown.removed_at = new Date();
      if (next !== 'draft' && !takedown.reference_id) takedown.reference_id = `VRT-${Date.now().toString().slice(-6)}`;
    }
    if (req.body.notes) takedown.notes = req.body.notes;
    await takedown.save();
    res.json({ success: true, data: takedown });
  } catch (e) {
    console.error('Veritas takedowns PATCH error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
