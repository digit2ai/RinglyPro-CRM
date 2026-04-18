const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { awardBadge } = require('../services/badge-service');

// GET /api/v1/fellows/me -- Fellow: my profile + passport
router.get('/me', verifyToken, requireRole('fellow'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellow = await models.VisionariumFellow.findOne({
      where: { community_member_id: req.user.id },
      include: [
        { model: models.VisionariumCommunityMember, as: 'member', attributes: { exclude: ['password_hash'] } },
        { model: models.VisionariumCohort, as: 'cohort' },
        { model: models.VisionariumMentor, as: 'mentor', attributes: { exclude: ['password_hash'] } },
        { model: models.VisionariumProject, as: 'project' }
      ]
    });
    if (!fellow) return res.status(404).json({ error: 'Fellow record not found' });
    res.json({ success: true, fellow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/fellows/me -- Fellow: update profile
router.put('/me', verifyToken, requireRole('fellow'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellow = await models.VisionariumFellow.findOne({ where: { community_member_id: req.user.id } });
    if (!fellow) return res.status(404).json({ error: 'Fellow record not found' });
    const allowed = ['notes_admin'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    await fellow.update(updates);
    res.json({ success: true, fellow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/fellows/me/badges
router.get('/me/badges', verifyToken, requireRole('fellow'), async (req, res) => {
  try {
    const models = require('../../models');
    const badges = await models.VisionariumMemberBadge.findAll({
      where: { community_member_id: req.user.id },
      include: [{ model: models.VisionariumBadge, as: 'badge' }],
      order: [['earned_at', 'DESC']]
    });
    res.json({ success: true, badges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/fellows/me/mentor
router.get('/me/mentor', verifyToken, requireRole('fellow'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellow = await models.VisionariumFellow.findOne({
      where: { community_member_id: req.user.id },
      include: [{ model: models.VisionariumMentor, as: 'mentor', attributes: { exclude: ['password_hash'] } }]
    });
    if (!fellow || !fellow.mentor) return res.status(404).json({ error: 'No mentor assigned' });
    res.json({ success: true, mentor: fellow.mentor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/fellows/me/project
router.get('/me/project', verifyToken, requireRole('fellow'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellow = await models.VisionariumFellow.findOne({ where: { community_member_id: req.user.id } });
    if (!fellow) return res.status(404).json({ error: 'Fellow not found' });
    const project = await models.VisionariumProject.findOne({ where: { fellow_id: fellow.id } });
    res.json({ success: true, project: project || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/fellows/me/project
router.put('/me/project', verifyToken, requireRole('fellow'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellow = await models.VisionariumFellow.findOne({ where: { community_member_id: req.user.id } });
    if (!fellow) return res.status(404).json({ error: 'Fellow not found' });

    let project = await models.VisionariumProject.findOne({ where: { fellow_id: fellow.id } });
    if (!project) {
      project = await models.VisionariumProject.create({ fellow_id: fellow.id, cohort_id: fellow.cohort_id, ...req.body });
    } else {
      await project.update(req.body);
    }
    res.json({ success: true, project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/fellows/me/schedule -- Weekly cadence
router.get('/me/schedule', verifyToken, requireRole('fellow'), async (req, res) => {
  try {
    res.json({
      success: true,
      schedule: {
        monday: { activity: 'Technology Lab', format: 'Virtual', duration: '90 min', description: 'Hands-on AI/building session' },
        wednesday: { activity: 'Leadership Forum', format: 'Virtual', duration: '60 min', description: 'Expert speaker + Q&A' },
        friday: { activity: '1:1 Human Mentor', format: 'Virtual', duration: '30 min', description: 'Assigned mentor session' },
        daily: { activity: 'Lina Mentor (AI Coach)', format: 'Async', duration: 'Unlimited', description: 'Bilingual voice + chat' },
        monthly: { activity: 'Cohort Showcase', format: 'Virtual', duration: 'TBD', description: 'Presentation of work in progress' },
        quarterly: { activity: 'Miami Immersion', format: 'In-person', duration: '3-4 days', description: 'All fellows together' }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: list all fellows
router.get('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const { cohort_id, status, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (cohort_id) where.cohort_id = cohort_id;
    if (status) where.status = status;

    const { rows, count } = await models.VisionariumFellow.findAndCountAll({
      where, limit: parseInt(limit), offset: parseInt(offset),
      include: [
        { model: models.VisionariumCommunityMember, as: 'member', attributes: ['first_name', 'last_name', 'email', 'country', 'city'] },
        { model: models.VisionariumMentor, as: 'mentor', attributes: ['first_name', 'last_name'] },
        { model: models.VisionariumCohort, as: 'cohort', attributes: ['name'] }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, total: count, fellows: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: create fellow
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellow = await models.VisionariumFellow.create(req.body);
    // Update member tier
    await models.VisionariumCommunityMember.update({ tier: 'fellow' }, { where: { id: req.body.community_member_id } });
    // Award accepted badge
    awardBadge(models, req.body.community_member_id, 'fellow_accepted').catch(() => {});
    res.status(201).json({ success: true, fellow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update fellow
router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellow = await models.VisionariumFellow.findByPk(req.params.id);
    if (!fellow) return res.status(404).json({ error: 'Fellow not found' });
    await fellow.update(req.body);
    res.json({ success: true, fellow });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete fellow
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellow = await models.VisionariumFellow.findByPk(req.params.id);
    if (!fellow) return res.status(404).json({ error: 'Fellow not found' });
    await models.VisionariumCommunityMember.update({ tier: 'community' }, { where: { id: fellow.community_member_id } });
    await fellow.destroy();
    res.json({ success: true, message: 'Fellow removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
