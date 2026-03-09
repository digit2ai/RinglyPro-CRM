'use strict';

const express = require('express');
const router = express.Router();
const reportGenerator = require('../services/report-generator');

// POST /api/v1/reports/:projectId/generate — Generate PDF report
router.post('/:projectId/generate', async (req, res) => {
  try {
    const project = await req.models.LogisticsProject.findByPk(req.params.projectId, {
      include: [
        { model: req.models.LogisticsAnalysisResult, as: 'results' },
        { model: req.models.LogisticsProductRecommendation, as: 'recommendations' }
      ]
    });

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!project.results || project.results.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No analysis results. Run analysis first.'
      });
    }

    const pdfBuffer = await reportGenerator.generate(project);

    res.json({
      success: true,
      data: {
        project_id: project.id,
        report_ready: true,
        download_url: `/logistics/api/v1/reports/${project.id}/download`
      }
    });
  } catch (error) {
    console.error('LOGISTICS report generate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/reports/:projectId/download — Download PDF report
router.get('/:projectId/download', async (req, res) => {
  try {
    const project = await req.models.LogisticsProject.findByPk(req.params.projectId, {
      include: [
        { model: req.models.LogisticsAnalysisResult, as: 'results' },
        { model: req.models.LogisticsProductRecommendation, as: 'recommendations' }
      ]
    });

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const pdfBuffer = await reportGenerator.generate(project);

    const filename = `LOGISTICS-Analysis-${project.company_name.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error('LOGISTICS report download error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
