'use strict';

const express = require('express');
const router = express.Router();
const { Takedown, Detection, Asset } = require('../models');
const templates = require('../services/takedown-templates');

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

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// GET /api/v1/takedowns/export.csv?tenant_id=N
router.get('/export.csv', async (req, res) => {
  try {
    const tid = tenantId(req);
    const rows = await Takedown.findAll({ where: { tenant_id: tid }, order: [['created_at', 'DESC']] });
    const header = ['id', 'status', 'platform', 'method', 'reference_id', 'notes', 'submitted_at', 'removed_at', 'created_at'];
    const lines = [header.join(',')];
    for (const t of rows) {
      lines.push([
        t.id, t.status, t.platform, t.method, t.reference_id, t.notes,
        t.submitted_at && t.submitted_at.toISOString(),
        t.removed_at && t.removed_at.toISOString(),
        t.created_at && t.created_at.toISOString()
      ].map(csvCell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="veritas-takedowns-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(lines.join('\n'));
  } catch (e) {
    console.error('Veritas takedowns export error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v1/takedowns/:id/letter  — generate the takedown letter/report draft
router.get('/:id/letter', async (req, res) => {
  try {
    const tid = tenantId(req);
    const takedown = await Takedown.findOne({ where: { id: req.params.id, tenant_id: tid } });
    if (!takedown) return res.status(404).json({ error: 'not found' });
    const detection = await Detection.findOne({ where: { id: takedown.detection_id, tenant_id: tid } });
    const asset = detection ? await Asset.findOne({ where: { id: detection.asset_id, tenant_id: tid } }) : null;
    const letter = templates.generate({
      method: takedown.method,
      detection: detection ? detection.toJSON() : {},
      asset: asset ? asset.toJSON() : {}
    });
    // mailto helper for the Apple-Mail magic-link pattern (no auto-send).
    // Pre-fills the platform's real DMCA agent inbox as the recipient.
    const to = letter.email ? encodeURIComponent(letter.email) : '';
    const mailto = `mailto:${to}?subject=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body)}`;
    res.json({ success: true, data: { ...letter, mailto, takedown_id: takedown.id } });
  } catch (e) {
    console.error('Veritas letter error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
