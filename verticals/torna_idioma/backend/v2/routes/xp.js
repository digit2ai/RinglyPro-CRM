'use strict';

/**
 * v2 Gamification Routes — XP, streaks, badges, leaderboard
 *
 *   GET /api/v2/xp/total         — total XP + streak for current learner
 *   GET /api/v2/xp/history       — recent XP transactions
 *   GET /api/v2/xp/streak        — streak detail (current + longest + start date)
 *   GET /api/v2/xp/badges        — earned badges (and all available)
 *   GET /api/v2/xp/leaderboard   — top learners by XP (weekly or all-time)
 */

const express = require('express');
const router = express.Router();
const sequelize = require('../../services/db.ti');
const v2Auth = require('../middleware/v2-auth');

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

// GET /api/v2/xp/total
router.get('/total', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const [[learner]] = await sequelize.query(
      `SELECT total_xp FROM ti_v2_learners WHERE id = $1`,
      { bind: [learnerId] }
    );
    const [[streak]] = await sequelize.query(
      `SELECT current_streak, longest_streak, last_activity_date
       FROM ti_v2_streaks WHERE learner_id = $1`,
      { bind: [learnerId] }
    );
    const [[badgeCount]] = await sequelize.query(
      `SELECT COUNT(*)::int AS c FROM ti_v2_user_badges WHERE learner_id = $1`,
      { bind: [learnerId] }
    );

    res.json({
      success: true,
      total_xp: learner?.total_xp || 0,
      current_streak: streak?.current_streak || 0,
      longest_streak: streak?.longest_streak || 0,
      last_activity_date: streak?.last_activity_date || null,
      badges_earned: badgeCount?.c || 0
    });
  } catch (err) {
    console.error('[v2/xp] total error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/xp/history?limit=50
router.get('/history', v2Auth.learner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const learnerId = await getLearnerId(req.user.id);
    const [rows] = await sequelize.query(
      `SELECT id, event_type, xp_amount, metadata, created_at
       FROM ti_v2_xp_log
       WHERE learner_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      { bind: [learnerId, limit] }
    );
    res.json({ success: true, count: rows.length, history: rows });
  } catch (err) {
    console.error('[v2/xp] history error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/xp/streak
router.get('/streak', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    const [[streak]] = await sequelize.query(
      `SELECT * FROM ti_v2_streaks WHERE learner_id = $1`,
      { bind: [learnerId] }
    );
    res.json({
      success: true,
      streak: streak || {
        current_streak: 0,
        longest_streak: 0,
        last_activity_date: null,
        streak_started_at: null
      }
    });
  } catch (err) {
    console.error('[v2/xp] streak error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/xp/badges
router.get('/badges', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);

    const [earned] = await sequelize.query(
      `SELECT b.id, b.code, b.name_en, b.name_es, b.name_fil, b.description, b.icon, b.color, b.category, b.xp_reward,
              ub.earned_at
       FROM ti_v2_user_badges ub
       JOIN ti_v2_badges b ON b.id = ub.badge_id
       WHERE ub.learner_id = $1
       ORDER BY ub.earned_at DESC`,
      { bind: [learnerId] }
    );

    const earnedIds = new Set(earned.map((b) => b.id));
    const [all] = await sequelize.query(
      `SELECT id, code, name_en, name_es, name_fil, description, icon, color, category, xp_reward, sort_order
       FROM ti_v2_badges
       ORDER BY sort_order, id`
    );

    const locked = all.filter((b) => !earnedIds.has(b.id));

    res.json({
      success: true,
      earned_count: earned.length,
      total_count: all.length,
      earned,
      locked
    });
  } catch (err) {
    console.error('[v2/xp] badges error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/xp/leaderboard?period=week|all&limit=50
router.get('/leaderboard', v2Auth.learner, async (req, res) => {
  try {
    const period = req.query.period === 'week' ? 'week' : 'all';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    let query;
    if (period === 'week') {
      query = `
        SELECT
          l.id AS learner_id,
          u.full_name,
          u.email,
          u.organization,
          COALESCE(SUM(x.xp_amount), 0)::int AS period_xp,
          l.total_xp
        FROM ti_v2_learners l
        JOIN ti_users u ON u.id = l.user_id
        LEFT JOIN ti_v2_xp_log x
          ON x.learner_id = l.id AND x.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY l.id, u.full_name, u.email, u.organization, l.total_xp
        HAVING COALESCE(SUM(x.xp_amount), 0) > 0
        ORDER BY period_xp DESC
        LIMIT $1`;
    } else {
      query = `
        SELECT
          l.id AS learner_id,
          u.full_name,
          u.email,
          u.organization,
          l.total_xp AS period_xp,
          l.total_xp
        FROM ti_v2_learners l
        JOIN ti_users u ON u.id = l.user_id
        WHERE l.total_xp > 0
        ORDER BY l.total_xp DESC
        LIMIT $1`;
    }

    const [rows] = await sequelize.query(query, { bind: [limit] });
    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      learner_id: r.learner_id,
      full_name: r.full_name,
      organization: r.organization,
      period_xp: r.period_xp,
      total_xp: r.total_xp
    }));

    res.json({ success: true, period, count: leaderboard.length, leaderboard });
  } catch (err) {
    console.error('[v2/xp] leaderboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
