'use strict';

// Task Agent Loop v1 — HTTP surface.
// All routes mount under /api/v1/agents. Worker tick is idempotent
// (SELECT ... FOR UPDATE SKIP LOCKED) so two concurrent ticks cannot
// process the same row twice.

const express = require('express');
const router = express.Router();
const { sequelize, Task, Project } = require('../models');
const dispatcher = require('../services/agents/dispatcher');
const inboxTriageAgent = require('../services/agents/inboxTriageAgent');
const classifier = require('../services/agents/classifier');

// GET /api/v1/agents/health
router.get('/health', async (_req, res) => {
  let queue_depth = 0;
  try {
    const [r] = await sequelize.query(
      "SELECT COUNT(*)::int AS n FROM d2_tasks WHERE workspace_id = 1 AND agent_status IN ('pending','processing')"
    );
    queue_depth = (r && r[0] && r[0].n) || 0;
  } catch (_) {}
  res.json({
    success: true,
    anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
    brave_configured: !!process.env.BRAVE_SEARCH_API_KEY,
    queue_depth
  });
});

// GET /api/v1/agents/queue
router.get('/queue', async (_req, res) => {
  try {
    const rows = await Task.findAll({
      where: { workspace_id: 1, agent_status: ['pending', 'processing'] },
      order: [['updated_at', 'ASC']],
      limit: 100
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/agents/worker/tick
// Pulls up to 5 pending rows under FOR UPDATE SKIP LOCKED, flips them to
// 'processing' in the same transaction, then dispatches outside the
// transaction so the Claude calls do not hold a lock for ~30s.
router.post('/worker/tick', async (_req, res) => {
  const claimed = [];
  try {
    await sequelize.transaction(async (t) => {
      const [rows] = await sequelize.query(
        `SELECT id FROM d2_tasks
         WHERE workspace_id = 1 AND agent_status = 'pending' AND agent_type IS NOT NULL
         ORDER BY updated_at ASC
         LIMIT 5
         FOR UPDATE SKIP LOCKED`,
        { transaction: t }
      );
      const ids = (rows || []).map(r => r.id);
      if (!ids.length) return;
      await sequelize.query(
        `UPDATE d2_tasks SET agent_status = 'processing', updated_at = NOW()
         WHERE id IN (:ids) AND workspace_id = 1`,
        { replacements: { ids }, transaction: t }
      );
      claimed.push(...ids);
    });
  } catch (err) {
    console.error('[agents] worker tick claim error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
  if (!claimed.length) return res.json({ success: true, processed: 0, message: 'queue empty' });

  // Dispatch outside the transaction so we do not hold row locks during Claude calls
  const results = [];
  for (const id of claimed) {
    try {
      const r = await dispatcher.processTaskById(id);
      results.push({ id, ...r });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
      // Mark failed in case dispatcher itself threw before updating
      try {
        await Task.update(
          { agent_status: 'failed', agent_error: err.message, agent_processed_at: new Date() },
          { where: { id, workspace_id: 1 } }
        );
      } catch (_) {}
    }
  }
  res.json({ success: true, processed: results.length, results });
});

// POST /api/v1/agents/run/:taskId
// Manual trigger. Body: { agent_type? } overrides the classifier.
router.post('/run/:taskId', async (req, res) => {
  const id = parseInt(req.params.taskId, 10);
  const explicit = req.body && req.body.agent_type;
  try {
    if (explicit) {
      await dispatcher.setAgentTypeAndQueue(id, explicit);
    } else {
      // Reset + classify
      const task = await Task.findOne({ where: { id, workspace_id: 1 } });
      if (!task) return res.status(404).json({ success: false, error: 'task_not_found' });
      await task.update({ agent_status: null, agent_type: null, agent_output: null, agent_structured: null, agent_error: null });
      const chosen = await classifier.classifyAndQueue(id);
      if (!chosen) return res.json({ success: true, agent_type: null, status: 'skipped', message: 'classifier returned no agent for this task' });
    }
    // Run inline so the caller gets the result without waiting on the cron tick
    const r = await dispatcher.processTaskById(id);
    res.json({ success: true, ...r });
  } catch (err) {
    console.error('[agents] /run error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/agents/approve/:taskId
// Body: { merge_into_description?: bool }
router.post('/approve/:taskId', async (req, res) => {
  try {
    const id = parseInt(req.params.taskId, 10);
    const task = await Task.findOne({ where: { id, workspace_id: 1 } });
    if (!task) return res.status(404).json({ success: false, error: 'task_not_found' });
    const updates = { agent_status: 'approved' };
    if (req.body && req.body.merge_into_description && task.agent_output) {
      const old = task.description || '';
      const stamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      updates.description = (old ? old + '\n\n' : '') + `--- AI Agent output (approved ${stamp}) ---\n` + task.agent_output;
    }
    await task.update(updates);
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/agents/reject/:taskId
// Body: { reason?: string }
router.post('/reject/:taskId', async (req, res) => {
  try {
    const id = parseInt(req.params.taskId, 10);
    const task = await Task.findOne({ where: { id, workspace_id: 1 } });
    if (!task) return res.status(404).json({ success: false, error: 'task_not_found' });
    const reason = (req.body && req.body.reason) || 'rejected by user';
    await task.update({ agent_status: 'rejected', agent_error: String(reason).slice(0, 2000) });
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/agents/triage/:projectId — manual rerun of triage
router.post('/triage/:projectId', async (req, res) => {
  try {
    const id = parseInt(req.params.projectId, 10);
    const project = await Project.findOne({ where: { id, workspace_id: 1 } });
    if (!project) return res.status(404).json({ success: false, error: 'project_not_found' });
    const r = await inboxTriageAgent.run({ project });
    if (!r.ok) return res.status(500).json({ success: false, error: r.error, partial: r.structured });
    res.json({ success: true, fit_score: r.structured.fit_score, recommendation: r.structured.go_no_go_recommendation, cost_usd: r.cost_estimate_usd });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
