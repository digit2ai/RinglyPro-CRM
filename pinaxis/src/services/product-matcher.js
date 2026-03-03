'use strict';

/**
 * GEBHARDT Product Matching Engine
 *
 * Scores each GEBHARDT product 0-100 based on warehouse analysis KPIs.
 * Products: StoreBiter MLS, StoreBiter OLS, InstaPick, ROTA-Sorter, Omnipallet, Versastore
 */

const PRODUCTS = [
  {
    name: 'StoreBiter MLS',
    category: 'Mini-Load System',
    description: 'High-density automated storage and retrieval system for bins and cartons. The StoreBiter MLS shuttle moves within rack aisles to store and retrieve goods at high speed, ideal for warehouses with many small/medium SKUs.',
    criteria: [
      { key: 'bin_capable_pct', weight: 0.30, threshold: 70, ideal: 90, direction: 'higher' },
      { key: 'total_skus', weight: 0.20, threshold: 500, ideal: 5000, direction: 'higher' },
      { key: 'gini', weight: 0.15, threshold: 0.5, ideal: 0.85, direction: 'higher' },
      { key: 'orderlines_per_day', weight: 0.15, threshold: 200, ideal: 2000, direction: 'higher' },
      { key: 'single_line_pct', weight: 0.10, threshold: 20, ideal: 60, direction: 'higher' },
      { key: 'active_sku_ratio', weight: 0.10, threshold: 0.3, ideal: 0.8, direction: 'higher' }
    ]
  },
  {
    name: 'StoreBiter OLS',
    category: 'Oversize Load System',
    description: 'Automated storage system for larger bins and trays up to 50kg. Handles oversize items that exceed mini-load dimensions while maintaining automated storage benefits.',
    criteria: [
      { key: 'bin_capable_pct', weight: 0.20, threshold: 30, ideal: 70, direction: 'higher' },
      { key: 'oversize_pct', weight: 0.25, threshold: 15, ideal: 50, direction: 'higher' },
      { key: 'total_skus', weight: 0.15, threshold: 200, ideal: 3000, direction: 'higher' },
      { key: 'avg_weight_kg', weight: 0.20, threshold: 5, ideal: 30, direction: 'higher' },
      { key: 'orderlines_per_day', weight: 0.20, threshold: 100, ideal: 1000, direction: 'higher' }
    ]
  },
  {
    name: 'InstaPick',
    category: 'Goods-to-Person',
    description: 'Ultra-fast goods-to-person picking station. Bins are delivered to ergonomic workstations where operators pick items. Ideal for high single-line order volumes with fast pick rates.',
    criteria: [
      { key: 'single_line_pct', weight: 0.30, threshold: 30, ideal: 70, direction: 'higher' },
      { key: 'bin_capable_pct', weight: 0.20, threshold: 50, ideal: 85, direction: 'higher' },
      { key: 'orderlines_per_day', weight: 0.25, threshold: 500, ideal: 5000, direction: 'higher' },
      { key: 'total_skus', weight: 0.15, threshold: 300, ideal: 3000, direction: 'higher' },
      { key: 'hourly_peak_ratio', weight: 0.10, threshold: 1.5, ideal: 3.0, direction: 'higher' }
    ]
  },
  {
    name: 'ROTA-Sorter',
    category: 'Sorting System',
    description: 'High-performance cross-belt sorter for order consolidation and outbound sorting. Routes items to destination chutes at high throughput, ideal for multi-destination distribution.',
    criteria: [
      { key: 'orders_per_month', weight: 0.25, threshold: 20000, ideal: 100000, direction: 'higher' },
      { key: 'multi_line_pct', weight: 0.20, threshold: 30, ideal: 70, direction: 'higher' },
      { key: 'weekday_concentration', weight: 0.15, threshold: 0.6, ideal: 0.9, direction: 'higher' },
      { key: 'unique_customers', weight: 0.15, threshold: 100, ideal: 5000, direction: 'higher' },
      { key: 'bin_capable_pct', weight: 0.15, threshold: 40, ideal: 80, direction: 'higher' },
      { key: 'orderlines_per_day', weight: 0.10, threshold: 1000, ideal: 10000, direction: 'higher' }
    ]
  },
  {
    name: 'Omnipallet',
    category: 'Pallet Handling',
    description: 'Automated pallet storage and retrieval system. Designed for heavy, large items that require pallet-level handling. Ideal when a significant portion of SKUs exceed bin dimensions.',
    criteria: [
      { key: 'non_bin_capable_pct', weight: 0.35, threshold: 20, ideal: 60, direction: 'higher' },
      { key: 'avg_weight_kg', weight: 0.25, threshold: 10, ideal: 50, direction: 'higher' },
      { key: 'total_skus', weight: 0.15, threshold: 100, ideal: 2000, direction: 'higher' },
      { key: 'units_per_day', weight: 0.15, threshold: 200, ideal: 5000, direction: 'higher' },
      { key: 'has_pallet_data', weight: 0.10, threshold: 0.5, ideal: 1, direction: 'higher' }
    ]
  },
  {
    name: 'Versastore',
    category: 'Flexible Automation',
    description: 'Versatile storage system bridging production and distribution. Supports batch-size-one workflows and production integration with dynamic buffering capabilities.',
    criteria: [
      { key: 'sku_diversity', weight: 0.20, threshold: 0.3, ideal: 0.8, direction: 'higher' },
      { key: 'batch_tracked_pct', weight: 0.20, threshold: 10, ideal: 50, direction: 'higher' },
      { key: 'daily_variability', weight: 0.20, threshold: 0.3, ideal: 0.8, direction: 'higher' },
      { key: 'bin_capable_pct', weight: 0.15, threshold: 40, ideal: 80, direction: 'higher' },
      { key: 'orderlines_per_day', weight: 0.15, threshold: 100, ideal: 2000, direction: 'higher' },
      { key: 'multi_line_pct', weight: 0.10, threshold: 20, ideal: 60, direction: 'higher' }
    ]
  }
];

/**
 * Extract scoring metrics from analysis results
 */
function extractMetrics(analysisMap) {
  const overview = analysisMap.overview_kpis || {};
  const orderStructure = analysisMap.order_structure || {};
  const timeSeries = analysisMap.order_time_series || {};
  const throughputMonthly = analysisMap.throughput_monthly || {};
  const throughputWeekday = analysisMap.throughput_weekday || {};
  const throughputHourly = analysisMap.throughput_hourly || {};
  const abc = analysisMap.abc_classification || {};
  const fit = analysisMap.fit_analysis || {};

  const skus = overview.skus || {};
  const orders = overview.orders || {};
  const dateRange = overview.date_range || {};

  // Compute derived metrics
  const dayCount = dateRange.from && dateRange.to
    ? Math.max(1, (new Date(dateRange.to) - new Date(dateRange.from)) / (1000 * 60 * 60 * 24))
    : 1;
  const monthCount = dayCount / 30;

  // Hourly peak ratio
  const hourlyData = throughputHourly.hours || [];
  const avgHourly = hourlyData.reduce((s, h) => s + h.orderlines, 0) / Math.max(1, hourlyData.filter(h => h.orderlines > 0).length);
  const peakHourly = Math.max(...hourlyData.map(h => h.orderlines), 0);

  // Weekday concentration (max weekday share)
  const weekdayData = throughputWeekday.weekdays || [];
  const totalWeekdayOL = weekdayData.reduce((s, d) => s + d.orderlines, 0);
  const maxWeekdayOL = Math.max(...weekdayData.map(d => d.orderlines), 0);

  // Daily variability (coefficient of variation of daily orderlines)
  const dailySeries = (timeSeries.series || []).map(d => d.orderlines);
  const dailyMean = dailySeries.length > 0 ? dailySeries.reduce((s, v) => s + v, 0) / dailySeries.length : 0;
  const dailyStdDev = dailySeries.length > 1
    ? Math.sqrt(dailySeries.reduce((s, v) => s + Math.pow(v - dailyMean, 2), 0) / dailySeries.length)
    : 0;

  // Count items with pallet data
  const fitBins = fit.bins || [];
  const overallBinPct = fit.overall_bin_capable_pct || skus.bin_capable_pct || 0;

  return {
    total_skus: skus.total || 0,
    active_sku_ratio: skus.total > 0 ? (skus.active || 0) / skus.total : 0,
    bin_capable_pct: overallBinPct,
    non_bin_capable_pct: 100 - overallBinPct,
    oversize_pct: 100 - overallBinPct,
    total_orders: orders.total_orders || 0,
    total_orderlines: orders.total_orderlines || 0,
    orderlines_per_day: dayCount > 0 ? (orders.total_orderlines || 0) / dayCount : 0,
    units_per_day: dayCount > 0 ? (orders.total_units || 0) / dayCount : 0,
    orders_per_month: monthCount > 0 ? (orders.total_orders || 0) / monthCount : 0,
    single_line_pct: orderStructure.single_line_pct || 0,
    multi_line_pct: orderStructure.multi_line_pct || 0,
    gini: abc.gini || 0,
    avg_weight_kg: 0, // Will be computed from item master if available
    hourly_peak_ratio: avgHourly > 0 ? peakHourly / avgHourly : 1,
    weekday_concentration: totalWeekdayOL > 0 ? maxWeekdayOL / totalWeekdayOL : 0,
    unique_customers: 0, // Could be enriched
    has_pallet_data: 0,
    batch_tracked_pct: 0,
    sku_diversity: skus.total > 0 ? Math.min(1, (skus.active || 0) / skus.total) : 0,
    daily_variability: dailyMean > 0 ? dailyStdDev / dailyMean : 0
  };
}

/**
 * Score a single criterion
 */
function scoreCriterion(value, criterion) {
  const { threshold, ideal, direction } = criterion;

  if (direction === 'higher') {
    if (value >= ideal) return 100;
    if (value <= 0) return 0;
    if (value <= threshold) return Math.round((value / threshold) * 50);
    return Math.round(50 + ((value - threshold) / (ideal - threshold)) * 50);
  } else {
    // Lower is better (not used currently but available)
    if (value <= ideal) return 100;
    if (value >= threshold) return 0;
    return Math.round(((threshold - value) / (threshold - ideal)) * 100);
  }
}

/**
 * Match analysis results against GEBHARDT product portfolio
 */
async function match(analysisMap) {
  const metrics = extractMetrics(analysisMap);

  const recommendations = PRODUCTS.map(product => {
    let totalScore = 0;
    let totalWeight = 0;
    const reasoning = {};

    for (const criterion of product.criteria) {
      const value = metrics[criterion.key] || 0;
      const score = scoreCriterion(value, criterion);

      reasoning[criterion.key] = {
        value: Math.round(value * 100) / 100,
        score,
        weight: criterion.weight,
        threshold: criterion.threshold,
        ideal: criterion.ideal
      };

      totalScore += score * criterion.weight;
      totalWeight += criterion.weight;
    }

    const fitScore = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) / 100 : 0;

    return {
      product_name: product.name,
      product_category: product.category,
      description: product.description,
      fit_score: fitScore,
      reasoning,
      highlighted: fitScore >= 70
    };
  });

  // Sort by score descending
  recommendations.sort((a, b) => b.fit_score - a.fit_score);

  // Mark top recommendation
  if (recommendations.length > 0) {
    recommendations[0].highlighted = true;
  }

  return recommendations;
}

module.exports = { match };
