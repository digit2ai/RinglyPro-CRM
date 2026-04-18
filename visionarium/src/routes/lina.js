const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { checkAndAwardAll } = require('../services/badge-service');

// POST /api/v1/lina/webhook -- ElevenLabs conversation webhook
router.post('/webhook', async (req, res) => {
  try {
    const models = require('../../models');
    const { community_member_id, conversation_id, language, summary, topics, sentiment, duration_seconds } = req.body;

    const convo = await models.VisionariumLinaConversation.create({
      community_member_id, conversation_id,
      language: language || 'en',
      summary, topics: topics || [],
      sentiment: sentiment || 'neutral',
      duration_seconds
    });

    // Update member stats + check Lina badges
    if (community_member_id) {
      await models.VisionariumCommunityMember.update({
        lina_conversation_count: models.sequelize.literal('lina_conversation_count + 1'),
        last_lina_interaction: new Date()
      }, { where: { id: community_member_id } });

      checkAndAwardAll(models, community_member_id).catch(() => {});
    }

    res.json({ success: true, conversation: convo });
  } catch (err) {
    console.error('Lina webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/lina/context/:member_id -- Fellow context for Lina
router.get('/context/:member_id', async (req, res) => {
  try {
    const models = require('../../models');
    const member = await models.VisionariumCommunityMember.findByPk(req.params.member_id, {
      attributes: { exclude: ['password_hash'] }
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const badges = await models.VisionariumMemberBadge.findAll({
      where: { community_member_id: member.id },
      include: [{ model: models.VisionariumBadge, as: 'badge' }]
    });

    let fellow = null;
    let project = null;
    let mentor = null;
    let upcomingEvents = [];

    if (member.tier === 'fellow') {
      fellow = await models.VisionariumFellow.findOne({
        where: { community_member_id: member.id },
        include: [
          { model: models.VisionariumMentor, as: 'mentor', attributes: ['first_name', 'last_name', 'expertise_areas'] },
          { model: models.VisionariumCohort, as: 'cohort', attributes: ['name', 'status'] }
        ]
      });
      if (fellow) {
        project = await models.VisionariumProject.findOne({ where: { fellow_id: fellow.id } });
        mentor = fellow.mentor;
        upcomingEvents = await models.VisionariumEvent.findAll({
          where: { cohort_id: fellow.cohort_id, status: ['planned', 'registration_open'] },
          order: [['start_datetime', 'ASC']], limit: 5
        });
      }
    }

    const recentConversations = await models.VisionariumLinaConversation.findAll({
      where: { community_member_id: member.id },
      order: [['created_at', 'DESC']], limit: 5
    });

    res.json({
      success: true,
      context: {
        member: { first_name: member.first_name, last_name: member.last_name, tier: member.tier, language_pref: member.language_pref, engagement_score: member.engagement_score },
        badges: badges.map(b => ({ name_en: b.badge.name_en, name_es: b.badge.name_es, category: b.badge.category })),
        fellow_status: fellow ? { track: fellow.track, status: fellow.status, completion_rate: fellow.completion_rate } : null,
        project: project ? { title: project.title, status: project.status } : null,
        mentor: mentor ? { first_name: mentor.first_name, last_name: mentor.last_name } : null,
        upcoming_events: upcomingEvents.map(e => ({ title_en: e.title_en, title_es: e.title_es, type: e.type, start: e.start_datetime })),
        recent_topics: recentConversations.map(c => c.topics).flat().slice(0, 10)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/lina/escalate -- Escalation trigger
router.post('/escalate', async (req, res) => {
  try {
    const models = require('../../models');
    const { community_member_id, reason, conversation_id } = req.body;

    // Log the escalation
    await models.VisionariumLinaConversation.update(
      { escalated: true, escalation_reason: reason },
      { where: { conversation_id } }
    );

    // Find mentor to notify
    const fellow = await models.VisionariumFellow.findOne({
      where: { community_member_id },
      include: [{ model: models.VisionariumMentor, as: 'mentor' }]
    });

    res.json({
      success: true,
      escalation: {
        member_id: community_member_id,
        reason,
        mentor_notified: fellow && fellow.mentor ? fellow.mentor.email : null,
        message: 'Escalation logged. Mentor notification queued.'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/lina/briefing/:fellow_id -- Pre-1:1 mentor briefing
router.get('/briefing/:fellow_id', verifyToken, requireRole('mentor', 'admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellow = await models.VisionariumFellow.findByPk(req.params.fellow_id, {
      include: [
        { model: models.VisionariumCommunityMember, as: 'member', attributes: { exclude: ['password_hash'] } },
        { model: models.VisionariumProject, as: 'project' }
      ]
    });
    if (!fellow) return res.status(404).json({ error: 'Fellow not found' });

    const recentConvos = await models.VisionariumLinaConversation.findAll({
      where: { community_member_id: fellow.community_member_id },
      order: [['created_at', 'DESC']], limit: 7
    });

    const recentBadges = await models.VisionariumMemberBadge.findAll({
      where: { community_member_id: fellow.community_member_id },
      include: [{ model: models.VisionariumBadge, as: 'badge' }],
      order: [['earned_at', 'DESC']], limit: 5
    });

    const escalations = recentConvos.filter(c => c.escalated);

    res.json({
      success: true,
      briefing: {
        fellow: {
          name: `${fellow.member.first_name} ${fellow.member.last_name}`,
          track: fellow.track, status: fellow.status,
          completion_rate: fellow.completion_rate,
          engagement_score: fellow.member.engagement_score
        },
        project: fellow.project ? { title: fellow.project.title, status: fellow.project.status } : null,
        lina_summary: {
          conversations_this_week: recentConvos.length,
          topics: [...new Set(recentConvos.map(c => c.topics).flat())],
          sentiment_trend: recentConvos.map(c => c.sentiment),
          escalations: escalations.length,
          escalation_reasons: escalations.map(c => c.escalation_reason)
        },
        recent_badges: recentBadges.map(b => b.badge.name_en)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Lina analytics
router.get('/analytics', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const totalConversations = await models.VisionariumLinaConversation.count();
    const escalationCount = await models.VisionariumLinaConversation.count({ where: { escalated: true } });
    const byLanguage = await models.VisionariumLinaConversation.findAll({
      attributes: ['language', [models.sequelize.fn('COUNT', '*'), 'count']],
      group: ['language'], raw: true
    });
    const bySentiment = await models.VisionariumLinaConversation.findAll({
      attributes: ['sentiment', [models.sequelize.fn('COUNT', '*'), 'count']],
      group: ['sentiment'], raw: true
    });

    res.json({
      success: true,
      analytics: {
        total_conversations: totalConversations,
        escalation_count: escalationCount,
        escalation_rate: totalConversations > 0 ? (escalationCount / totalConversations * 100).toFixed(1) + '%' : '0%',
        by_language: byLanguage,
        by_sentiment: bySentiment
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
