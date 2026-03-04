'use strict';

const express = require('express');
const router = express.Router();

// ============================================================================
// PINAXIS Voice Agent Endpoints
// These are called by the ElevenLabs ConvAI agent as webhook tools.
// Each endpoint returns structured data the agent can speak about.
// ============================================================================

// Helper: build a spoken narrative from analysis data
function buildSpokenBriefing(project, analysisMap, recommendations, benefits) {
  const parts = [];

  parts.push(`Here is the full warehouse analysis report for ${project.company_name}.`);

  // Overview KPIs — structure: { skus: { total, active, bin_capable, bin_capable_pct }, orders: { total_orders, total_orderlines, total_units, avg_lines_per_order }, inventory: { total_stock, total_locations }, date_range: { from, to } }
  const overview = analysisMap.overview_kpis;
  if (overview) {
    const skuTotal = overview.skus?.total || overview.total_skus;
    if (skuTotal) parts.push(`The warehouse contains ${skuTotal.toLocaleString()} unique SKUs.`);
    const totalOrders = overview.orders?.total_orders || overview.total_orders;
    const totalLines = overview.orders?.total_orderlines || overview.total_order_lines;
    if (totalOrders) parts.push(`There were ${totalOrders.toLocaleString()} total orders with ${totalLines?.toLocaleString() || 'N/A'} order lines.`);
    const avgLines = overview.orders?.avg_lines_per_order || overview.avg_lines_per_order;
    if (avgLines) parts.push(`The average order has ${avgLines} lines.`);
    const dateFrom = overview.date_range?.from || overview.date_range?.start;
    const dateTo = overview.date_range?.to || overview.date_range?.end;
    if (dateFrom && dateTo) parts.push(`The data spans from ${dateFrom} to ${dateTo}.`);
    const binPct = overview.skus?.bin_capable_pct;
    if (binPct != null) parts.push(`${binPct}% of SKUs are bin-capable for automated storage.`);
  }

  // Order structure
  const orderStructure = analysisMap.order_structure;
  if (orderStructure) {
    if (orderStructure.single_line_pct != null) {
      parts.push(`${orderStructure.single_line_pct}% of orders are single-line orders, meaning they contain just one product.`);
    }
    if (orderStructure.multi_line_pct != null) {
      parts.push(`The remaining ${orderStructure.multi_line_pct}% are multi-line orders.`);
    }
  }

  // ABC Classification
  const abc = analysisMap.abc_classification;
  if (abc) {
    if (abc.by_frequency) {
      const aItems = abc.by_frequency.A;
      if (aItems) {
        parts.push(`In the ABC classification by order frequency, ${aItems.sku_count || 'a subset of'} SKUs are classified as A-items, accounting for ${aItems.order_pct || 80}% of all orders.`);
      }
    }
    if (abc.by_volume) {
      const aVol = abc.by_volume.A;
      if (aVol) {
        parts.push(`By volume, A-items represent ${aVol.volume_pct || 80}% of total units shipped.`);
      }
    }
  }

  // Throughput patterns
  const monthly = analysisMap.throughput_monthly;
  if (monthly && Array.isArray(monthly)) {
    const peak = monthly.reduce((max, m) => (m.orders || 0) > (max.orders || 0) ? m : max, monthly[0]);
    const low = monthly.reduce((min, m) => (m.orders || Infinity) < (min.orders || Infinity) ? m : min, monthly[0]);
    if (peak.month && low.month) {
      parts.push(`The busiest month was ${peak.month} with ${peak.orders} orders, while the slowest was ${low.month} with ${low.orders} orders.`);
    }
  }

  const weekday = analysisMap.throughput_weekday;
  if (weekday && Array.isArray(weekday)) {
    const busiest = weekday.reduce((max, d) => (d.orders || 0) > (max.orders || 0) ? d : max, weekday[0]);
    if (busiest.day) {
      parts.push(`${busiest.day} is the busiest day of the week with ${busiest.orders} orders on average.`);
    }
  }

  // Fit analysis
  const fit = analysisMap.fit_analysis;
  if (fit) {
    if (fit.bin_capable_pct != null) {
      parts.push(`${fit.bin_capable_pct}% of SKUs are bin-capable, meaning they fit within the standard 600 by 400 millimeter bin footprint for automated storage.`);
    }
    if (fit.automation_readiness_score != null) {
      parts.push(`The overall automation readiness score is ${fit.automation_readiness_score} out of 100.`);
    }
  }

  // Product recommendations
  if (recommendations && recommendations.length > 0) {
    parts.push(`Based on the analysis, ${recommendations.length} GEBHARDT products are recommended.`);
    const top3 = recommendations.slice(0, 3);
    for (const rec of top3) {
      parts.push(`${rec.product_name} with a fit score of ${rec.fit_score} out of 100. ${rec.rationale || ''}`);
    }
  }

  // Benefits / ROI
  if (benefits) {
    if (benefits.total_annual_savings) {
      parts.push(`The projected total annual savings from automation is ${formatCurrency(benefits.total_annual_savings)}.`);
    }
    if (benefits.payback_period_years) {
      parts.push(`The estimated payback period is ${benefits.payback_period_years} years.`);
    }
    if (benefits.five_year_roi_pct) {
      parts.push(`The 5-year return on investment is projected at ${benefits.five_year_roi_pct}%.`);
    }
    if (benefits.categories && Array.isArray(benefits.categories)) {
      for (const cat of benefits.categories.slice(0, 3)) {
        if (cat.annual_savings) {
          parts.push(`${cat.name}: estimated annual savings of ${formatCurrency(cat.annual_savings)}.`);
        }
      }
    }
  }

  parts.push(`That concludes the warehouse analysis report for ${project.company_name}. Feel free to ask me about any specific section in more detail.`);

  return parts.join(' ');
}

function formatCurrency(value) {
  if (!value) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

// GET /api/v1/voice/:projectId/full-briefing — Complete spoken report
router.get('/:projectId/full-briefing', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    // Load all analysis results
    const results = await req.models.PinaxisAnalysisResult.findAll({
      where: { project_id: project.id }
    });
    const analysisMap = {};
    for (const r of results) {
      analysisMap[r.analysis_type] = r.result_data;
    }

    // Load recommendations
    const recommendations = await req.models.PinaxisProductRecommendation.findAll({
      where: { project_id: project.id },
      order: [['fit_score', 'DESC']]
    });

    // Benefits
    const benefitResult = analysisMap.benefit_projections || null;

    const briefing = buildSpokenBriefing(project, analysisMap, recommendations, benefitResult);

    res.json({
      success: true,
      data: {
        project_id: project.id,
        company_name: project.company_name,
        status: project.status,
        spoken_briefing: briefing,
        analysis_types: Object.keys(analysisMap),
        recommendation_count: recommendations.length
      }
    });
  } catch (error) {
    console.error('PINAXIS voice briefing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/:projectId/overview — Quick overview for the agent
router.get('/:projectId/overview', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const result = await req.models.PinaxisAnalysisResult.findOne({
      where: { project_id: project.id, analysis_type: 'overview_kpis' }
    });

    const recCount = await req.models.PinaxisProductRecommendation.count({
      where: { project_id: project.id }
    });

    res.json({
      success: true,
      data: {
        company_name: project.company_name,
        project_code: project.project_code,
        status: project.status,
        industry: project.industry,
        country: project.country,
        kpis: result ? result.result_data : null,
        recommendation_count: recCount,
        analysis_completed_at: project.analysis_completed_at
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/:projectId/order-analysis — Order structure spoken summary
router.get('/:projectId/order-analysis', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const [orderResult, throughputResults] = await Promise.all([
      req.models.PinaxisAnalysisResult.findOne({
        where: { project_id: project.id, analysis_type: 'order_structure' }
      }),
      req.models.PinaxisAnalysisResult.findAll({
        where: { project_id: project.id, analysis_type: ['throughput_monthly', 'throughput_weekday'] }
      })
    ]);

    const throughput = {};
    for (const r of throughputResults) {
      throughput[r.analysis_type] = r.result_data;
    }

    res.json({
      success: true,
      data: {
        company_name: project.company_name,
        order_structure: orderResult ? orderResult.result_data : null,
        throughput_monthly: throughput.throughput_monthly || null,
        throughput_weekday: throughput.throughput_weekday || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/:projectId/product-recommendations — Products spoken summary
router.get('/:projectId/product-recommendations', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const recommendations = await req.models.PinaxisProductRecommendation.findAll({
      where: { project_id: project.id },
      order: [['fit_score', 'DESC']],
      attributes: ['product_name', 'product_category', 'fit_score', 'rationale', 'key_benefits']
    });

    const fitResult = await req.models.PinaxisAnalysisResult.findOne({
      where: { project_id: project.id, analysis_type: 'fit_analysis' }
    });

    res.json({
      success: true,
      data: {
        company_name: project.company_name,
        fit_analysis: fitResult ? fitResult.result_data : null,
        recommendations: recommendations.map(r => r.toJSON()),
        count: recommendations.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/:projectId/roi — ROI and benefits spoken summary
router.get('/:projectId/roi', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const result = await req.models.PinaxisAnalysisResult.findOne({
      where: { project_id: project.id, analysis_type: 'benefit_projections' }
    });

    res.json({
      success: true,
      data: {
        company_name: project.company_name,
        benefits: result ? result.result_data : null,
        computed: !!result
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/:projectId/abc — ABC classification spoken summary
router.get('/:projectId/abc', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const result = await req.models.PinaxisAnalysisResult.findOne({
      where: { project_id: project.id, analysis_type: 'abc_classification' }
    });

    res.json({
      success: true,
      data: {
        company_name: project.company_name,
        abc: result ? result.result_data : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/voice/projects/list — List all projects (for agent to discover)
router.get('/projects/list', async (req, res) => {
  try {
    const projects = await req.models.PinaxisProject.findAll({
      where: { status: 'completed' },
      order: [['created_at', 'DESC']],
      attributes: ['id', 'project_code', 'company_name', 'industry', 'country', 'status', 'created_at'],
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
