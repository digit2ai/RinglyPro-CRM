'use strict';

const express = require('express');
const router = express.Router();
const productMatcher = require('../services/product-matcher');

// POST /api/v1/products/:projectId/match — Run product matching
router.post('/:projectId/match', async (req, res) => {
  try {
    const project = await req.models.LogisticsProject.findByPk(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Get all analysis results for this project
    const analysisResults = await req.models.LogisticsAnalysisResult.findAll({
      where: { project_id: project.id }
    });

    if (analysisResults.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No analysis results found. Run analysis first.'
      });
    }

    // Build analysis map
    const analysisMap = {};
    for (const r of analysisResults) {
      analysisMap[r.analysis_type] = r.result_data;
    }

    // Run product matching
    const recommendations = await productMatcher.match(analysisMap);

    // Delete old recommendations and store new ones
    await req.models.LogisticsProductRecommendation.destroy({
      where: { project_id: project.id }
    });

    const records = recommendations.map(rec => ({
      ...rec,
      project_id: project.id,
      computed_at: new Date()
    }));

    await req.models.LogisticsProductRecommendation.bulkCreate(records);

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('LOGISTICS product match error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/products/:projectId/recommendations — Get product recommendations
router.get('/:projectId/recommendations', async (req, res) => {
  try {
    const recommendations = await req.models.LogisticsProductRecommendation.findAll({
      where: { project_id: req.params.projectId },
      order: [['fit_score', 'DESC']]
    });

    res.json({ success: true, data: recommendations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
