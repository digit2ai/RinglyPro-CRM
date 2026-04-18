const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /api/v1/admin/dashboard -- Overview analytics
router.get('/dashboard', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');

    const [
      totalMembers, activeMembers, totalFellows, activeFellows,
      totalMentors, activeMentors, totalSponsors, activeSponsors,
      totalApplications, pendingApps, totalEvents, totalBadges,
      totalOpportunities, totalConversations
    ] = await Promise.all([
      models.VisionariumCommunityMember.count(),
      models.VisionariumCommunityMember.count({ where: { status: 'active' } }),
      models.VisionariumFellow.count(),
      models.VisionariumFellow.count({ where: { status: 'active' } }),
      models.VisionariumMentor.count(),
      models.VisionariumMentor.count({ where: { status: 'active' } }),
      models.VisionariumSponsor.count(),
      models.VisionariumSponsor.count({ where: { status: 'active' } }),
      models.VisionariumApplication.count(),
      models.VisionariumApplication.count({ where: { status: ['submitted', 'under_review'] } }),
      models.VisionariumEvent.count(),
      models.VisionariumBadge.count(),
      models.VisionariumOpportunity.count(),
      models.VisionariumLinaConversation.count()
    ]);

    // Country breakdown
    const countryBreakdown = await models.VisionariumCommunityMember.findAll({
      attributes: ['country', [models.sequelize.fn('COUNT', '*'), 'count']],
      where: { country: { [models.Sequelize.Op.ne]: null } },
      group: ['country'],
      order: [[models.sequelize.literal('count'), 'DESC']],
      limit: 15, raw: true
    });

    // Cohorts
    const cohorts = await models.VisionariumCohort.findAll({ order: [['year', 'DESC']] });

    res.json({
      success: true,
      dashboard: {
        community: { total: totalMembers, active: activeMembers },
        fellows: { total: totalFellows, active: activeFellows },
        mentors: { total: totalMentors, active: activeMentors },
        sponsors: { total: totalSponsors, active: activeSponsors },
        applications: { total: totalApplications, pending_review: pendingApps },
        events: totalEvents,
        badges: totalBadges,
        opportunities: totalOpportunities,
        lina_conversations: totalConversations,
        country_breakdown: countryBreakdown,
        cohorts
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/admin/community/analytics
router.get('/community/analytics', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');

    const tierBreakdown = await models.VisionariumCommunityMember.findAll({
      attributes: ['tier', [models.sequelize.fn('COUNT', '*'), 'count']],
      group: ['tier'], raw: true
    });

    const languageBreakdown = await models.VisionariumCommunityMember.findAll({
      attributes: ['language_pref', [models.sequelize.fn('COUNT', '*'), 'count']],
      group: ['language_pref'], raw: true
    });

    const registrationsByMonth = await models.sequelize.query(`
      SELECT DATE_TRUNC('month', created_at) as month, COUNT(*) as count
      FROM visionarium_community_members
      GROUP BY month ORDER BY month DESC LIMIT 12
    `, { type: models.Sequelize.QueryTypes.SELECT });

    res.json({
      success: true,
      analytics: { tier_breakdown: tierBreakdown, language_breakdown: languageBreakdown, registrations_by_month: registrationsByMonth }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Badge admin CRUD
router.get('/badges', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const badges = await models.VisionariumBadge.findAll({ order: [['category', 'ASC']] });
    res.json({ success: true, badges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/badges', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const badge = await models.VisionariumBadge.create(req.body);
    res.status(201).json({ success: true, badge });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/badges/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const badge = await models.VisionariumBadge.findByPk(req.params.id);
    if (!badge) return res.status(404).json({ error: 'Badge not found' });
    await badge.update(req.body);
    res.json({ success: true, badge });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/badges/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const badge = await models.VisionariumBadge.findByPk(req.params.id);
    if (!badge) return res.status(404).json({ error: 'Badge not found' });
    await badge.destroy();
    res.json({ success: true, message: 'Badge deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Award badge to member
router.post('/badges/award', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const { community_member_id, badge_id } = req.body;
    const award = await models.VisionariumMemberBadge.create({ community_member_id, badge_id });
    await models.VisionariumCommunityMember.increment('total_badges', { where: { id: community_member_id } });
    res.status(201).json({ success: true, award });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
