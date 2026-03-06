'use strict';

const express = require('express');
const router = express.Router();

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) {}

// GET / - List funnels
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const where = { school_id: schoolId };
    if (req.query.status) where.status = req.query.status;
    if (req.query.type) where.type = req.query.type;

    const funnels = await kanchoModels.KanchoFunnel.findAll({
      where,
      include: [{ model: kanchoModels.KanchoLandingPage, as: 'pages', attributes: ['id', 'name', 'slug', 'is_published'] }],
      order: [['created_at', 'DESC']]
    });
    res.json({ success: true, data: funnels });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - Get funnel details
router.get('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const funnel = await kanchoModels.KanchoFunnel.findByPk(req.params.id, {
      include: [{ model: kanchoModels.KanchoLandingPage, as: 'pages' }]
    });
    if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });
    res.json({ success: true, data: funnel });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create funnel
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    if (!req.body.name) return res.status(400).json({ success: false, error: 'name required' });

    // Generate slug from name
    const slug = (req.body.slug || req.body.name)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Check slug uniqueness
    const existing = await kanchoModels.KanchoFunnel.findOne({ where: { school_id: schoolId, slug } });
    if (existing) return res.status(409).json({ success: false, error: 'Slug already exists. Choose a different name.' });

    const funnel = await kanchoModels.KanchoFunnel.create({
      school_id: schoolId,
      name: req.body.name,
      slug,
      type: req.body.type || 'lead_capture',
      steps: req.body.steps || [],
      settings: req.body.settings || {},
      campaign_id: req.body.campaign_id || null,
      automation_id: req.body.automation_id || null
    });

    // Auto-create a landing page for the funnel
    const page = await kanchoModels.KanchoLandingPage.create({
      school_id: schoolId,
      funnel_id: funnel.id,
      name: req.body.name + ' - Landing Page',
      slug: slug,
      template: req.body.template || 'trial_class',
      headline: req.body.headline || 'Start Your Martial Arts Journey Today',
      subheadline: req.body.subheadline || 'Book a free trial class and discover the transformative power of martial arts.',
      cta_text: req.body.cta_text || 'Book Your Free Trial'
    });

    res.status(201).json({ success: true, data: { funnel, page } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update funnel
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const funnel = await kanchoModels.KanchoFunnel.findByPk(req.params.id);
    if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

    const allowed = ['name', 'type', 'status', 'steps', 'settings', 'campaign_id', 'automation_id'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await funnel.update(updates);
    res.json({ success: true, data: funnel });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete funnel and its pages
router.delete('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const funnel = await kanchoModels.KanchoFunnel.findByPk(req.params.id);
    if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });
    await kanchoModels.KanchoLandingPage.destroy({ where: { funnel_id: funnel.id } });
    await funnel.destroy();
    res.json({ success: true, message: 'Funnel deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
