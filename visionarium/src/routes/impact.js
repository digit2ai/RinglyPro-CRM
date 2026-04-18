const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /api/v1/impact/public/:cohort_id -- Public impact report
router.get('/public/:cohort_id', async (req, res) => {
  try {
    const models = require('../../models');
    const cohort = await models.VisionariumCohort.findByPk(req.params.cohort_id);
    if (!cohort) return res.status(404).json({ error: 'Cohort not found' });

    const metrics = await models.VisionariumImpactMetric.findAll({
      where: { cohort_id: req.params.cohort_id },
      order: [['category', 'ASC'], ['measured_at', 'DESC']]
    });

    const fellowCount = await models.VisionariumFellow.count({ where: { cohort_id: req.params.cohort_id } });
    const completedCount = await models.VisionariumFellow.count({ where: { cohort_id: req.params.cohort_id, status: 'completed' } });

    res.json({
      success: true,
      report: {
        cohort: { name: cohort.name, year: cohort.year, city: cohort.city },
        fellows_total: fellowCount,
        fellows_completed: completedCount,
        metrics,
        targets: {
          completion_rate: 85,
          internship_placement: 60,
          capstones_shipped: 100,
          bilingual_proficiency: 90,
          ai_fluency: 80,
          nps_score: 70
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: record metric
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const metric = await models.VisionariumImpactMetric.create(req.body);
    res.status(201).json({ success: true, metric });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: get all metrics for a cohort
router.get('/:cohort_id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const metrics = await models.VisionariumImpactMetric.findAll({
      where: { cohort_id: req.params.cohort_id },
      order: [['category', 'ASC'], ['measured_at', 'DESC']]
    });
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update metric
router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const metric = await models.VisionariumImpactMetric.findByPk(req.params.id);
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    await metric.update(req.body);
    res.json({ success: true, metric });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
