'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// Built-in automation templates
const AUTOMATION_TEMPLATES = [
  {
    name: 'New Lead Follow-Up',
    type: 'lead_followup',
    trigger_type: 'event',
    trigger_config: { event: 'lead_created', delay_minutes: 5 },
    actions: [
      { type: 'sms', config: { template: 'Hi {{lead.first_name}}, thanks for your interest in {{school.name}}! Would you like to schedule a free trial class?' } },
      { type: 'task', config: { title: 'Follow up with {{lead.first_name}} {{lead.last_name}}', type: 'follow_up', priority: 'high', due_days: 1 } }
    ]
  },
  {
    name: 'Trial Class Reminder',
    type: 'trial_booking',
    trigger_type: 'schedule',
    trigger_config: { event: 'appointment_upcoming', hours_before: 24 },
    actions: [
      { type: 'sms', config: { template: 'Hi {{appointment.customer_name}}, reminder: your trial class at {{school.name}} is tomorrow at {{appointment.appointment_time}}. See you there!' } }
    ]
  },
  {
    name: 'Attendance Drop Alert',
    type: 'retention',
    trigger_type: 'condition',
    trigger_config: { condition: 'student_missed_classes', threshold: 3, period_days: 14 },
    actions: [
      { type: 'call', config: { agent: 'kancho', call_type: 'retention', script: 'Check in with student about missed classes' } },
      { type: 'task', config: { title: 'Retention: {{student.first_name}} missed 3+ classes', type: 'retention', priority: 'high', due_days: 1 } }
    ]
  },
  {
    name: 'Payment Reminder',
    type: 'payment_reminder',
    trigger_type: 'condition',
    trigger_config: { condition: 'payment_past_due', days_overdue: 3 },
    actions: [
      { type: 'sms', config: { template: 'Hi {{student.first_name}}, your payment for {{school.name}} is past due. Please update your payment method or contact us.' } },
      { type: 'task', config: { title: 'Past due: {{student.first_name}} {{student.last_name}}', type: 'billing', priority: 'high', due_days: 0 } }
    ]
  },
  {
    name: 'Win-Back Campaign',
    type: 'reactivation',
    trigger_type: 'condition',
    trigger_config: { condition: 'student_cancelled', days_since: 30 },
    actions: [
      { type: 'call', config: { agent: 'kancho', call_type: 'winback', script: 'Reach out to former student with re-enrollment offer' } },
      { type: 'sms', config: { template: 'Hi {{student.first_name}}, we miss you at {{school.name}}! Come back and get your first month at 50% off.' } }
    ]
  },
  {
    name: 'Birthday Greeting',
    type: 'custom',
    trigger_type: 'schedule',
    trigger_config: { condition: 'student_birthday', days_before: 0 },
    actions: [
      { type: 'sms', config: { template: 'Happy Birthday {{student.first_name}}! From all of us at {{school.name}}, have an amazing day!' } }
    ]
  },
  {
    name: 'Belt Promotion Congratulations',
    type: 'belt_promotion',
    trigger_type: 'event',
    trigger_config: { event: 'belt_rank_updated' },
    actions: [
      { type: 'sms', config: { template: 'Congratulations {{student.first_name}}! You earned your {{student.belt_rank}} belt at {{school.name}}!' } }
    ]
  },
  {
    name: 'Welcome New Student',
    type: 'welcome',
    trigger_type: 'event',
    trigger_config: { event: 'student_enrolled' },
    actions: [
      { type: 'sms', config: { template: 'Welcome to {{school.name}}, {{student.first_name}}! We are excited to have you. Your journey begins now!' } },
      { type: 'task', config: { title: 'Onboarding: Welcome {{student.first_name}}', type: 'onboarding', priority: 'medium', due_days: 0 } }
    ]
  }
];

// GET / - List automations
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const where = { school_id: schoolId };
    if (req.query.type) where.type = req.query.type;
    if (req.query.active !== undefined) where.is_active = req.query.active === 'true';

    const automations = await kanchoModels.KanchoAutomation.findAll({ where, order: [['type', 'ASC'], ['name', 'ASC']] });
    res.json({ success: true, data: automations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /templates - Get built-in templates
router.get('/templates', (req, res) => {
  res.json({ success: true, data: AUTOMATION_TEMPLATES });
});

// POST / - Create automation
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const automation = await kanchoModels.KanchoAutomation.create({
      school_id: schoolId,
      name: req.body.name,
      type: req.body.type,
      trigger_type: req.body.trigger_type,
      trigger_config: req.body.trigger_config,
      actions: req.body.actions,
      is_active: req.body.is_active !== false
    });
    res.status(201).json({ success: true, data: automation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /install-template - Install a template automation
router.post('/install-template', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const template = AUTOMATION_TEMPLATES.find(t => t.type === req.body.template_type);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const existing = await kanchoModels.KanchoAutomation.findOne({ where: { school_id: schoolId, type: template.type } });
    if (existing) return res.status(409).json({ success: false, error: 'Automation already installed', data: existing });

    const automation = await kanchoModels.KanchoAutomation.create({
      school_id: schoolId,
      ...template
    });
    res.status(201).json({ success: true, data: automation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /install-all - Install all template automations for a school
router.post('/install-all', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const installed = [];
    for (const template of AUTOMATION_TEMPLATES) {
      const existing = await kanchoModels.KanchoAutomation.findOne({ where: { school_id: schoolId, type: template.type } });
      if (!existing) {
        const automation = await kanchoModels.KanchoAutomation.create({ school_id: schoolId, ...template });
        installed.push(automation);
      }
    }
    res.json({ success: true, data: installed, message: `${installed.length} automations installed` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update automation
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const automation = await kanchoModels.KanchoAutomation.findByPk(req.params.id);
    if (!automation) return res.status(404).json({ success: false, error: 'Automation not found' });

    const allowed = ['name', 'type', 'trigger_type', 'trigger_config', 'actions', 'is_active'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await automation.update(updates);
    res.json({ success: true, data: automation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/toggle - Toggle automation on/off
router.post('/:id/toggle', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const automation = await kanchoModels.KanchoAutomation.findByPk(req.params.id);
    if (!automation) return res.status(404).json({ success: false, error: 'Automation not found' });
    await automation.update({ is_active: !automation.is_active, updated_at: new Date() });
    res.json({ success: true, data: automation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete automation
router.delete('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const automation = await kanchoModels.KanchoAutomation.findByPk(req.params.id);
    if (!automation) return res.status(404).json({ success: false, error: 'Automation not found' });
    await automation.destroy();
    res.json({ success: true, message: 'Automation deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
