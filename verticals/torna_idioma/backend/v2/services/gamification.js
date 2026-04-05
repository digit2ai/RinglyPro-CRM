'use strict';

/**
 * Gamification Service — XP, streaks, badge awards.
 *
 * Used by SRS, Isabel, lesson player, and other v2 routes via internal
 * service calls (not exposed HTTP). All functions are atomic and safe
 * to call from concurrent request handlers.
 */

const sequelize = require('../../services/db.ti');

// XP amounts per event type (single source of truth)
const XP_AMOUNTS = {
  signup: 10,
  card_added: 2,
  card_reviewed: 2,
  card_mastered: 10,
  card_lapsed: 0,
  lesson_complete: 25,
  lesson_perfect: 10, // bonus on top of lesson_complete
  isabel_chat: 3,
  isabel_voice: 5,
  streak_continued: 5,
  streak_milestone: 0 // handled via badge_reward
};

function xpFor(eventType) {
  return XP_AMOUNTS[eventType] ?? 0;
}

/**
 * Award XP to a learner. Inserts into ti_v2_xp_log and updates
 * ti_v2_learners.total_xp atomically. Returns the new total.
 *
 * @param {number} learnerId
 * @param {string} eventType
 * @param {number} [amount]  — defaults to XP_AMOUNTS[eventType]
 * @param {object} [metadata]
 * @returns {Promise<number>} new total_xp
 */
async function awardXP(learnerId, eventType, amount, metadata = {}) {
  const xp = amount != null ? amount : xpFor(eventType);
  if (!learnerId || xp === 0) {
    const [[row]] = await sequelize.query(
      `SELECT total_xp FROM ti_v2_learners WHERE id = $1`,
      { bind: [learnerId] }
    );
    return row?.total_xp || 0;
  }

  await sequelize.query(
    `INSERT INTO ti_v2_xp_log (learner_id, event_type, xp_amount, metadata, created_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())`,
    { bind: [learnerId, eventType, xp, JSON.stringify(metadata)] }
  );

  const [[updated]] = await sequelize.query(
    `UPDATE ti_v2_learners
     SET total_xp = total_xp + $1, updated_at = NOW()
     WHERE id = $2
     RETURNING total_xp`,
    { bind: [xp, learnerId] }
  );

  return updated?.total_xp || 0;
}

/**
 * Update streak on activity. Called after any XP-earning event.
 * - If last_activity_date is today: no change
 * - If yesterday: increment current_streak
 * - If gap: reset current_streak to 1
 * - Track longest_streak
 * Returns the updated streak row.
 */
async function updateStreak(learnerId) {
  if (!learnerId) return null;

  // Ensure row exists
  await sequelize.query(
    `INSERT INTO ti_v2_streaks (learner_id, current_streak, longest_streak, last_activity_date, streak_started_at, updated_at)
     VALUES ($1, 0, 0, NULL, NULL, NOW())
     ON CONFLICT (learner_id) DO NOTHING`,
    { bind: [learnerId] }
  );

  const [[streak]] = await sequelize.query(
    `SELECT * FROM ti_v2_streaks WHERE learner_id = $1`,
    { bind: [learnerId] }
  );
  if (!streak) return null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);

  const last = streak.last_activity_date ? new Date(streak.last_activity_date) : null;
  if (last) last.setUTCHours(0, 0, 0, 0);

  let newCurrent;
  let newLongest = streak.longest_streak;
  let newStartedAt = streak.streak_started_at;
  let wasContinued = false;

  if (!last) {
    // First activity ever
    newCurrent = 1;
    newStartedAt = todayIso;
  } else {
    const diffDays = Math.floor((today - last) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) {
      // Already counted today
      return streak;
    } else if (diffDays === 1) {
      // Consecutive day
      newCurrent = streak.current_streak + 1;
      wasContinued = true;
    } else {
      // Gap — reset
      newCurrent = 1;
      newStartedAt = todayIso;
    }
  }

  if (newCurrent > newLongest) newLongest = newCurrent;

  const [[updated]] = await sequelize.query(
    `UPDATE ti_v2_streaks
     SET current_streak = $1,
         longest_streak = $2,
         last_activity_date = $3::date,
         streak_started_at = $4::date,
         updated_at = NOW()
     WHERE learner_id = $5
     RETURNING *`,
    { bind: [newCurrent, newLongest, todayIso, newStartedAt, learnerId] }
  );

  // Bonus XP for streak continuation (not first day)
  if (wasContinued) {
    await awardXP(learnerId, 'streak_continued', XP_AMOUNTS.streak_continued, {
      current_streak: newCurrent
    });
  }

  return updated;
}

/**
 * Check all badge trigger conditions against a learner's current state
 * and award any newly-qualified badges. Idempotent — existing badges
 * are skipped via ON CONFLICT DO NOTHING.
 *
 * @returns {Promise<Array>} array of newly-awarded badge objects
 */
async function checkBadgeEligibility(learnerId) {
  if (!learnerId) return [];

  // Load current state
  const [[learner]] = await sequelize.query(
    `SELECT id, total_xp FROM ti_v2_learners WHERE id = $1`,
    { bind: [learnerId] }
  );
  if (!learner) return [];

  const [[streak]] = await sequelize.query(
    `SELECT current_streak, longest_streak FROM ti_v2_streaks WHERE learner_id = $1`,
    { bind: [learnerId] }
  );
  const currentStreak = streak?.current_streak || 0;
  const longestStreak = streak?.longest_streak || 0;

  const [[cardStats]] = await sequelize.query(
    `SELECT
       COUNT(*)::int AS total_cards,
       COUNT(*) FILTER (WHERE repetitions >= 5 AND interval_days >= 21)::int AS mastered,
       COUNT(*) FILTER (WHERE source = 'cognate')::int AS cognate_cards
     FROM ti_v2_vocabulary_cards
     WHERE learner_id = $1`,
    { bind: [learnerId] }
  );

  const [[reviewStats]] = await sequelize.query(
    `SELECT COUNT(*)::int AS total_reviews FROM ti_v2_reviews WHERE learner_id = $1`,
    { bind: [learnerId] }
  );

  const [[reviewsToday]] = await sequelize.query(
    `SELECT COUNT(*)::int AS c
     FROM ti_v2_reviews
     WHERE learner_id = $1 AND reviewed_at >= NOW() - INTERVAL '24 hours'`,
    { bind: [learnerId] }
  );

  // Isabel chat activity (Step 6)
  let isabelMessages = 0;
  try {
    const [[ir]] = await sequelize.query(
      `SELECT COUNT(*)::int AS c FROM ti_v2_isabel_conversations
       WHERE learner_id = $1 AND role = 'user'`,
      { bind: [learnerId] }
    );
    isabelMessages = ir?.c || 0;
  } catch (_) {
    // Table may not exist yet in earlier deploys — skip silently
  }

  // Build list of eligible badge codes
  const eligible = [];

  if (reviewStats.total_reviews >= 1) eligible.push('first_word');
  if (cardStats.mastered >= 100) eligible.push('one_hundred_words');
  if (cardStats.cognate_cards >= 25) eligible.push('cognate_master');
  if (cardStats.cognate_cards >= 5 && reviewStats.total_reviews >= 10) eligible.push('bilingual_bridge');
  if (longestStreak >= 3) eligible.push('streak_3');
  if (longestStreak >= 7) eligible.push('streak_7');
  if (longestStreak >= 30) eligible.push('streak_30');
  if (reviewsToday.c >= 50) eligible.push('marathon_learner');
  if (cardStats.total_cards >= 10 && reviewStats.total_reviews >= 50) eligible.push('rizals_heir');
  if (isabelMessages >= 1) eligible.push('isabel_favorite');

  if (eligible.length === 0) return [];

  // Award all eligible badges (skip existing via ON CONFLICT)
  const [awarded] = await sequelize.query(
    `WITH new_badges AS (
       INSERT INTO ti_v2_user_badges (learner_id, badge_id, earned_at)
       SELECT $1, b.id, NOW()
       FROM ti_v2_badges b
       WHERE b.code = ANY($2::text[])
       ON CONFLICT (learner_id, badge_id) DO NOTHING
       RETURNING badge_id
     )
     SELECT b.id, b.code, b.name_en, b.name_es, b.name_fil, b.description, b.icon, b.color, b.category, b.xp_reward
     FROM ti_v2_badges b
     JOIN new_badges nb ON b.id = nb.badge_id`,
    { bind: [learnerId, eligible] }
  );

  // Award XP rewards for each new badge
  for (const badge of awarded) {
    if (badge.xp_reward > 0) {
      await awardXP(learnerId, 'badge_earned', badge.xp_reward, {
        badge_code: badge.code,
        badge_name: badge.name_en
      });
    }
  }

  return awarded;
}

/**
 * Convenience wrapper — call after any XP event to keep streak + badges in sync.
 */
async function recordActivity(learnerId, eventType, amount, metadata) {
  const newXp = await awardXP(learnerId, eventType, amount, metadata);
  await updateStreak(learnerId);
  const newBadges = await checkBadgeEligibility(learnerId);
  return { total_xp: newXp, new_badges: newBadges };
}

module.exports = {
  awardXP,
  updateStreak,
  checkBadgeEligibility,
  recordActivity,
  XP_AMOUNTS,
  xpFor
};
