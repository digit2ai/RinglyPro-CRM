'use strict';

const { KpiDefinition, KpiThreshold, KpiMetric } = require('../../models');
const { kpiCalculator } = require('../services');
const { Op } = require('sequelize');
const { format } = require('date-fns');

/**
 * KPI Controller
 * Handles KPI calculation and retrieval endpoints
 */

/**
 * Calculate and store a single KPI
 * POST /api/v1/kpis/calculate
 * Body: { store_id, kpi_code, metric_date, value, metadata }
 */
exports.calculateKpi = async (req, res) => {
  const { store_id, kpi_code, metric_date, value, metadata } = req.body;

  if (!store_id || !kpi_code || !value) {
    return res.status(400).json({
      success: false,
      error: { message: 'store_id, kpi_code, and value are required', statusCode: 400 }
    });
  }

  const date = metric_date ? new Date(metric_date) : new Date();

  const result = await kpiCalculator.calculateAndStoreKpi(
    store_id,
    kpi_code,
    date,
    value,
    metadata || {}
  );

  res.json({
    success: true,
    data: result
  });
};

/**
 * Batch calculate KPIs
 * POST /api/v1/kpis/batch-calculate
 * Body: { store_id, metric_date, kpis: { kpi_code: value, ... } }
 */
exports.batchCalculateKpis = async (req, res) => {
  const { store_id, metric_date, kpis } = req.body;

  if (!store_id || !kpis) {
    return res.status(400).json({
      success: false,
      error: { message: 'store_id and kpis are required', statusCode: 400 }
    });
  }

  const date = metric_date ? new Date(metric_date) : new Date();

  const results = await kpiCalculator.batchCalculateKpis(store_id, date, kpis);

  res.json({
    success: true,
    data: results,
    count: results.length
  });
};

/**
 * Get all KPI definitions
 * GET /api/v1/kpis/definitions
 */
exports.getKpiDefinitions = async (req, res) => {
  const { organization_id, category, is_active = true } = req.query;

  const where = {};
  if (organization_id) where.organization_id = organization_id;
  if (category) where.category = category;
  if (is_active !== undefined) where.is_active = is_active === 'true';

  const definitions = await KpiDefinition.findAll({
    where,
    order: [['category', 'ASC'], ['name', 'ASC']]
  });

  res.json({
    success: true,
    data: definitions,
    count: definitions.length
  });
};

/**
 * Get KPI thresholds
 * GET /api/v1/kpis/thresholds
 */
exports.getKpiThresholds = async (req, res) => {
  const { organization_id, store_id, kpi_definition_id } = req.query;

  const where = {};
  if (organization_id) where.organization_id = organization_id;
  if (store_id) where.store_id = store_id;
  if (kpi_definition_id) where.kpi_definition_id = kpi_definition_id;

  const thresholds = await KpiThreshold.findAll({
    where,
    include: [
      {
        model: KpiDefinition,
        as: 'kpiDefinition',
        attributes: ['id', 'kpi_code', 'name', 'unit']
      }
    ]
  });

  res.json({
    success: true,
    data: thresholds,
    count: thresholds.length
  });
};

/**
 * Get KPI metrics (with filters)
 * GET /api/v1/kpis/metrics
 */
exports.getKpiMetrics = async (req, res) => {
  const { store_id, kpi_definition_id, metric_date, status, limit = 100, offset = 0 } = req.query;

  const where = {};
  if (store_id) where.store_id = store_id;
  if (kpi_definition_id) where.kpi_definition_id = kpi_definition_id;
  if (metric_date) where.metric_date = metric_date;
  if (status) where.status = status;

  const metrics = await KpiMetric.findAll({
    where,
    include: [
      {
        model: KpiDefinition,
        as: 'kpiDefinition',
        attributes: ['id', 'kpi_code', 'name', 'unit', 'category']
      }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['metric_date', 'DESC']]
  });

  res.json({
    success: true,
    data: metrics,
    count: metrics.length
  });
};
