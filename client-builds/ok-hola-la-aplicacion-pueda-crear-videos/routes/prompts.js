'use strict';
const express = require('express');
const store = require('../models');
const { requireAuth } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenant');
const promptBuilder = require('../services/promptBuilder');

const router = express.Router();

// All prompt endpoints require a valid JWT.
router.use(requireAuth);

// POST /api/v1/prompts/generate  { rawText }
// Transforms free-form text into a structured prompt and persists it.
router.post('/generate', async (req, res) => {
  try {
    const tenant_id = tenantScope(req);
    const rawText = String((req.body && req.body.rawText) || '');
    if (!rawText.trim()) return res.status(400).json({ error: 'rawText required' });
    // No truncation — supports rawText >= 2000 chars ("no 60-line cap").
    const structured = await promptBuilder.build(rawText);
    const row = await store.createPrompt({
      tenant_id,
      raw_text: rawText,
      structured,
      title: structured.title || null,
      source: structured.source || 'mock'
    });
    return res.status(201).json({ ok: true, id: row.id, prompt: row });
  } catch (e) {
    process.stderr.write(`[okhola] generate error: ${e.message}\n`);
    return res.status(500).json({ error: 'internal error' });
  }
});

// GET /api/v1/prompts  -> only caller's tenant rows
router.get('/', async (req, res) => {
  try {
    const tenant_id = tenantScope(req);
    const rows = await store.listPrompts(tenant_id);
    return res.status(200).json({ ok: true, prompts: rows });
  } catch (e) {
    process.stderr.write(`[okhola] list error: ${e.message}\n`);
    return res.status(500).json({ error: 'internal error' });
  }
});

// GET /api/v1/prompts/:id
router.get('/:id', async (req, res) => {
  try {
    const tenant_id = tenantScope(req);
    const row = await store.getPrompt(req.params.id, tenant_id);
    if (!row) return res.status(404).json({ error: 'not found' });
    return res.status(200).json({ ok: true, prompt: row });
  } catch (e) {
    process.stderr.write(`[okhola] get error: ${e.message}\n`);
    return res.status(500).json({ error: 'internal error' });
  }
});

// PATCH /api/v1/prompts/:id  { structured?, rawText?, title? }
router.patch('/:id', async (req, res) => {
  try {
    const tenant_id = tenantScope(req);
    const patch = {};
    if (req.body && typeof req.body.structured === 'object' && req.body.structured) patch.structured = req.body.structured;
    if (req.body && typeof req.body.rawText === 'string') patch.raw_text = req.body.rawText;
    if (req.body && typeof req.body.title === 'string') patch.title = req.body.title;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to update' });
    const row = await store.updatePrompt(req.params.id, tenant_id, patch);
    if (!row) return res.status(404).json({ error: 'not found' });
    return res.status(200).json({ ok: true, prompt: row });
  } catch (e) {
    process.stderr.write(`[okhola] patch error: ${e.message}\n`);
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
