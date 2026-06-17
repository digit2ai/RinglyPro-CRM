'use strict';

/**
 * CINCO RAÍCES — daily five-root engine + SRS (Método Rizal).
 * All routes require a valid Torna Idioma JWT (auth.any).
 *
 * Only PROMOTED roots live in ti_vocab_roots (Gate G3); generated/unreviewed
 * content stays in ti_vocab_roots_staging and never surfaces here.
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.ti');
const sequelize = require('../services/db.ti');
const srs = require('../services/rizal-srs');
const emperador = require('../services/emperador');

const ROOTS_PER_SESSION = 5;
const ANNUAL_TARGET = 1800;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// GET /daily-session — today's 5 new roots (current module) + roots due for review.
router.get('/daily-session', auth.any, async (req, res) => {
  try {
    const userId = req.user.id;
    const [[u]] = await sequelize.query(
      `SELECT current_module, current_streak, longest_streak, immersion_level FROM ti_users WHERE id = $1`,
      { bind: [userId] }
    );
    const currentModule = u?.current_module || 1;

    // 5 new roots from the current module the learner hasn't started yet.
    const [newRoots] = await sequelize.query(
      `SELECT r.* FROM ti_vocab_roots r
       WHERE r.module = $1
         AND NOT EXISTS (
           SELECT 1 FROM ti_user_vocab_progress p
           WHERE p.user_id = $2 AND p.root_id = r.id
         )
       ORDER BY r.sort_order ASC, r.id ASC
       LIMIT $3`,
      { bind: [currentModule, userId, ROOTS_PER_SESSION] }
    );

    // Roots due for review today (across all modules already started).
    const [dueReviews] = await sequelize.query(
      `SELECT r.*, p.ease, p.interval_days, p.reps, p.lapses, p.due_date
       FROM ti_user_vocab_progress p
       JOIN ti_vocab_roots r ON r.id = p.root_id
       WHERE p.user_id = $1 AND p.due_date <= $2 AND p.mastered_at IS NULL
       ORDER BY p.due_date ASC
       LIMIT 30`,
      { bind: [userId, todayStr()] }
    );

    const [[done]] = await sequelize.query(
      `SELECT completed_at FROM ti_user_daily_session WHERE user_id = $1 AND session_date = $2`,
      { bind: [userId, todayStr()] }
    );

    res.json({
      success: true,
      module: currentModule,
      roots_per_session: ROOTS_PER_SESSION,
      new_roots: newRoots,
      due_reviews: dueReviews,
      streak: { current: u?.current_streak || 0, longest: u?.longest_streak || 0 },
      immersion_level: u?.immersion_level || 1,
      already_completed_today: !!done?.completed_at,
    });
  } catch (err) {
    console.error('daily-session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /review — submit an SM-2 grade for one root. Body: { root_id, quality(0-5) }
router.post('/review', auth.any, async (req, res) => {
  try {
    const userId = req.user.id;
    const { root_id, quality } = req.body;
    if (!root_id || typeof quality !== 'number') {
      return res.status(400).json({ error: 'root_id and numeric quality (0-5) required' });
    }
    const [[root]] = await sequelize.query(`SELECT id FROM ti_vocab_roots WHERE id = $1`, { bind: [root_id] });
    if (!root) return res.status(404).json({ error: 'root not found' });

    const [[prev]] = await sequelize.query(
      `SELECT ease, interval_days, reps, lapses, mastered_at FROM ti_user_vocab_progress WHERE user_id = $1 AND root_id = $2`,
      { bind: [userId, root_id] }
    );

    const next = srs.schedule(prev || {}, quality);
    const wasMastered = !!prev?.mastered_at;
    const masteredAtClause = next.mastered ? 'COALESCE(ti_user_vocab_progress.mastered_at, NOW())' : 'ti_user_vocab_progress.mastered_at';

    await sequelize.query(
      `INSERT INTO ti_user_vocab_progress (user_id, root_id, ease, interval_days, due_date, reps, lapses, mastered_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ${next.mastered ? 'NOW()' : 'NULL'}, NOW(), NOW())
       ON CONFLICT (user_id, root_id) DO UPDATE SET
         ease = $3, interval_days = $4, due_date = $5, reps = $6, lapses = $7,
         mastered_at = ${masteredAtClause}, updated_at = NOW()`,
      { bind: [userId, root_id, next.ease, next.interval_days, next.due_date, next.reps, next.lapses] }
    );

    // Honor-based points: correct reviews, and a one-time bonus on first mastery.
    if (quality >= 3) await emperador.award(userId, 'review_correct');
    if (next.mastered && !wasMastered) await emperador.award(userId, 'root_mastered');

    res.json({ success: true, srs: next, newly_mastered: next.mastered && !wasMastered });
  } catch (err) {
    console.error('review error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /session/complete — log the day's session, advance streak, award points.
// Body: { new_root_ids?: string[], reviews_done?: number }
router.post('/session/complete', auth.any, async (req, res) => {
  try {
    const userId = req.user.id;
    const newRootIds = Array.isArray(req.body.new_root_ids) ? req.body.new_root_ids : [];
    const reviewsDone = Number(req.body.reviews_done) || 0;
    const today = todayStr();

    // Streak: continue if last session was yesterday; reset if older; unchanged if today.
    const [[u]] = await sequelize.query(
      `SELECT current_streak, longest_streak, last_session_date FROM ti_users WHERE id = $1`,
      { bind: [userId] }
    );
    let current = u?.current_streak || 0;
    let longest = u?.longest_streak || 0;
    const last = u?.last_session_date ? new Date(u.last_session_date).toISOString().slice(0, 10) : null;

    if (last !== today) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      current = last === yStr ? current + 1 : 1;
      longest = Math.max(longest, current);
      await sequelize.query(
        `UPDATE ti_users SET current_streak = $1, longest_streak = $2, last_session_date = $3, updated_at = NOW() WHERE id = $4`,
        { bind: [current, longest, today, userId] }
      );
      await emperador.award(userId, 'streak_day');
    }

    await sequelize.query(
      `INSERT INTO ti_user_daily_session (user_id, session_date, new_roots, reviews_done, completed_at, created_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW(), NOW())
       ON CONFLICT (user_id, session_date) DO UPDATE SET
         new_roots = $3::jsonb, reviews_done = ti_user_daily_session.reviews_done + $4, completed_at = NOW()`,
      { bind: [userId, today, JSON.stringify(newRootIds), reviewsDone] }
    );
    await emperador.award(userId, 'session_completed');

    res.json({ success: true, streak: { current, longest } });
  } catch (err) {
    console.error('session/complete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /progress — mastered total, projection to ~1,800/year, streak, module coverage.
router.get('/progress', auth.any, async (req, res) => {
  try {
    const userId = req.user.id;
    const [[u]] = await sequelize.query(
      `SELECT current_module, current_streak, longest_streak FROM ti_users WHERE id = $1`,
      { bind: [userId] }
    );
    const [[counts]] = await sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE mastered_at IS NOT NULL) AS mastered,
         COUNT(*) AS started
       FROM ti_user_vocab_progress WHERE user_id = $1`,
      { bind: [userId] }
    );
    // Pace: roots mastered per active day → project to a year.
    const [[span]] = await sequelize.query(
      `SELECT COUNT(DISTINCT session_date) AS active_days,
              MIN(session_date) AS first_day
       FROM ti_user_daily_session WHERE user_id = $1`,
      { bind: [userId] }
    );
    const mastered = Number(counts?.mastered) || 0;
    const activeDays = Number(span?.active_days) || 0;
    const perDay = activeDays > 0 ? mastered / activeDays : 0;
    const projectionYear = Math.round(perDay * 365);

    const [[totalRoots]] = await sequelize.query(`SELECT COUNT(*) AS n FROM ti_vocab_roots`);

    res.json({
      success: true,
      mastered_total: mastered,
      started_total: Number(counts?.started) || 0,
      annual_target: ANNUAL_TARGET,
      projection_per_year: projectionYear,
      active_days: activeDays,
      streak: { current: u?.current_streak || 0, longest: u?.longest_streak || 0 },
      current_module: u?.current_module || 1,
      corpus_total_roots: Number(totalRoots?.n) || 0,
    });
  } catch (err) {
    console.error('progress error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
