'use strict';

const express = require('express');
const router = express.Router();
const { Monitor } = require('../models');
const adscan = require('../services/adscan');

function tenantId(req) {
  return parseInt(req.query.tenant_id || req.body.tenant_id || 1, 10);
}

// GET /api/v1/monitors?tenant_id=N
router.get('/', async (req, res) => {
  try {
    const monitors = await Monitor.findAll({
      where: { tenant_id: tenantId(req) },
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: monitors });
  } catch (e) {
    console.error('Veritas monitors GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/v1/monitors
router.post('/', async (req, res) => {
  try {
    const { type, target_label, query_terms, platforms, cadence } = req.body;
    if (!type || !target_label) return res.status(400).json({ error: 'type and target_label required' });
    const monitor = await Monitor.create({
      tenant_id: tenantId(req),
      type, target_label,
      query_terms: query_terms || [],
      platforms: platforms || [],
      cadence: cadence || 'daily'
    });
    res.status(201).json({ success: true, data: monitor });
  } catch (e) {
    console.error('Veritas monitors POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/v1/monitors/:id  (pause/resume)
router.patch('/:id', async (req, res) => {
  try {
    const monitor = await Monitor.findOne({ where: { id: req.params.id, tenant_id: tenantId(req) } });
    if (!monitor) return res.status(404).json({ error: 'not found' });
    if (req.body.status) monitor.status = req.body.status;
    await monitor.save();
    res.json({ success: true, data: monitor });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/v1/monitors/:id/scan  — run this monitor now (ad-library scan)
router.post('/:id/scan', async (req, res) => {
  try {
    const result = await adscan.scanMonitor(parseInt(req.params.id, 10), tenantId(req));
    res.json({ success: true, data: result });
  } catch (e) {
    console.error('Veritas monitor scan error:', e.message);
    res.status(e.message === 'monitor not found' ? 404 : 500).json({ error: e.message });
  }
});

module.exports = router;
