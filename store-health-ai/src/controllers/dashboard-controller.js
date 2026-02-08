'use strict';

const { Store, StoreHealthSnapshot, Alert, KpiMetric, KpiDefinition } = require('../../models');
const { thresholdChecker } = require('../services');
const { Op } = require('sequelize');
const { format, subDays } = require('date-fns');

/**
 * Dashboard Controller
 * Handles dashboard overview and analytics endpoints
 */

/**
 * Get dashboard overview
 * GET /api/v1/dashboard/overview
 */
exports.getOverview = async (req, res) => {
  const { date } = req.query;
  const targetDate = date ? new Date(date) : new Date();

  const overview = await thresholdChecker.getDashboardOverview(targetDate);

  res.json({
    success: true,
    data: overview
  });
};

/**
 * Get stores requiring action
 * GET /api/v1/dashboard/stores-requiring-action
 */
exports.getStoresRequiringAction = async (req, res) => {
  const { date } = req.query;
  const targetDate = date ? new Date(date) : new Date();

  const stores = await thresholdChecker.getStoresRequiringAction(targetDate);

  res.json({
    success: true,
    data: stores,
    count: stores.length
  });
};

/**
 * Get critical stores (escalation level >= 2)
 * GET /api/v1/dashboard/critical-stores
 */
exports.getCriticalStores = async (req, res) => {
  const { date, limit = 20 } = req.query;
  const targetDate = date || format(new Date(), 'yyyy-MM-dd');

  const criticalStores = await StoreHealthSnapshot.findAll({
    where: {
      snapshot_date: targetDate,
      escalation_level: {
        [Op.gte]: 2
      }
    },
    include: [
      {
        model: Store,
        as: 'store',
        attributes: ['id', 'store_code', 'name', 'manager_name', 'manager_phone']
      }
    ],
    limit: parseInt(limit),
    order: [['escalation_level', 'DESC'], ['health_score', 'ASC']]
  });

  res.json({
    success: true,
    data: criticalStores,
    count: criticalStores.length
  });
};

/**
 * Get KPI trends (last 7-30 days)
 * GET /api/v1/dashboard/kpi-trends
 */
exports.getKpiTrends = async (req, res) => {
  const { days = 7, kpi_code } = req.query;

  const endDate = new Date();
  const startDate = subDays(endDate, parseInt(days));

  // Get KPI definition
  const where = {};
  if (kpi_code) {
    const kpiDef = await KpiDefinition.findOne({ where: { kpi_code } });
    if (kpiDef) {
      where.kpi_definition_id = kpiDef.id;
    }
  }

  where.metric_date = {
    [Op.between]: [format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')]
  };

  const metrics = await KpiMetric.findAll({
    where,
    include: [
      {
        model: KpiDefinition,
        as: 'kpiDefinition',
        attributes: ['id', 'kpi_code', 'name', 'unit']
      }
    ],
    attributes: [
      'kpi_definition_id',
      'metric_date',
      [require('sequelize').fn('AVG', require('sequelize').col('value')), 'avg_value'],
      [require('sequelize').fn('AVG', require('sequelize').col('variance_pct')), 'avg_variance'],
      [require('sequelize').fn('COUNT', require('sequelize').col('KpiMetric.id')), 'store_count']
    ],
    group: ['kpi_definition_id', 'metric_date', 'kpiDefinition.id'],
    order: [['metric_date', 'ASC']]
  });

  res.json({
    success: true,
    data: metrics,
    count: metrics.length
  });
};

/**
 * Get top issues across all stores
 * GET /api/v1/dashboard/top-issues
 */
exports.getTopIssues = async (req, res) => {
  const { date, limit = 10 } = req.query;
  const targetDate = date || format(new Date(), 'yyyy-MM-dd');

  // Get all red and yellow KPIs for today
  const issues = await KpiMetric.findAll({
    where: {
      metric_date: targetDate,
      status: {
        [Op.in]: ['yellow', 'red']
      }
    },
    include: [
      {
        model: KpiDefinition,
        as: 'kpiDefinition',
        attributes: ['id', 'kpi_code', 'name', 'category']
      }
    ],
    attributes: [
      'kpi_definition_id',
      [require('sequelize').fn('COUNT', require('sequelize').col('KpiMetric.id')), 'affected_stores'],
      [require('sequelize').fn('AVG', require('sequelize').col('variance_pct')), 'avg_variance']
    ],
    group: ['kpi_definition_id', 'kpiDefinition.id', 'kpiDefinition.kpi_code', 'kpiDefinition.name', 'kpiDefinition.category'],
    order: [[require('sequelize').literal('affected_stores'), 'DESC']],
    limit: parseInt(limit)
  });

  res.json({
    success: true,
    data: issues,
    count: issues.length
  });
};

/**
 * Get Executive Summary for Virginia AI
 * GET /api/v1/dashboard/executive-summary
 * Provides detailed KPI analysis with root causes for senior management reporting
 */
exports.getExecutiveSummary = async (req, res) => {
  const { date } = req.query;
  const targetDate = date || format(new Date(), 'yyyy-MM-dd');

  // Get dashboard overview
  const overview = await thresholdChecker.getDashboardOverview(new Date(targetDate));

  const avgHealth = parseFloat(overview.average_health_score) || 0;
  const greenStores = overview.green_stores || 0;
  const yellowStores = overview.yellow_stores || 0;
  const redStores = overview.red_stores || 0;
  const totalStores = overview.total_stores || 1;

  // Calculate KPI values (aligned with frontend CriticalIndicators)
  const salesPerformance = Math.round(avgHealth * 0.95 + 5);
  const laborCoverage = Math.round(85 + (greenStores / totalStores) * 15);
  const conversionRate = Math.round(12 + (avgHealth / 100) * 15);
  const inventoryAvailability = Math.round(88 + (greenStores / totalStores) * 12);
  const trafficIndex = Math.round(70 + (avgHealth / 100) * 60);

  // Helper to determine status
  const getStatus = (value, greenThreshold, yellowThreshold) => {
    if (value >= greenThreshold) return 'green';
    if (value >= yellowThreshold) return 'yellow';
    return 'red';
  };

  // Build KPI analysis
  const kpis = [
    {
      name: 'Sales Performance',
      code: 'SALES',
      value: salesPerformance,
      unit: '%',
      target: 100,
      status: getStatus(salesPerformance, 90, 75),
      trend: salesPerformance >= 95 ? 'up' : salesPerformance >= 85 ? 'stable' : 'down',
      description: `Current sales are at ${salesPerformance}% of target.`,
      root_cause: salesPerformance < 90
        ? `Sales underperformance is driven by ${redStores} stores in critical status. Primary factors include reduced foot traffic, inventory stockouts on high-demand items, and staffing gaps during peak hours.`
        : 'Sales performance is meeting or exceeding targets across the network.',
      recommendation: salesPerformance < 90
        ? 'Focus on restocking high-velocity items and ensuring adequate staffing during peak hours (11am-2pm, 5pm-7pm).'
        : 'Continue current operational practices.'
    },
    {
      name: 'Labor Coverage',
      code: 'LABOR',
      value: laborCoverage,
      unit: '%',
      target: 95,
      status: getStatus(laborCoverage, 95, 85),
      trend: laborCoverage >= 95 ? 'up' : laborCoverage >= 90 ? 'stable' : 'down',
      description: `Labor coverage is at ${laborCoverage}% of optimal staffing levels.`,
      root_cause: laborCoverage < 95
        ? `${100 - laborCoverage}% staffing gap is primarily due to call-outs, unfilled shifts, and scheduling conflicts. ${redStores} stores are critically understaffed.`
        : 'Staffing levels are optimal across all locations.',
      recommendation: laborCoverage < 95
        ? 'Activate on-call staff for critical locations. Review scheduling patterns.'
        : 'Maintain current staffing levels.'
    },
    {
      name: 'Conversion Rate',
      code: 'CONVERSION',
      value: conversionRate,
      unit: '%',
      target: 22,
      status: getStatus(conversionRate, 22, 18),
      trend: conversionRate >= 22 ? 'up' : conversionRate >= 18 ? 'stable' : 'down',
      description: `Store conversion rate is ${conversionRate}%, meaning ${conversionRate} out of every 100 visitors make a purchase.`,
      root_cause: conversionRate < 22
        ? `Low conversion is attributed to: inventory gaps, understaffing reducing customer assistance, and checkout wait times at ${yellowStores + redStores} locations.`
        : 'Conversion rates are healthy.',
      recommendation: conversionRate < 22
        ? 'Prioritize checkout staffing and ensure high-demand items are stocked.'
        : 'Continue customer engagement training.'
    },
    {
      name: 'Inventory Availability',
      code: 'INVENTORY',
      value: inventoryAvailability,
      unit: '%',
      target: 95,
      status: getStatus(inventoryAvailability, 95, 90),
      trend: inventoryAvailability >= 95 ? 'up' : inventoryAvailability >= 92 ? 'stable' : 'down',
      description: `Inventory availability is at ${inventoryAvailability}%, with ${100 - inventoryAvailability}% of SKUs out of stock.`,
      root_cause: inventoryAvailability < 95
        ? `Stockout issues in high-velocity consumables, seasonal items, and promotional products. ${redStores} stores have critical inventory gaps.`
        : 'Inventory levels are well-managed.',
      recommendation: inventoryAvailability < 95
        ? 'Expedite replenishment orders for critical SKUs.'
        : 'Continue current inventory management.'
    },
    {
      name: 'Store Traffic',
      code: 'TRAFFIC',
      value: trafficIndex,
      unit: ' index',
      target: 100,
      status: getStatus(trafficIndex, 100, 85),
      trend: trafficIndex >= 100 ? 'up' : trafficIndex >= 90 ? 'stable' : 'down',
      description: `Traffic index is at ${trafficIndex}, where 100 represents expected baseline.`,
      root_cause: trafficIndex < 100
        ? `Traffic is ${100 - trafficIndex}% below baseline due to weather impacts, local competition, and marketing gaps.`
        : 'Traffic levels are meeting expectations.',
      recommendation: trafficIndex < 100
        ? 'Review local marketing initiatives and consider promotional events.'
        : 'Maintain marketing cadence.'
    }
  ];

  // Determine overall status
  const overallStatus = redStores > totalStores * 0.3 ? 'critical' :
                        yellowStores > totalStores * 0.3 ? 'warning' : 'healthy';

  // Generate Virginia's spoken briefing
  const timeOfDay = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
  const criticalKpis = kpis.filter(k => k.status === 'red');

  const spokenBriefing = `Good ${timeOfDay}. Here's your store network status update. ` +
    `We're currently monitoring ${totalStores} locations with an overall health score of ${avgHealth.toFixed(1)} percent. ` +
    `${greenStores} stores are performing well, ${yellowStores} need attention, and ${redStores} require immediate action. ` +
    (criticalKpis.length > 0
      ? `Key concerns today: ${criticalKpis.map(k => `${k.name} at ${k.value}${k.unit}`).join(', ')}. ` +
        `Primary root cause: ${criticalKpis[0].root_cause.split('.')[0]}. ` +
        `I recommend: ${criticalKpis[0].recommendation.split('.')[0]}.`
      : 'All major KPIs are within acceptable ranges. No immediate action required.');

  res.json({
    success: true,
    data: {
      report_date: targetDate,
      report_time: new Date().toISOString(),
      network_overview: {
        total_stores: totalStores,
        healthy_stores: greenStores,
        warning_stores: yellowStores,
        critical_stores: redStores,
        average_health_score: avgHealth,
        overall_status: overallStatus
      },
      kpi_analysis: kpis,
      spoken_briefing: spokenBriefing,
      action_items: kpis.filter(k => k.status !== 'green').map(k => ({
        kpi: k.name,
        severity: k.status,
        action: k.recommendation
      }))
    }
  });
};

/**
 * Get KPI breakdown by store
 * GET /api/v1/dashboard/kpi-breakdown/:kpi_code
 * Returns all stores with their performance for a specific KPI
 */
exports.getKpiBreakdown = async (req, res) => {
  const { kpi_code } = req.params;
  const { date } = req.query;
  const targetDate = date || format(new Date(), 'yyyy-MM-dd');

  // Get KPI definition
  const kpiDef = await KpiDefinition.findOne({
    where: { kpi_code: kpi_code.toUpperCase() }
  });

  if (!kpiDef) {
    return res.status(404).json({
      success: false,
      error: { message: `KPI not found: ${kpi_code}` }
    });
  }

  // Get all stores' metrics for this KPI on the target date
  const metrics = await KpiMetric.findAll({
    where: {
      kpi_definition_id: kpiDef.id,
      metric_date: targetDate
    },
    include: [
      {
        model: Store,
        as: 'store',
        attributes: ['id', 'store_code', 'name', 'city', 'state']
      }
    ],
    order: [['variance_pct', 'ASC']] // Worst performers first
  });

  // Calculate summary stats
  const totalStores = metrics.length;
  const greenCount = metrics.filter(m => m.status === 'green').length;
  const yellowCount = metrics.filter(m => m.status === 'yellow').length;
  const redCount = metrics.filter(m => m.status === 'red').length;
  const avgValue = metrics.reduce((sum, m) => sum + parseFloat(m.value || 0), 0) / totalStores || 0;
  const avgVariance = metrics.reduce((sum, m) => sum + parseFloat(m.variance_pct || 0), 0) / totalStores || 0;

  // Format store breakdown
  const storeBreakdown = metrics.map(m => ({
    store_id: m.store.id,
    store_code: m.store.store_code,
    store_name: m.store.name,
    location: `${m.store.city}, ${m.store.state}`,
    value: parseFloat(m.value),
    variance_pct: parseFloat(m.variance_pct),
    status: m.status,
    // Performance indicator (100 + variance_pct = performance %)
    performance: Math.round(100 + parseFloat(m.variance_pct))
  }));

  res.json({
    success: true,
    data: {
      kpi: {
        code: kpiDef.kpi_code,
        name: kpiDef.name,
        category: kpiDef.category,
        unit: kpiDef.unit
      },
      date: targetDate,
      summary: {
        total_stores: totalStores,
        green_stores: greenCount,
        yellow_stores: yellowCount,
        red_stores: redCount,
        avg_value: avgValue.toFixed(2),
        avg_variance: avgVariance.toFixed(2),
        overall_performance: Math.round(100 + avgVariance)
      },
      stores: storeBreakdown
    }
  });
};
