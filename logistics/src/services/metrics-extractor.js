'use strict';

/**
 * Shared metrics extraction from LOGISTICS analysis results.
 * Used by both product-matcher.js and benefit-projections.js.
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
  const overallBinPct = fit.overall_bin_capable_pct || skus.bin_capable_pct || 0;

  // After-hours orderlines (hours 0-7 and 18-23)
  const afterHoursOL = hourlyData
    .filter(h => h.hour < 8 || h.hour >= 18)
    .reduce((s, h) => s + h.orderlines, 0);
  const totalHourlyOL = hourlyData.reduce((s, h) => s + h.orderlines, 0);

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
    avg_weight_kg: 0,
    hourly_peak_ratio: avgHourly > 0 ? peakHourly / avgHourly : 1,
    weekday_concentration: totalWeekdayOL > 0 ? maxWeekdayOL / totalWeekdayOL : 0,
    unique_customers: 0,
    has_pallet_data: 0,
    batch_tracked_pct: 0,
    sku_diversity: skus.total > 0 ? Math.min(1, (skus.active || 0) / skus.total) : 0,
    daily_variability: dailyMean > 0 ? dailyStdDev / dailyMean : 0,
    // Extra metrics for benefit projections
    after_hours_pct: totalHourlyOL > 0 ? (afterHoursOL / totalHourlyOL) * 100 : 0,
    day_count: dayCount,
    total_units: orders.total_units || 0
  };
}

module.exports = { extractMetrics };
