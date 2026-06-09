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
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

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
 * Recent call + voicemail + SMS history for client 15, newest first.
 * Powers the embedded Messages view at /projects-messages.html.
 */
router.get('/messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);

    const rows = await sequelize.query(
      `SELECT * FROM (
          SELECT 'call'::text AS kind,
                 id,
                 from_number AS phone,
                 COALESCE(duration, 0) AS secs,
                 COALESCE(NULLIF(notes, ''), caller_name, '') AS body,
                 recording_url,
                 elevenlabs_conversation_id AS conv_id,
                 COALESCE(start_time, created_at) AS ts
            FROM calls
           WHERE client_id = $1 AND direction = 'incoming'
          UNION ALL
          SELECT COALESCE(NULLIF(message_type, ''), 'message')::text AS kind,
                 id,
                 from_number AS phone,
                 COALESCE(call_duration, 0) AS secs,
                 COALESCE(body, '') AS body,
                 recording_url,
                 NULL AS conv_id,
                 COALESCE(call_start_time, created_at) AS ts
            FROM messages
           WHERE client_id = $1
       ) x
       ORDER BY ts DESC
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

module.exports = router;
