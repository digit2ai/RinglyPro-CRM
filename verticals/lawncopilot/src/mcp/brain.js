'use strict';

/**
 * Lawn Co-Pilot — THE BRAIN (MCP server)
 *
 * One brain, not four. Every AI employee's capability is a tool registered
 * here, and EVERY channel — the landing-page orb, the phone Receptionist, the
 * typed chat, the admin copilot — calls these same tools. No channel gets a
 * private copy of the booking, pricing, or billing logic.
 *
 * What the Brain enforces centrally (so no prompt can talk its way around it):
 *   - role + channel authorization on every call
 *   - tenant scoping injected from session context, never from model arguments
 *   - identity gate: no account data before the caller is identified
 *   - audit trail of every call in lc_agent_calls
 *   - per-tenant daily cost guard
 *   - human-in-the-loop approval queue for flagged tools
 */

const { AgentCall, AgentApproval, AgentSession } = require('../models');

// ── Employee registry ──────────────────────────────────────────────────────
const EMPLOYEES = [
  require('./employees/receptionist'),
  require('./employees/estimator'),
  require('./employees/dispatcher'),
  require('./employees/administrator')
];

const REGISTRY = {};
EMPLOYEES.forEach(emp => {
  Object.keys(emp.tools || {}).forEach(name => {
    REGISTRY[`${emp.id}.${name}`] = { employee: emp, name, ...emp.tools[name] };
  });
});

// ── Channel trust levels ───────────────────────────────────────────────────
// public_web  : anonymous visitor on the landing page
// identified  : gate satisfied (name + phone + email captured)
// customer    : authenticated portal session
// phone       : inbound call, identity confirmed by ANI + one factor
// staff       : authenticated admin user
const CHANNEL_TRUST = {
  web_orb: 'public_web',
  web_chat: 'public_web',
  phone: 'phone',
  portal: 'customer',
  admin: 'staff',
  system: 'staff'
};

const TRUST_ORDER = ['public_web', 'identified', 'phone', 'customer', 'staff'];
function trustAtLeast(actual, required) {
  return TRUST_ORDER.indexOf(actual) >= TRUST_ORDER.indexOf(required);
}

function redact(args) {
  const out = {};
  const SENSITIVE = /(password|card|cvv|token|secret|gate_code|ssn)/i;
  Object.keys(args || {}).forEach(k => {
    if (SENSITIVE.test(k)) { out[k] = '[redacted]'; return; }
    const v = args[k];
    if (typeof v === 'string' && v.length > 400) { out[k] = v.slice(0, 400) + '...'; return; }
    out[k] = v;
  });
  return out;
}

// ── Cost guard ─────────────────────────────────────────────────────────────
async function spentToday(tenant_id) {
  try {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { Op } = require('sequelize');
    const rows = await AgentCall.findAll({
      where: { tenant_id, created_at: { [Op.gte]: since } },
      attributes: ['cost_cents'], raw: true
    });
    return rows.reduce((a, r) => a + (r.cost_cents || 0), 0);
  } catch (e) {
    return 0;
  }
}

async function costGuardOk(tenant_id) {
  const capUsd = Number(process.env.LAWNCOPILOT_AGENT_COST_CAP_USD || 25);
  if (!capUsd) return { ok: true };
  const spent = await spentToday(tenant_id);
  if (spent >= capUsd * 100) {
    return { ok: false, spent_cents: spent, cap_cents: capUsd * 100 };
  }
  return { ok: true, spent_cents: spent, cap_cents: capUsd * 100 };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * The tool catalog for a caller.
 *
 * identity_verified MUST be passed for a live session, or every
 * 'identified'-trust tool is filtered out and the agent is handed a toolset it
 * cannot do its job with — which is how a Receptionist ends up taking a message
 * instead of quoting. Effective trust is computed exactly as callTool does.
 */
function listTools({ channel, role, identity_verified } = {}) {
  const base = CHANNEL_TRUST[channel] || 'public_web';
  const trust = (base === 'public_web' && identity_verified) ? 'identified' : base;
  return Object.keys(REGISTRY)
    .map(full => {
      const t = REGISTRY[full];
      const allowed =
        (!t.channels || t.channels.includes(channel) || !channel) &&
        (!t.min_trust || trustAtLeast(trust, t.min_trust)) &&
        (!t.roles || !role || t.roles.includes(role));
      return {
        name: full,
        employee: t.employee.id,
        employee_name: t.employee.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {} },
        min_trust: t.min_trust || 'public_web',
        requires_approval: !!t.requires_approval,
        available: allowed
      };
    })
    .filter(t => (channel ? t.available : true));
}

function listEmployees() {
  return EMPLOYEES.map(e => ({
    id: e.id,
    name: e.name,
    role: e.role,
    replaces: e.replaces,
    channels: e.channels,
    supervisor_role: e.supervisor_role,
    tool_count: Object.keys(e.tools || {}).length,
    tools: Object.keys(e.tools || {}).map(t => `${e.id}.${t}`),
    enabled: e.enabled !== false
  }));
}

function getEmployee(id) {
  return EMPLOYEES.find(e => e.id === id) || null;
}

/**
 * THE gateway. Everything an AI employee does goes through here.
 *
 * context = { tenant_id, channel, actor, session_id, role, customer_id,
 *             identity_verified, user_id }
 */
async function callTool(toolName, args = {}, context = {}) {
  const started = Date.now();
  const tenant_id = context.tenant_id;
  const channel = context.channel || 'system';
  const tool = REGISTRY[toolName];

  const fail = async (error, extra = {}) => {
    await audit({ tenant_id, context, toolName, args, success: false, error, latency: Date.now() - started });
    return { success: false, error, ...extra };
  };

  if (!tool) return fail(`Unknown tool: ${toolName}`);
  if (!tenant_id) return fail('Missing tenant context');
  if (tool.employee.enabled === false) {
    return fail(`${tool.employee.name} is currently switched off by the operator.`);
  }

  // Authorization — enforced HERE, not in a prompt.
  const trust = CHANNEL_TRUST[channel] || 'public_web';
  const effectiveTrust = (trust === 'public_web' && context.identity_verified) ? 'identified' : trust;

  if (tool.channels && !tool.channels.includes(channel)) {
    return fail(`${toolName} is not available on the ${channel} channel`, { code: 'channel_forbidden' });
  }
  if (tool.min_trust && !trustAtLeast(effectiveTrust, tool.min_trust)) {
    return fail(
      `Not authorized: ${toolName} requires ${tool.min_trust} access (this session is ${effectiveTrust})`,
      { code: 'forbidden' }
    );
  }
  if (tool.roles && context.role && !tool.roles.includes(context.role)) {
    return fail(`Not authorized: ${toolName} requires one of [${tool.roles.join(', ')}]`, { code: 'role_forbidden' });
  }

  // Cost guard.
  const guard = await costGuardOk(tenant_id);
  if (!guard.ok && channel !== 'admin') {
    return fail('Daily AI budget reached for this account. Typed self-service is still available.', { code: 'cost_cap' });
  }

  // Tenant is ALWAYS injected from session context — a model cannot supply it.
  const safeArgs = { ...args };
  delete safeArgs.tenant_id;

  // Approval gate.
  if (tool.requires_approval) {
    const approval = await AgentApproval.create({
      tenant_id, session_id: context.session_id || null,
      employee: tool.employee.id, tool: toolName,
      arguments: redact(safeArgs), reason: tool.approval_reason || 'Requires human approval',
      status: 'pending'
    });
    await audit({ tenant_id, context, toolName, args: safeArgs, success: true, latency: Date.now() - started, requires_approval: true });
    return {
      success: true, requires_approval: true, approval_id: approval.id,
      message: 'This needs a quick sign-off from the team before it goes through. It is in the approval queue now.'
    };
  }

  // Execute.
  try {
    const result = await tool.handler(safeArgs, { ...context, tenant_id });
    await audit({
      tenant_id, context, toolName, args: safeArgs,
      success: result && result.success !== false,
      error: result && result.error ? String(result.error) : null,
      latency: Date.now() - started,
      cost: tool.cost_cents || 0
    });
    return result;
  } catch (e) {
    return fail(e.message);
  }
}

async function audit({ tenant_id, context, toolName, args, success, error, latency, cost = 0, requires_approval = false }) {
  try {
    const emp = (REGISTRY[toolName] || {}).employee;
    await AgentCall.create({
      tenant_id,
      session_id: (context && context.session_id) || null,
      employee: emp ? emp.id : 'unknown',
      tool: toolName,
      channel: (context && context.channel) || null,
      actor: (context && context.actor) || null,
      arguments: redact(args),
      success: !!success,
      error: error || null,
      requires_approval,
      latency_ms: latency,
      cost_cents: cost
    });
  } catch (e) {
    // Auditing must never break the call it is auditing.
  }
}

/**
 * Execute a previously parked approval.
 */
async function executeApproval({ tenant_id, approval_id, user_id, approve }) {
  const a = await AgentApproval.findOne({ where: { id: approval_id, tenant_id } });
  if (!a) return { success: false, error: 'Approval not found' };
  if (a.status !== 'pending') return { success: false, error: `Already ${a.status}` };

  a.decided_by = user_id || null;
  a.decided_at = new Date();

  if (!approve) {
    a.status = 'rejected';
    await a.save();
    return { success: true, status: 'rejected' };
  }

  const tool = REGISTRY[a.tool];
  if (!tool) { a.status = 'rejected'; await a.save(); return { success: false, error: 'Tool no longer exists' }; }

  try {
    const result = await tool.handler(a.arguments || {}, { tenant_id, channel: 'admin', actor: `user:${user_id}`, role: 'admin' });
    a.status = 'executed';
    a.result = result;
    await a.save();
    return { success: true, status: 'executed', result };
  } catch (e) {
    a.status = 'approved';
    a.result = { error: e.message };
    await a.save();
    return { success: false, error: e.message };
  }
}

/**
 * Today's activity, per employee. Drives the admin AI Staff screen.
 */
async function staffActivity({ tenant_id, days = 1 }) {
  const { Op } = require('sequelize');
  const since = new Date(Date.now() - days * 86400000);
  const calls = await AgentCall.findAll({
    where: { tenant_id, created_at: { [Op.gte]: since } },
    order: [['created_at', 'DESC']], limit: 500, raw: true
  });
  const pending = await AgentApproval.count({ where: { tenant_id, status: 'pending' } });

  const byEmployee = {};
  EMPLOYEES.forEach(e => {
    byEmployee[e.id] = {
      id: e.id, name: e.name, role: e.role, replaces: e.replaces,
      enabled: e.enabled !== false,
      calls: 0, failures: 0, cost_cents: 0, avg_latency_ms: 0, tools_used: {}
    };
  });
  let latencySum = {};
  calls.forEach(c => {
    const e = byEmployee[c.employee];
    if (!e) return;
    e.calls++;
    if (!c.success) e.failures++;
    e.cost_cents += c.cost_cents || 0;
    e.tools_used[c.tool] = (e.tools_used[c.tool] || 0) + 1;
    latencySum[c.employee] = (latencySum[c.employee] || 0) + (c.latency_ms || 0);
  });
  Object.keys(byEmployee).forEach(k => {
    const e = byEmployee[k];
    e.avg_latency_ms = e.calls ? Math.round(latencySum[k] / e.calls) : 0;
    e.tools_used = Object.entries(e.tools_used).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ tool: t, count: n }));
  });

  return {
    success: true,
    period_days: days,
    total_calls: calls.length,
    pending_approvals: pending,
    employees: Object.values(byEmployee),
    recent: calls.slice(0, 40).map(c => ({
      at: c.created_at, employee: c.employee, tool: c.tool,
      channel: c.channel, success: c.success, error: c.error, latency_ms: c.latency_ms
    }))
  };
}

async function upsertSession({ tenant_id, session_id, channel, employee, identity, lead_id, customer_id }) {
  let s = await AgentSession.findOne({ where: { tenant_id, session_id } });
  if (!s) {
    s = await AgentSession.create({
      tenant_id, session_id, channel, employee: employee || 'receptionist',
      identity: identity || {}, lead_id: lead_id || null, customer_id: customer_id || null,
      identity_verified: !!(identity && identity.name && identity.phone && identity.email)
    });
  } else {
    if (identity) {
      s.identity = { ...(s.identity || {}), ...identity };
      s.identity_verified = !!(s.identity.name && s.identity.phone && s.identity.email);
    }
    if (lead_id) s.lead_id = lead_id;
    if (customer_id) s.customer_id = customer_id;
    s.updated_at = new Date();
    await s.save();
  }
  return s;
}

module.exports = {
  callTool, listTools, listEmployees, getEmployee,
  executeApproval, staffActivity, upsertSession,
  costGuardOk, spentToday, REGISTRY, EMPLOYEES, CHANNEL_TRUST
};
