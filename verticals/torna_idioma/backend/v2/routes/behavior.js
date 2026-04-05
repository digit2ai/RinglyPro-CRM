'use strict';

/**
 * v2 Behavior & Engagement Routes
 *
 * Auth: all routes require learner JWT.
 *
 *   POST /api/v2/behavior/event             — log a behavior event
 *   POST /api/v2/behavior/events            — bulk log (for efficient client batching)
 *   GET  /api/v2/behavior/engagement-score  — current engagement 0-100 + components
 *   GET  /api/v2/behavior/fatigue-signals   — fatigue detection + rest suggestion
 *   GET  /api/v2/behavior/recent            — recent events for current learner
 */

const express = require('express');
const router = express.Router();
const sequelize = require('../../services/db.ti');
const v2Auth = require('../middleware/v2-auth');
const behavior = require('../services/behavior-score');

// Whitelist of allowed event types — rejects unknown event types to prevent
// pollution of the analytics table
const ALLOWED_EVENTS = new Set([
  'lesson_started',
  'lesson_completed',
  'exercise_started',
  'exercise_skipped',
  'exercise_retried',
  'hint_used',
  'audio_replayed',
  'session_started',
  'session_abandoned',
  'session_ended',
  'fatigue_signal',
  'engagement_sample',
  'emotion_sample',
  'rest_accepted',
  'rest_dismissed',
  'focus_lost',
  'focus_regained'
]);

async function getLearnerId(userId) {
  const [rows] = await sequelize.query(
    `SELECT id FROM ti_v2_learners WHERE user_id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  if (rows.length > 0) return rows[0].id;
  await sequelize.query(
    `INSERT INTO ti_v2_learners (user_id, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`,
    { bind: [userId] }
  );
  const [created] = await sequelize.query(
    `SELECT id FROM ti_v2_learners WHERE user_id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  return created[0].id;
}

// POST /api/v2/behavior/event  { event_type, payload?, engagement_score?, session_id? }
router.post('/event', v2Auth.learner, async (req, res) => {
  try {
    const { event_type, payload, engagement_score, session_id } = req.body;
    if (!event_type || !ALLOWED_EVENTS.has(event_type)) {
      return res.status(400).json({
        error: 'Invalid event_type',
        allowed: Array.from(ALLOWED_EVENTS)
      });
    }

    const learnerId = await getLearnerId(req.user.id);
    const eventId = await behavior.logEvent(
      learnerId,
      event_type,
      payload || {},
      engagement_score != null ? Math.max(0, Math.min(100, Math.round(engagement_score))) : null,
      session_id
    );

    res.json({ success: true, event_id: eventId });
  } catch (err) {
    console.error('[v2/behavior] event error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/behavior/events  { events: [{event_type, payload, ...}] }
router.post('/events', v2Auth.learner, async (req, res) => {
  try {
    const events = Array.isArray(req.body.events) ? req.body.events : [];
    if (events.length === 0) return res.status(400).json({ error: 'events array required' });
    if (events.length > 100) return res.status(400).json({ error: 'max 100 events per batch' });

    const learnerId = await getLearnerId(req.user.id);
    let inserted = 0;
    let skipped = 0;

    for (const e of events) {
      if (!e.event_type || !ALLOWED_EVENTS.has(e.event_type)) {
        skipped++;
        continue;
      }
      try {
        await behavior.logEvent(
          learnerId,
          e.event_type,
          e.payload || {},
          e.engagement_score != null ? Math.max(0, Math.min(100, Math.round(e.engagement_score))) : null,
          e.session_id || null
        );
        inserted++;
      } catch (_) {
        skipped++;
      }
    }

    res.json({ success: true, inserted, skipped });
  } catch (err) {
    console.error('[v2/behavior] bulk events error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/behavior/engagement-score
router.get('/engagement-score', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const lookback = Math.min(parseInt(req.query.lookback_minutes, 10) || 15, 180);
    const result = await behavior.computeEngagementScore(learnerId, lookback);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[v2/behavior] engagement error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/behavior/fatigue-signals
router.get('/fatigue-signals', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const lookback = Math.min(parseInt(req.query.lookback_minutes, 10) || 15, 180);
    const result = await behavior.detectFatigue(learnerId, lookback);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[v2/behavior] fatigue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/behavior/recent?limit=50
router.get('/recent', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const [rows] = await sequelize.query(
      `SELECT id, session_id, event_type, payload, engagement_score, created_at
       FROM ti_v2_behavior_events
       WHERE learner_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      { bind: [learnerId, limit] }
    );
    res.json({ success: true, count: rows.length, events: rows });
  } catch (err) {
    console.error('[v2/behavior] recent error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
