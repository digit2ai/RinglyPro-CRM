'use strict';

const { Op } = require('sequelize');
const { Escalation, EscalationRule, Alert, Task, Store, District, Region, KpiDefinition } = require('../../models');
const { differenceInHours, addHours } = require('date-fns');

/**
 * Escalation Engine Service
 * Manages the 5-level escalation model (0-4)
 * Monitors SLAs and triggers escalations
 */
class EscalationEngineService {
  /**
   * Monitor all active alerts and escalate as needed
   * Should be run on a schedule (e.g., every 15-30 minutes)
   */
  async monitorAndEscalate() {
    console.log('Starting escalation monitoring...');

    const activeAlerts = await Alert.findAll({
      where: {
        status: {
          [Op.in]: ['active', 'acknowledged']
        }
      },
      include: [
        {
          model: Store,
          as: 'store',
          include: [
            { model: District, as: 'district' },
            { model: Region, as: 'region' }
          ]
        },
        {
          model: KpiDefinition,
          as: 'kpiDefinition'
        }
      ]
    });

    const escalations = [];

    for (const alert of activeAlerts) {
      try {
        const escalation = await this.checkAndEscalateAlert(alert);
        if (escalation) {
          escalations.push(escalation);
        }
      } catch (error) {
        console.error(`Error escalating alert ${alert.id}:`, error.message);
      }
    }

    console.log(`Escalation monitoring complete. ${escalations.length} escalations created.`);
    return escalations;
  }

  /**
   * Check if an alert should be escalated and escalate if needed
   */
  async checkAndEscalateAlert(alert) {
    const hoursSinceAlert = differenceInHours(new Date(), new Date(alert.alert_date));

    // Get applicable escalation rules
    const rules = await this.getEscalationRules(alert);

    for (const rule of rules) {
      if (this.shouldEscalate(alert, rule, hoursSinceAlert)) {
        return await this.executeEscalation(alert, rule, 'sla_breach');
      }
    }

    return null;
  }

  /**
   * Get escalation rules applicable to this alert
   */
  async getEscalationRules(alert) {
    const store = await Store.findByPk(alert.store_id, {
      include: [{ model: require('../../models').Organization, as: 'organization' }]
    });

    // Get rules for this specific KPI or general rules
    const rules = await EscalationRule.findAll({
      where: {
        organization_id: store.organization_id,
        [Op.or]: [
          { kpi_definition_id: alert.kpi_definition_id },
          { kpi_definition_id: null } // General rules
        ],
        is_active: true,
        from_level: alert.escalation_level
      },
      order: [['kpi_definition_id', 'DESC']] // Specific rules first
    });

    return rules;
  }

  /**
   * Determine if alert should be escalated based on rule
   */
  shouldEscalate(alert, rule, hoursSinceAlert) {
    // Check if trigger condition matches
    if (rule.trigger_condition === 'status_red' && alert.severity !== 'red') {
      return false;
    }

    if (rule.trigger_condition === 'status_yellow' && alert.severity !== 'yellow') {
      return false;
    }

    if (rule.trigger_condition === 'sla_breach') {
      // Check if enough time has passed
      return hoursSinceAlert >= rule.duration_hours;
    }

    return false;
  }

  /**
   * Execute escalation
   */
  async executeEscalation(alert, rule, triggeredBy = 'sla_breach') {
    const store = await Store.findByPk(alert.store_id, {
      include: [
        { model: District, as: 'district' },
        { model: Region, as: 'region' }
      ]
    });

    const kpiDefinition = await KpiDefinition.findByPk(alert.kpi_definition_id);

    // Determine escalation target
    const escalationTarget = this.getEscalationTarget(store, rule.to_level);

    // Create escalation record
    const escalation = await Escalation.create({
      store_id: alert.store_id,
      alert_id: alert.id,
      task_id: null,
      from_level: rule.from_level,
      to_level: rule.to_level,
      escalation_reason: this.generateEscalationReason(alert, kpiDefinition, rule),
      triggered_by: triggeredBy,
      escalated_at: new Date(),
      escalated_to_role: escalationTarget.role,
      escalated_to_name: escalationTarget.name,
      escalated_to_contact: escalationTarget.contact,
      status: 'pending',
      metadata: {
        kpi_code: kpiDefinition.kpi_code,
        hours_in_status: differenceInHours(new Date(), new Date(alert.alert_date))
      }
    });

    // Update alert escalation level
    await alert.update({
      escalation_level: rule.to_level
    });

    // Execute escalation action
    await this.executeEscalationAction(escalation, alert, rule, store, kpiDefinition);

    return escalation;
  }

  /**
   * Get escalation target based on level
   */
  getEscalationTarget(store, toLevel) {
    switch (toLevel) {
      case 1: // Store manager (yellow alert)
        return {
          role: 'store_manager',
          name: store.manager_name,
          contact: store.manager_phone || store.manager_email
        };

      case 2: // Store manager (red alert with acknowledgment)
        return {
          role: 'store_manager',
          name: store.manager_name,
          contact: store.manager_phone || store.manager_email
        };

      case 3: // Persistent red - AI call to store manager
        return {
          role: 'store_manager',
          name: store.manager_name,
          contact: store.manager_phone
        };

      case 4: // Regional escalation
        if (store.district) {
          return {
            role: 'district_manager',
            name: store.district.manager_name,
            contact: store.district.manager_phone || store.district.manager_email
          };
        } else if (store.region) {
          return {
            role: 'regional_manager',
            name: store.region.manager_name,
            contact: store.region.manager_phone || store.region.manager_email
          };
        }
        return {
          role: 'regional_ops',
          name: 'Regional Operations',
          contact: null
        };

      default:
        return {
          role: 'store_manager',
          name: store.manager_name,
          contact: store.manager_phone
        };
    }
  }

  /**
   * Generate escalation reason message
   */
  generateEscalationReason(alert, kpiDefinition, rule) {
    const hoursSince = differenceInHours(new Date(), new Date(alert.alert_date));

    let reason = `${kpiDefinition.name} has remained in ${alert.severity.toUpperCase()} status for ${hoursSince} hours. `;
    reason += `SLA threshold of ${rule.duration_hours} hours has been exceeded. `;
    reason += `Escalating from Level ${rule.from_level} to Level ${rule.to_level} per policy.`;

    return reason;
  }

  /**
   * Execute the escalation action (create task, send alert, trigger AI call, etc.)
   */
  async executeEscalationAction(escalation, alert, rule, store, kpiDefinition) {
    switch (rule.action) {
      case 'create_task':
        await this.createEscalationTask(escalation, alert, store, kpiDefinition);
        break;

      case 'send_alert':
        await this.sendEscalationAlert(escalation, alert, store);
        break;

      case 'ai_call':
        await this.scheduleAiCall(escalation, alert, store, kpiDefinition);
        break;

      case 'regional_escalation':
        await this.escalateToRegional(escalation, alert, store, kpiDefinition);
        break;

      default:
        console.log(`Unknown escalation action: ${rule.action}`);
    }
  }

  /**
   * Create escalation task
   */
  async createEscalationTask(escalation, alert, store, kpiDefinition) {
    const task = await Task.create({
      alert_id: alert.id,
      store_id: store.id,
      kpi_definition_id: kpiDefinition.id,
      task_type: 'escalation',
      priority: escalation.to_level >= 3 ? 1 : 2,
      title: `ESCALATED: ${kpiDefinition.name} - Level ${escalation.to_level}`,
      description: `This issue has been escalated to Level ${escalation.to_level}.\n\nReason: ${escalation.escalation_reason}\n\nImmediate action required.`,
      assigned_to_role: escalation.escalated_to_role,
      assigned_to_name: escalation.escalated_to_name,
      assigned_to_contact: escalation.escalated_to_contact,
      status: 'pending',
      due_date: addHours(new Date(), escalation.to_level >= 3 ? 6 : 24),
      metadata: {
        escalation_id: escalation.id,
        escalation_level: escalation.to_level
      }
    });

    await escalation.update({ task_id: task.id });

    return task;
  }

  /**
   * Send escalation alert
   * In production, this would integrate with push notification/SMS/email systems
   */
  async sendEscalationAlert(escalation, alert, store) {
    console.log(`📢 ESCALATION ALERT: Store ${store.name} - Alert ${alert.id} escalated to Level ${escalation.to_level}`);
    console.log(`   Contact: ${escalation.escalated_to_name} (${escalation.escalated_to_role})`);
    console.log(`   Contact Info: ${escalation.escalated_to_contact}`);

    // TODO: Integrate with actual notification system (Twilio SMS, SendGrid, Push notifications, etc.)
    // For now, just log it

    return {
      sent: true,
      recipient: escalation.escalated_to_contact,
      method: 'console_log'
    };
  }

  /**
   * Schedule AI voice call (Level 3 escalation)
   * This will be handled by the VoiceCallManager service
   */
  async scheduleAiCall(escalation, alert, store, kpiDefinition) {
    console.log(`📞 SCHEDULING AI CALL: Store ${store.name} - Manager ${store.manager_name}`);
    console.log(`   Phone: ${store.manager_phone}`);
    console.log(`   KPI: ${kpiDefinition.name}`);
    console.log(`   Reason: Level 3 escalation - Persistent red status`);

    // TODO: Integrate with VoiceCallManager service
    // const callManager = require('./voice-call-manager');
    // await callManager.scheduleCall(escalation, alert, store, kpiDefinition);

    // For now, create a placeholder in ai_calls table
    const { AiCall } = require('../../models');
    const aiCall = await AiCall.create({
      store_id: store.id,
      alert_id: alert.id,
      escalation_id: escalation.id,
      call_type: 'red',
      call_status: 'scheduled',
      recipient_name: store.manager_name,
      recipient_phone: store.manager_phone,
      metadata: {
        kpi_code: kpiDefinition.kpi_code,
        escalation_level: 3,
        note: 'Scheduled by escalation engine - awaiting voice provider integration'
      }
    });

    return aiCall;
  }

  /**
   * Escalate to regional management (Level 4)
   */
  async escalateToRegional(escalation, alert, store, kpiDefinition) {
    console.log(`🚨 REGIONAL ESCALATION: Store ${store.name}`);
    console.log(`   District Manager: ${escalation.escalated_to_name}`);
    console.log(`   KPI: ${kpiDefinition.name}`);
    console.log(`   Status: Persistent Red for ${differenceInHours(new Date(), alert.alert_date)} hours`);

    // Create high-priority task for district/regional manager
    await this.createEscalationTask(escalation, alert, store, kpiDefinition);

    // Send alert notification
    await this.sendEscalationAlert(escalation, alert, store);

    return {
      escalated: true,
      level: 4,
      contact: escalation.escalated_to_contact
    };
  }

  /**
   * Get escalation summary for a store
   */
  async getStoreEscalations(storeId) {
    return await Escalation.findAll({
      where: { store_id: storeId },
      include: [
        {
          model: Alert,
          as: 'alert',
          include: [
            {
              model: KpiDefinition,
              as: 'kpiDefinition',
              attributes: ['kpi_code', 'name', 'category']
            }
          ]
        }
      ],
      order: [['escalated_at', 'DESC']]
    });
  }

  /**
   * Get all pending escalations across all stores
   */
  async getPendingEscalations() {
    return await Escalation.findAll({
      where: {
        status: 'pending'
      },
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
              attributes: ['kpi_code', 'name']
            }
          ]
        }
      ],
      order: [
        ['to_level', 'DESC'],
        ['escalated_at', 'ASC']
      ]
    });
  }

  /**
   * Acknowledge an escalation
   */
  async acknowledgeEscalation(escalationId, acknowledgedBy) {
    const escalation = await Escalation.findByPk(escalationId);

    if (!escalation) {
      throw new Error('Escalation not found');
    }

    await escalation.update({
      status: 'acknowledged',
      metadata: {
        ...escalation.metadata,
        acknowledged_by: acknowledgedBy,
        acknowledged_at: new Date()
      }
    });

    return escalation;
  }

  /**
   * Resolve an escalation
   */
  async resolveEscalation(escalationId, resolution) {
    const escalation = await Escalation.findByPk(escalationId);

    if (!escalation) {
      throw new Error('Escalation not found');
    }

    await escalation.update({
      status: 'resolved',
      resolution,
      resolved_at: new Date()
    });

    return escalation;
  }
}

module.exports = new EscalationEngineService();
