'use strict';

/**
 * Simulation Agent — what-if scenario runner
 * Derives capacity, queue, and bottleneck scenarios from existing analysis data.
 *
 * Routes:
 *   POST /api/v1/simulation/:projectId/run  — Run/re-run all scenarios
 *   GET  /api/v1/simulation/:projectId      — Get stored simulation package
 */

const express = require('express');
const router = express.Router();

// ── Scenario engine ───────────────────────────────────────────────────────────

function runScenarios(analysisData, recommendations) {
  const overview = analysisData.overview_kpis || {};
  const orderStructure = analysisData.order_structure || {};
  const throughputMonthly = analysisData.throughput_monthly || {};
  const abc = analysisData.abc_classification || {};
  const arch = analysisData.system_architecture || {};

  const orders = overview.orders || {};
  const dateRange = overview.date_range || {};
  const skus = overview.skus || {};

  const dayCount = dateRange.from && dateRange.to
    ? Math.max(1, (new Date(dateRange.to) - new Date(dateRange.from)) / (1000 * 60 * 60 * 24))
    : 90;

  const avgOrderlinesPerDay = dayCount > 0 ? (orders.total_orderlines || 0) / dayCount : 0;
  const avgOrdersPerDay = dayCount > 0 ? (orders.total_orders || 0) / dayCount : 0;

  // Peak day from monthly data
  const months = throughputMonthly.months || [];
  const maxMonthOrderlines = months.length > 0 ? Math.max(...months.map(m => m.orderlines || 0)) : 0;
  const avgMonthOrderlines = months.length > 0
    ? months.reduce((s, m) => s + (m.orderlines || 0), 0) / months.length : 0;
  const peakRatio = avgMonthOrderlines > 0 ? maxMonthOrderlines / avgMonthOrderlines : 1.4;

  const gini = abc.gini || 0;
  const activeSkus = skus.active || skus.total || 0;
  const deadStockPct = abc.classes?.D?.pct || 0;
  const topRec = recommendations?.[0];
  const complexityScore = arch.complexity_score || 50;

  // ── Scenario builder ────────────────────────────────────────────────────────
  function buildScenario(label, id, multiplier, description, type) {
    const orderlinesPerDay = Math.round(avgOrderlinesPerDay * multiplier);
    const ordersPerDay = Math.round(avgOrdersPerDay * multiplier);

    // Buffer / storage sizing: assume 4h inbound buffer + 2h outbound
    const inboundBufferSlots = Math.round(orderlinesPerDay * 0.15);
    const outboundBufferSlots = Math.round(orderlinesPerDay * 0.25);

    // Zone requirements (rough: 1 zone per 800 orderlines/day, min 1)
    const pickingZones = Math.max(1, Math.ceil(orderlinesPerDay / 800));

    // Bottleneck assessment
    const bottlenecks = [];
    if (orderlinesPerDay > 3000) bottlenecks.push({ zone: 'Sorting / consolidation', risk: 'High', reason: 'Volume exceeds manual sort capacity' });
    if (orderlinesPerDay > 1500 && (skus.bin_capable_pct || 0) < 60) bottlenecks.push({ zone: 'Storage retrieval', risk: 'Medium', reason: 'Low bin-capable rate limits AS/RS throughput' });
    if (orderlinesPerDay > 2000 && gini < 0.4) bottlenecks.push({ zone: 'Pick face slotting', risk: 'Medium', reason: 'Flat SKU distribution requires wider pick face' });
    if (deadStockPct > 10) bottlenecks.push({ zone: 'Storage utilization', risk: 'Low', reason: `${deadStockPct.toFixed(0)}% dead stock occupies active locations` });
    if (bottlenecks.length === 0) bottlenecks.push({ zone: 'None identified', risk: 'Low', reason: 'Throughput within modeled capacity bounds' });

    // Confidence level
    const confidence = type === 'baseline' ? 'High'
      : type === 'growth' ? 'Medium'
      : 'Indicative';

    return {
      id,
      label,
      type,
      description,
      multiplier,
      metrics: {
        orderlines_per_day: orderlinesPerDay,
        orders_per_day: ordersPerDay,
        inbound_buffer_slots: inboundBufferSlots,
        outbound_buffer_slots: outboundBufferSlots,
        picking_zones: pickingZones,
        storage_locations_needed: Math.round(activeSkus * 1.2) // 20% slotting buffer
      },
      bottlenecks,
      confidence,
      recommended_product: topRec?.product_name || null
    };
  }

  const baseline = buildScenario(
    'Baseline',
    'baseline',
    1.0,
    'Current observed throughput — derived directly from uploaded goods-out data.',
    'baseline'
  );

  const growth = buildScenario(
    '+30% Volume Growth',
    'growth_30',
    1.3,
    'Moderate growth scenario — 30% throughput increase over baseline. Represents typical 12-18 month expansion.',
    'growth'
  );

  const peak = buildScenario(
    `Peak Day Stress (×${peakRatio.toFixed(1)})`,
    'peak',
    peakRatio,
    `Simulates your highest historical throughput month applied as a daily stress test. Peak-to-average ratio: ${peakRatio.toFixed(2)}.`,
    'peak'
  );

  // ── Sensitivity summary ──────────────────────────────────────────────────────
  const sensitivity = {
    orderlines_range: {
      low: Math.round(avgOrderlinesPerDay * 0.8),
      mid: Math.round(avgOrderlinesPerDay),
      high: Math.round(avgOrderlinesPerDay * peakRatio)
    },
    storage_range: {
      low: Math.round(activeSkus * 1.1),
      mid: Math.round(activeSkus * 1.2),
      high: Math.round(activeSkus * 1.5)
    },
    automation_justification: complexityScore >= 65
      ? 'High complexity score — full automation stack justified at all three scenarios'
      : complexityScore >= 35
      ? 'Moderate complexity — automation ROI becomes compelling at growth scenario'
      : 'Lower complexity — targeted automation recommended for peak handling'
  };

  // ── Handoff package ──────────────────────────────────────────────────────────
  const package_summary = {
    status: 'complete',
    scenarios_run: 3,
    highest_risk_scenario: 'peak',
    bottleneck_count: Math.max(
      baseline.bottlenecks.filter(b => b.risk !== 'None identified').length,
      peak.bottlenecks.filter(b => b.risk !== 'None identified').length
    ),
    simulation_verdict: peak.bottlenecks.some(b => b.risk === 'High')
      ? 'Automation required to handle peak demand without bottlenecks'
      : 'Current automation concept handles modeled scenarios within capacity',
    ready_for_commercial: true,
    computed_at: new Date().toISOString()
  };

  return { scenarios: [baseline, growth, peak], sensitivity, package_summary };
}

// ── POST /api/v1/simulation/:projectId/run ────────────────────────────────────

router.post('/:projectId/run', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sequelize, LogisticsAnalysisResult, LogisticsProductRecommendation } = req.models;

    // Load existing analysis
    const results = await LogisticsAnalysisResult.findAll({ where: { project_id: projectId } });
    if (!results.length) {
      return res.status(400).json({ success: false, error: 'Run analysis first before simulation.' });
    }

    const analysisMap = {};
    for (const r of results) analysisMap[r.analysis_type] = r.result_data;

    // Load recommendations
    const recs = await LogisticsProductRecommendation.findAll({
      where: { project_id: projectId },
      order: [['fit_score', 'DESC']],
      limit: 3
    });
    const recData = recs.map(r => r.dataValues || r);

    const simulationResult = runScenarios(analysisMap, recData);

    // Store as analysis result type
    await LogisticsAnalysisResult.upsert({
      project_id: projectId,
      analysis_type: 'simulation',
      result_data: simulationResult,
      computed_at: new Date()
    });

    res.json({ success: true, data: simulationResult });
  } catch (error) {
    console.error('Simulation run error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/v1/simulation/:projectId ────────────────────────────────────────

router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await req.models.LogisticsAnalysisResult.findOne({
      where: { project_id: projectId, analysis_type: 'simulation' }
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'Simulation not run yet.' });
    }

    res.json({ success: true, data: result.result_data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
