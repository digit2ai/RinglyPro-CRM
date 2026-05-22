'use strict';

const router = require('express').Router();
const execBrief = require('../services/executive-brief-service');

/**
 * GET /api/v1/executive-brief/:projectId
 * Returns the complete MyIntuitive+ format executive brief payload.
 *
 * Sections: cover, diagnostic, kpi_header, scoreboard, clinical_overlay,
 * surgeon_commitments (3-bucket), recommendation (two-phase + OR-level),
 * peer_case_study (MUSC-style)
 */
router.get('/:projectId', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });

    const brief = await execBrief.buildExecutiveBrief({
      projectId,
      models: req.models,
    });

    res.json({ success: true, data: brief });
  } catch (err) {
    console.error('executive-brief error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/executive-brief/:projectId/diagnostic
 * Just the two-column diagnostic frame (for embedding elsewhere).
 */
router.get('/:projectId/diagnostic', async (req, res) => {
  try {
    const { IntuitiveProject, IntuitiveAnalysisResult } = req.models;
    const projectId = parseInt(req.params.projectId);
    const project = await IntuitiveProject.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const analysisRows = await IntuitiveAnalysisResult.findAll({ where: { project_id: projectId } });
    const analysis = {};
    for (const r of analysisRows) {
      const data = typeof r.result_data === 'string' ? JSON.parse(r.result_data) : r.result_data;
      analysis[r.analysis_type] = data;
    }

    res.json({ success: true, data: execBrief.buildDiagnostic(project, analysis) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/executive-brief/:projectId/peers
 * Just the peer hospital comparison (used standalone for MUSC-style slide).
 */
router.get('/:projectId/peers', async (req, res) => {
  try {
    const peerService = require('../services/peer-comparison-service');
    const { IntuitiveProject } = req.models;
    const projectId = parseInt(req.params.projectId);
    const project = await IntuitiveProject.findByPk(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const peers = await peerService.findPeerHospitals(project, req.models);
    res.json({
      success: true,
      data: {
        peers,
        target_state_bed_day_cost: peerService.bedDayCost(project.state),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
