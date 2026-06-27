// =====================================================
// Intercom routes — champion <-> owner chat.
//
// Champion (requireAuth — champion code or CRM session), scoped to own email:
//   GET  /api/v1/intercom/me           -> { messages, email } + mark owner msgs read
//   GET  /api/v1/intercom/me/unread    -> { unread }   (badge poll, no mark)
//   POST /api/v1/intercom/me           { body } -> send a message to the owner
//
// Owner (requireCrmAuth):
//   GET  /api/v1/intercom/threads          -> { threads, total_unread }
//   GET  /api/v1/intercom/threads/unread   -> { total_unread }  (badge poll)
//   GET  /api/v1/intercom/threads/:email   -> { messages, email, name } + mark read
//   POST /api/v1/intercom/threads/:email   { body } -> owner reply
// =====================================================

const express = require('express');
const router = express.Router();
const { requireAuth, requireCrmAuth } = require('../middleware/auth');
const intercom = require('../services/intercom');
const push = require('../services/push');

function champEmail(req) { return (req.jwt && req.jwt.email) || null; }
function champName(req) {
  const j = req.jwt || {};
  return j.name || j.businessName || j.business_name || j.email || null;
}

// ---- Champion side ----
router.get('/me', requireAuth, async (req, res) => {
  try {
    const email = champEmail(req);
    if (!email) return res.json({ messages: [], email: null });
    const messages = await intercom.getThread(email);
    await intercom.markReadByChampion(email);
    res.json({ messages, email });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'intercom_me_error', error: err.message }));
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/me/unread', requireAuth, async (req, res) => {
  const email = champEmail(req);
  const unread = email ? await intercom.unreadForChampion(email) : 0;
  res.json({ unread });
});

// Tells the client whether the signed-in user is the owner (CRM session, not a
// champion code). The owner's installed PWA uses this to badge with the owner
// unread count and subscribe for owner pushes instead of champion ones.
router.get('/whoami', requireAuth, (req, res) => {
  res.json({ isOwner: !req.isChampion, email: champEmail(req) });
});

// Owner registers a push subscription (their installed PWA) — badged when ANY
// champion sends a message. requireCrmAuth = genuine CRM session only.
router.post('/owner/subscribe', requireCrmAuth, async (req, res) => {
  try {
    const sub = req.body && req.body.subscription;
    if (!sub) return res.status(400).json({ error: 'bad request' });
    const ok = await push.saveOwnerSubscription(sub);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: 'internal error' });
  }
});

// VAPID public key + whether push is enabled (for the champion to subscribe).
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: push.publicKey(), enabled: push.isEnabled() });
});

// Champion registers a push subscription (their installed PWA).
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const email = champEmail(req);
    const sub = req.body && req.body.subscription;
    if (!email || !sub) return res.status(400).json({ error: 'bad request' });
    const ok = await push.saveSubscription(email, sub);
    res.json({ ok });
  } catch (err) {
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/me', requireAuth, async (req, res) => {
  try {
    const email = champEmail(req);
    const body = String((req.body && req.body.body) || '').trim();
    if (!email) return res.status(400).json({ error: 'no champion identity' });
    if (!body) return res.status(422).json({ error: 'message is empty' });
    const row = await intercom.postMessage({ email, name: champName(req), sender: 'champion', body });
    res.status(201).json({ ok: true, id: row.id, created_at: row.created_at });
    // Push to the owner's installed PWA: badge their icon with total unread.
    intercom.totalUnreadForOwner().then((unread) => {
      push.sendToOwner({
        title: 'Digit2Ai Intercom',
        body: (champName(req) ? champName(req) + ': ' : '') + body.slice(0, 100),
        unread,
        url: '/voice-to-intake-transcript-direct-pipeli/'
      });
    }).catch(() => {});
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'intercom_send_error', error: err.message }));
    res.status(500).json({ error: 'internal error' });
  }
});

// ---- Owner side ----
router.get('/threads/unread', requireCrmAuth, async (req, res) => {
  const total_unread = await intercom.totalUnreadForOwner();
  res.json({ total_unread });
});

router.get('/threads', requireCrmAuth, async (req, res) => {
  try {
    const threads = await intercom.listThreads();
    const total_unread = threads.reduce((s, t) => s + (t.unread || 0), 0);
    res.json({ threads, total_unread });
  } catch (err) {
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/threads/:email', requireCrmAuth, async (req, res) => {
  try {
    const email = String(req.params.email || '').toLowerCase();
    const messages = await intercom.getThread(email);
    await intercom.markReadByOwner(email);
    res.json({ messages, email });
  } catch (err) {
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/threads/:email', requireCrmAuth, async (req, res) => {
  try {
    const email = String(req.params.email || '').toLowerCase();
    const body = String((req.body && req.body.body) || '').trim();
    if (!email) return res.status(400).json({ error: 'email required' });
    if (!body) return res.status(422).json({ error: 'message is empty' });
    const row = await intercom.postMessage({ email, name: null, sender: 'owner', body });
    res.status(201).json({ ok: true, id: row.id, created_at: row.created_at });
    // Push to the champion's installed PWA: badge their icon + show a notification.
    intercom.unreadForChampion(email).then((unread) => {
      push.sendToChampion(email, {
        title: 'Digit2Ai',
        body: body.slice(0, 120),
        unread,
        url: '/voice-to-intake-transcript-direct-pipeli/'
      });
    }).catch(() => {});
  } catch (err) {
    res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
