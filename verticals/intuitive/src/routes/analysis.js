'use strict';
const router = require('express').Router();
const systemMatcher = require('../services/system-matcher');

// Run full analysis for a project
router.post('/:projectId/run', async (req, res) => {
  try {
    const results = await systemMatcher.runAll(req.models, parseInt(req.params.projectId));
    res.json({ status: 'completed', results });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all analysis results for a project
router.get('/:projectId/all', async (req, res) => {
  try {
    const { IntuitiveAnalysisResult } = req.models;
    const rows = await IntuitiveAnalysisResult.findAll({
      where: { project_id: parseInt(req.params.projectId) },
      order: [['analysis_type', 'ASC']]
    });
    const results = {};
    rows.forEach(r => { results[r.analysis_type] = r.result_data; });
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get system catalog
router.get('/systems', (req, res) => {
  res.json({ systems: systemMatcher.SYSTEMS });
});

module.exports = router;
