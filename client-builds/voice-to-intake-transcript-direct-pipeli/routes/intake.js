// =====================================================
// POST /api/v1/intake  (JWT-guarded)  -> persist + forward (real or mock)
// GET  /api/v1/intake  (JWT-guarded)  -> rows for the caller's tenant_id only
// =====================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const store = require('../models/intake');
const { forwardToIntake } = require('../services/digit2ai');
const projectsBridge = require('../services/projectsBridge');

// All intake endpoints require a valid JWT with tenant context.
router.use(requireAuth);

// POST /api/v1/intake
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
    if (!transcript) {
      return res.status(422).json({ error: 'transcript is required and cannot be empty' });
    }
    const lang = body.lang === 'es' ? 'es' : 'en';
    const submitter_id = body.submitter_id != null ? String(body.submitter_id).slice(0, 255) : null;

    // Persist first so we always have a row even if the forward fails/mocks.
    let intake = await store.createIntake({
      tenant_id: req.tenantId,
      transcript,
      lang,
      submitter_id,
      triage_bypass: true,
      forward_status: 'pending',
      created_at: body.created_at || new Date().toISOString()
    });

    // Submitter identity from the verified JWT (used to create the inbox row;
    // never logged). CRM login tokens carry email + businessName.
    const j = req.jwt || {};
    const submitter = {
      email: j.email || null,
      full_name: j.businessName || j.business_name ||
        [j.firstName, j.lastName].filter(Boolean).join(' ').trim() || j.name || j.email || null,
      company_name: j.businessName || j.business_name || null
    };

    // Forward into the Digit2AI Project Request Inbox. Never throws.
    const { forward_status, project_id } = await forwardToIntake(intake, submitter);
    const updated = await store.updateForwardStatus(intake.id, forward_status);
    if (updated) intake = updated;

    // Auto-generate the PoC Voice Teaser magic link for this request (background;
    // the champion picks it up in their Inbox once "ready"). Never blocks the 201.
    if (project_id) {
      projectsBridge.generateTeaserAsync(project_id, intake.lang);
    }

    return res.status(201).json({
      id: intake.id,
      tenant_id: intake.tenant_id,
      lang: intake.lang,
      submitter_id: intake.submitter_id,
      triage_bypass: intake.triage_bypass === true,
      forward_status: intake.forward_status,
      created_at: intake.created_at
    });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'post_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

// GET /api/v1/intake — tenant-scoped list
router.get('/', async (req, res) => {
  try {
    const rows = await store.listByTenant(req.tenantId);
    return res.json(rows.map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      transcript: r.transcript,
      lang: r.lang,
      submitter_id: r.submitter_id,
      triage_bypass: r.triage_bypass === true,
      forward_status: r.forward_status,
      created_at: r.created_at
    })));
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'get_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
