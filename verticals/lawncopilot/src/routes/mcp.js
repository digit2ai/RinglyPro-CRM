'use strict';

/**
 * Lawn Co-Pilot — Brain MCP server endpoints
 *
 * The single door every AI employee capability goes through. External callers
 * authenticate with LAWNCOPILOT_MCP_KEY; browser sessions use their session
 * cookie. Authorization is enforced in the Brain, not here and not in a prompt.
 */

const express = require('express');
const router = express.Router();
const brain = require('../mcp/brain');
const { sequelize } = require('../models');

const DEFAULT_TENANT = () => Number(process.env.LAWNCOPILOT_TENANT_ID || 1);

function externalAuth(req) {
  const key = process.env.LAWNCOPILOT_MCP_KEY;
  if (!key) return { ok: false, reason: 'external MCP access is not configured' };
  const given = req.headers['x-mcp-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return given === key ? { ok: true } : { ok: false, reason: 'invalid MCP key' };
}

// Resolve who is calling. Staff session > customer session > external key.
function resolveContext(req) {
  if (req.staff) {
    return { tenant_id: req.staff.tenant_id, channel: 'admin', role: req.staff.role, actor: `user:${req.staff.id}`, user_id: req.staff.id };
  }
  if (req.customer) {
    return {
      tenant_id: req.customer.tenant_id, channel: 'portal', customer_id: req.customer.id,
      actor: `customer:${req.customer.id}`, identity_verified: true
    };
  }
  const ext = externalAuth(req);
  if (ext.ok) {
    return {
      tenant_id: Number(req.body.tenant_id || req.query.tenant_id || DEFAULT_TENANT()),
      channel: (req.body.context && req.body.context.channel) || 'system',
      role: 'admin', actor: 'external_mcp'
    };
  }
  return null;
}

router.get('/health', async (req, res) => {
  let db = 'unknown';
  try { await sequelize.authenticate(); db = 'ok'; } catch (e) { db = 'error: ' + e.message; }
  res.json({
    status: db === 'ok' ? 'ok' : 'degraded',
    service: 'Lawn Co-Pilot Brain (MCP)',
    db,
    employees: brain.listEmployees().length,
    tools: Object.keys(brain.REGISTRY).length,
    version: '1.0.0'
  });
});

router.get('/employees', (req, res) => {
  res.json({ success: true, employees: brain.listEmployees() });
});

router.get('/tools/list', (req, res) => {
  const channel = req.query.channel || null;
  const role = req.query.role || null;
  const tools = brain.listTools({ channel, role });
  res.json({
    success: true,
    count: tools.length,
    namespaces: ['receptionist', 'estimator', 'dispatcher', 'administrator'],
    tools
  });
});

router.post('/tools/call', async (req, res) => {
  const { tool, arguments: args } = req.body || {};
  if (!tool) return res.status(400).json({ success: false, error: 'tool is required' });

  const ctx = resolveContext(req);
  if (!ctx) {
    return res.status(401).json({ success: false, error: 'Not authorized to call the Brain' });
  }

  // A caller-supplied session_id is allowed (it groups the audit trail) but
  // tenant_id is NEVER taken from the request body when a session exists.
  const context = {
    ...ctx,
    session_id: (req.body.context && req.body.context.session_id) || null,
    channel: (req.body.context && req.body.context.channel && ctx.channel === 'system')
      ? req.body.context.channel : ctx.channel
  };

  const result = await brain.callTool(tool, args || {}, context);
  const code = result.success === false && /not authorized|forbidden/i.test(result.error || '') ? 403 : 200;
  res.status(code).json(result);
});

module.exports = router;
