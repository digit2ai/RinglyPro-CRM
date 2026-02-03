'use strict';

const { Escalation, Store, Alert, KpiDefinition } = require('../../models');
const { escalationEngine } = require('../services');
const { Op } = require('sequelize');

/**
 * Escalation Controller
 * Handles escalation management endpoints
 */

/**
 * Get all escalations (with filters)
 * GET /api/v1/escalations
 */
exports.getAllEscalations = async (req, res) => {
  const { store_id, status, to_level, limit = 50, offset = 0 } = req.query;

  const where = {};
  if (store_id) where.store_id = store_id;
  if (status) where.status = status;
  if (to_level) where.to_level = to_level;

  const escalations = await Escalation.findAll({
    where,
    include: [
      {
        model: Store,
        as: 'store',
        attributes: ['id', 'store_code', 'name']
      },
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
    offset: parseInt(offset),
    order: [['to_level', 'DESC'], ['escalated_at', 'DESC']]
  });

  res.json({
    success: true,
    data: escalations,
    count: escalations.length
  });
};

/**
 * Get escalation by ID
 * GET /api/v1/escalations/:id
 */
exports.getEscalationById = async (req, res) => {
  const { id } = req.params;

  const escalation = await Escalation.findByPk(id, {
    include: [
      {
        model: Store,
        as: 'store'
      },
      {
        model: Alert,
        as: 'alert',
        include: [
          {
            model: KpiDefinition,
            as: 'kpiDefinition'
          }
        ]
      }
    ]
  });

  if (!escalation) {
    return res.status(404).json({
      success: false,
      error: { message: 'Escalation not found', statusCode: 404 }
    });
  }

  res.json({
    success: true,
    data: escalation
  });
};

/**
 * Acknowledge an escalation
 * POST /api/v1/escalations/:id/acknowledge
 * Body: { acknowledged_by }
 */
exports.acknowledgeEscalation = async (req, res) => {
  const { id } = req.params;
  const { acknowledged_by } = req.body;

  if (!acknowledged_by) {
    return res.status(400).json({
      success: false,
      error: { message: 'acknowledged_by is required', statusCode: 400 }
    });
  }

  const escalation = await escalationEngine.acknowledgeEscalation(parseInt(id), acknowledged_by);

  res.json({
    success: true,
    data: escalation,
    message: 'Escalation acknowledged successfully'
  });
};

/**
 * Resolve an escalation
 * POST /api/v1/escalations/:id/resolve
 * Body: { resolution }
 */
exports.resolveEscalation = async (req, res) => {
  const { id } = req.params;
  const { resolution } = req.body;

  if (!resolution) {
    return res.status(400).json({
      success: false,
      error: { message: 'resolution is required', statusCode: 400 }
    });
  }

  const escalation = await escalationEngine.resolveEscalation(parseInt(id), resolution);

  res.json({
    success: true,
    data: escalation,
    message: 'Escalation resolved successfully'
  });
};

/**
 * Get pending escalations
 * GET /api/v1/escalations/status/pending
 */
exports.getPendingEscalations = async (req, res) => {
  const escalations = await escalationEngine.getPendingEscalations();

  res.json({
    success: true,
    data: escalations,
    count: escalations.length
  });
};

/**
 * Trigger escalation monitoring
 * POST /api/v1/escalations/monitor
 */
exports.monitorAndEscalate = async (req, res) => {
  const escalations = await escalationEngine.monitorAndEscalate();

  res.json({
    success: true,
    data: escalations,
    count: escalations.length,
    message: `Escalation monitoring complete. ${escalations.length} new escalations created.`
  });
};
