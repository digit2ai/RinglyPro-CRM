'use strict';

/**
 * NOTIFICATIONS — the only notification channel in this service.
 *
 * There is no email and no SMS here by decision (see services/notify.js). A
 * row plus a badge is the whole delivery mechanism, which is why these routes
 * are first-class rather than living under /outbound: the outbound add-on was
 * simply the first thing that needed to tell somebody something.
 *
 * Mounted inside the authenticated tree, so req.tenantId comes from the
 * session and never from a body.
 */
const express = require('express');
const router = express.Router();
const notify = require('../services/notify');

/**
 * ADMIN IS RESOLVED FROM THE DATABASE, NOT FROM THE SESSION TOKEN.
 *
 * The token lasts 30 days and carries an email — signed, so truthful about
 * who logged in, but truthful about a month ago. Reading the owner tenant
 * fresh means a changed founder account takes effect the same day, and a
 * stale token cannot keep broadcasting to every customer. It is one cached
 * query, so the cost is nothing.
 */
async function requireOwner(req, res, next) {
  try {
    if (await notify.isOwner(req.tenantId)) return next();
  } catch (e) { /* fall through to the refusal */ }
  // 404, not 403: a 403 confirms there is an admin surface here to find.
  return res.status(404).json({ error: 'not_found' });
}

/** This tenant's notifications, newest first, with the unread count. */
router.get('/', async (req, res) => {
  const list = await notify.list(req.tenantId, { limit: 50 });
  res.json({
    notifications: list,
    unread: list.filter((n) => !n.read_at).length,
    // The compose box is drawn from this, so a non-owner never renders it.
    is_owner: await notify.isOwner(req.tenantId).catch(() => false),
  });
});

/** Reading is the dismissal. Marks all, and the badge comes down with it. */
router.post('/read', async (req, res) => {
  await notify.markRead(req.tenantId, null);
  res.json({ ok: true });
});

/* ── FOUNDER ONLY ────────────────────────────────────────────────────────── */

/** Announce something to every subscriber. */
router.post('/broadcast', requireOwner, express.json({ limit: '8kb' }), async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  const body = String(b.body || '').trim();
  if (title.length < 3) return res.status(400).json({ error: 'title_too_short' });
  if (title.length > 200) return res.status(400).json({ error: 'title_too_long' });
  if (body.length > 4000) return res.status(400).json({ error: 'body_too_long' });

  const r = await notify.broadcast({ title, body, byTenant: req.tenantId });
  if (!r.ok) {
    // `just_sent` is reported as its own thing rather than a generic failure:
    // the founder needs to know the second tap did NOT send, not wonder.
    return res.status(r.reason === 'just_sent' ? 409 : 400).json(r);
  }
  console.log(`[lite:broadcast] "${title}" -> ${r.recipients} tenant(s)`);
  res.json(r);
});

/** What has been announced, and how many received each one. */
router.get('/broadcasts', requireOwner, async (req, res) => {
  res.json({ broadcasts: await notify.broadcastHistory({ limit: 20 }) });
});

module.exports = router;
