'use strict';

/**
 * EMPERADOR — progression & cohort leaderboard (Método Rizal).
 * Honor-based only: badges, rotating Emperador/Emperatriz title, no real money.
 * Leaderboard is tenant/school scoped (no cross-tenant leakage). Display handles
 * only — never emails. Learners can appear anonymously.
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.ti');
const sequelize = require('../services/db.ti');

const TENANT = 'torna_idioma';

// Badge ladder (honor-based, unlocked by points). Cultural-capsule unlock at top.
const BADGES = [
  { key: 'aprendiz',    label_en: 'Aprendiz',          label_fil: 'Aprendiz',          min: 0 },
  { key: 'caminante',   label_en: 'Caminante',         label_fil: 'Manlalakbay',       min: 50 },
  { key: 'lector',      label_en: 'Lector',            label_fil: 'Mambabasa',         min: 150 },
  { key: 'orador',      label_en: 'Orador',            label_fil: 'Tagapagsalita',     min: 300 },
  { key: 'erudito',     label_en: 'Erudito',           label_fil: 'Dalubhasa',         min: 600 },
  { key: 'maestro',     label_en: 'Maestro',           label_fil: 'Maestro',           min: 1000 },
];

function badgeFor(points) {
  let b = BADGES[0];
  for (const cand of BADGES) if (points >= cand.min) b = cand;
  return b;
}

// Pretty display name honoring anonymity. Never returns an email.
function publicName(row) {
  if (row.anonymous_leaderboard) return 'Anónimo';
  return row.display_handle || row.full_name || `Learner #${row.user_id}`;
}

// GET /leaderboard?scope=tenant|school — ranked, cohort-scoped, top 50.
router.get('/leaderboard', auth.any, async (req, res) => {
  try {
    const scope = req.query.scope === 'school' ? 'school' : 'tenant';
    const me = req.user;

    // School scope = same organization as the requester; tenant scope = whole tenant.
    let where = `s.tenant_id = $1`;
    const bind = [TENANT];
    if (scope === 'school' && me.organization) {
      where += ` AND u.organization = $2`;
      bind.push(me.organization);
    }

    const [rows] = await sequelize.query(
      `SELECT s.user_id, s.points, s.components_json,
              u.full_name, u.display_handle, u.anonymous_leaderboard, u.organization
       FROM ti_emperador_score s
       JOIN ti_users u ON u.id = s.user_id
       WHERE ${where}
       ORDER BY s.points DESC, s.updated_at ASC
       LIMIT 50`,
      { bind }
    );

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      name: publicName(r),
      points: r.points,
      badge: badgeFor(r.points),
      is_emperador: i === 0,
      title: i === 0 ? 'Emperador/Emperatriz' : null,
      is_me: r.user_id === me.id,
    }));

    res.json({ success: true, scope, leaderboard });
  } catch (err) {
    console.error('leaderboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /me — my score, components breakdown, badge, next badge.
router.get('/me', auth.any, async (req, res) => {
  try {
    const userId = req.user.id;
    const [[row]] = await sequelize.query(
      `SELECT points, components_json FROM ti_emperador_score WHERE user_id = $1`,
      { bind: [userId] }
    );
    const points = row?.points || 0;
    const badge = badgeFor(points);
    const next = BADGES.find(b => b.min > points) || null;

    // My rank within the tenant.
    const [[rank]] = await sequelize.query(
      `SELECT COUNT(*) + 1 AS r FROM ti_emperador_score s
       JOIN ti_users u ON u.id = s.user_id
       WHERE u.tenant_id = $1 AND s.points > $2`,
      { bind: [TENANT, points] }
    );

    res.json({
      success: true,
      points,
      components: row?.components_json || {},
      badge,
      next_badge: next,
      points_to_next: next ? next.min - points : 0,
      rank: Number(rank?.r) || 1,
    });
  } catch (err) {
    console.error('emperador/me error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /settings — anonymous toggle + display handle. Body: { anonymous?, display_handle? }
router.post('/settings', auth.any, async (req, res) => {
  try {
    const userId = req.user.id;
    const { anonymous, display_handle } = req.body;
    const handle = typeof display_handle === 'string' ? display_handle.trim().slice(0, 60) : undefined;
    await sequelize.query(
      `UPDATE ti_users SET
         anonymous_leaderboard = COALESCE($1, anonymous_leaderboard),
         display_handle = COALESCE($2, display_handle),
         updated_at = NOW()
       WHERE id = $3`,
      { bind: [typeof anonymous === 'boolean' ? anonymous : null, handle ?? null, userId] }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('emperador/settings error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
