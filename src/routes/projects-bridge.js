/**
 * Projects-Bridge Routes
 *
 * Surfaces main-CRM voice/call data (calls, voicemails, SMS, lead follow-ups)
 * into the Digit2AI Projects Hub at /projects — CLIENT 15 ONLY.
 *
 * Manuel Stagg wants /projects to be the single command center for the whole
 * business. The Projects Hub lives in its own DB (d2_* tables); calls/messages/
 * lead_* live in the main CRM DB. Both apps are same-origin, so the Hub frontend
 * fetches these endpoints directly. Everything here is hard-scoped to client 15.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const emailReconcile = require('../services/emailReconcile');

// Hard-scoped to the Digit2AI / RinglyPro owner tenant. Matches D2AI_CLIENT_ID
// in routes/elevenlabs-tools.js (Lina's Projects-calendar carve-out).
const D2AI_CLIENT_ID = 15;

/**
 * GET /api/projects-bridge/call-stats
 * Numbers for the Projects Hub home dashboard:
 *   - calls_today        : incoming calls received today (America/New_York)
 *   - follow_ups_pending : leads in lead_tracker not yet marked in lead_followups
 *   - unread_messages    : incoming messages/voicemails not yet marked read
 */
router.get('/call-stats', async (req, res) => {
  try {
    const [callsRow] = await sequelize.query(
      `SELECT COUNT(*)::int AS n
         FROM calls
        WHERE client_id = $1
          AND direction = 'incoming'
          AND (COALESCE(start_time, created_at) AT TIME ZONE 'America/New_York')::date
              = (NOW() AT TIME ZONE 'America/New_York')::date`,
      { bind: [D2AI_CLIENT_ID], type: QueryTypes.SELECT }
    );

    const [followRow] = await sequelize.query(
      `SELECT COUNT(*)::int AS n
         FROM lead_tracker lt
        WHERE lt.client_id = $1
          AND lt.conversation_id NOT IN (
                SELECT conversation_id FROM lead_followups WHERE client_id = $1
          )`,
      { bind: [D2AI_CLIENT_ID], type: QueryTypes.SELECT }
    );

    const [unreadRow] = await sequelize.query(
      `SELECT COUNT(*)::int AS n
         FROM messages
        WHERE client_id = $1
          AND direction = 'incoming'
          AND read = false`,
      { bind: [D2AI_CLIENT_ID], type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      calls_today: callsRow ? callsRow.n : 0,
      follow_ups_pending: followRow ? followRow.n : 0,
      unread_messages: unreadRow ? unreadRow.n : 0
    });
  } catch (error) {
    console.error('[ProjectsBridge] call-stats error:', error.message);
    // Degrade gracefully — the Hub home should never break over a missing table.
    res.json({ success: false, calls_today: 0, follow_ups_pending: 0, unread_messages: 0, error: error.message });
  }
});

/**
 * GET /api/projects-bridge/messages?limit=40
 * Recent inbound call + voicemail + SMS history for client 15, newest first.
 * Sourced from the messages table only — that's where AI-call summaries live
 * (message_type='call', body=summary, recording_url=elevenlabs-audio proxy) AND
 * where the `read` flag lives, so every item is markable. Powers the embedded
 * Messages view at /projects-messages.html.
 */
router.get('/messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);

    const rows = await sequelize.query(
      `SELECT id,
              COALESCE(NULLIF(message_type, ''), 'message') AS kind,
              from_number AS phone,
              COALESCE(call_duration, 0) AS secs,
              COALESCE(body, '') AS body,
              recording_url,
              read,
              COALESCE(call_start_time, created_at) AS ts
         FROM messages
        WHERE client_id = $1 AND direction = 'incoming'
        ORDER BY read ASC, ts DESC
        LIMIT $2`,
      { bind: [D2AI_CLIENT_ID, limit], type: QueryTypes.SELECT }
    );

    res.json({ success: true, count: rows.length, items: rows });
  } catch (error) {
    console.error('[ProjectsBridge] messages error:', error.message);
    res.json({ success: false, items: [], error: error.message });
  }
});

/**
 * POST /api/projects-bridge/messages/:id/read
 * Mark one inbound message (client 15) as read.
 */
router.post('/messages/:id/read', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.json({ success: false, error: 'invalid id' });
    await sequelize.query(
      `UPDATE messages SET read = true WHERE id = $1 AND client_id = $2`,
      { bind: [id, D2AI_CLIENT_ID], type: QueryTypes.UPDATE }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[ProjectsBridge] mark-read error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

/**
 * POST /api/projects-bridge/messages/read-all
 * Mark every inbound message (client 15) as read.
 */
router.post('/messages/read-all', async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE messages SET read = true WHERE client_id = $1 AND direction = 'incoming' AND read = false`,
      { bind: [D2AI_CLIENT_ID], type: QueryTypes.UPDATE }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[ProjectsBridge] read-all error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

/**
 * GET /api/projects-bridge/neural
 * Neural Intelligence health score + KPI panels for client 15, for the Hub home.
 * Proxies the main CRM's /api/neural/dashboard/15 server-side so the admin key
 * is never exposed to the browser.
 */
router.get('/neural', async (req, res) => {
  try {
    const port = process.env.PORT || 10000;
    const key = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const upstream = await fetch(
      `http://127.0.0.1:${port}/api/neural/dashboard/${D2AI_CLIENT_ID}`,
      { headers: { 'X-Api-Key': key }, signal: ctrl.signal }
    );
    clearTimeout(t);
    const data = await upstream.json();
    res.json(data);
  } catch (error) {
    console.error('[ProjectsBridge] neural error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// =====================================================
// EMAIL RECONCILIATION (client 15) — JWT-gated; inbox content is sensitive.
// =====================================================
function requireClient15(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query.token || '');
    if (!token) return res.status(401).json({ success: false, error: 'auth required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
    const cid = parseInt(decoded.clientId || decoded.client_id, 10);
    if (cid !== D2AI_CLIENT_ID) return res.status(403).json({ success: false, error: 'forbidden' });
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'invalid token' });
  }
}

// Unread totals + per-account breakdown (for the Email badge/card).
router.get('/email-stats', requireClient15, async (req, res) => {
  try {
    const data = await emailReconcile.getSummary(D2AI_CLIENT_ID, { limit: 1 });
    res.json({ success: true, total_unread: data.total_unread, accounts: data.accounts });
  } catch (error) {
    console.error('[ProjectsBridge] email-stats error:', error.message);
    res.json({ success: false, total_unread: 0, accounts: [], error: error.message });
  }
});

// Recent unread emails merged across all accounts (for the unified inbox view).
router.get('/emails', requireClient15, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 30);
    const force = req.query.force === '1';
    const data = await emailReconcile.getSummary(D2AI_CLIENT_ID, { limit, force });
    res.json({ success: true, total_unread: data.total_unread, accounts: data.accounts, items: data.items });
  } catch (error) {
    console.error('[ProjectsBridge] emails error:', error.message);
    res.json({ success: false, items: [], accounts: [], error: error.message });
  }
});

// List connected accounts (no secrets).
router.get('/email-accounts', requireClient15, async (req, res) => {
  try {
    const accounts = await emailReconcile.listAccounts(D2AI_CLIENT_ID);
    res.json({ success: true, accounts });
  } catch (error) {
    res.json({ success: false, accounts: [], error: error.message });
  }
});

// Add an IMAP account (tests the connection before saving).
router.post('/email-accounts', requireClient15, async (req, res) => {
  try {
    const { label, email, host, port, secure, user, password } = req.body || {};
    if (!email || !host || !password) {
      return res.json({ success: false, error: 'email, host and password are required' });
    }
    try {
      await emailReconcile.testImap({ email, host, port, secure, user, password });
    } catch (e) {
      return res.json({ success: false, error: `Could not connect: ${e.message}` });
    }
    const id = await emailReconcile.addImapAccount(D2AI_CLIENT_ID, { label, email, host, port, secure, user, password });
    res.json({ success: true, id: id && (id.id || id) });
  } catch (error) {
    console.error('[ProjectsBridge] add email account error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

// Remove an account.
router.delete('/email-accounts/:id', requireClient15, async (req, res) => {
  try {
    await emailReconcile.deleteAccount(D2AI_CLIENT_ID, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ---- Gmail OAuth (password-free) ----
// Start: requireClient15 reads the token from ?token= (it's a top-level redirect,
// so we can't set an Authorization header). State carries the JWT for the callback.
router.get('/email-oauth/google/start', requireClient15, (req, res) => {
  try {
    const state = (req.headers.authorization || '').replace('Bearer ', '') || req.query.token || '';
    const url = emailReconcile.getGmailAuthUrl(state);
    res.redirect(url);
  } catch (error) {
    res.status(500).send('Could not start Gmail connection: ' + error.message);
  }
});

// Callback: Google redirects here. Verify the JWT carried in `state` is client 15.
router.get('/email-oauth/google/callback', async (req, res) => {
  const done = (msg, ok) => res.type('html').send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Gmail</title>
    <style>body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
    .c{max-width:380px;padding:24px}.ok{color:#10b981}.err{color:#f87171}button{margin-top:16px;background:#2563eb;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-weight:600;cursor:pointer}</style></head>
    <body><div class="c"><h2 class="${ok ? 'ok' : 'err'}">${ok ? '&#10003; Gmail connected' : 'Could not connect'}</h2>
    <p>${msg}</p><button onclick="window.close()">Close this tab</button></div></body></html>`);
  try {
    const { code, state, error } = req.query;
    if (error) return done('Google returned: ' + error, false);
    if (!code) return done('Missing authorization code.', false);
    try {
      const decoded = jwt.verify(state || '', process.env.JWT_SECRET || 'your-super-secret-jwt-key');
      if (parseInt(decoded.clientId || decoded.client_id, 10) !== D2AI_CLIENT_ID) return done('Not authorized.', false);
    } catch (e) { return done('Session expired — please retry from the Email screen.', false); }

    const { tokens, email } = await emailReconcile.exchangeGmailCode(code);
    const granted = tokens.scope || '';
    if (!/gmail\.modify|gmail\.readonly|mail\.google\.com/.test(granted)) {
      return done('You signed in, but did NOT grant Gmail access. Reconnect and make sure to CHECK the box "Read, compose, and send emails from your Gmail account" before clicking Continue.', false);
    }
    if (!tokens.refresh_token) {
      return done('Google did not return a refresh token. Remove RinglyPro at myaccount.google.com/permissions, then retry.', false);
    }
    await emailReconcile.saveGmailAccount(D2AI_CLIENT_ID, tokens, email || 'gmail account');
    return done(`Connected ${email || 'your Gmail'}. Return to the Email tab and hit Refresh.`, true);
  } catch (e) {
    console.error('[ProjectsBridge] gmail callback error:', e.message);
    return done(e.message, false);
  }
});

module.exports = router;
