// =====================================================
// POST /api/v1/intake  (JWT-guarded)  -> persist + forward (real or mock)
//   multipart/form-data: transcript, lang, submitter_id, attachments[] (files)
// GET  /api/v1/intake  (JWT-guarded)  -> rows for the caller's tenant_id only
// GET  /api/v1/intake/attachments/:id?dt=<signed>  -> download a stored file
// =====================================================

const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { requireAuth, getCredential, verifyAny } = require('../middleware/auth');
const store = require('../models/intake');
const attachStore = require('../models/attachment');
const { forwardToIntake } = require('../services/digit2ai');
const projectsBridge = require('../services/projectsBridge');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// ---- Attachment upload config -----------------------------------------------
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB / file
const MAX_FILES = 5;
const ALLOWED_EXT = ['txt', 'pdf', 'doc', 'docx', 'csv', 'rtf', 'md'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES }
});
function extOf(name) { const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
function baseUrl() { return (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/$/, ''); }
// A signed, clickable capability link so the owner can open the file straight
// from the Project Request Inbox (no Authorization header needed on the click).
function signDownload(attId) { return jwt.sign({ purpose: 'd2-attach', att_id: attId }, JWT_SECRET, { expiresIn: '90d' }); }
function downloadUrl(attId) {
  return baseUrl() + '/voice-to-intake-transcript-direct-pipeli/api/v1/intake/attachments/' + attId + '?dt=' + encodeURIComponent(signDownload(attId));
}

// ---- Download (own auth: signed dt token OR any valid app token) -------------
// Registered BEFORE the global requireAuth so a plain link click works.
router.get('/attachments/:attId', async (req, res) => {
  try {
    const attId = parseInt(req.params.attId, 10);
    if (!attId) return res.status(400).json({ error: 'bad id' });
    let ok = false;
    if (req.query.dt) {
      try { const d = jwt.verify(String(req.query.dt), JWT_SECRET); if (d && d.purpose === 'd2-attach' && parseInt(d.att_id, 10) === attId) ok = true; } catch (e) { /* fall through */ }
    }
    if (!ok) { const cred = getCredential(req); if (cred && verifyAny(cred)) ok = true; } // owner/champion session
    if (!ok) return res.status(401).json({ error: 'unauthorized' });

    const att = await attachStore.getById(attId);
    if (!att) return res.status(404).json({ error: 'not found' });
    const safeName = String(att.filename || 'file').replace(/[^\w.\- ]/g, '_');
    res.set('Content-Type', att.mimetype || 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="' + safeName + '"');
    res.set('Cache-Control', 'private, no-store');
    return res.send(Buffer.isBuffer(att.data) ? att.data : Buffer.from(att.data));
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'attach_download_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

// All remaining intake endpoints require a valid JWT with tenant context.
router.use(requireAuth);

// POST /api/v1/intake  (multipart; attachments optional)
router.post('/', (req, res, next) => {
  upload.array('attachments', MAX_FILES)(req, res, (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 422).json({ error: tooBig ? 'A file exceeds the 10 MB limit' : 'upload error' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const body = req.body || {};
    let transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
    const files = Array.isArray(req.files) ? req.files : [];
    const lang = body.lang === 'es' ? 'es' : 'en';

    // Allow attachment-only submissions: synthesize a transcript placeholder.
    if (!transcript && files.length) transcript = lang === 'es' ? '(Ver archivos adjuntos)' : '(See attached files)';
    if (!transcript) return res.status(422).json({ error: 'transcript is required and cannot be empty' });

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

    // Save attachments (skip anything disallowed; never block the submission).
    const savedAttachments = [];
    const rejected = [];
    for (const f of files) {
      const ext = extOf(f.originalname);
      if (!ALLOWED_EXT.includes(ext)) { rejected.push(f.originalname); continue; }
      if (!f.buffer || f.size > MAX_FILE_BYTES) { rejected.push(f.originalname); continue; }
      try {
        const a = await attachStore.createAttachment({
          intake_id: intake.id, tenant_id: req.tenantId,
          filename: f.originalname, mimetype: f.mimetype, size_bytes: f.size, data: f.buffer
        });
        savedAttachments.push({ id: a.id, filename: a.filename, size_bytes: a.size_bytes, url: downloadUrl(a.id) });
      } catch (e) { rejected.push(f.originalname); }
    }

    // Submitter identity from the verified JWT.
    const j = req.jwt || {};
    const submitter = {
      email: j.email || null,
      full_name: j.businessName || j.business_name ||
        [j.firstName, j.lastName].filter(Boolean).join(' ').trim() || j.name || j.email || null,
      company_name: j.businessName || j.business_name || null
    };

    // Forward into the Digit2AI Project Request Inbox (attachments appended).
    const { forward_status, project_id } = await forwardToIntake(intake, submitter, savedAttachments);
    const updated = await store.updateForwardStatus(intake.id, forward_status);
    if (updated) intake = updated;

    if (project_id) projectsBridge.generateTeaserAsync(project_id, intake.lang);

    return res.status(201).json({
      id: intake.id,
      tenant_id: intake.tenant_id,
      lang: intake.lang,
      submitter_id: intake.submitter_id,
      triage_bypass: intake.triage_bypass === true,
      forward_status: intake.forward_status,
      created_at: intake.created_at,
      attachments: savedAttachments.map((a) => ({ id: a.id, filename: a.filename, size_bytes: a.size_bytes })),
      attachments_rejected: rejected
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
