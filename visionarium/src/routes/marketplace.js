const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /api/v1/opportunities -- Browse marketplace (fellows + sponsors)
router.get('/', verifyToken, async (req, res) => {
  try {
    const models = require('../../models');
    const { type, status = 'open' } = req.query;
    const where = { status };
    if (type) where.type = type;

    const opportunities = await models.VisionariumOpportunity.findAll({
      where,
      include: [{ model: models.VisionariumSponsor, as: 'sponsor', attributes: ['company_name', 'logo_url'] }],
      order: [['deadline', 'ASC']]
    });
    res.json({ success: true, opportunities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/opportunities/:id/apply
router.post('/:id/apply', verifyToken, requireRole('fellow'), async (req, res) => {
  try {
    const models = require('../../models');
    const opp = await models.VisionariumOpportunity.findByPk(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
    if (opp.status !== 'open') return res.status(400).json({ error: 'Opportunity is not open' });
    // In a full implementation, track applications in a join table
    res.json({ success: true, message: 'Application submitted', opportunity: opp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: CRUD for opportunities
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const opp = await models.VisionariumOpportunity.create(req.body);
    res.status(201).json({ success: true, opportunity: opp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const opp = await models.VisionariumOpportunity.findByPk(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
    await opp.update(req.body);
    res.json({ success: true, opportunity: opp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const opp = await models.VisionariumOpportunity.findByPk(req.params.id);
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
    await opp.destroy();
    res.json({ success: true, message: 'Opportunity deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
