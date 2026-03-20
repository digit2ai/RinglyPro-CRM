// routes/agents.js
// FreightMind AI — Agent Execution API
const express = require('express');
const router = express.Router();
const { getAgent, getAllAgents } = require('../services/agent-framework.cw');
const sequelize = require('../services/db.cw');

// GET /api/agents — List all registered agents and their status
router.get('/', (req, res) => {
  try {
    const agents = getAllAgents();
    res.json({ success: true, data: { agents, count: agents.length } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/log — Agent activity log with filters
router.get('/log', async (req, res) => {
  try {
    const { agent_name, tool_name, success, limit = 50, offset = 0 } = req.query;
    let where = 'WHERE 1=1';
    const binds = [];
    let bindIdx = 1;

    if (agent_name) { where += ` AND agent_name = $${bindIdx++}`; binds.push(agent_name); }
    if (tool_name) { where += ` AND tool_name = $${bindIdx++}`; binds.push(tool_name); }
    if (success !== undefined) { where += ` AND success = $${bindIdx++}`; binds.push(success === 'true'); }

    const [rows] = await sequelize.query(
      `SELECT id, agent_name, tool_name, duration_ms, success, error, created_at
       FROM lg_agent_log ${where}
       ORDER BY created_at DESC LIMIT $${bindIdx++} OFFSET $${bindIdx++}`,
      { bind: [...binds, parseInt(limit), parseInt(offset)] }
    );

    const [countResult] = await sequelize.query(
      `SELECT COUNT(*)::int as total FROM lg_agent_log ${where}`,
      { bind: binds }
    );

    res.json({ success: true, data: { logs: rows, total: countResult[0].total, limit: parseInt(limit), offset: parseInt(offset) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:agentName/status — Get specific agent status
router.get('/:agentName/status', (req, res) => {
  try {
    const agent = getAgent(req.params.agentName);
    if (!agent) return res.status(404).json({ error: `Agent ${req.params.agentName} not found` });
    res.json({ success: true, data: agent.getStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/:agentName/tools/call — Execute a specific tool on an agent
router.post('/:agentName/tools/call', async (req, res) => {
  try {
    const agent = getAgent(req.params.agentName);
    if (!agent) return res.status(404).json({ error: `Agent ${req.params.agentName} not found` });

    const { tool, input } = req.body;
    if (!tool) return res.status(400).json({ error: 'tool name required' });

    const result = await agent.executeTool(tool, input || {});
    res.json({ success: true, data: { agent: req.params.agentName, tool, result } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/agents/:agentName/run — Run agent with natural language prompt
router.post('/:agentName/run', async (req, res) => {
  try {
    const agent = getAgent(req.params.agentName);
    if (!agent) return res.status(404).json({ error: `Agent ${req.params.agentName} not found` });

    const { prompt, context } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const result = await agent.run(prompt, context || {});
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/agents/orchestrate — Trigger the orchestrator with an event
router.post('/orchestrate', async (req, res) => {
  try {
    const orchestrator = getAgent('orchestrator');
    if (!orchestrator) return res.status(503).json({ error: 'Orchestrator agent not initialized' });

    const { event, data } = req.body;
    if (!event) return res.status(400).json({ error: 'event required' });

    const result = await orchestrator.executeTool('orchestrate_event', { event, ...data });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/agents/audit — Audit trail of AI decisions
router.get('/audit', async (req, res) => {
  try {
    const { agent_name, entity_type, limit = 50, offset = 0 } = req.query;
    let where = 'WHERE 1=1';
    const binds = [];
    let bindIdx = 1;

    if (agent_name) { where += ` AND agent_name = $${bindIdx++}`; binds.push(agent_name); }
    if (entity_type) { where += ` AND entity_type = $${bindIdx++}`; binds.push(entity_type); }

    const [rows] = await sequelize.query(
      `SELECT id, agent_name, action_type, entity_type, entity_id, decision, reasoning, confidence, human_override, created_at
       FROM lg_audit_trail ${where}
       ORDER BY created_at DESC LIMIT $${bindIdx++} OFFSET $${bindIdx++}`,
      { bind: [...binds, parseInt(limit), parseInt(offset)] }
    );

    res.json({ success: true, data: { audit: rows, limit: parseInt(limit), offset: parseInt(offset) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
