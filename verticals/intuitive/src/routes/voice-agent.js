'use strict';

const express = require('express');
const router = express.Router();

// ============================================================================
// INTUITIVE SURGICAL Voice Agent Endpoints
// Called by the ElevenLabs ConvAI agent as webhook tools.
// Each endpoint returns structured data the agent can speak about.
// ============================================================================

function formatCurrency(value) {
  if (!value) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

// Helper: build a spoken narrative from analysis data
function buildSpokenBriefing(project, analysisMap, recommendations) {
  const parts = [];

  parts.push(`Here is the complete da Vinci System Assessment for ${project.hospital_name}.`);

  // Hospital profile
  parts.push(`${project.hospital_name} is a ${project.hospital_type || 'hospital'} facility with ${project.bed_count || 'an unspecified number of'} beds, located in ${project.state || ''} ${project.country || 'the United States'}.`);
  if (project.annual_surgical_volume) {
    parts.push(`The annual surgical volume is ${project.annual_surgical_volume.toLocaleString()} procedures.`);
  }
  if (project.current_system && project.current_system !== 'none') {
    parts.push(`Currently operating ${project.current_system_count || 1} ${project.current_system} system${(project.current_system_count || 1) > 1 ? 's' : ''}.`);
  } else {
    parts.push(`The hospital does not currently have a robotic surgical system.`);
  }

  // Surgeon capacity
  const surgCap = analysisMap.surgeon_capacity;
  if (surgCap) {
    if (surgCap.credentialed_surgeons) parts.push(`There are ${surgCap.credentialed_surgeons} credentialed robotic surgeons.`);
    if (surgCap.interested_surgeons) parts.push(`An additional ${surgCap.interested_surgeons} surgeons are interested in robotic training.`);
  }

  // Procedure analysis
  const pareto = analysisMap.procedure_pareto;
  if (pareto) {
    if (pareto.gini_coefficient || pareto.gini) {
      parts.push(`The procedure Gini coefficient is ${pareto.gini_coefficient || pareto.gini}, indicating ${(pareto.gini_coefficient || pareto.gini) >= 0.6 ? 'high concentration in a few key procedures' : 'a moderate distribution across procedure types'}.`);
    }
    const topProcs = pareto.top_procedures || [];
    if (topProcs.length > 0) {
      parts.push(`The top procedure is ${topProcs[0].name || topProcs[0].procedure}, accounting for ${topProcs[0].pct || topProcs[0].percentage}% of volume.`);
    }
  }

  // Model matching
  const modelMatch = analysisMap.model_matching;
  if (modelMatch) {
    const model = modelMatch.primary_recommendation || modelMatch.recommended_model;
    const score = modelMatch.fit_score || modelMatch.overall_fit;
    if (model) {
      parts.push(`Our primary recommendation is the da Vinci ${model} with a fit score of ${Math.round(score || 0)} out of 100.`);
    }
    if (modelMatch.rationale || modelMatch.reasoning) {
      parts.push(modelMatch.rationale || modelMatch.reasoning);
    }
  }

  // ROI
  const roi = analysisMap.roi_calculation;
  if (roi) {
    if (roi.breakeven_months) parts.push(`The breakeven point is ${roi.breakeven_months} months.`);
    if (roi.five_year_roi_pct) parts.push(`The 5-year ROI is projected at ${roi.five_year_roi_pct}%.`);
  }

  // Financial deep dive
  const financial = analysisMap.financial_deep_dive;
  if (financial) {
    const tco = financial.total_cost_of_ownership || financial.tco || {};
    if (tco.five_year) parts.push(`The 5-year total cost of ownership is ${formatCurrency(tco.five_year)}.`);
    if (financial.per_procedure_cost || financial.cost_per_case) {
      parts.push(`Per-procedure incremental cost is ${formatCurrency(financial.per_procedure_cost || financial.cost_per_case)}.`);
    }
  }

  // System recommendations
  if (recommendations && recommendations.length > 0) {
    parts.push(`${recommendations.length} system configuration${recommendations.length > 1 ? 's were' : ' was'} evaluated.`);
    for (const rec of recommendations.slice(0, 3)) {
      parts.push(`da Vinci ${rec.system_model}: fit score ${Math.round(rec.fit_score || 0)} out of 100, ${rec.quantity} unit${rec.quantity > 1 ? 's' : ''} recommended.`);
    }
  }

  // Risk assessment
  const risk = analysisMap.risk_assessment;
  if (risk) {
    const factors = risk.risk_factors || risk.factors || [];
    if (factors.length > 0) {
      parts.push(`Key risk factors include ${factors.slice(0, 3).map(r => r.name || r.factor || r).join(', ')}.`);
    }
  }

  parts.push(`That concludes the da Vinci System Assessment for ${project.hospital_name}. Feel free to ask me about any specific section in more detail.`);

  return parts.join(' ');
}

// GET /api/v1/voice/:projectId/full-briefing
router.get('/:projectId/full-briefing', async (req, res) => {
  try {
    const project = await req.models.IntuitiveProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const results = await req.models.IntuitiveAnalysisResult.findAll({
      where: { project_id: project.id }
    });
    const analysisMap = {};
    for (const r of results) {
      analysisMap[r.analysis_type] = r.result_data;
    }

    const recommendations = await req.models.IntuitiveSystemRecommendation.findAll({
      where: { project_id: project.id },
      order: [['fit_score', 'DESC']]
    });

    const briefing = buildSpokenBriefing(project, analysisMap, recommendations);

    res.json({
      success: true,
      data: {
        project_id: project.id,
        hospital_name: project.hospital_name,
        status: project.status,
        spoken_briefing: briefing,
        analysis_types: Object.keys(analysisMap),
        recommendation_count: recommendations.length
      }
    });
  } catch (error) {
    console.error('INTUITIVE voice briefing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/:projectId/overview
router.get('/:projectId/overview', async (req, res) => {
  try {
    const project = await req.models.IntuitiveProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const recCount = await req.models.IntuitiveSystemRecommendation.count({
      where: { project_id: project.id }
    });

    res.json({
      success: true,
      data: {
        hospital_name: project.hospital_name,
        project_code: project.project_code,
        status: project.status,
        hospital_type: project.hospital_type,
        bed_count: project.bed_count,
        state: project.state,
        country: project.country,
        annual_surgical_volume: project.annual_surgical_volume,
        current_system: project.current_system,
        recommendation_count: recCount,
        analysis_completed_at: project.analysis_completed_at
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/:projectId/system-recommendation
router.get('/:projectId/system-recommendation', async (req, res) => {
  try {
    const project = await req.models.IntuitiveProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const recommendations = await req.models.IntuitiveSystemRecommendation.findAll({
      where: { project_id: project.id },
      order: [['fit_score', 'DESC']]
    });

    const modelMatch = await req.models.IntuitiveAnalysisResult.findOne({
      where: { project_id: project.id, analysis_type: 'model_matching' }
    });

    const spoken = [];
    spoken.push(`System recommendation for ${project.hospital_name}.`);
    if (modelMatch) {
      const data = modelMatch.result_data;
      const model = data.primary_recommendation || data.recommended_model;
      if (model) spoken.push(`Our primary recommendation is the da Vinci ${model} with a fit score of ${Math.round(data.fit_score || data.overall_fit || 0)} out of 100.`);
      if (data.rationale || data.reasoning) spoken.push(data.rationale || data.reasoning);
    }
    for (const rec of recommendations) {
      spoken.push(`da Vinci ${rec.system_model}: ${rec.quantity} unit${rec.quantity > 1 ? 's' : ''}, fit score ${Math.round(rec.fit_score || 0)}, projected ${rec.projected_annual_cases || 0} annual cases.`);
    }

    res.json({
      success: true,
      data: {
        hospital_name: project.hospital_name,
        recommendations: recommendations.map(r => r.toJSON()),
        model_matching: modelMatch ? modelMatch.result_data : null,
        spoken_briefing: spoken.join(' ')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/:projectId/roi
router.get('/:projectId/roi', async (req, res) => {
  try {
    const project = await req.models.IntuitiveProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const [roiResult, financialResult] = await Promise.all([
      req.models.IntuitiveAnalysisResult.findOne({
        where: { project_id: project.id, analysis_type: 'roi_calculation' }
      }),
      req.models.IntuitiveAnalysisResult.findOne({
        where: { project_id: project.id, analysis_type: 'financial_deep_dive' }
      })
    ]);

    const spoken = [];
    spoken.push(`Financial analysis for ${project.hospital_name}.`);
    if (roiResult) {
      const d = roiResult.result_data;
      if (d.breakeven_months) spoken.push(`Breakeven at month ${d.breakeven_months}.`);
      if (d.five_year_roi_pct) spoken.push(`Five-year ROI: ${d.five_year_roi_pct}%.`);
    }
    if (financialResult) {
      const d = financialResult.result_data;
      const tco = d.total_cost_of_ownership || d.tco || {};
      if (tco.five_year) spoken.push(`Five-year TCO: ${formatCurrency(tco.five_year)}.`);
      if (d.per_procedure_cost || d.cost_per_case) spoken.push(`Per-procedure cost: ${formatCurrency(d.per_procedure_cost || d.cost_per_case)}.`);
    }

    res.json({
      success: true,
      data: {
        hospital_name: project.hospital_name,
        roi: roiResult ? roiResult.result_data : null,
        financial: financialResult ? financialResult.result_data : null,
        spoken_briefing: spoken.join(' ')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/:projectId/procedure-analysis
router.get('/:projectId/procedure-analysis', async (req, res) => {
  try {
    const project = await req.models.IntuitiveProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const [paretoResult, compatResult] = await Promise.all([
      req.models.IntuitiveAnalysisResult.findOne({
        where: { project_id: project.id, analysis_type: 'procedure_pareto' }
      }),
      req.models.IntuitiveAnalysisResult.findOne({
        where: { project_id: project.id, analysis_type: 'robot_compatibility_matrix' }
      })
    ]);

    const spoken = [];
    spoken.push(`Procedure analysis for ${project.hospital_name}.`);
    if (paretoResult) {
      const d = paretoResult.result_data;
      if (d.gini_coefficient || d.gini) spoken.push(`Gini coefficient: ${d.gini_coefficient || d.gini}.`);
      const topProcs = d.top_procedures || [];
      for (const p of topProcs.slice(0, 5)) {
        spoken.push(`${p.name || p.procedure}: ${p.cases || p.count} cases, ${p.pct || p.percentage}% of volume, class ${p.abc_class || p.class}.`);
      }
    }
    if (compatResult) {
      const d = compatResult.result_data;
      if (d.best_overall_model) spoken.push(`Best overall model match: ${d.best_overall_model}.`);
    }

    res.json({
      success: true,
      data: {
        hospital_name: project.hospital_name,
        pareto: paretoResult ? paretoResult.result_data : null,
        compatibility: compatResult ? compatResult.result_data : null,
        spoken_briefing: spoken.join(' ')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/:projectId/risk-assessment
router.get('/:projectId/risk-assessment', async (req, res) => {
  try {
    const project = await req.models.IntuitiveProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const [riskResult, compResult] = await Promise.all([
      req.models.IntuitiveAnalysisResult.findOne({
        where: { project_id: project.id, analysis_type: 'risk_assessment' }
      }),
      req.models.IntuitiveAnalysisResult.findOne({
        where: { project_id: project.id, analysis_type: 'competitive_analysis' }
      })
    ]);

    const spoken = [];
    spoken.push(`Risk assessment for ${project.hospital_name}.`);
    if (riskResult) {
      const factors = riskResult.result_data.risk_factors || riskResult.result_data.factors || [];
      for (const f of factors.slice(0, 5)) {
        spoken.push(`${f.name || f.factor || f}: ${f.description || f.detail || f.mitigation || ''}.`);
      }
    }
    if (compResult) {
      const d = compResult.result_data;
      if (d.competitive_pressure) spoken.push(`Competitive pressure: ${d.competitive_pressure}.`);
      if (d.nearby_competitors) spoken.push(`${d.nearby_competitors} nearby competitors with robotic programs.`);
    }

    res.json({
      success: true,
      data: {
        hospital_name: project.hospital_name,
        risk: riskResult ? riskResult.result_data : null,
        competitive: compResult ? compResult.result_data : null,
        spoken_briefing: spoken.join(' ')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/projects/list
router.get('/projects/list', async (req, res) => {
  try {
    const projects = await req.models.IntuitiveProject.findAll({
      where: { status: 'completed' },
      order: [['created_at', 'DESC']],
      attributes: ['id', 'project_code', 'hospital_name', 'hospital_type', 'state', 'country', 'status', 'created_at'],
      limit: 20
    });

    res.json({
      success: true,
      data: {
        projects: projects.map(p => p.toJSON()),
        count: projects.length,
        hint: 'Use a project ID from this list to query other voice endpoints.'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
