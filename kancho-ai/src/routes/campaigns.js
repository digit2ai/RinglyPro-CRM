'use strict';

const express = require('express');
const router = express.Router();

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// GET / - List campaigns
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const where = { school_id: schoolId };
    if (req.query.status) where.status = req.query.status;
    if (req.query.goal) where.goal = req.query.goal;

    const campaigns = await kanchoModels.KanchoCampaign.findAll({ where, order: [['created_at', 'DESC']] });
    res.json({ success: true, data: campaigns });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - Get campaign details
router.get('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const campaign = await kanchoModels.KanchoCampaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create campaign
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const campaign = await kanchoModels.KanchoCampaign.create({
      school_id: schoolId,
      name: req.body.name,
      type: req.body.type || 'sms',
      goal: req.body.goal || 'engagement',
      audience: req.body.audience || {},
      content: req.body.content || {},
      schedule: req.body.schedule || null,
      budget: req.body.budget || 0
    });
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update campaign
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const campaign = await kanchoModels.KanchoCampaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const allowed = ['name', 'type', 'goal', 'status', 'audience', 'content', 'schedule', 'budget'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await campaign.update(updates);
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete campaign
router.delete('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const campaign = await kanchoModels.KanchoCampaign.findByPk(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    await campaign.destroy();
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
