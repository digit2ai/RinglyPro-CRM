'use strict';

const { Alert, Store, KpiDefinition } = require('../../models');
const { alertManager } = require('../services');
const { Op } = require('sequelize');

/**
 * Alert Controller
 * Handles alert management endpoints
 */

/**
 * Get all alerts (with filters)
 * GET /api/v1/alerts
 */
exports.getAllAlerts = async (req, res) => {
  const { store_id, status, severity, limit = 50, offset = 0 } = req.query;

  const where = {};
  if (store_id) where.store_id = store_id;
  if (status) where.status = status;
  if (severity) where.severity = severity;

  const alerts = await Alert.findAll({
    where,
    include: [
      {
        model: Store,
        as: 'store',
        attributes: ['id', 'store_code', 'name']
      },
      {
        model: KpiDefinition,
        as: 'kpiDefinition',
        attributes: ['id', 'kpi_code', 'name', 'category']
      }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['escalation_level', 'DESC'], ['alert_date', 'DESC']]
  });

  res.json({
    success: true,
    data: alerts,
    count: alerts.length
  });
};

/**
 * Get alert by ID
 * GET /api/v1/alerts/:id
 */
exports.getAlertById = async (req, res) => {
  const { id } = req.params;

  const alert = await Alert.findByPk(id, {
    include: [
      {
        model: Store,
        as: 'store',
        attributes: ['id', 'store_code', 'name', 'manager_name']
      },
      {
        model: KpiDefinition,
        as: 'kpiDefinition',
        attributes: ['id', 'kpi_code', 'name', 'unit', 'category']
      }
    ]
  });

  if (!alert) {
    return res.status(404).json({
      success: false,
      error: { message: 'Alert not found', statusCode: 404 }
    });
  }

  res.json({
    success: true,
    data: alert
  });
};

/**
 * Acknowledge an alert
 * POST /api/v1/alerts/:id/acknowledge
 * Body: { acknowledged_by }
 */
exports.acknowledgeAlert = async (req, res) => {
  const { id } = req.params;
  const { acknowledged_by } = req.body;

  if (!acknowledged_by) {
    return res.status(400).json({
      success: false,
      error: { message: 'acknowledged_by is required', statusCode: 400 }
    });
  }

  const alert = await alertManager.acknowledgeAlert(parseInt(id), acknowledged_by);

  res.json({
    success: true,
    data: alert,
    message: 'Alert acknowledged successfully'
  });
};

/**
 * Resolve an alert
 * POST /api/v1/alerts/:id/resolve
 */
exports.resolveAlert = async (req, res) => {
  const { id } = req.params;

  const alert = await alertManager.resolveAlert(parseInt(id));

  res.json({
    success: true,
    data: alert,
    message: 'Alert resolved successfully'
  });
};

/**
 * Get overdue alerts
 * GET /api/v1/alerts/status/overdue
 */
exports.getOverdueAlerts = async (req, res) => {
  const alerts = await alertManager.getOverdueAlerts();

  res.json({
    success: true,
    data: alerts,
    count: alerts.length
  });
};
