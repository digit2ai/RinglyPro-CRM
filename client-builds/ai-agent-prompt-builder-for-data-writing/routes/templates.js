// =====================================================
// routes/templates.js — the seeded, read-only gallery.
//
//   GET /            -> list every template visible to the caller
//   GET /:slug       -> one template, ready to load into the wizard
//
// PUBLIC by design. The gallery is static seeded content with no PII and no
// tenant data — requiring a session to browse it would put a login in front of
// the first thing a new user does. Writes are not exposed at all this sprint
// (the gallery is read-only, per the brief), so there is no endpoint to gate.
//
// `attachTenant` is still applied so that a signed-in caller would see their
// own future templates alongside the system set with no route change.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();

const store = require('../lib/store');
const { attachTenant } = require('../lib/auth');

router.use(attachTenant);

// --- GET / — the gallery ----------------------------------------------------
// Returns a bare JSON ARRAY: acceptance criterion 2 asserts on the array shape,
// and it is also what a client wants to map over directly.
router.get('/', async (req, res) => {
  try {
    const rows = await store.listTemplates(req.tenant_id);
    res.status(200).json(rows);
  } catch (err) {
    console.error('[ai-agent-prompt-builder] template list failed:', err.message);
    res.status(500).json({ error: 'template_list_failed', detail: err.message });
  }
});

// --- GET /:slug -------------------------------------------------------------
router.get('/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').slice(0, 100);
    const row = await store.getTemplate(slug, req.tenant_id);
    if (!row) return res.status(404).json({ error: 'not_found', slug });
    res.status(200).json(row);
  } catch (err) {
    console.error('[ai-agent-prompt-builder] template read failed:', err.message);
    res.status(500).json({ error: 'template_read_failed', detail: err.message });
  }
});

module.exports = router;
