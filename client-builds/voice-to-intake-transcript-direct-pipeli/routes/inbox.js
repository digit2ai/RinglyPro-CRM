// =====================================================
// Champion Inbox — the champion's own requests + their PoC teaser magic links.
//   GET  /api/v1/inbox                 -> tenant/email-scoped list + badge count
//   POST /api/v1/inbox/:projectId/shared -> mark the teaser as shared (clears badge)
// JWT-guarded; scoped strictly by the submitter email in the verified token.
// =====================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const projectsBridge = require('../services/projectsBridge');

router.use(requireAuth);

function championEmail(req) {
  const j = req.jwt || {};
  return j.email || null;
}

// GET /api/v1/inbox
router.get('/', async (req, res) => {
  try {
    const email = championEmail(req);
    if (!email) {
      return res.json({ items: [], badge: 0, ready: false, note: 'no_email_in_token' });
    }
    const items = await projectsBridge.listChampionInbox(email);
    const badge = items.filter((i) => i.teaser_ready && !i.shared).length;
    return res.json({ items, badge, ready: true, email });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'inbox_get_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

// POST /api/v1/inbox/:projectId/shared
router.post('/:projectId/shared', async (req, res) => {
  try {
    const email = championEmail(req);
    const projectId = parseInt(req.params.projectId, 10);
    if (!email || !Number.isInteger(projectId)) {
      return res.status(400).json({ error: 'bad request' });
    }
    await projectsBridge.markTeaserShared(projectId, email);
    return res.json({ ok: true });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'inbox_shared_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
