'use strict';

const { Op, fn, col, literal } = require('sequelize');

/**
 * Run all 8 analytics for a project and store results
 */
async function runAll(models, projectId) {
  const results = {};

  // 1. Overview KPIs
  results.overview_kpis = await computeOverviewKPIs(models, projectId);
  await storeResult(models, projectId, 'overview_kpis', results.overview_kpis);

  // 2. Order Structure
  results.order_structure = await computeOrderStructure(models, projectId);
  await storeResult(models, projectId, 'order_structure', results.order_structure);

  // 3. Order Time Series
  results.order_time_series = await computeOrderTimeSeries(models, projectId);
  await storeResult(models, projectId, 'order_time_series', results.order_time_series);

  // 4. Throughput by Month
  results.throughput_monthly = await computeThroughputMonthly(models, projectId);
  await storeResult(models, projectId, 'throughput_monthly', results.throughput_monthly);

  // 5. Throughput by Weekday
  results.throughput_weekday = await computeThroughputWeekday(models, projectId);
  await storeResult(models, projectId, 'throughput_weekday', results.throughput_weekday);

  // 6. Throughput by Hour
  results.throughput_hourly = await computeThroughputHourly(models, projectId);
  await storeResult(models, projectId, 'throughput_hourly', results.throughput_hourly);

  // 7. ABC Classification
  results.abc_classification = await computeABCClassification(models, projectId);
  await storeResult(models, projectId, 'abc_classification', results.abc_classification);

  // 8. Fit Analysis
  results.fit_analysis = await computeFitAnalysis(models, projectId);
  await storeResult(models, projectId, 'fit_analysis', results.fit_analysis);

  // 9. System Architecture Readiness
  results.system_architecture = computeSystemArchitecture(results);
  await storeResult(models, projectId, 'system_architecture', results.system_architecture);

  return results;
}

async function storeResult(models, projectId, analysisType, data) {
  await models.PinaxisAnalysisResult.upsert({
    project_id: projectId,
    analysis_type: analysisType,
    result_data: data,
    computed_at: new Date()
  });
}

// ============================================================================
// 1. OVERVIEW KPIs
// ============================================================================

async function computeOverviewKPIs(models, projectId) {
  const seq = models.sequelize;

  // SKU counts from item master
  const totalSKUs = await models.PinaxisItemMaster.count({ where: { project_id: projectId } });
  const binCapableSKUs = await models.PinaxisItemMaster.count({
    where: { project_id: projectId, bin_capable: true }
  });

  // Active SKUs (those with goods-out activity)
  const [activeSKUResult] = await seq.query(`
    SELECT COUNT(DISTINCT sku) as count
    FROM pinaxis_goods_out_data
    WHERE project_id = :projectId
  `, { replacements: { projectId } });
  const activeSKUs = parseInt(activeSKUResult[0]?.count || 0);

  // Order counts
  const [orderStats] = await seq.query(`
    SELECT
      COUNT(DISTINCT order_id) as total_orders,
      COUNT(*) as total_orderlines,
      COALESCE(SUM(quantity), 0) as total_units
    FROM pinaxis_goods_out_data
    WHERE project_id = :projectId
  `, { replacements: { projectId } });

  // Date range
  const [dateRange] = await seq.query(`
    SELECT MIN(ship_date) as min_date, MAX(ship_date) as max_date
    FROM pinaxis_goods_out_data
    WHERE project_id = :projectId
  `, { replacements: { projectId } });

  // Inventory value
  const [invStats] = await seq.query(`
    SELECT COUNT(*) as locations, COALESCE(SUM(stock), 0) as total_stock
    FROM pinaxis_inventory_data
    WHERE project_id = :projectId
  `, { replacements: { projectId } });

  const stats = orderStats[0] || {};
  const dates = dateRange[0] || {};
  const inv = invStats[0] || {};

  return {
    skus: {
      total: totalSKUs,
      active: activeSKUs,
      bin_capable: binCapableSKUs,
      bin_capable_pct: totalSKUs > 0 ? Math.round((binCapableSKUs / totalSKUs) * 100 * 10) / 10 : 0
    },
    orders: {
      total_orders: parseInt(stats.total_orders || 0),
      total_orderlines: parseInt(stats.total_orderlines || 0),
      total_units: parseFloat(stats.total_units || 0),
      avg_lines_per_order: parseInt(stats.total_orders) > 0
        ? Math.round((parseInt(stats.total_orderlines) / parseInt(stats.total_orders)) * 100) / 100
        : 0
    },
    date_range: {
      from: dates.min_date,
      to: dates.max_date
    },
    inventory: {
      total_locations: parseInt(inv.locations || 0),
      total_stock: parseFloat(inv.total_stock || 0)
    }
  };
}

// ============================================================================
// 2. ORDER STRUCTURE — orderlines-per-order histogram
// ============================================================================

async function computeOrderStructure(models, projectId) {
  const seq = models.sequelize;

  const [lineCountDist] = await seq.query(`
    WITH order_lines AS (
      SELECT order_id, COUNT(*) as line_count
      FROM pinaxis_goods_out_data
      WHERE project_id = :projectId
      GROUP BY order_id
    )
    SELECT line_count, COUNT(*) as order_count
    FROM order_lines
    GROUP BY line_count
    ORDER BY line_count
  `, { replacements: { projectId } });

  const totalOrders = lineCountDist.reduce((s, r) => s + parseInt(r.order_count), 0);

  // Build histogram bins: 1, 2, 3, 4, 5, 6-10, 11-20, 21-50, 50+
  const bins = [
    { label: '1', min: 1, max: 1 },
    { label: '2', min: 2, max: 2 },
    { label: '3', min: 3, max: 3 },
    { label: '4', min: 4, max: 4 },
    { label: '5', min: 5, max: 5 },
    { label: '6-10', min: 6, max: 10 },
    { label: '11-20', min: 11, max: 20 },
    { label: '21-50', min: 21, max: 50 },
    { label: '50+', min: 51, max: Infinity }
  ];

  const histogram = bins.map(bin => {
    const count = lineCountDist
      .filter(r => parseInt(r.line_count) >= bin.min && parseInt(r.line_count) <= bin.max)
      .reduce((s, r) => s + parseInt(r.order_count), 0);
    return {
      label: bin.label,
      count,
      pct: totalOrders > 0 ? Math.round((count / totalOrders) * 100 * 10) / 10 : 0
    };
  });

  // Cumulative percentages
  let cumPct = 0;
  for (const bin of histogram) {
    cumPct += bin.pct;
    bin.cumulative_pct = Math.round(cumPct * 10) / 10;
  }

  // Single-line vs multi-line
  const singleLineOrders = histogram[0]?.count || 0;
  const singleLinePct = totalOrders > 0 ? Math.round((singleLineOrders / totalOrders) * 100 * 10) / 10 : 0;

  return {
    total_orders: totalOrders,
    histogram,
    single_line_orders: singleLineOrders,
    single_line_pct: singleLinePct,
    multi_line_orders: totalOrders - singleLineOrders,
    multi_line_pct: Math.round((100 - singleLinePct) * 10) / 10
  };
}

// ============================================================================
// 3. ORDER TIME SERIES — orderlines/orders by day
// ============================================================================

async function computeOrderTimeSeries(models, projectId) {
  const seq = models.sequelize;

  const [dailyData] = await seq.query(`
    SELECT
      ship_date as date,
      COUNT(DISTINCT order_id) as orders,
      COUNT(*) as orderlines,
      COALESCE(SUM(quantity), 0) as units
    FROM pinaxis_goods_out_data
    WHERE project_id = :projectId AND ship_date IS NOT NULL
    GROUP BY ship_date
    ORDER BY ship_date
  `, { replacements: { projectId } });

  // Compute 7-day moving average for orderlines
  const series = dailyData.map((d, i) => {
    const windowStart = Math.max(0, i - 6);
    const window = dailyData.slice(windowStart, i + 1);
    const ma7 = window.reduce((s, r) => s + parseInt(r.orderlines), 0) / window.length;

    return {
      date: d.date,
      orders: parseInt(d.orders),
      orderlines: parseInt(d.orderlines),
      units: parseFloat(d.units),
      ma7_orderlines: Math.round(ma7 * 10) / 10
    };
  });

  // Compute quartile bands
  const orderlineCounts = dailyData.map(d => parseInt(d.orderlines)).sort((a, b) => a - b);
  const q1 = percentile(orderlineCounts, 25);
  const median = percentile(orderlineCounts, 50);
  const q3 = percentile(orderlineCounts, 75);

  return {
    series,
    statistics: {
      q1,
      median,
      q3,
      min: orderlineCounts[0] || 0,
      max: orderlineCounts[orderlineCounts.length - 1] || 0,
      days: orderlineCounts.length
    }
  };
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const index = (p / 100) * (arr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return arr[lower];
  return arr[lower] + (arr[upper] - arr[lower]) * (index - lower);
}

// ============================================================================
// 4. THROUGHPUT BY MONTH
// ============================================================================

async function computeThroughputMonthly(models, projectId) {
  const seq = models.sequelize;

  const [monthlyData] = await seq.query(`
    SELECT
      TO_CHAR(ship_date, 'YYYY-MM') as month,
      COUNT(DISTINCT order_id) as orders,
      COUNT(*) as orderlines,
      COALESCE(SUM(quantity), 0) as units
    FROM pinaxis_goods_out_data
    WHERE project_id = :projectId AND ship_date IS NOT NULL
    GROUP BY TO_CHAR(ship_date, 'YYYY-MM')
    ORDER BY month
  `, { replacements: { projectId } });

  return {
    months: monthlyData.map(d => ({
      month: d.month,
      orders: parseInt(d.orders),
      orderlines: parseInt(d.orderlines),
      units: parseFloat(d.units)
    }))
  };
}

// ============================================================================
// 5. THROUGHPUT BY WEEKDAY
// ============================================================================

async function computeThroughputWeekday(models, projectId) {
  const seq = models.sequelize;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const [weekdayData] = await seq.query(`
    SELECT
      EXTRACT(DOW FROM ship_date) as dow,
      COUNT(DISTINCT order_id) as orders,
      COUNT(*) as orderlines,
      COALESCE(SUM(quantity), 0) as units
    FROM pinaxis_goods_out_data
    WHERE project_id = :projectId AND ship_date IS NOT NULL
    GROUP BY EXTRACT(DOW FROM ship_date)
    ORDER BY dow
  `, { replacements: { projectId } });

  return {
    weekdays: weekdayData.map(d => ({
      day: dayNames[parseInt(d.dow)],
      dow: parseInt(d.dow),
      orders: parseInt(d.orders),
      orderlines: parseInt(d.orderlines),
      units: parseFloat(d.units)
    }))
  };
}

// ============================================================================
// 6. THROUGHPUT BY HOUR
// ============================================================================

async function computeThroughputHourly(models, projectId) {
  const seq = models.sequelize;

  // Use ship_time if available, otherwise picking_time
  const [hourlyData] = await seq.query(`
    SELECT
      EXTRACT(HOUR FROM COALESCE(ship_time::time, picking_time::time, '08:00:00'::time)) as hour,
      COUNT(*) as orderlines,
      COALESCE(SUM(quantity), 0) as units
    FROM pinaxis_goods_out_data
    WHERE project_id = :projectId
    GROUP BY EXTRACT(HOUR FROM COALESCE(ship_time::time, picking_time::time, '08:00:00'::time))
    ORDER BY hour
  `, { replacements: { projectId } });

  // Fill all 24 hours
  const hourMap = {};
  for (const d of hourlyData) {
    hourMap[parseInt(d.hour)] = {
      orderlines: parseInt(d.orderlines),
      units: parseFloat(d.units)
    };
  }

  const hours = [];
  for (let h = 0; h < 24; h++) {
    hours.push({
      hour: h,
      label: `${h.toString().padStart(2, '0')}:00`,
      orderlines: hourMap[h]?.orderlines || 0,
      units: hourMap[h]?.units || 0
    });
  }

  return { hours };
}

// ============================================================================
// 7. ABC CLASSIFICATION — Lorenz curve + Gini coefficient
// ============================================================================

async function computeABCClassification(models, projectId) {
  const seq = models.sequelize;

  // Get total picks per SKU
  const [skuPicks] = await seq.query(`
    SELECT sku, COALESCE(SUM(quantity), COUNT(*)) as total_picks
    FROM pinaxis_goods_out_data
    WHERE project_id = :projectId
    GROUP BY sku
    ORDER BY total_picks DESC
  `, { replacements: { projectId } });

  if (skuPicks.length === 0) {
    return { skus: [], gini: 0, lorenz_curve: [], classes: { A: { count: 0, pct: 0, volume_pct: 0 }, B: { count: 0, pct: 0, volume_pct: 0 }, C: { count: 0, pct: 0, volume_pct: 0 } } };
  }

  const totalPicks = skuPicks.reduce((s, r) => s + parseFloat(r.total_picks), 0);
  const n = skuPicks.length;

  // ABC classification (descending order — A items first)
  let cumVolumeDesc = 0;
  const skuData = [];

  for (let i = 0; i < n; i++) {
    cumVolumeDesc += parseFloat(skuPicks[i].total_picks);

    let abcClass;
    if ((cumVolumeDesc / totalPicks) <= 0.80) {
      abcClass = 'A';
    } else if ((cumVolumeDesc / totalPicks) <= 0.95) {
      abcClass = 'B';
    } else {
      abcClass = 'C';
    }

    skuData.push({
      sku: skuPicks[i].sku,
      picks: parseFloat(skuPicks[i].total_picks),
      pct: Math.round((parseFloat(skuPicks[i].total_picks) / totalPicks) * 100 * 100) / 100,
      cumulative_pct: Math.round((cumVolumeDesc / totalPicks) * 100 * 10) / 10,
      class: abcClass
    });
  }

  // Build Lorenz curve (ascending sort — small contributors first)
  const skuPicksAsc = [...skuPicks].reverse(); // reverse the DESC sort
  let cumVolumeAsc = 0;
  const lorenzCurve = [{ x: 0, y: 0 }];
  for (let i = 0; i < n; i++) {
    cumVolumeAsc += parseFloat(skuPicksAsc[i].total_picks);
    lorenzCurve.push({
      x: Math.round(((i + 1) / n) * 100 * 10) / 10,
      y: Math.round((cumVolumeAsc / totalPicks) * 100 * 10) / 10
    });
  }

  // Compute Gini coefficient using trapezoidal rule
  let areaUnderLorenz = 0;
  for (let i = 1; i < lorenzCurve.length; i++) {
    const dx = (lorenzCurve[i].x - lorenzCurve[i - 1].x) / 100;
    const avgY = (lorenzCurve[i].y + lorenzCurve[i - 1].y) / 2 / 100;
    areaUnderLorenz += dx * avgY;
  }
  const gini = Math.round((1 - 2 * areaUnderLorenz) * 1000) / 1000;

  // Class summary
  const classA = skuData.filter(s => s.class === 'A');
  const classB = skuData.filter(s => s.class === 'B');
  const classC = skuData.filter(s => s.class === 'C');

  return {
    total_skus: n,
    total_picks: totalPicks,
    gini,
    lorenz_curve: lorenzCurve,
    classes: {
      A: {
        count: classA.length,
        pct: Math.round((classA.length / n) * 100 * 10) / 10,
        volume_pct: 80
      },
      B: {
        count: classB.length,
        pct: Math.round((classB.length / n) * 100 * 10) / 10,
        volume_pct: 15
      },
      C: {
        count: classC.length,
        pct: Math.round((classC.length / n) * 100 * 10) / 10,
        volume_pct: 5
      }
    },
    top_skus: skuData.slice(0, 20)
  };
}

// ============================================================================
// 8. FIT ANALYSIS — SKU fitting into standard GEBHARDT bins
// ============================================================================

async function computeFitAnalysis(models, projectId) {
  const seq = models.sequelize;

  // GEBHARDT standard bin sizes (internal dimensions in mm)
  const binSizes = [
    { name: '600x400x250', length: 600, width: 400, height: 250 },
    { name: '600x400x350', length: 600, width: 400, height: 350 },
    { name: '600x400x450', length: 600, width: 400, height: 450 }
  ];

  const items = await models.PinaxisItemMaster.findAll({
    where: { project_id: projectId },
    attributes: ['sku', 'description', 'length_mm', 'width_mm', 'height_mm', 'weight_kg']
  });

  const totalItems = items.length;
  const results = { total_items: totalItems, bins: [], items_with_dimensions: 0, items_without_dimensions: 0 };

  const itemsWithDims = items.filter(i => i.length_mm && i.width_mm && i.height_mm);
  const itemsWithoutDims = items.filter(i => !i.length_mm || !i.width_mm || !i.height_mm);

  results.items_with_dimensions = itemsWithDims.length;
  results.items_without_dimensions = itemsWithoutDims.length;

  for (const bin of binSizes) {
    const fitting = itemsWithDims.filter(item => {
      // Try all orientations (6 permutations of L/W/H)
      const dims = [item.length_mm, item.width_mm, item.height_mm].sort((a, b) => a - b);
      const binDims = [bin.length, bin.width, bin.height].sort((a, b) => a - b);
      return dims[0] <= binDims[0] && dims[1] <= binDims[1] && dims[2] <= binDims[2];
    });

    results.bins.push({
      name: bin.name,
      dimensions: { length: bin.length, width: bin.width, height: bin.height },
      fit_count: fitting.length,
      fit_pct: itemsWithDims.length > 0
        ? Math.round((fitting.length / itemsWithDims.length) * 100 * 10) / 10
        : 0,
      fit_pct_total: totalItems > 0
        ? Math.round((fitting.length / totalItems) * 100 * 10) / 10
        : 0
    });
  }

  // Overall bin-capable rate (largest bin)
  const largestBinFit = results.bins[results.bins.length - 1];
  results.overall_bin_capable_pct = largestBinFit?.fit_pct || 0;

  return results;
}

// ============================================================================
// 9. SYSTEM ARCHITECTURE READINESS
// Determines which DC software stack tier the warehouse needs
// ============================================================================

function computeSystemArchitecture(analysisResults) {
  const overview = analysisResults.overview_kpis || {};
  const orderStructure = analysisResults.order_structure || {};
  const abc = analysisResults.abc_classification || {};
  const fit = analysisResults.fit_analysis || {};
  const throughputMonthly = analysisResults.throughput_monthly || {};

  const skus = overview.skus || {};
  const orders = overview.orders || {};
  const dateRange = overview.date_range || {};

  const dayCount = dateRange.from && dateRange.to
    ? Math.max(1, (new Date(dateRange.to) - new Date(dateRange.from)) / (1000 * 60 * 60 * 24))
    : 1;

  const orderlinesPerDay = dayCount > 0 ? (orders.total_orderlines || 0) / dayCount : 0;
  const totalSKUs = skus.total || 0;
  const binCapablePct = fit.overall_bin_capable_pct || skus.bin_capable_pct || 0;
  const multiLinePct = orderStructure.multi_line_pct || 0;
  const gini = abc.gini || 0;

  // Complexity score (0-100) determines which tier
  let complexityScore = 0;

  // Factor 1: Throughput volume (max 25 pts)
  if (orderlinesPerDay >= 5000) complexityScore += 25;
  else if (orderlinesPerDay >= 1000) complexityScore += 15 + ((orderlinesPerDay - 1000) / 4000) * 10;
  else if (orderlinesPerDay >= 200) complexityScore += 5 + ((orderlinesPerDay - 200) / 800) * 10;
  else complexityScore += (orderlinesPerDay / 200) * 5;

  // Factor 2: SKU count / diversity (max 20 pts)
  if (totalSKUs >= 10000) complexityScore += 20;
  else if (totalSKUs >= 2000) complexityScore += 10 + ((totalSKUs - 2000) / 8000) * 10;
  else if (totalSKUs >= 500) complexityScore += 5 + ((totalSKUs - 500) / 1500) * 5;
  else complexityScore += (totalSKUs / 500) * 5;

  // Factor 3: Order complexity (max 20 pts)
  if (multiLinePct >= 60) complexityScore += 20;
  else if (multiLinePct >= 30) complexityScore += 10 + ((multiLinePct - 30) / 30) * 10;
  else complexityScore += (multiLinePct / 30) * 10;

  // Factor 4: Automation readiness (max 20 pts)
  if (binCapablePct >= 80) complexityScore += 20;
  else if (binCapablePct >= 50) complexityScore += 10 + ((binCapablePct - 50) / 30) * 10;
  else complexityScore += (binCapablePct / 50) * 10;

  // Factor 5: SKU concentration / Gini (max 15 pts)
  if (gini >= 0.7) complexityScore += 15;
  else if (gini >= 0.4) complexityScore += 5 + ((gini - 0.4) / 0.3) * 10;
  else complexityScore += (gini / 0.4) * 5;

  complexityScore = Math.round(complexityScore * 10) / 10;

  // Determine recommended tier
  let recommended_tier, tier_label, tier_description;
  const software_recommendations = [];

  if (complexityScore >= 65) {
    recommended_tier = 3;
    tier_label = 'Full Stack (WMS + WES + WCS)';
    tier_description = 'Your operation has high throughput, complex order profiles, and strong automation readiness. A full three-layer software stack with WMS, WES, and WCS is recommended for optimal orchestration.';
    software_recommendations.push(
      { layer: 'WMS', recommendation: 'SAP EWM or Manhattan Active WM', reason: 'Enterprise-grade inventory and order management for high-complexity operations' },
      { layer: 'WES', recommendation: 'Korber WES or Pyramid Director', reason: 'Real-time task orchestration across multiple automated and manual zones' },
      { layer: 'WCS', recommendation: 'GEBHARDT Galileo WCS', reason: 'Native integration with GEBHARDT shuttle and conveyor systems for direct equipment control' }
    );
  } else if (complexityScore >= 35) {
    recommended_tier = 2;
    tier_label = 'WES + WCS Integration';
    tier_description = 'Your operation has moderate complexity with growing automation potential. A WES layer coordinating with WCS provides the right balance of orchestration and equipment control.';
    software_recommendations.push(
      { layer: 'WES/WCS', recommendation: 'Dematic iQ or Honeywell Momentum', reason: 'Combined WES+WCS platform for integrated execution and equipment control' },
      { layer: 'WCS', recommendation: 'GEBHARDT Galileo WCS', reason: 'Direct shuttle and conveyor control with built-in diagnostics' }
    );
  } else {
    recommended_tier = 1;
    tier_label = 'Standalone WCS';
    tier_description = 'Your operation has straightforward automation needs. A standalone WCS controlling the automated equipment, interfacing directly with your existing WMS, is sufficient.';
    software_recommendations.push(
      { layer: 'WCS', recommendation: 'GEBHARDT Galileo WCS', reason: 'Efficient standalone equipment control with WMS interface capability' }
    );
  }

  return {
    complexity_score: complexityScore,
    recommended_tier,
    tier_label,
    tier_description,
    software_recommendations,
    scoring_breakdown: {
      throughput_volume: { value: Math.round(orderlinesPerDay), label: 'Orderlines / Day', max_points: 25 },
      sku_diversity: { value: totalSKUs, label: 'Total SKUs', max_points: 20 },
      order_complexity: { value: Math.round(multiLinePct * 10) / 10, label: 'Multi-Line %', max_points: 20 },
      automation_readiness: { value: Math.round(binCapablePct * 10) / 10, label: 'Bin-Capable %', max_points: 20 },
      sku_concentration: { value: Math.round(gini * 1000) / 1000, label: 'Gini Coefficient', max_points: 15 }
    }
  };
}

module.exports = { runAll };
