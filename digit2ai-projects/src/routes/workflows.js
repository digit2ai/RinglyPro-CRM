'use strict';

const express = require('express');
const router = express.Router();
const { Workflow, WorkflowRun, Contact, PipelineHistory, EmailCampaign, sequelize } = require('../models');
const { logActivity } = require('../services/activityService');

/*
  Workflow step format:
  {
    type: 'change_stage' | 'send_email' | 'wait' | 'condition' | 'notify' | 'tag',
    config: {
      // For change_stage: { stage: 'warm_lead' }
      // For send_email: { campaign_id: 5 } or { subject, body_html }
      // For wait: { days: 3 }
      // For condition: { field: 'last_email_event', operator: 'equals', value: 'open', yes_step: 3, no_step: 5 }
      // For notify: { message: '...' }
      // For tag: { add: ['vip'], remove: [] }
    }
  }
*/

// GET /api/v1/workflows — List workflows
router.get('/', async (req, res) => {
  try {
    const workflows = await Workflow.findAll({
      where: { workspace_id: 1 },
      order: [['created_at', 'DESC']]
    });

    // Add run counts
    const data = [];
    for (const wf of workflows) {
      const activeRuns = await WorkflowRun.count({ where: { workflow_id: wf.id, status: 'active' } });
      const completedRuns = await WorkflowRun.count({ where: { workflow_id: wf.id, status: 'completed' } });
      data.push({ ...wf.toJSON(), active_runs: activeRuns, completed_runs: completedRuns });
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/workflows/:id — Workflow detail with runs
router.get('/:id', async (req, res) => {
  try {
    const workflow = await Workflow.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!workflow) return res.status(404).json({ success: false, error: 'Workflow not found' });

    const runs = await WorkflowRun.findAll({
      where: { workflow_id: workflow.id },
      include: [{ model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name', 'email', 'pipeline_stage'] }],
      order: [['created_at', 'DESC']],
      limit: 100
    });

    res.json({ success: true, data: { ...workflow.toJSON(), runs } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/workflows — Create workflow
router.post('/', async (req, res) => {
  try {
    const data = { workspace_id: 1, ...req.body };
    const workflow = await Workflow.create(data);
    await logActivity(req.user?.email, 'created', 'workflow', workflow.id, workflow.name);
    res.status(201).json({ success: true, data: workflow });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/workflows/:id — Update workflow
router.put('/:id', async (req, res) => {
  try {
    const workflow = await Workflow.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!workflow) return res.status(404).json({ success: false, error: 'Workflow not found' });
    await workflow.update(req.body);
    res.json({ success: true, data: workflow });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/workflows/:id
router.delete('/:id', async (req, res) => {
  try {
    const workflow = await Workflow.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!workflow) return res.status(404).json({ success: false, error: 'Workflow not found' });
    await WorkflowRun.destroy({ where: { workflow_id: workflow.id } });
    await workflow.destroy();
    res.json({ success: true, message: 'Workflow deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/workflows/:id/enroll — Enroll contacts into workflow
router.post('/:id/enroll', async (req, res) => {
  try {
    const workflow = await Workflow.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!workflow) return res.status(404).json({ success: false, error: 'Workflow not found' });
    if (!workflow.active) return res.status(400).json({ success: false, error: 'Workflow is inactive' });

    const { contact_ids } = req.body;
    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'contact_ids array required' });
    }

    let enrolled = 0;
    for (const contactId of contact_ids) {
      // Skip if already in this workflow
      const existing = await WorkflowRun.findOne({
        where: { workflow_id: workflow.id, contact_id: contactId, status: 'active' }
      });
      if (existing) continue;

      const nextActionAt = calculateNextAction(workflow.steps, 0);
      await WorkflowRun.create({
        workflow_id: workflow.id,
        contact_id: contactId,
        current_step: 0,
        status: 'active',
        next_action_at: nextActionAt
      });

      await Contact.update({ workflow_id: workflow.id }, { where: { id: contactId } });
      enrolled++;
    }

    res.json({ success: true, enrolled, total: contact_ids.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/workflows/process — Process pending workflow steps (called by cron)
router.post('/process', async (req, res) => {
  try {
    const now = new Date();
    const pendingRuns = await WorkflowRun.findAll({
      where: {
        status: 'active',
        next_action_at: { [sequelize.Sequelize.Op.lte]: now }
      },
      include: [
        { model: Workflow, as: 'workflow' },
        { model: Contact, as: 'contact' }
      ],
      limit: 100
    });

    let processed = 0;
    for (const run of pendingRuns) {
      if (!run.workflow || !run.contact) continue;
      const steps = run.workflow.steps || [];
      if (run.current_step >= steps.length) {
        await run.update({ status: 'completed', completed_at: new Date() });
        continue;
      }

      const step = steps[run.current_step];
      await executeStep(run, step);
      processed++;
    }

    res.json({ success: true, processed });
  } catch (error) {
    console.error('[D2AI] Workflow process error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/workflows/seed-default — Create the default prospecting workflow
router.post('/seed-default', async (req, res) => {
  try {
    const existing = await Workflow.findOne({ where: { name: 'Prospecting Pipeline', workspace_id: 1 } });
    if (existing) return res.json({ success: true, data: existing, message: 'Already exists' });

    const workflow = await Workflow.create({
      workspace_id: 1,
      name: 'Prospecting Pipeline',
      description: 'Automatic prospecting workflow: sends intro email, tracks engagement, and advances contacts through the pipeline based on their activity.',
      trigger_type: 'on_import',
      active: true,
      steps: [
        { type: 'change_stage', config: { stage: 'prospect' }, label: 'Set as Prospect' },
        { type: 'wait', config: { days: 1 }, label: 'Wait 1 day' },
        { type: 'notify', config: { message: 'New prospects ready for outreach' }, label: 'Notify team' },
        { type: 'wait', config: { days: 3 }, label: 'Wait 3 days for email engagement' },
        { type: 'condition', config: { field: 'last_email_event', operator: 'equals', value: 'open', yes_step: 5, no_step: 7 }, label: 'Check if email opened' },
        { type: 'change_stage', config: { stage: 'lead' }, label: 'Mark as Lead (opened email)' },
        { type: 'wait', config: { days: 3 }, label: 'Wait for more engagement' },
        { type: 'condition', config: { field: 'last_email_event', operator: 'equals', value: 'click', yes_step: 8, no_step: 9 }, label: 'Check if clicked' },
        { type: 'change_stage', config: { stage: 'warm_lead' }, label: 'Mark as Warm Lead (clicked)' },
        { type: 'condition', config: { field: 'pipeline_stage', operator: 'equals', value: 'prospect', yes_step: 10, no_step: 11 }, label: 'Still a prospect?' },
        { type: 'change_stage', config: { stage: 'cold_lead' }, label: 'Mark as Cold Lead (no engagement)' },
        { type: 'notify', config: { message: 'Workflow complete — review pipeline' }, label: 'Done' }
      ]
    });

    res.status(201).json({ success: true, data: workflow });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// === HELPERS ===

function calculateNextAction(steps, stepIndex) {
  if (!steps || stepIndex >= steps.length) return null;
  const step = steps[stepIndex];
  if (step.type === 'wait' && step.config?.days) {
    const next = new Date();
    next.setDate(next.getDate() + step.config.days);
    return next;
  }
  return new Date(); // Execute immediately
}

async function executeStep(run, step) {
  const contact = run.contact;
  const steps = run.workflow.steps || [];

  try {
    switch (step.type) {
      case 'change_stage': {
        const newStage = step.config?.stage;
        if (newStage && contact.pipeline_stage !== newStage) {
          const from = contact.pipeline_stage;
          await contact.update({ pipeline_stage: newStage, last_interaction_date: new Date() });
          await PipelineHistory.create({
            workspace_id: 1, contact_id: contact.id,
            from_stage: from, to_stage: newStage,
            trigger_type: 'workflow', trigger_detail: `Workflow: ${run.workflow.name}`
          });
        }
        await advanceRun(run, steps);
        break;
      }

      case 'wait': {
        // Move to next step and set next_action_at
        const nextStep = run.current_step + 1;
        if (nextStep >= steps.length) {
          await run.update({ status: 'completed', completed_at: new Date() });
        } else {
          const nextAction = calculateNextAction(steps, run.current_step);
          await run.update({ current_step: nextStep, next_action_at: nextAction || new Date() });
        }
        break;
      }

      case 'condition': {
        const { field, operator, value, yes_step, no_step } = step.config || {};
        const contactVal = contact[field];
        let result = false;

        if (operator === 'equals') result = contactVal === value;
        else if (operator === 'not_equals') result = contactVal !== value;
        else if (operator === 'exists') result = !!contactVal;

        const targetStep = result ? (yes_step || run.current_step + 1) : (no_step || run.current_step + 1);
        if (targetStep >= steps.length) {
          await run.update({ status: 'completed', completed_at: new Date() });
        } else {
          const nextAction = calculateNextAction(steps, targetStep);
          await run.update({ current_step: targetStep, next_action_at: nextAction || new Date() });
        }
        break;
      }

      case 'tag': {
        const { add, remove } = step.config || {};
        let tags = contact.tags || [];
        if (add) tags = [...new Set([...tags, ...add])];
        if (remove) tags = tags.filter(t => !remove.includes(t));
        await contact.update({ tags });
        await advanceRun(run, steps);
        break;
      }

      case 'notify': {
        // Create notification
        const { Notification } = require('../models');
        await Notification.create({
          workspace_id: 1,
          type: 'workflow',
          title: `Workflow: ${run.workflow.name}`,
          message: step.config?.message || 'Workflow step completed',
          entity_type: 'contact',
          entity_id: contact.id
        });
        await advanceRun(run, steps);
        break;
      }

      default:
        await advanceRun(run, steps);
    }
  } catch (e) {
    console.log('[D2AI] Workflow step error:', e.message?.substring(0, 100));
    await advanceRun(run, steps);
  }
}

async function advanceRun(run, steps) {
  const nextStep = run.current_step + 1;
  if (nextStep >= steps.length) {
    await run.update({ status: 'completed', completed_at: new Date() });
  } else {
    const nextAction = calculateNextAction(steps, nextStep);
    await run.update({ current_step: nextStep, next_action_at: nextAction || new Date() });
  }
}

module.exports = router;
