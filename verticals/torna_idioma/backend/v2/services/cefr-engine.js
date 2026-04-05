'use strict';

/**
 * CEFR Adaptive Engine
 *
 * Watches a learner's recent lesson performance and decides whether to:
 *   - Advance them to the next CEFR level (mastery >= 90%)
 *   - Reduce difficulty/increase SRS frequency (mastery < 60%)
 *   - Hold steady (60-89%)
 *
 * Mastery is computed from the last N completed lesson sessions
 * (default 3) using their average score.
 */

const sequelize = require('../../services/db.ti');

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function nextLevel(current) {
  const idx = CEFR_ORDER.indexOf(current);
  if (idx === -1 || idx >= CEFR_ORDER.length - 1) return current;
  return CEFR_ORDER[idx + 1];
}

function previousLevel(current) {
  const idx = CEFR_ORDER.indexOf(current);
  if (idx <= 0) return current;
  return CEFR_ORDER[idx - 1];
}

/**
 * Compute average mastery from recent completed lesson sessions.
 * @param {number} learnerId
 * @param {number} [lookbackLessons=3]
 * @returns {Promise<{mastery, sampleCount, recentScores}>}
 */
async function computeMastery(learnerId, lookbackLessons = 3) {
  const [rows] = await sequelize.query(
    `SELECT score FROM ti_v2_lesson_sessions
     WHERE learner_id = $1 AND status = 'completed' AND score IS NOT NULL
     ORDER BY completed_at DESC
     LIMIT $2`,
    { bind: [learnerId, lookbackLessons] }
  );

  if (rows.length === 0) {
    return { mastery: null, sampleCount: 0, recentScores: [] };
  }

  const scores = rows.map((r) => Number(r.score) || 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    mastery: Math.round(avg),
    sampleCount: rows.length,
    recentScores: scores
  };
}

/**
 * Decide whether to adjust the learner's CEFR level based on recent mastery.
 * Auto-advances if mastery >= 90%, prompts downgrade if <60%.
 * @param {number} learnerId
 * @returns {Promise<{currentLevel, mastery, recommendation, newLevel?}>}
 */
async function evaluate(learnerId) {
  const [[learner]] = await sequelize.query(
    `SELECT cefr_level FROM ti_v2_learners WHERE id = $1`,
    { bind: [learnerId] }
  );
  if (!learner) return null;

  const currentLevel = learner.cefr_level || 'A1';
  const { mastery, sampleCount, recentScores } = await computeMastery(learnerId);

  let recommendation = 'hold';
  let newLevel = currentLevel;

  if (sampleCount >= 3) {
    if (mastery >= 90 && currentLevel !== 'C2') {
      recommendation = 'level_up';
      newLevel = nextLevel(currentLevel);
    } else if (mastery < 60 && currentLevel !== 'A1') {
      recommendation = 'level_down';
      newLevel = previousLevel(currentLevel);
    } else if (mastery < 60) {
      recommendation = 'reinforce'; // At A1 already — can't go lower, trigger more SRS
    }
  }

  return {
    currentLevel,
    mastery,
    sampleCount,
    recentScores,
    recommendation,
    newLevel,
    threshold_advance: 90,
    threshold_reduce: 60
  };
}

/**
 * Apply a level change (user-confirmed or auto).
 */
async function applyLevelChange(learnerId, newLevel) {
  if (!CEFR_ORDER.includes(newLevel)) {
    throw new Error(`Invalid CEFR level: ${newLevel}`);
  }
  await sequelize.query(
    `UPDATE ti_v2_learners SET cefr_level = $1, updated_at = NOW() WHERE id = $2`,
    { bind: [newLevel, learnerId] }
  );
  return newLevel;
}

module.exports = {
  computeMastery,
  evaluate,
  applyLevelChange,
  nextLevel,
  previousLevel,
  CEFR_ORDER
};
