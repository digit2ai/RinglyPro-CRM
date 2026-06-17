'use strict';

/**
 * Emperador scoring helper — honor-based gamification for Método Rizal.
 * No real money, no gambling. Points accrue per learning action; the cohort
 * leaderboard is tenant/school-scoped (no cross-tenant leakage).
 */

const sequelize = require('./db.ti');

// Point values per component (honor-based recognition only).
const POINTS = {
  root_mastered: 10,
  review_correct: 2,
  session_completed: 5,
  streak_day: 3,
  translation_done: 8,
  immersion_session: 5,
  rizal_milestone: 15,
};

/**
 * Award points to a user for a component, accumulating per-component totals in
 * components_json. Idempotent upsert on (user_id).
 * @param {number} userId
 * @param {string} component  one of POINTS keys
 * @param {number} [multiplier=1]
 * @returns {Promise<{points:number}|null>}
 */
async function award(userId, component, multiplier = 1) {
  const per = POINTS[component];
  if (!per || !userId) return null;
  const delta = per * multiplier;
  const [[row]] = await sequelize.query(
    `INSERT INTO ti_emperador_score (user_id, tenant_id, points, components_json, updated_at)
     VALUES ($1, 'torna_idioma', $2, jsonb_build_object($3::text, $2::int), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       points = ti_emperador_score.points + $2,
       components_json = jsonb_set(
         ti_emperador_score.components_json,
         ARRAY[$3::text],
         to_jsonb(COALESCE((ti_emperador_score.components_json->>$3)::int, 0) + $2),
         true
       ),
       updated_at = NOW()
     RETURNING points`,
    { bind: [userId, delta, component] }
  );
  return row || null;
}

module.exports = { award, POINTS };
