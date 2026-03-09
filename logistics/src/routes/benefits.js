'use strict';

const express = require('express');
const router = express.Router();
const benefitProjections = require('../services/benefit-projections');

// POST /api/v1/benefits/:projectId/compute — Compute benefit projections
router.post('/:projectId/compute', async (req, res) => {
  try {
    const project = await req.models.LogisticsProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    // Load analysis results
    const results = await req.models.LogisticsAnalysisResult.findAll({
      where: { project_id: project.id }
    });
    const analysisMap = {};
    for (const r of results) {
      analysisMap[r.analysis_type] = r.result_data;
    }

    // Load product recommendations
    const recommendations = await req.models.LogisticsProductRecommendation.findAll({
      where: { project_id: project.id },
      order: [['fit_score', 'DESC']]
    });

    // Compute benefits
    const benefitData = await benefitProjections.compute(analysisMap, recommendations);

    // Store as analysis result (upsert)
    await req.models.LogisticsAnalysisResult.upsert({
      project_id: project.id,
      analysis_type: 'benefit_projections',
      result_data: benefitData,
      computed_at: new Date()
    });

    res.json({ success: true, data: benefitData });
  } catch (error) {
    console.error('LOGISTICS benefits compute error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/benefits/:projectId — Get stored benefit projections
router.get('/:projectId', async (req, res) => {
  try {
    const result = await req.models.LogisticsAnalysisResult.findOne({
      where: { project_id: req.params.projectId, analysis_type: 'benefit_projections' }
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'Benefits not computed yet. Run POST /benefits/:projectId/compute first.' });
    }

    res.json({ success: true, data: result.result_data });
  } catch (error) {
    console.error('LOGISTICS benefits get error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
