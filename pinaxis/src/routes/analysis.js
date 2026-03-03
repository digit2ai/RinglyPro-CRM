'use strict';

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics');

// POST /api/v1/analysis/:projectId/run — Run full analytics pipeline
router.post('/:projectId/run', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    await project.update({
      status: 'analyzing',
      analysis_started_at: new Date()
    });

    // Run all analytics
    const results = await analyticsService.runAll(req.models, project.id);

    await project.update({
      status: 'completed',
      analysis_completed_at: new Date()
    });

    res.json({
      success: true,
      data: {
        project_id: project.id,
        analyses_completed: Object.keys(results),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('PINAXIS analysis run error:', error);
    // Mark project as errored
    try {
      await req.models.PinaxisProject.update(
        { status: 'error' },
        { where: { id: req.params.projectId } }
      );
    } catch (e) { /* ignore */ }

    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/analysis/:projectId/overview — Overview KPIs
router.get('/:projectId/overview', async (req, res) => {
  try {
    const result = await req.models.PinaxisAnalysisResult.findOne({
      where: { project_id: req.params.projectId, analysis_type: 'overview_kpis' }
    });
    if (!result) return res.status(404).json({ success: false, error: 'Analysis not found. Run analysis first.' });
    res.json({ success: true, data: result.result_data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/analysis/:projectId/order-structure
router.get('/:projectId/order-structure', async (req, res) => {
  try {
    const result = await req.models.PinaxisAnalysisResult.findOne({
      where: { project_id: req.params.projectId, analysis_type: 'order_structure' }
    });
    if (!result) return res.status(404).json({ success: false, error: 'Analysis not found. Run analysis first.' });
    res.json({ success: true, data: result.result_data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/analysis/:projectId/order-time-series
router.get('/:projectId/order-time-series', async (req, res) => {
  try {
    const result = await req.models.PinaxisAnalysisResult.findOne({
      where: { project_id: req.params.projectId, analysis_type: 'order_time_series' }
    });
    if (!result) return res.status(404).json({ success: false, error: 'Analysis not found. Run analysis first.' });
    res.json({ success: true, data: result.result_data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/analysis/:projectId/throughput
router.get('/:projectId/throughput', async (req, res) => {
  try {
    const types = ['throughput_monthly', 'throughput_weekday', 'throughput_hourly'];
    const results = await req.models.PinaxisAnalysisResult.findAll({
      where: { project_id: req.params.projectId, analysis_type: types }
    });

    const data = {};
    for (const r of results) {
      data[r.analysis_type] = r.result_data;
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/analysis/:projectId/abc
router.get('/:projectId/abc', async (req, res) => {
  try {
    const result = await req.models.PinaxisAnalysisResult.findOne({
      where: { project_id: req.params.projectId, analysis_type: 'abc_classification' }
    });
    if (!result) return res.status(404).json({ success: false, error: 'Analysis not found. Run analysis first.' });
    res.json({ success: true, data: result.result_data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/analysis/:projectId/fit-analysis
router.get('/:projectId/fit-analysis', async (req, res) => {
  try {
    const result = await req.models.PinaxisAnalysisResult.findOne({
      where: { project_id: req.params.projectId, analysis_type: 'fit_analysis' }
    });
    if (!result) return res.status(404).json({ success: false, error: 'Analysis not found. Run analysis first.' });
    res.json({ success: true, data: result.result_data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/analysis/:projectId/all — Get all results at once
router.get('/:projectId/all', async (req, res) => {
  try {
    const results = await req.models.PinaxisAnalysisResult.findAll({
      where: { project_id: req.params.projectId }
    });

    const data = {};
    for (const r of results) {
      data[r.analysis_type] = r.result_data;
    }

    res.json({ success: true, data, count: results.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
