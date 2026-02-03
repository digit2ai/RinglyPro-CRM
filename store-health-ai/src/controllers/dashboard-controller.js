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
