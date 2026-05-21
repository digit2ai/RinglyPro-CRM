'use strict';

// Dispatcher — given a task row whose agent_status='pending', looks up
// the agent module by agent_type, runs it with task + linked project,
// and writes the result back to the row (status transitions, output_md,
// structured JSON, cost, model, errors).
//
// Used by the worker tick endpoint and the manual /run endpoint.

const { Task, Project } = require('../../models');
const researchBriefAgent = require('./researchBriefAgent');
const outreachDrafterAgent = require('./outreachDrafterAgent');
const inboxTriageAgent = require('./inboxTriageAgent');

const AGENT_MAP = {
  research: researchBriefAgent,
  draft:    outreachDrafterAgent,
  triage:   inboxTriageAgent
};

// Process one task by id. Caller is expected to have already flipped
// status to 'processing' (the worker does this in the SELECT FOR UPDATE
// transaction). Returns { ok, agent_type, status, error? }.
async function processTaskById(taskId) {
  const task = await Task.findOne({ where: { id: taskId, workspace_id: 1 } });
  if (!task) return { ok: false, error: 'task_not_found' };
  const agentType = task.agent_type;
  const agent = AGENT_MAP[agentType];
  if (!agent) {
    await task.update({ agent_status: 'failed', agent_error: 'no_agent_for_type:' + agentType, agent_processed_at: new Date() });
    return { ok: false, error: 'no_agent_for_type' };
  }
  let project = null;
  if (task.project_id) {
    try { project = await Project.findOne({ where: { id: task.project_id, workspace_id: 1 } }); } catch (_) {}
  }
  let result;
  try {
    result = await agent.run({ task, project });
  } catch (err) {
    result = { ok: false, error: err.message, output_md: '', structured: null, cost_estimate_usd: 0, model: agent.SONNET_MODEL || 'unknown' };
  }
  const update = {
    agent_processed_at: new Date(),
    agent_model: result.model || null,
    agent_cost_usd: result.cost_estimate_usd || 0
  };
  if (result.ok) {
    update.agent_status = 'ready_for_review';
    update.agent_output = result.output_md || '';
    update.agent_structured = result.structured || null;
    update.agent_error = null;
  } else {
    update.agent_status = 'failed';
    update.agent_error = String(result.error || 'unknown').slice(0, 2000);
    if (result.structured) update.agent_structured = result.structured;
  }
  await task.update(update);
  return { ok: result.ok, agent_type: agentType, status: update.agent_status, error: result.error || null };
}

// Manually override the agent_type for a task and queue it for processing
// (used by POST /api/v1/agents/run/:taskId?type=...)
async function setAgentTypeAndQueue(taskId, agentType) {
  if (!AGENT_MAP[agentType]) throw new Error('unsupported agent_type: ' + agentType);
  const task = await Task.findOne({ where: { id: taskId, workspace_id: 1 } });
  if (!task) throw new Error('task_not_found');
  await task.update({
    agent_type: agentType,
    agent_status: 'pending',
    agent_output: null,
    agent_structured: null,
    agent_error: null,
    agent_processed_at: null
  });
  return task;
}

module.exports = { processTaskById, setAgentTypeAndQueue, AGENT_MAP };
