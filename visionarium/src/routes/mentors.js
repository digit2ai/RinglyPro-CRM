const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /api/v1/mentors/me
router.get('/me', verifyToken, requireRole('mentor'), async (req, res) => {
  try {
    const models = require('../../models');
    const mentor = await models.VisionariumMentor.findByPk(req.user.id, {
      attributes: { exclude: ['password_hash'] }
    });
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });
    res.json({ success: true, mentor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/mentors/me/fellows
router.get('/me/fellows', verifyToken, requireRole('mentor'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellows = await models.VisionariumFellow.findAll({
      where: { mentor_id: req.user.id },
      include: [
        { model: models.VisionariumCommunityMember, as: 'member', attributes: ['first_name', 'last_name', 'email', 'engagement_score', 'total_badges'] },
        { model: models.VisionariumProject, as: 'project' }
      ]
    });
    res.json({ success: true, fellows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/mentors/me/lina-briefings
router.get('/me/lina-briefings', verifyToken, requireRole('mentor'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellows = await models.VisionariumFellow.findAll({
      where: { mentor_id: req.user.id },
      attributes: ['id', 'community_member_id']
    });
    const memberIds = fellows.map(f => f.community_member_id);

    const conversations = await models.VisionariumLinaConversation.findAll({
      where: { community_member_id: memberIds },
      order: [['created_at', 'DESC']],
      limit: 20
    });
    res.json({ success: true, briefings: conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/mentors/sessions/:id/notes
router.post('/sessions/:id/notes', verifyToken, requireRole('mentor'), async (req, res) => {
  try {
    const models = require('../../models');
    const match = await models.VisionariumMentorMatch.findByPk(req.params.id);
    if (!match || match.mentor_id !== req.user.id) return res.status(404).json({ error: 'Match not found' });
    await match.update({
      total_sessions: (match.total_sessions || 0) + 1,
      avg_rating_by_mentor: req.body.rating || match.avg_rating_by_mentor
    });
    res.json({ success: true, match });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/mentors/availability
router.put('/availability', verifyToken, requireRole('mentor'), async (req, res) => {
  try {
    const models = require('../../models');
    const mentor = await models.VisionariumMentor.findByPk(req.user.id);
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });
    await mentor.update({ availability_hours_per_month: req.body.hours });
    res.json({ success: true, mentor: { id: mentor.id, availability_hours_per_month: mentor.availability_hours_per_month } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: list all mentors
router.get('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const mentors = await models.VisionariumMentor.findAll({
      attributes: { exclude: ['password_hash'] },
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, mentors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: create mentor
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const { password, ...data } = req.body;
    data.password_hash = await bcrypt.hash(password || 'Mentor2026!', 10);
    const mentor = await models.VisionariumMentor.create(data);
    res.status(201).json({ success: true, mentor: { ...mentor.toJSON(), password_hash: undefined } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update mentor
router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const mentor = await models.VisionariumMentor.findByPk(req.params.id);
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });
    const { password_hash, ...updates } = req.body;
    await mentor.update(updates);
    res.json({ success: true, mentor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete mentor
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const mentor = await models.VisionariumMentor.findByPk(req.params.id);
    if (!mentor) return res.status(404).json({ error: 'Mentor not found' });
    await mentor.destroy();
    res.json({ success: true, message: 'Mentor deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
