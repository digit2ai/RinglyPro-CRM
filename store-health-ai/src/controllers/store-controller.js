'use strict';

const { Store, Alert, Task, Escalation, AiCall, KpiMetric, KpiDefinition, StoreHealthSnapshot } = require('../../models');
const { thresholdChecker, kpiCalculator, escalationEngine } = require('../services');
const { Op } = require('sequelize');
const { format, subDays } = require('date-fns');

/**
 * Store Controller
 * Handles all store-related API endpoints
 */

/**
 * Get all stores
 * GET /api/v1/stores
 */
exports.getAllStores = async (req, res) => {
  const { status, region_id, district_id, limit = 50, offset = 0 } = req.query;

  const where = {};
  if (status) where.status = status;
  if (region_id) where.region_id = region_id;
  if (district_id) where.district_id = district_id;

  const stores = await Store.findAll({
    where,
    attributes: ['id', 'store_code', 'name', 'city', 'state', 'status', 'manager_name'],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['name', 'ASC']]
  });

  res.json({
    success: true,
    data: stores,
    count: stores.length
  });
};

/**
 * Get store by ID
 * GET /api/v1/stores/:id
 */
exports.getStoreById = async (req, res) => {
  const { id } = req.params;

  const store = await Store.findByPk(id, {
    include: [
      { model: require('../../models').Region, as: 'region' },
      { model: require('../../models').District, as: 'district' }
    ]
  });

  if (!store) {
    return res.status(404).json({
      success: false,
      error: { message: 'Store not found', statusCode: 404 }
    });
  }

  res.json({
    success: true,
    data: store
  });
};

/**
 * Get store health status
 * GET /api/v1/stores/:id/health
 */
exports.getStoreHealth = async (req, res) => {
  const { id } = req.params;
  const { date } = req.query;

  const targetDate = date ? new Date(date) : new Date();

  const health = await thresholdChecker.checkStoreHealth(parseInt(id), targetDate);

  if (!health) {
    return res.status(404).json({
      success: false,
      error: { message: 'No health data available for this date', statusCode: 404 }
    });
  }

  res.json({
    success: true,
    data: health
  });
};

/**
 * Get store health history
 * GET /api/v1/stores/:id/health/history
 */
exports.getHealthHistory = async (req, res) => {
  const { id } = req.params;
  const { days = 30 } = req.query;

  const endDate = new Date();
  const startDate = subDays(endDate, parseInt(days));

  const history = await StoreHealthSnapshot.findAll({
    where: {
      store_id: id,
      snapshot_date: {
        [Op.between]: [format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')]
      }
    },
    order: [['snapshot_date', 'DESC']]
  });

  res.json({
    success: true,
    data: history,
    count: history.length
  });
};

/**
 * Get current KPIs for store
 * GET /api/v1/stores/:id/kpis
 */
exports.getStoreKpis = async (req, res) => {
  const { id } = req.params;
  const { date } = req.query;

  const targetDate = date || format(new Date(), 'yyyy-MM-dd');

  const kpis = await KpiMetric.findAll({
    where: {
      store_id: id,
      metric_date: targetDate
    },
    include: [
      {
        model: KpiDefinition,
        as: 'kpiDefinition',
        attributes: ['id', 'kpi_code', 'name', 'unit', 'category']
      }
    ],
    order: [['kpiDefinition', 'category', 'ASC']]
  });

  res.json({
    success: true,
    data: kpis,
    count: kpis.length
  });
};

/**
 * Get KPI history for store
 * GET /api/v1/stores/:id/kpis/history
 */
exports.getKpiHistory = async (req, res) => {
  const { id } = req.params;
  const { kpi_code, days = 30 } = req.query;

  if (!kpi_code) {
    return res.status(400).json({
      success: false,
      error: { message: 'kpi_code query parameter is required', statusCode: 400 }
    });
  }

  const endDate = new Date();
  const startDate = subDays(endDate, parseInt(days));

  // Get KPI definition
  const kpiDef = await KpiDefinition.findOne({
    where: { kpi_code }
  });

  if (!kpiDef) {
    return res.status(404).json({
      success: false,
      error: { message: 'KPI definition not found', statusCode: 404 }
    });
  }

  const history = await KpiMetric.findAll({
    where: {
      store_id: id,
      kpi_definition_id: kpiDef.id,
      metric_date: {
        [Op.between]: [format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')]
      }
    },
    order: [['metric_date', 'ASC']]
  });

  res.json({
    success: true,
    data: {
      kpi: kpiDef,
      history
    },
    count: history.length
  });
};

/**
 * Get alerts for store
 * GET /api/v1/stores/:id/alerts
 */
exports.getStoreAlerts = async (req, res) => {
  const { id } = req.params;
  const { status, severity, limit = 50 } = req.query;

  const where = { store_id: id };
  if (status) where.status = status;
  if (severity) where.severity = severity;

  const alerts = await Alert.findAll({
    where,
    include: [
      {
        model: KpiDefinition,
        as: 'kpiDefinition',
        attributes: ['id', 'kpi_code', 'name', 'category']
      }
    ],
    limit: parseInt(limit),
    order: [['alert_date', 'DESC']]
  });

  res.json({
    success: true,
    data: alerts,
    count: alerts.length
  });
};

/**
 * Get tasks for store
 * GET /api/v1/stores/:id/tasks
 */
exports.getStoreTasks = async (req, res) => {
  const { id } = req.params;
  const { status, limit = 50 } = req.query;

  const where = { store_id: id };
  if (status) where.status = status;

  const tasks = await Task.findAll({
    where,
    include: [
      {
        model: KpiDefinition,
        as: 'kpiDefinition',
        attributes: ['id', 'kpi_code', 'name']
      }
    ],
    limit: parseInt(limit),
    order: [['priority', 'ASC'], ['due_date', 'ASC']]
  });

  res.json({
    success: true,
    data: tasks,
    count: tasks.length
  });
};

/**
 * Get escalations for store
 * GET /api/v1/stores/:id/escalations
 */
exports.getStoreEscalations = async (req, res) => {
  const { id } = req.params;
  const { status, limit = 50 } = req.query;

  const where = { store_id: id };
  if (status) where.status = status;

  const escalations = await Escalation.findAll({
    where,
    include: [
      {
        model: Alert,
        as: 'alert',
        include: [
          {
            model: KpiDefinition,
            as: 'kpiDefinition',
            attributes: ['id', 'kpi_code', 'name']
          }
        ]
      }
    ],
    limit: parseInt(limit),
    order: [['escalated_at', 'DESC']]
  });

  res.json({
    success: true,
    data: escalations,
    count: escalations.length
  });
};

/**
 * Get AI call history for store
 * GET /api/v1/stores/:id/ai-calls
 */
exports.getAiCallHistory = async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;

  const calls = await AiCall.findAll({
    where: { store_id: id },
    limit: parseInt(limit),
    order: [['created_at', 'DESC']]
  });

  res.json({
    success: true,
    data: calls,
    count: calls.length
  });
};
