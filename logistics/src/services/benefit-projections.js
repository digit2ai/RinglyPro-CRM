'use strict';

/**
 * LOGISTICS Client Benefit Projections Engine
 *
 * Computes 10 data-driven ROI projections using warehouse analytics metrics.
 * Category A: Warehouse Automation (high confidence, directly data-driven)
 * Category B: Platform/AI (benchmark-anchored with data citations)
 */

const { extractMetrics } = require('./metrics-extractor');

// Clamp value between min and max
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * 1. Unplanned Downtime Reduction (30-40%)
 * Higher peak ratios and daily variability = more stress on manual systems
 */
function computeDowntimeReduction(m, topScore) {
  const peakFactor = clamp(m.hourly_peak_ratio / 3, 0, 1);
  const fitFactor = topScore / 100;
  const varFactor = clamp(m.daily_variability / 0.8, 0, 1);
  const pct = 30 + 10 * (peakFactor * 0.4 + fitFactor * 0.4 + varFactor * 0.2);

  return {
    id: 'downtime_reduction',
    category: 'warehouse_automation',
    title: 'Unplanned Downtime Reduction',
    improvement_pct: round1(pct),
    improvement_range: [30, 40],
    confidence: 'high',
    data_drivers: [
      { metric: 'hourly_peak_ratio', value: round1(m.hourly_peak_ratio), explanation: `Peak hour is ${round1(m.hourly_peak_ratio)}x the average — automation smooths these spikes` },
      { metric: 'daily_variability', value: round1(m.daily_variability * 100), explanation: `${round1(m.daily_variability * 100)}% daily volume variation creates stress on manual workflows` },
      { metric: 'top_product_score', value: Math.round(topScore), explanation: `Best-fit RinglyPro Logistics system scores ${Math.round(topScore)}/100 for this profile` }
    ],
    reasoning: `With a peak-to-average ratio of ${round1(m.hourly_peak_ratio)}x and ${round1(m.daily_variability * 100)}% daily variation, automated systems with predictive maintenance and load balancing reduce unplanned downtime by an estimated ${round1(pct)}%.`
  };
}

/**
 * 2. Service Response Time (up to 50% faster)
 * High single-line % and automation = faster goods-to-person
 */
function computeServiceResponseTime(m, topScore) {
  const singleFactor = clamp(m.single_line_pct / 100, 0, 1);
  const autoFactor = topScore / 100;
  const volFactor = clamp(m.orderlines_per_day / 2000, 0, 1);
  const pct = 30 + 20 * (singleFactor * 0.4 + autoFactor * 0.3 + volFactor * 0.3);

  return {
    id: 'response_time',
    category: 'warehouse_automation',
    title: 'Service Response Time Improvement',
    improvement_pct: round1(pct),
    improvement_range: [30, 50],
    confidence: 'high',
    data_drivers: [
      { metric: 'single_line_pct', value: round1(m.single_line_pct), explanation: `${round1(m.single_line_pct)}% single-line orders benefit most from goods-to-person picking` },
      { metric: 'orderlines_per_day', value: Math.round(m.orderlines_per_day), explanation: `${Math.round(m.orderlines_per_day)} daily orderlines justify automated retrieval systems` }
    ],
    reasoning: `${round1(m.single_line_pct)}% of orders are single-line, ideal for goods-to-person automation. Combined with ${Math.round(m.orderlines_per_day)} daily orderlines, response times improve by ~${round1(pct)}%.`
  };
}

/**
 * 3. Cost per Pick Reduction (20-35%)
 * Bin-capable SKUs + concentrated demand (Gini) + volume
 */
function computeCostPerPick(m, topScore) {
  const binFactor = clamp(m.bin_capable_pct / 100, 0, 1);
  const giniFactor = clamp(m.gini / 0.85, 0, 1);
  const fitFactor = topScore / 100;
  const pct = 20 + 15 * (binFactor * 0.4 + giniFactor * 0.3 + fitFactor * 0.3);

  const manualCost = 3.00 * (1 + m.daily_variability * 0.3);
  const projectedCost = manualCost * (1 - pct / 100);

  return {
    id: 'cost_per_pick',
    category: 'warehouse_automation',
    title: 'Cost per Pick Reduction',
    improvement_pct: round1(pct),
    improvement_range: [20, 35],
    confidence: 'high',
    baseline_value: `EUR ${round1(manualCost)}/pick`,
    projected_value: `EUR ${round1(projectedCost)}/pick`,
    data_drivers: [
      { metric: 'bin_capable_pct', value: round1(m.bin_capable_pct), explanation: `${round1(m.bin_capable_pct)}% of SKUs automatable in bin-based systems` },
      { metric: 'gini', value: round1(m.gini), explanation: `Gini ${round1(m.gini)} — concentrated demand means A-items get the most automation benefit` },
      { metric: 'orderlines_per_day', value: Math.round(m.orderlines_per_day), explanation: `${Math.round(m.orderlines_per_day)} daily picks amplify per-pick savings` }
    ],
    reasoning: `With ${round1(m.bin_capable_pct)}% bin-capable SKUs and a Gini coefficient of ${round1(m.gini)}, automating high-frequency picks reduces cost from ~EUR ${round1(manualCost)} to ~EUR ${round1(projectedCost)} per pick (${round1(pct)}% reduction).`
  };
}

/**
 * 4. Manual Coordination Overhead (60-70% eliminated)
 * Multi-line complexity + SKU count + weekday concentration
 */
function computeManualCoordination(m) {
  const complexFactor = (clamp(m.multi_line_pct / 100, 0, 1) * 0.4) +
    (clamp(m.total_skus / 5000, 0, 1) * 0.3) +
    (clamp(m.weekday_concentration, 0, 1) * 0.3);
  const pct = 60 + 10 * complexFactor;

  return {
    id: 'manual_coordination',
    category: 'warehouse_automation',
    title: 'Manual Coordination Overhead Eliminated',
    improvement_pct: round1(pct),
    improvement_range: [60, 70],
    confidence: 'high',
    data_drivers: [
      { metric: 'multi_line_pct', value: round1(m.multi_line_pct), explanation: `${round1(m.multi_line_pct)}% multi-line orders require cross-zone coordination` },
      { metric: 'total_skus', value: m.total_skus, explanation: `${m.total_skus} SKUs create location management complexity` },
      { metric: 'weekday_concentration', value: round1(m.weekday_concentration * 100), explanation: `${round1(m.weekday_concentration * 100)}% peak-day concentration requires dynamic resource planning` }
    ],
    reasoning: `${round1(m.multi_line_pct)}% multi-line orders across ${m.total_skus} SKUs create significant coordination overhead. WMS-driven automation eliminates ~${round1(pct)}% of manual planning and dispatch tasks.`
  };
}

/**
 * 5. SLA Penalty Exposure (near zero)
 * High variability = high SLA risk that proactive alerts eliminate
 */
function computeSLAPenalty(m) {
  const varFactor = clamp(m.daily_variability / 0.8, 0, 1);
  const peakFactor = clamp(m.hourly_peak_ratio / 3, 0, 1);
  const pct = 85 + 15 * (varFactor * 0.6 + peakFactor * 0.4);

  return {
    id: 'sla_penalty',
    category: 'warehouse_automation',
    title: 'SLA Penalty Exposure Reduction',
    improvement_pct: round1(pct),
    improvement_range: [85, 100],
    confidence: 'medium',
    data_drivers: [
      { metric: 'daily_variability', value: round1(m.daily_variability * 100), explanation: `${round1(m.daily_variability * 100)}% volume variation is the primary SLA risk driver` },
      { metric: 'hourly_peak_ratio', value: round1(m.hourly_peak_ratio), explanation: `${round1(m.hourly_peak_ratio)}x peak ratio — capacity alerts prevent bottleneck breaches` }
    ],
    reasoning: `With ${round1(m.daily_variability * 100)}% daily variability and ${round1(m.hourly_peak_ratio)}x peak ratios, proactive capacity alerts and automated load balancing reduce SLA penalty exposure by ~${round1(pct)}%.`
  };
}

/**
 * 6. Spare Parts Waste (25% reduction)
 * More products + more dormant SKUs = more spare parts complexity
 */
function computeSparePartsWaste(m, numProducts) {
  const dormantFactor = clamp(1 - m.active_sku_ratio, 0, 1);
  const skuScale = clamp(m.total_skus / 3000, 0, 1);
  const productFactor = clamp(numProducts / 6, 0, 1);
  const pct = 15 + 10 * (dormantFactor * 0.4 + skuScale * 0.3 + productFactor * 0.3);

  return {
    id: 'spare_parts',
    category: 'warehouse_automation',
    title: 'Spare Parts Waste Reduction',
    improvement_pct: round1(pct),
    improvement_range: [15, 25],
    confidence: 'medium',
    data_drivers: [
      { metric: 'active_sku_ratio', value: round1(m.active_sku_ratio * 100), explanation: `${round1((1 - m.active_sku_ratio) * 100)}% dormant SKUs indicate inventory complexity` },
      { metric: 'total_skus', value: m.total_skus, explanation: `${m.total_skus} SKUs across ${numProducts} product systems require coordinated spare parts planning` }
    ],
    reasoning: `Managing ${m.total_skus} SKUs (${round1((1 - m.active_sku_ratio) * 100)}% dormant) across ${numProducts} RinglyPro Logistics systems — predictive ordering reduces spare parts waste by ~${round1(pct)}%.`
  };
}

/**
 * 7. Sales Cycle Length (30% shorter) — Platform benefit
 */
function computeSalesCycle(m) {
  return {
    id: 'sales_cycle',
    category: 'platform_ai',
    title: 'Sales Cycle Length Reduction',
    improvement_pct: 30,
    improvement_range: [25, 35],
    confidence: 'medium',
    data_drivers: [
      { metric: 'total_orders', value: m.total_orders, explanation: `Analysis of ${m.total_orders.toLocaleString()} orders produces instant data-driven proposals` },
      { metric: 'total_skus', value: m.total_skus, explanation: `${m.total_skus} SKU profiles matched to products in minutes vs weeks of manual analysis` }
    ],
    reasoning: `LOGISTICS automated analysis of ${m.total_orders.toLocaleString()} orders and ${m.total_skus} SKUs replaces weeks of manual data gathering with instant, data-driven RinglyPro Logistics proposals — reducing sales cycles by ~30%.`
  };
}

/**
 * 8. After-Hours Lead Capture (100% vs zero) — Direct data from hourly
 */
function computeAfterHoursCapture(m) {
  return {
    id: 'after_hours',
    category: 'platform_ai',
    title: 'After-Hours Lead Capture',
    improvement_pct: 100,
    improvement_range: [100, 100],
    confidence: 'high',
    baseline_value: '0% captured',
    projected_value: '100% captured',
    data_drivers: [
      { metric: 'after_hours_pct', value: round1(m.after_hours_pct), explanation: `${round1(m.after_hours_pct)}% of order volume occurs outside standard business hours (before 8am / after 6pm)` }
    ],
    reasoning: `${round1(m.after_hours_pct)}% of warehouse activity occurs outside business hours. Voice AI captures 100% of inbound inquiries during these periods — previously lost entirely.`
  };
}

/**
 * 9. Technician Dispatch Accuracy (90%+) — Platform benefit
 */
function computeTechnicianAccuracy(m, numProducts) {
  return {
    id: 'technician_accuracy',
    category: 'platform_ai',
    title: 'Technician Dispatch Accuracy',
    improvement_pct: 92,
    improvement_range: [90, 95],
    confidence: 'medium',
    data_drivers: [
      { metric: 'products_matched', value: numProducts, explanation: `${numProducts} distinct RinglyPro Logistics systems require specialized service knowledge` },
      { metric: 'total_skus', value: m.total_skus, explanation: `${m.total_skus} SKU profiles enable precise fault diagnosis` }
    ],
    reasoning: `With ${numProducts} RinglyPro Logistics product systems handling ${m.total_skus} SKUs, AI-driven diagnostics achieve 92%+ first-time resolution by matching issue patterns to the right technician expertise.`
  };
}

/**
 * 10. Customer Churn Reduction — Platform benefit
 */
function computeChurnReduction(m) {
  const ordersPerDay = m.total_orders / Math.max(1, m.day_count);
  return {
    id: 'churn_reduction',
    category: 'platform_ai',
    title: 'Customer Churn Reduction',
    improvement_pct: 40,
    improvement_range: [30, 50],
    confidence: 'medium',
    data_drivers: [
      { metric: 'orders_per_day', value: round1(ordersPerDay), explanation: `${round1(ordersPerDay)} orders/day require consistent service quality — proactive engagement prevents dissatisfaction` },
      { metric: 'daily_variability', value: round1(m.daily_variability * 100), explanation: `${round1(m.daily_variability * 100)}% demand variation means customers need timely communication` }
    ],
    reasoning: `With ${round1(ordersPerDay)} daily orders and ${round1(m.daily_variability * 100)}% demand variation, proactive AI engagement (status updates, capacity alerts, re-scheduling) reduces customer churn by an estimated 40%.`
  };
}

/**
 * Compute aggregate ROI summary
 */
function computeROISummary(projections, metrics) {
  // Automation readiness: weighted average of key metrics
  const binScore = clamp(metrics.bin_capable_pct / 100, 0, 1) * 30;
  const volScore = clamp(metrics.orderlines_per_day / 2000, 0, 1) * 25;
  const ginScore = clamp(metrics.gini / 0.85, 0, 1) * 20;
  const skuScore = clamp(metrics.total_skus / 3000, 0, 1) * 15;
  const actScore = clamp(metrics.active_sku_ratio, 0, 1) * 10;
  const readinessScore = Math.round(binScore + volScore + ginScore + skuScore + actScore);

  // Estimated annual savings (based on industry benchmark of EUR 3/pick)
  const annualPicks = metrics.orderlines_per_day * 260; // 260 working days
  const avgSavingPct = projections
    .filter(p => p.category === 'warehouse_automation')
    .reduce((s, p) => s + p.improvement_pct, 0) / 6 / 100;
  const annualSavingsLow = Math.round(annualPicks * 2.5 * avgSavingPct * 0.7);
  const annualSavingsHigh = Math.round(annualPicks * 3.5 * avgSavingPct * 1.0);

  const highConfidence = projections.filter(p => p.confidence === 'high').length;

  return {
    automation_readiness_score: readinessScore,
    annual_savings_low: annualSavingsLow,
    annual_savings_high: annualSavingsHigh,
    annual_savings_currency: 'EUR',
    payback_months_low: 12,
    payback_months_high: 24,
    high_confidence_count: highConfidence,
    total_projections: projections.length
  };
}

/**
 * Main computation function
 */
async function compute(analysisMap, recommendations) {
  const metrics = extractMetrics(analysisMap);
  const topScore = (recommendations[0] || {}).fit_score || 50;
  const numProducts = recommendations.filter(r => r.fit_score >= 40).length;

  const projections = [
    computeDowntimeReduction(metrics, topScore),
    computeServiceResponseTime(metrics, topScore),
    computeCostPerPick(metrics, topScore),
    computeManualCoordination(metrics),
    computeSLAPenalty(metrics),
    computeSparePartsWaste(metrics, numProducts),
    computeSalesCycle(metrics),
    computeAfterHoursCapture(metrics),
    computeTechnicianAccuracy(metrics, numProducts),
    computeChurnReduction(metrics)
  ];

  const summary = computeROISummary(projections, metrics);

  return {
    projections,
    summary,
    computed_at: new Date().toISOString()
  };
}

module.exports = { compute };
