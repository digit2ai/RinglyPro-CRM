'use strict';

const { Op } = require('sequelize');
const { Alert, Task, KpiMetric, KpiDefinition, Store, StoreHealthSnapshot } = require('../../models');
const { addHours, format } = require('date-fns');

/**
 * Alert Manager Service
 * Creates and manages alerts when KPI thresholds are crossed
 * Creates tasks for store managers
 */
class AlertManagerService {
  /**
   * Create alert for a KPI threshold violation
   * @param {number} storeId - Store ID
   * @param {object} kpiMetric - KPI metric that triggered the alert
   * @returns {Promise<object>} Created alert and task
   */
  async createAlert(storeId, kpiMetric) {
    try {
      const store = await Store.findByPk(storeId);
      const kpiDefinition = await KpiDefinition.findByPk(kpiMetric.kpi_definition_id);

      if (!store || !kpiDefinition) {
        throw new Error('Store or KPI definition not found');
      }

      // Determine severity based on status
      let severity, escalationLevel, requiresAcknowledgment, slaHours;

      if (kpiMetric.status === 'red') {
        severity = 'red';
        escalationLevel = 2;
        requiresAcknowledgment = true;
        slaHours = this.getSlaHours(kpiDefinition.category, 'red');
      } else if (kpiMetric.status === 'yellow') {
        severity = 'yellow';
        escalationLevel = 1;
        requiresAcknowledgment = false;
        slaHours = this.getSlaHours(kpiDefinition.category, 'yellow');
      } else {
        // Don't create alerts for green status
        return null;
      }

      // Check if active alert already exists for this KPI
      const existingAlert = await Alert.findOne({
        where: {
          store_id: storeId,
          kpi_definition_id: kpiMetric.kpi_definition_id,
          status: {
            [Op.in]: ['active', 'acknowledged']
          }
        }
      });

      if (existingAlert) {
        console.log(`Active alert already exists for store ${storeId}, KPI ${kpiDefinition.kpi_code}`);
        return { alert: existingAlert, task: null, created: false };
      }

      // Create alert
      const alert = await Alert.create({
        store_id: storeId,
        kpi_definition_id: kpiMetric.kpi_definition_id,
        alert_date: new Date(),
        severity,
        escalation_level: escalationLevel,
        status: 'active',
        title: this.generateAlertTitle(kpiDefinition, kpiMetric, severity),
        message: this.generateAlertMessage(store, kpiDefinition, kpiMetric, severity),
        requires_acknowledgment: requiresAcknowledgment,
        expires_at: addHours(new Date(), slaHours),
        metadata: {
          kpi_code: kpiDefinition.kpi_code,
          variance_pct: kpiMetric.variance_pct,
          actual_value: kpiMetric.value,
          comparison_value: kpiMetric.comparison_value
        }
      });

      // Create task for store manager
      const task = await this.createTaskForAlert(alert, store, kpiDefinition, kpiMetric);

      return { alert, task, created: true };
    } catch (error) {
      console.error('Error creating alert:', error);
      throw error;
    }
  }

  /**
   * Create task for an alert
   */
  async createTaskForAlert(alert, store, kpiDefinition, kpiMetric) {
    const dueDate = alert.expires_at || addHours(new Date(), 24);
    const priority = alert.severity === 'red' ? 1 : alert.severity === 'yellow' ? 3 : 5;

    const task = await Task.create({
      alert_id: alert.id,
      store_id: store.id,
      kpi_definition_id: kpiDefinition.id,
      task_type: alert.severity === 'red' ? 'action' : 'review',
      priority,
      title: `Review ${kpiDefinition.name} - ${alert.severity.toUpperCase()}`,
      description: this.generateTaskDescription(kpiDefinition, kpiMetric),
      assigned_to_role: 'store_manager',
      assigned_to_name: store.manager_name,
      assigned_to_contact: store.manager_phone || store.manager_email,
      status: 'pending',
      due_date: dueDate,
      metadata: {
        recommended_action: this.getRecommendedAction(kpiDefinition.kpi_code, kpiMetric.status)
      }
    });

    return task;
  }

  /**
   * Generate alert title
   */
  generateAlertTitle(kpiDefinition, kpiMetric, severity) {
    const emoji = severity === 'red' ? '🔴' : '🟨';
    const direction = kpiMetric.variance_pct < 0 ? 'below' : 'above';

    return `${emoji} ${kpiDefinition.name} ${Math.abs(kpiMetric.variance_pct).toFixed(1)}% ${direction} target`;
  }

  /**
   * Generate alert message
   */
  generateAlertMessage(store, kpiDefinition, kpiMetric, severity) {
    const variance = kpiMetric.variance_pct.toFixed(1);
    const direction = kpiMetric.variance_pct < 0 ? 'below' : 'above';

    let message = `${store.name}: ${kpiDefinition.name} is ${Math.abs(variance)}% ${direction} the baseline.\n\n`;
    message += `Current Value: ${kpiMetric.value} ${kpiDefinition.unit}\n`;

    if (kpiMetric.comparison_value) {
      message += `Baseline: ${kpiMetric.comparison_value} ${kpiDefinition.unit}\n`;
    }

    message += `Variance: ${variance}%\n\n`;

    if (severity === 'red') {
      message += '⚠️ IMMEDIATE ACTION REQUIRED\n';
      message += 'This KPI has fallen into the red zone. Please review and take corrective action immediately.';
    } else {
      message += '⚡ ATTENTION NEEDED\n';
      message += 'This KPI requires monitoring. Consider taking preventive action to avoid further decline.';
    }

    return message;
  }

  /**
   * Generate task description with recommendations
   */
  generateTaskDescription(kpiDefinition, kpiMetric) {
    const recommendedAction = this.getRecommendedAction(kpiDefinition.kpi_code, kpiMetric.status);

    return `${kpiDefinition.name} is tracking ${kpiMetric.status.toUpperCase()} status.\n\nRecommended Actions:\n${recommendedAction.map((action, i) => `${i + 1}. ${action}`).join('\n')}`;
  }

  /**
   * Get recommended actions based on KPI code and status
   */
  getRecommendedAction(kpiCode, status) {
    const actions = {
      sales: [
        'Review current promotions and pricing',
        'Check inventory availability for top SKUs',
        'Analyze traffic patterns and conversion rates',
        'Consider targeted marketing campaigns'
      ],
      traffic: [
        'Review store hours and scheduling',
        'Check local events and competition',
        'Assess storefront visibility and signage',
        'Consider promotional activities to drive traffic'
      ],
      conversion_rate: [
        'Review sales associate training and coverage',
        'Check product availability and merchandising',
        'Analyze basket abandonment reasons',
        'Assess checkout process efficiency'
      ],
      labor_coverage: [
        'Fill open shifts immediately',
        'Contact backup staff for coverage',
        'Review schedule for next 48 hours',
        'Escalate to district if unable to cover'
      ],
      inventory: [
        'Review out-of-stock items',
        'Expedite replenishment for top SKUs',
        'Check pending deliveries and orders',
        'Contact distribution center if delays'
      ]
    };

    return actions[kpiCode] || [
      'Review current performance trends',
      'Identify root cause of variance',
      'Implement corrective actions',
      'Monitor closely over next 24 hours'
    ];
  }

  /**
   * Get SLA hours based on KPI category and severity
   */
  getSlaHours(category, severity) {
    const slaConfig = {
      sales: { red: 24, yellow: 48 },
      labor: { red: 24, yellow: 48 },
      inventory: { red: 72, yellow: 96 },
      traffic: { red: 24, yellow: 48 },
      hr: { red: 48, yellow: 72 },
      operations: { red: 24, yellow: 48 }
    };

    return slaConfig[category]?.[severity] || 24;
  }

  /**
   * Process all KPIs for a store and create alerts as needed
   */
  async processStoreKpis(storeId, date = new Date()) {
    const dateStr = format(date, 'yyyy-MM-dd');

    const metrics = await KpiMetric.findAll({
      where: {
        store_id: storeId,
        metric_date: dateStr,
        status: {
          [Op.in]: ['yellow', 'red']
        }
      },
      include: [
        {
          model: KpiDefinition,
          as: 'kpiDefinition'
        }
      ]
    });

    const results = [];

    for (const metric of metrics) {
      try {
        const result = await this.createAlert(storeId, metric);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Failed to create alert for KPI ${metric.kpi_definition_id}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = await Alert.findByPk(alertId);

    if (!alert) {
      throw new Error('Alert not found');
    }

    if (alert.status !== 'active') {
      throw new Error('Alert is not active');
    }

    await alert.update({
      status: 'acknowledged',
      acknowledged_at: new Date(),
      acknowledged_by
    });

    return alert;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId) {
    const alert = await Alert.findByPk(alertId);

    if (!alert) {
      throw new Error('Alert not found');
    }

    await alert.update({
      status: 'resolved',
      resolved_at: new Date()
    });

    // Mark associated tasks as completed
    await Task.update(
      {
        status: 'completed',
        completed_at: new Date()
      },
      {
        where: {
          alert_id: alertId,
          status: {
            [Op.in]: ['pending', 'in_progress']
          }
        }
      }
    );

    return alert;
  }

  /**
   * Get active alerts for a store
   */
  async getActiveAlerts(storeId) {
    return await Alert.findAll({
      where: {
        store_id: storeId,
        status: {
          [Op.in]: ['active', 'acknowledged']
        }
      },
      include: [
        {
          model: KpiDefinition,
          as: 'kpiDefinition',
          attributes: ['id', 'kpi_code', 'name', 'category']
        }
      ],
      order: [
        ['escalation_level', 'DESC'],
        ['alert_date', 'DESC']
      ]
    });
  }

  /**
   * Get overdue alerts (past SLA)
   */
  async getOverdueAlerts() {
    return await Alert.findAll({
      where: {
        status: {
          [Op.in]: ['active', 'acknowledged']
        },
        expires_at: {
          [Op.lt]: new Date()
        }
      },
      include: [
        {
          model: Store,
          as: 'store',
          attributes: ['id', 'store_code', 'name', 'manager_name', 'manager_phone']
        },
        {
          model: KpiDefinition,
          as: 'kpiDefinition',
          attributes: ['id', 'kpi_code', 'name', 'category']
        }
      ],
      order: [['expires_at', 'ASC']]
    });
  }
}

module.exports = new AlertManagerService();
