// kancho-ai/services/kancho-automation-engine.js
// Automation execution engine - runs scheduled/condition-based automations
// Checks every 5 minutes for automations that should fire

'use strict';

const { Op } = require('sequelize');

class KanchoAutomationEngine {
  constructor(models, voiceService) {
    this.models = models;
    this.voiceService = voiceService;
    this.running = false;
    this.intervalId = null;
    this.CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[AutomationEngine] Started - checking every 5 minutes');
    // Run once immediately, then on interval
    setTimeout(() => this.runCycle(), 10000);
    this.intervalId = setInterval(() => this.runCycle(), this.CHECK_INTERVAL);
  }

  stop() {
    this.running = false;
    if (this.intervalId) clearInterval(this.intervalId);
    console.log('[AutomationEngine] Stopped');
  }

  async runCycle() {
    try {
      const automations = await this.models.KanchoAutomation.findAll({
        where: { is_active: true },
        include: [{ model: this.models.KanchoSchool, as: 'school', attributes: ['id', 'name', 'twilio_number'] }]
      });

      if (!automations.length) return;

      for (const automation of automations) {
        try {
          await this.evaluateAutomation(automation);
        } catch (err) {
          console.error(`[AutomationEngine] Error evaluating automation ${automation.id}:`, err.message);
          await automation.increment('failure_count');
        }
      }
    } catch (err) {
      console.error('[AutomationEngine] Cycle error:', err.message);
    }
  }

  async evaluateAutomation(automation) {
    const { trigger_type, trigger_config, school_id } = automation;
    let targets = [];

    switch (trigger_type) {
      case 'condition':
        targets = await this.evaluateCondition(trigger_config, school_id);
        break;
      case 'schedule':
        targets = await this.evaluateSchedule(trigger_config, school_id);
        break;
      // 'event' triggers are handled by the event emitter (see fireEvent below)
      default:
        return;
    }

    if (targets.length > 0) {
      console.log(`[AutomationEngine] ${automation.name}: ${targets.length} targets found`);
      for (const target of targets) {
        await this.executeActions(automation, target);
      }
      await automation.update({
        runs_count: automation.runs_count + targets.length,
        last_run_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  // ==================== CONDITION EVALUATORS ====================

  async evaluateCondition(config, schoolId) {
    const today = new Date().toISOString().split('T')[0];

    switch (config.condition) {
      case 'student_missed_classes': {
        const threshold = config.threshold || 3;
        const periodDays = config.period_days || 14;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - periodDays);
        const cutoffDate = cutoff.toISOString().split('T')[0];

        // Find active students whose last_attendance is older than cutoff
        // and who haven't been contacted about this recently
        const atRisk = await this.models.KanchoStudent.findAll({
          where: {
            school_id: schoolId,
            status: 'active',
            [Op.or]: [
              { last_attendance: { [Op.lt]: cutoff } },
              { last_attendance: null }
            ]
          },
          attributes: ['id', 'first_name', 'last_name', 'phone', 'email', 'last_attendance', 'school_id'],
          limit: 10
        });

        // Filter out students contacted in the last 7 days for retention
        const filtered = [];
        for (const student of atRisk) {
          const recentComm = await this.models.KanchoCommunication.findOne({
            where: {
              student_id: student.id,
              campaign: 'retention_auto',
              created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }
          });
          if (!recentComm) filtered.push({ type: 'student', data: student });
        }
        return filtered;
      }

      case 'payment_past_due': {
        const daysOverdue = config.days_overdue || 3;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysOverdue);

        const pastDue = await this.models.KanchoSubscription.findAll({
          where: {
            school_id: schoolId,
            status: 'past_due',
            next_billing_date: { [Op.lt]: cutoff.toISOString().split('T')[0] }
          },
          include: [{ model: this.models.KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name', 'phone', 'email'] }],
          limit: 10
        });

        const filtered = [];
        for (const sub of pastDue) {
          if (!sub.student) continue;
          const recentComm = await this.models.KanchoCommunication.findOne({
            where: {
              student_id: sub.student.id,
              campaign: 'payment_reminder_auto',
              created_at: { [Op.gte]: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
            }
          });
          if (!recentComm) filtered.push({ type: 'student', data: sub.student });
        }
        return filtered;
      }

      case 'student_cancelled': {
        const daysSince = config.days_since || 30;
        const cancelWindow = new Date();
        cancelWindow.setDate(cancelWindow.getDate() - daysSince);
        const windowEnd = new Date();
        windowEnd.setDate(windowEnd.getDate() - (daysSince - 7));

        const cancelled = await this.models.KanchoStudent.findAll({
          where: {
            school_id: schoolId,
            status: 'cancelled',
            updated_at: { [Op.between]: [cancelWindow, windowEnd] }
          },
          attributes: ['id', 'first_name', 'last_name', 'phone', 'email', 'school_id'],
          limit: 5
        });

        const filtered = [];
        for (const student of cancelled) {
          const recentComm = await this.models.KanchoCommunication.findOne({
            where: {
              student_id: student.id,
              campaign: 'reactivation_auto',
              created_at: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }
          });
          if (!recentComm) filtered.push({ type: 'student', data: student });
        }
        return filtered;
      }

      default:
        return [];
    }
  }

  // ==================== SCHEDULE EVALUATORS ====================

  async evaluateSchedule(config, schoolId) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    switch (config.condition || config.event) {
      case 'student_birthday': {
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');

        // Find students with birthday today (match month-day portion of date_of_birth)
        const students = await this.models.KanchoStudent.findAll({
          where: {
            school_id: schoolId,
            status: 'active',
            date_of_birth: { [Op.ne]: null }
          },
          attributes: ['id', 'first_name', 'last_name', 'phone', 'email', 'date_of_birth', 'school_id']
        });

        const birthdayStudents = students.filter(s => {
          const dob = s.date_of_birth;
          if (!dob) return false;
          const dobStr = typeof dob === 'string' ? dob : dob.toISOString().split('T')[0];
          return dobStr.endsWith(`-${month}-${day}`);
        });

        const filtered = [];
        for (const student of birthdayStudents) {
          const recentComm = await this.models.KanchoCommunication.findOne({
            where: {
              student_id: student.id,
              campaign: 'birthday_auto',
              created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }
          });
          if (!recentComm) filtered.push({ type: 'student', data: student });
        }
        return filtered;
      }

      case 'appointment_upcoming': {
        const hoursBefore = config.hours_before || 24;
        const targetTime = new Date();
        targetTime.setHours(targetTime.getHours() + hoursBefore);
        const targetDate = targetTime.toISOString().split('T')[0];

        const appointments = await this.models.KanchoAppointment.findAll({
          where: {
            school_id: schoolId,
            appointment_date: targetDate,
            status: { [Op.notIn]: ['cancelled'] }
          },
          attributes: ['id', 'customer_name', 'customer_phone', 'customer_email', 'appointment_date', 'appointment_time', 'school_id']
        });

        const filtered = [];
        for (const appt of appointments) {
          const recentComm = await this.models.KanchoCommunication.findOne({
            where: {
              school_id: schoolId,
              to_number: appt.customer_phone,
              campaign: 'trial_reminder_auto',
              created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }
          });
          if (!recentComm) filtered.push({ type: 'appointment', data: appt });
        }
        return filtered;
      }

      default:
        return [];
    }
  }

  // ==================== EVENT-BASED TRIGGERS ====================

  async fireEvent(eventName, schoolId, entityData) {
    try {
      const automations = await this.models.KanchoAutomation.findAll({
        where: {
          school_id: schoolId,
          is_active: true,
          trigger_type: 'event'
        },
        include: [{ model: this.models.KanchoSchool, as: 'school', attributes: ['id', 'name'] }]
      });

      for (const automation of automations) {
        if (automation.trigger_config.event === eventName) {
          const delay = (automation.trigger_config.delay_minutes || 0) * 60 * 1000;
          if (delay > 0) {
            setTimeout(() => this.executeActions(automation, entityData), delay);
            console.log(`[AutomationEngine] Scheduled ${automation.name} in ${automation.trigger_config.delay_minutes}m`);
          } else {
            await this.executeActions(automation, entityData);
          }
          await automation.increment('runs_count');
          await automation.update({ last_run_at: new Date() });
        }
      }
    } catch (err) {
      console.error(`[AutomationEngine] fireEvent(${eventName}) error:`, err.message);
    }
  }

  // ==================== ACTION EXECUTOR ====================

  async executeActions(automation, target) {
    const school = automation.school || await this.models.KanchoSchool.findByPk(automation.school_id);
    const entity = target.data || target;

    for (const action of (automation.actions || [])) {
      try {
        switch (action.type) {
          case 'sms':
            await this.executeSms(action.config, entity, school, automation);
            break;
          case 'call':
            await this.executeCall(action.config, entity, school, automation);
            break;
          case 'task':
            await this.executeTask(action.config, entity, school, automation);
            break;
          case 'update':
            await this.executeUpdate(action.config, entity, school);
            break;
          default:
            console.log(`[AutomationEngine] Unknown action type: ${action.type}`);
        }
        await automation.increment('success_count');
      } catch (err) {
        console.error(`[AutomationEngine] Action ${action.type} failed:`, err.message);
        await automation.increment('failure_count');
      }
    }
  }

  // ---- SMS Action ----
  async executeSms(config, entity, school, automation) {
    const phone = entity.phone || entity.customer_phone;
    if (!phone) return;

    const body = this.interpolateTemplate(config.template, entity, school);
    const campaign = automation.type + '_auto';

    // Log the communication (actual SMS sending would use Twilio here)
    await this.models.KanchoCommunication.create({
      school_id: school.id,
      channel: 'sms',
      direction: 'outbound',
      to_number: phone,
      from_number: school.twilio_number || null,
      body: body,
      status: 'queued',
      student_id: entity.id && entity.first_name ? entity.id : null,
      lead_id: entity.lead_id || null,
      automation_id: automation.id,
      campaign: campaign,
      template_name: automation.name
    });

    console.log(`[AutomationEngine] SMS queued -> ${phone}: ${body.substring(0, 60)}...`);
  }

  // ---- AI Call Action ----
  async executeCall(config, entity, school, automation) {
    const phone = entity.phone || entity.customer_phone;
    if (!phone || !this.voiceService?.isReady()) return;

    // Log call intent
    await this.models.KanchoAiCall.create({
      school_id: school.id,
      agent: config.agent || 'kancho',
      call_type: config.call_type || 'retention',
      direction: 'outbound',
      phone_number: phone,
      student_id: entity.id || null,
      status: 'scheduled',
      summary: config.script || automation.name,
      metadata: { automation_id: automation.id }
    });

    await this.models.KanchoCommunication.create({
      school_id: school.id,
      channel: 'voice',
      direction: 'outbound',
      to_number: phone,
      body: config.script || 'AI outbound call',
      status: 'queued',
      student_id: entity.id || null,
      automation_id: automation.id,
      campaign: automation.type + '_auto'
    });

    console.log(`[AutomationEngine] AI call scheduled -> ${phone} (${config.call_type})`);
  }

  // ---- Task Action ----
  async executeTask(config, entity, school, automation) {
    const title = this.interpolateTemplate(config.title, entity, school);
    const dueDate = config.due_days !== undefined
      ? new Date(Date.now() + config.due_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : null;

    await this.models.KanchoTask.create({
      school_id: school.id,
      automation_id: automation.id,
      title: title,
      type: config.type || 'general',
      priority: config.priority || 'medium',
      related_student_id: entity.id && entity.first_name && !entity.customer_name ? entity.id : null,
      related_lead_id: entity.lead_id || null,
      due_date: dueDate,
      metadata: { source: 'automation', automation_name: automation.name }
    });

    console.log(`[AutomationEngine] Task created: ${title}`);
  }

  // ---- Update Action ----
  async executeUpdate(config, entity, school) {
    if (config.model === 'student' && entity.id) {
      await this.models.KanchoStudent.update(config.updates || {}, { where: { id: entity.id } });
    } else if (config.model === 'lead' && (entity.lead_id || entity.id)) {
      await this.models.KanchoLead.update(config.updates || {}, { where: { id: entity.lead_id || entity.id } });
    }
  }

  // ==================== TEMPLATE INTERPOLATION ====================

  interpolateTemplate(template, entity, school) {
    if (!template) return '';
    return template
      .replace(/\{\{student\.first_name\}\}/g, entity.first_name || entity.customer_name || '')
      .replace(/\{\{student\.last_name\}\}/g, entity.last_name || '')
      .replace(/\{\{student\.belt_rank\}\}/g, entity.belt_rank || '')
      .replace(/\{\{lead\.first_name\}\}/g, entity.first_name || '')
      .replace(/\{\{lead\.last_name\}\}/g, entity.last_name || '')
      .replace(/\{\{appointment\.customer_name\}\}/g, entity.customer_name || '')
      .replace(/\{\{appointment\.appointment_time\}\}/g, entity.appointment_time || '')
      .replace(/\{\{appointment\.appointment_date\}\}/g, entity.appointment_date || '')
      .replace(/\{\{school\.name\}\}/g, school.name || '');
  }
}

module.exports = KanchoAutomationEngine;
