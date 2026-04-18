const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /api/v1/sponsors/me
router.get('/me', verifyToken, requireRole('sponsor'), async (req, res) => {
  try {
    const models = require('../../models');
    const sponsor = await models.VisionariumSponsor.findByPk(req.user.id, {
      attributes: { exclude: ['password_hash'] }
    });
    if (!sponsor) return res.status(404).json({ error: 'Sponsor not found' });
    res.json({ success: true, sponsor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/sponsors/me/impact
router.get('/me/impact', verifyToken, requireRole('sponsor'), async (req, res) => {
  try {
    const models = require('../../models');
    const sponsor = await models.VisionariumSponsor.findByPk(req.user.id);
    const namedFellows = await models.VisionariumFellow.findAll({
      where: { sponsor_id: req.user.id },
      include: [{ model: models.VisionariumCommunityMember, as: 'member', attributes: ['first_name', 'last_name', 'country'] }]
    });
    const opportunities = await models.VisionariumOpportunity.findAll({ where: { sponsor_id: req.user.id } });
    res.json({
      success: true,
      impact: {
        tier: sponsor.tier,
        contribution: sponsor.contribution_amount,
        named_fellows: namedFellows,
        opportunities_posted: opportunities.length,
        opportunities
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/sponsors/me/fellows
router.get('/me/fellows', verifyToken, requireRole('sponsor'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellows = await models.VisionariumFellow.findAll({
      where: { sponsor_id: req.user.id },
      include: [
        { model: models.VisionariumCommunityMember, as: 'member', attributes: { exclude: ['password_hash'] } },
        { model: models.VisionariumProject, as: 'project' }
      ]
    });
    res.json({ success: true, fellows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/sponsors/me/pipeline -- Talent pipeline
router.get('/me/pipeline', verifyToken, requireRole('sponsor'), async (req, res) => {
  try {
    const models = require('../../models');
    const fellows = await models.VisionariumFellow.findAll({
      where: { status: ['active', 'completed'] },
      include: [
        { model: models.VisionariumCommunityMember, as: 'member', attributes: ['first_name', 'last_name', 'country', 'city', 'field_of_interest'] },
        { model: models.VisionariumProject, as: 'project', attributes: ['title', 'tech_stack', 'status'] }
      ],
      limit: 100
    });
    res.json({ success: true, pipeline: fellows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/sponsors/opportunities
router.post('/opportunities', verifyToken, requireRole('sponsor'), async (req, res) => {
  try {
    const models = require('../../models');
    const opp = await models.VisionariumOpportunity.create({ ...req.body, sponsor_id: req.user.id });
    res.status(201).json({ success: true, opportunity: opp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/sponsors/me/metrics
router.get('/me/metrics', verifyToken, requireRole('sponsor'), async (req, res) => {
  try {
    const models = require('../../models');
    const namedCount = await models.VisionariumFellow.count({ where: { sponsor_id: req.user.id } });
    const oppsCount = await models.VisionariumOpportunity.count({ where: { sponsor_id: req.user.id } });
    const totalCommunity = await models.VisionariumCommunityMember.count();
    res.json({
      success: true,
      metrics: {
        named_fellows: namedCount,
        opportunities_posted: oppsCount,
        total_community_reach: totalCommunity
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: list all sponsors
router.get('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const sponsors = await models.VisionariumSponsor.findAll({
      attributes: { exclude: ['password_hash'] },
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, sponsors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: create sponsor
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const { password, ...data } = req.body;
    data.password_hash = await bcrypt.hash(password || 'Sponsor2026!', 10);
    const sponsor = await models.VisionariumSponsor.create(data);
    res.status(201).json({ success: true, sponsor: { ...sponsor.toJSON(), password_hash: undefined } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update sponsor
router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const sponsor = await models.VisionariumSponsor.findByPk(req.params.id);
    if (!sponsor) return res.status(404).json({ error: 'Sponsor not found' });
    const { password_hash, ...updates } = req.body;
    await sponsor.update(updates);
    res.json({ success: true, sponsor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete sponsor
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const sponsor = await models.VisionariumSponsor.findByPk(req.params.id);
    if (!sponsor) return res.status(404).json({ error: 'Sponsor not found' });
    await sponsor.destroy();
    res.json({ success: true, message: 'Sponsor deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
