const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /api/v1/cohorts -- List cohorts
router.get('/', async (req, res) => {
  try {
    const models = require('../../models');
    const cohorts = await models.VisionariumCohort.findAll({ order: [['year', 'DESC'], ['id', 'DESC']] });
    res.json({ success: true, cohorts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/cohorts/:id
router.get('/:id', async (req, res) => {
  try {
    const models = require('../../models');
    const cohort = await models.VisionariumCohort.findByPk(req.params.id);
    if (!cohort) return res.status(404).json({ error: 'Cohort not found' });
    res.json({ success: true, cohort });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/cohorts -- Admin: create cohort
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const cohort = await models.VisionariumCohort.create(req.body);
    res.status(201).json({ success: true, cohort });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/cohorts/:id -- Admin: update cohort
router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const cohort = await models.VisionariumCohort.findByPk(req.params.id);
    if (!cohort) return res.status(404).json({ error: 'Cohort not found' });
    await cohort.update(req.body);
    res.json({ success: true, cohort });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/cohorts/:id -- Admin: delete cohort
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const cohort = await models.VisionariumCohort.findByPk(req.params.id);
    if (!cohort) return res.status(404).json({ error: 'Cohort not found' });
    await cohort.destroy();
    res.json({ success: true, message: 'Cohort deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
