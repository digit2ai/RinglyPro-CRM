'use strict';

/**
 * v2 Learner Profile Routes
 *
 * GET   /api/v2/learner/me      — fetch current learner profile (auto-creates on first call)
 * PATCH /api/v2/learner/me      — update learner profile fields
 * GET   /api/v2/learner/stats   — quick stats (XP, CEFR level, daily goal status)
 */

const express = require('express');
const router = express.Router();
const sequelize = require('../../services/db.ti');
const v2Auth = require('../middleware/v2-auth');

// Whitelist of fields the learner may PATCH on their own profile
const EDITABLE_FIELDS = [
  'native_language',
  'target_dialect',
  'cefr_level',
  'daily_goal_minutes',
  'reminder_time',
  'timezone',
  'voice_preference',
  'cognate_highlighting',
  'onboarded'
];

/**
 * Get or lazily create the learner profile for the authenticated user.
 * Returns the full ti_v2_learners row joined with the user's v1 name/email.
 */
async function getOrCreateLearner(userId) {
  const [existing] = await sequelize.query(
    `SELECT l.*, u.email, u.full_name, u.role, u.organization
     FROM ti_v2_learners l
     JOIN ti_users u ON u.id = l.user_id
     WHERE l.user_id = $1
     LIMIT 1`,
    { bind: [userId] }
  );

  if (existing.length > 0) return existing[0];

  // Lazy create
  await sequelize.query(
    `INSERT INTO ti_v2_learners (user_id, created_at, updated_at)
     VALUES ($1, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    { bind: [userId] }
  );

  const [created] = await sequelize.query(
    `SELECT l.*, u.email, u.full_name, u.role, u.organization
     FROM ti_v2_learners l
     JOIN ti_users u ON u.id = l.user_id
     WHERE l.user_id = $1
     LIMIT 1`,
    { bind: [userId] }
  );

  return created[0];
}

// GET /api/v2/learner/me
router.get('/me', v2Auth.learner, async (req, res) => {
  try {
    const learner = await getOrCreateLearner(req.user.id);
    if (!learner) {
      return res.status(500).json({ error: 'Failed to load or create learner profile' });
    }
    res.json({ success: true, learner });
  } catch (err) {
    console.error('[v2/learner] GET /me error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v2/learner/me
router.patch('/me', v2Auth.learner, async (req, res) => {
  try {
    // Ensure profile exists first
    await getOrCreateLearner(req.user.id);

    const updates = {};
    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No editable fields provided', editable: EDITABLE_FIELDS });
    }

    // Build parameterized SET clause
    const setClauses = [];
    const binds = [];
    let idx = 1;
    for (const [field, value] of Object.entries(updates)) {
      setClauses.push(`${field} = $${idx}`);
      binds.push(value);
      idx++;
    }
    setClauses.push(`updated_at = NOW()`);
    binds.push(req.user.id);

    await sequelize.query(
      `UPDATE ti_v2_learners SET ${setClauses.join(', ')} WHERE user_id = $${idx}`,
      { bind: binds }
    );

    const updated = await getOrCreateLearner(req.user.id);
    res.json({ success: true, learner: updated });
  } catch (err) {
    console.error('[v2/learner] PATCH /me error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/learner/stats — quick summary for dashboard widgets
router.get('/stats', v2Auth.learner, async (req, res) => {
  try {
    const learner = await getOrCreateLearner(req.user.id);
    res.json({
      success: true,
      stats: {
        cefr_level: learner.cefr_level,
        total_xp: learner.total_xp,
        daily_goal_minutes: learner.daily_goal_minutes,
        onboarded: learner.onboarded,
        voice_preference: learner.voice_preference,
        cognate_highlighting: learner.cognate_highlighting,
        member_since: learner.created_at
      }
    });
  } catch (err) {
    console.error('[v2/learner] GET /stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
