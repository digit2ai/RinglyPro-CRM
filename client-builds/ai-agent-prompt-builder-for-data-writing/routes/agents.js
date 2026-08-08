// =====================================================
// routes/agents.js — saved agent definitions + the generate endpoint.
//
//   POST   /                -> create   (JWT)
//   GET    /                -> list     (JWT, tenant-scoped)
//   GET    /:id             -> read one (JWT, tenant-scoped)
//   PUT    /:id             -> update   (JWT)
//   DELETE /:id             -> delete   (JWT)
//   POST   /generate        -> build the JSON prompt payload (public, stateless)
//
// LOGGING RULE (from the compliance section of the brief): agent instructions
// are long free text, so nothing user-authored is ever written to the log — we
// log ids, counts and lengths only. `logShape()` below is the only logging
// helper in this file and it takes no free text.
//
// /generate is deliberately UNGATED and stateless: it writes nothing, reads
// nothing, and its whole job is to run lib/promptBuilder over a body the caller
// already has. Gating it would only make the live preview require a session.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();

const store = require('../lib/store');
const { requireJwt } = require('../lib/auth');
const pb = require('../lib/promptBuilder');

/** Log ids, counts and lengths — never user free text. */
function logShape(action, tenantId, body, extra) {
  const b = body || {};
  const len = (v) => (Array.isArray(v) ? v.length : (typeof v === 'string' ? v.length : 0));
  const parts = [
    `[ai-agent-prompt-builder] ${action}`,
    `tenant=${tenantId}`,
    `name_len=${len(b.name)}`,
    `sources=${len(b.dataSources || b.data_sources)}`,
    `instructions=${len(b.instructions)}`,
    `constraints=${len(b.constraints)}`
  ];
  if (extra) parts.push(extra);
  console.log(parts.join(' '));
}

function parseId(v) {
  const n = parseInt(v, 10);
  return isFinite(n) && n > 0 ? n : null;
}

// --- POST /generate — pure assembly, no persistence, no model call ----------
// Registered BEFORE /:id so the literal path is never captured as an id.
router.post('/generate', (req, res) => {
  try {
    const payload = pb.buildPrompt(req.body || {});
    res.status(200).json(payload);
  } catch (err) {
    console.error('[ai-agent-prompt-builder] generate failed:', err.message);
    res.status(500).json({ error: 'generate_failed', detail: err.message });
  }
});

// --- POST / — create --------------------------------------------------------
router.post('/', requireJwt, async (req, res) => {
  try {
    const body = req.body || {};
    const check = pb.validateAgent(body);
    if (!check.valid) {
      return res.status(400).json({ error: 'validation_failed', errors: check.errors });
    }

    const fields = pb.normalizeAgent(body);
    if (body.source_template || body.sourceTemplate) {
      fields.source_template = String(body.source_template || body.sourceTemplate).slice(0, 100);
    }

    const row = await store.createAgent(req.tenant_id, fields);
    logShape('create', req.tenant_id, body, `id=${row.id}`);
    res.status(201).json(row);
  } catch (err) {
    console.error('[ai-agent-prompt-builder] create failed:', err.message);
    res.status(500).json({ error: 'create_failed', detail: err.message });
  }
});

// --- GET / — list, tenant-scoped -------------------------------------------
router.get('/', requireJwt, async (req, res) => {
  try {
    const rows = await store.listAgents(req.tenant_id);
    res.status(200).json({ tenant_id: req.tenant_id, count: rows.length, agents: rows });
  } catch (err) {
    console.error('[ai-agent-prompt-builder] list failed:', err.message);
    res.status(500).json({ error: 'list_failed', detail: err.message });
  }
});

// --- GET /:id ---------------------------------------------------------------
router.get('/:id', requireJwt, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const row = await store.getAgent(req.tenant_id, id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.status(200).json(row);
  } catch (err) {
    console.error('[ai-agent-prompt-builder] read failed:', err.message);
    res.status(500).json({ error: 'read_failed', detail: err.message });
  }
});

// --- PUT /:id ---------------------------------------------------------------
router.put('/:id', requireJwt, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const body = req.body || {};
    const check = pb.validateAgent(body);
    if (!check.valid) {
      return res.status(400).json({ error: 'validation_failed', errors: check.errors });
    }
    const row = await store.updateAgent(req.tenant_id, id, pb.normalizeAgent(body));
    if (!row) return res.status(404).json({ error: 'not_found' });
    logShape('update', req.tenant_id, body, `id=${id}`);
    res.status(200).json(row);
  } catch (err) {
    console.error('[ai-agent-prompt-builder] update failed:', err.message);
    res.status(500).json({ error: 'update_failed', detail: err.message });
  }
});

// --- DELETE /:id ------------------------------------------------------------
router.delete('/:id', requireJwt, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const gone = await store.deleteAgent(req.tenant_id, id);
    if (!gone) return res.status(404).json({ error: 'not_found' });
    console.log(`[ai-agent-prompt-builder] delete tenant=${req.tenant_id} id=${id}`);
    res.status(200).json({ deleted: true, id });
  } catch (err) {
    console.error('[ai-agent-prompt-builder] delete failed:', err.message);
    res.status(500).json({ error: 'delete_failed', detail: err.message });
  }
});

module.exports = router;
