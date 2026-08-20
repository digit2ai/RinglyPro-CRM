'use strict';

// =============================================================
// Email-notification compliance surface.
//   GET/POST /unsubscribe?u=<token>  — honored WITHOUT login (one click).
//   GET/PATCH /prefs                 — the signed-in user's frequency controls.
//   POST /webhook/sendgrid           — bounce handling (3 hard bounces = off).
// Mounted at /api/v1/notify.
// =============================================================

const express = require('express');
const { models } = require('../models');
const authSvc = require('../services/auth');

const router = express.Router();

function tenantFrom(req) {
  const p = authSvc.readSession((req.cookies && req.cookies.jobup_token) || '');
  return p ? p.tid : null;
}

async function turnOff(token) {
  const tok = String(token || '').trim();
  if (!tok) return { ok: false, reason: 'missing token' };
  const sub = await models.subscribers.findOne({ where: { unsubscribe_token: tok } });
  if (!sub) return { ok: false, reason: 'unknown token' };
  if (sub.notifications_enabled !== false) {
    await models.subscribers.update({ notifications_enabled: false }, { where: { id: sub.id } });
  }
  return { ok: true, email: sub.email };
}

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07080c;
color:#eef2f8;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
.box{max-width:420px;text-align:center}.mark{display:inline-block;background:linear-gradient(90deg,#e64980,#ff922b);
-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800;font-size:20px;margin-bottom:14px}
a{color:#22d3ee}</style></head><body><div class="box"><div class="mark">JobUp</div>${body}</div></body></html>`;
}

// One-click unsubscribe (List-Unsubscribe-Post sends a POST; browsers a GET).
router.post('/unsubscribe', express.urlencoded({ extended: false }), async (req, res) => {
  const r = await turnOff((req.query.u) || (req.body && req.body.u));
  res.status(r.ok ? 200 : 400).json(r);
});
router.get('/unsubscribe', async (req, res) => {
  const r = await turnOff(req.query.u);
  const base = (process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev').replace(/\/$/, '');
  if (!r.ok) {
    return res.status(400).type('html').send(page('Unsubscribe',
      `<h2 style="margin:0 0 8px">Link not recognized</h2>
       <p style="color:#9aa3b4">This unsubscribe link is invalid or has expired. You can manage alerts from your
       <a href="${base}/app?tab=account">account settings</a>.</p>`));
  }
  res.type('html').send(page('Unsubscribed',
    `<h2 style="margin:0 0 8px">You're unsubscribed</h2>
     <p style="color:#9aa3b4">You will no longer receive job-match emails. Changed your mind? Turn them back on in your
     <a href="${base}/app?tab=account">account settings</a> any time.</p>`));
});

// The signed-in user's controls.
router.get('/prefs', async (req, res) => {
  const tid = tenantFrom(req); if (!tid) return res.status(401).json({ error: 'not signed in' });
  const sub = await models.subscribers.findOne({ where: { id: tid } });
  if (!sub) return res.status(404).json({ error: 'no account' });
  const digest = require('../services/emailDigest');
  const cad = digest.cadenceFor(sub.plan);
  res.json({
    notifications_enabled: sub.notifications_enabled !== false,
    timezone: sub.timezone || null,
    plan: sub.plan || 'legacy',
    cadence: cad ? cad.period : 'none',              // 'daily' | 'weekly' | 'none' (free)
    eligible_for_email: Boolean(cad),
    last_notified_at: sub.last_notified_at || null,
    next_eligible_at: sub.next_eligible_at || null,
  });
});

router.patch('/prefs', async (req, res) => {
  const tid = tenantFrom(req); if (!tid) return res.status(401).json({ error: 'not signed in' });
  const b = req.body || {};
  const patch = {};
  if (typeof b.notifications_enabled === 'boolean') patch.notifications_enabled = b.notifications_enabled;
  if (typeof b.timezone === 'string' && b.timezone.length <= 64) {
    // Validate the IANA zone; ignore garbage rather than store a tz that throws.
    try { new Intl.DateTimeFormat('en-US', { timeZone: b.timezone }); patch.timezone = b.timezone; }
    catch (e) { /* ignore invalid tz */ }
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to change' });
  await models.subscribers.update(patch, { where: { id: tid } });
  res.json({ ok: true, ...patch });
});

// SendGrid Event Webhook. Point https://jobup.dev/api/v1/notify/webhook/sendgrid
// at it in the SendGrid dashboard (Mail Settings -> Event Webhook), subscribed
// to bounce/dropped/delivered/open. Three consecutive HARD bounces turns email
// off for that address; any delivery/open resets the counter.
router.post('/webhook/sendgrid', express.json({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [];
  let disabled = 0;
  for (const ev of events) {
    const email = String(ev.email || '').toLowerCase();
    if (!email) continue;
    const sub = await models.subscribers.findOne({ where: { email } });
    if (!sub) continue;
    const type = ev.event;
    if (type === 'bounce' && (ev.type === 'bounce' || ev.type === 'blocked' || !ev.type)) {
      const n = (sub.bounce_count || 0) + 1;
      const patch = { bounce_count: n };
      if (n >= 3) { patch.notifications_enabled = false; disabled++; }
      await models.subscribers.update(patch, { where: { id: sub.id } });
    } else if (type === 'delivered' || type === 'open') {
      if (sub.bounce_count) await models.subscribers.update({ bounce_count: 0 }, { where: { id: sub.id } });
    }
  }
  res.json({ ok: true, processed: events.length, disabled });
});

module.exports = router;
