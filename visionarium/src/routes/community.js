const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /api/v1/community/stats -- Public community stats
router.get('/stats', async (req, res) => {
  try {
    const models = require('../../models');
    const { Op } = require('sequelize');

    const totalMembers = await models.VisionariumCommunityMember.count();
    const activeMembers = await models.VisionariumCommunityMember.count({ where: { tier: 'active_member' } });
    const fellows = await models.VisionariumCommunityMember.count({ where: { tier: 'fellow' } });
    const alumni = await models.VisionariumCommunityMember.count({ where: { tier: 'alumni' } });

    const countriesRaw = await models.VisionariumCommunityMember.findAll({
      attributes: [[models.sequelize.fn('DISTINCT', models.sequelize.col('country')), 'country']],
      where: { country: { [Op.ne]: null } },
      raw: true
    });

    res.json({
      success: true,
      stats: {
        total_community_members: totalMembers,
        active_members: activeMembers,
        current_fellows: fellows,
        alumni: alumni,
        countries_represented: countriesRaw.length
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/community/members -- Admin: list members
router.get('/members', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const { tier, country, status, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (tier) where.tier = tier;
    if (country) where.country = country;
    if (status) where.status = status;

    const { rows, count } = await models.VisionariumCommunityMember.findAndCountAll({
      where, limit: parseInt(limit), offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['password_hash'] }
    });

    res.json({ success: true, total: count, members: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
