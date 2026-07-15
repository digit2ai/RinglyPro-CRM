'use strict';
// Stubbed integrations — real video rendering and social publishing are DEFERRED.
const express = require('express');
const store = require('../models');
const { requireAuth } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenant');

const router = express.Router();
router.use(requireAuth);

// POST /api/v1/prompts/:id/render  -> 202, mocked render job
// TODO: real AI video generation (banana-video-style output).
router.post('/:id/render', async (req, res) => {
  try {
    const tenant_id = tenantScope(req);
    const row = await store.getPrompt(req.params.id, tenant_id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const jobId = 'mock-render-' + row.id + '-' + Math.floor(Date.now() / 1000);
    return res.status(202).json({
      ok: true,
      jobId,
      status: 'mocked',
      note: 'Render de video simulado. La generación real de video está diferida en este sprint.'
    });
  } catch (e) {
    process.stderr.write(`[okhola] render error: ${e.message}\n`);
    return res.status(500).json({ error: 'internal error' });
  }
});

// POST /api/v1/prompts/:id/publish  { platform? }  -> 202, mocked publisher
// TODO: real social auto-publishing (YouTube/Instagram/Facebook/TikTok).
router.post('/:id/publish', async (req, res) => {
  try {
    const tenant_id = tenantScope(req);
    const row = await store.getPrompt(req.params.id, tenant_id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const platform = String((req.body && req.body.platform) || (row.structured && row.structured.platform) || 'general');
    return res.status(202).json({
      ok: true,
      status: 'mocked',
      platform,
      note: 'Publicación simulada. La auto-publicación en redes está diferida en este sprint.'
    });
  } catch (e) {
    process.stderr.write(`[okhola] publish error: ${e.message}\n`);
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
