'use strict';

/**
 * THE DEPARTMENT BRAIN — one gateway in front of every agent in the AI
 * Readiness Department.
 *
 * Same doctrine as the standalone MCP Brain (github.com/digit2ai/mcp-brain):
 * authorization, tenancy, budget and audit are enforced HERE, in code, not
 * requested of a language model in a prompt. Every channel — the sponsor
 * console, a voice orb, an external MCP client — calls the same tools, so no
 * two channels can disagree about what the department does.
 *
 * There is a specific reason this department in particular must obey its own
 * doctrine visibly. Its entire pitch to a frightened CEO is "AI does not act
 * without a human, and every action is logged." A department that could not
 * demonstrate that about itself would be asking to be believed rather than
 * showing its work.
 *
 * The five gates, in order:
 *   1. agent enablement        2. channel allow-list      3. minimum trust
 *   4. role allow-list         5. daily cost cap
 *
 * Then the line that matters most: tenant_id is injected from session context
 * and DELETED from model-supplied arguments, which makes cross-tenant access
 * unrepresentable rather than merely defended against.
 */

const { Call, Approval } = require('./models');

const CHANNEL_TRUST = {
  web_orb: 'public_web',
  web_chat: 'public_web',
  phone: 'phone',
  portal: 'customer',
  admin: 'staff',
  system: 'staff'
};
const TRUST_ORDER = ['public_web', 'identified', 'phone', 'customer', 'staff'];
const CHANNELS = Object.keys(CHANNEL_TRUST);

function trustAtLeast(actual, required) {
  return TRUST_ORDER.indexOf(actual) >= TRUST_ORDER.indexOf(required);
}

// The audit trail is a human surface. It must never become a secrets store —
// and in this department it holds a CEO's stated fears, which is its own
// category of sensitive.
const SENSITIVE = /(password|passwd|card|cvv|token|secret|api[_-]?key|ssn|pin)/i;
function redact(args) {
  const out = {};
  Object.keys(args || {}).forEach(k => {
    if (SENSITIVE.test(k)) { out[k] = '[redacted]'; return; }
    const v = args[k];
    if (typeof v === 'string' && v.length > 400) { out[k] = v.slice(0, 400) + '...'; return; }
    out[k] = v;
  });
  return out;
}

/**
 * defineAgent — the only way to declare a capability in this department.
 * Validates at definition time so a malformed tool fails on boot naming the
 * tool, rather than in front of a CEO six weeks later.
 */
function defineAgent(def) {
  if (!def || typeof def !== 'object') throw new Error('defineAgent expects an object');
  if (!def.id || !/^[a-z][a-z0-9_]*$/.test(def.id)) throw new Error(`Agent id must be lower_snake_case: ${JSON.stringify(def.id)}`);
  if (!def.name) throw new Error(`Agent ${def.id} needs a human-readable name`);
  if (!def.tools || !Object.keys(def.tools).length) throw new Error(`Agent ${def.id} registers no tools`);
  (def.channels || []).forEach(c => {
    if (!CHANNELS.includes(c)) throw new Error(`Agent ${def.id}: unknown channel "${c}"`);
  });
  Object.keys(def.tools).forEach(name => {
    const t = def.tools[name];
    const ref = `${def.id}.${name}`;
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`${ref}: tool names must be lower_snake_case`);
    if (typeof t.handler !== 'function') throw new Error(`${ref}: handler must be a function`);
    if (!t.description) throw new Error(`${ref}: every tool needs a description — it is what the model reads`);
    if (t.min_trust && !TRUST_ORDER.includes(t.min_trust)) throw new Error(`${ref}: bad min_trust`);
    (t.channels || []).forEach(c => { if (!CHANNELS.includes(c)) throw new Error(`${ref}: unknown channel "${c}"`); });
    if (t.parameters && t.parameters.type !== 'object') throw new Error(`${ref}: parameters must be a JSON Schema object`);
  });
  return def;
}

class DepartmentBrain {
  constructor(opts = {}) {
    this.registry = {};
    this.agents = [];
    this.costCapUsd = opts.costCapUsd !== undefined
      ? Number(opts.costCapUsd)
      : Number(process.env.AIR_COST_CAP_USD || 15);
    (opts.agents || []).forEach(a => this.register(a));
  }

  register(agent) {
    if (!agent || !agent.id) throw new Error('An agent needs an id');
    if (this.agents.some(a => a.id === agent.id)) throw new Error('Duplicate agent id: ' + agent.id);
    Object.keys(agent.tools || {}).forEach(name => {
      this.registry[`${agent.id}.${name}`] = { agent, name, ...agent.tools[name] };
    });
    this.agents.push(agent);
    return this;
  }

  get toolCount() { return Object.keys(this.registry).length; }

  /**
   * The catalog for a caller.
   *
   * Effective trust is computed here EXACTLY as callTool computes it. That
   * symmetry is load-bearing: if discovery and execution disagree, an agent is
   * handed a toolset it cannot run and improvises instead — which in this
   * department means inventing a number for a CEO.
   */
  listTools({ channel, role, identity_verified } = {}) {
    const base = CHANNEL_TRUST[channel] || 'public_web';
    const trust = (base === 'public_web' && identity_verified) ? 'identified' : base;
    return Object.keys(this.registry).map(full => {
      const t = this.registry[full];
      const allowed =
        (!t.channels || !channel || t.channels.includes(channel)) &&
        (!t.min_trust || trustAtLeast(trust, t.min_trust)) &&
        (!t.roles || !role || t.roles.includes(role));
      return {
        name: full,
        agent: t.agent.id,
        agent_name: t.agent.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {} },
        min_trust: t.min_trust || 'public_web',
        requires_approval: !!t.requires_approval,
        available: allowed
      };
    }).filter(t => (channel ? t.available : true));
  }

  listAgents() {
    return this.agents.map(a => ({
      id: a.id, name: a.name, role: a.role, overcomes: a.overcomes,
      replaces: a.replaces, channels: a.channels,
      tool_count: Object.keys(a.tools || {}).length,
      tools: Object.keys(a.tools || {}).map(t => `${a.id}.${t}`),
      enabled: a.enabled !== false
    }));
  }

  getAgent(id) { return this.agents.find(a => a.id === id) || null; }

  async spentTodayCents(tenant_id) {
    try {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const { Op } = require('sequelize');
      const rows = await Call.findAll({ where: { tenant_id, created_at: { [Op.gte]: since } }, attributes: ['cost_cents'] });
      return rows.reduce((a, r) => a + (r.cost_cents || 0), 0);
    } catch (e) {
      return 0;   // a cost-guard read failure must never block the engagement
    }
  }

  /* ── THE gateway ──────────────────────────────────────────────────────── */
  async callTool(toolName, args = {}, context = {}) {
    const started = Date.now();
    const tenant_id = context.tenant_id;
    const channel = context.channel || 'system';
    const tool = this.registry[toolName];

    const fail = async (error, extra = {}) => {
      await this._audit({ tenant_id, context, toolName, args, success: false, error, latency: Date.now() - started });
      return { success: false, error, ...extra };
    };

    if (!tool) return fail(`Unknown tool: ${toolName}`);
    if (!tenant_id) return fail('Missing tenant context');
    if (tool.agent.enabled === false) return fail(`${tool.agent.name} is currently switched off.`);

    // ① agent enablement
    const enabled = Array.isArray(context.enabled_agents) ? context.enabled_agents : null;
    if (enabled && !enabled.includes(tool.agent.id)) {
      return fail(`${tool.agent.name} is not enabled on this account.`, { code: 'agent_not_enabled' });
    }

    const base = CHANNEL_TRUST[channel] || 'public_web';
    const effectiveTrust = (base === 'public_web' && context.identity_verified) ? 'identified' : base;

    // ② channel allow-list
    if (tool.channels && !tool.channels.includes(channel)) {
      return fail(`${toolName} is not available on the ${channel} channel`, { code: 'channel_forbidden' });
    }
    // ③ minimum trust
    if (tool.min_trust && !trustAtLeast(effectiveTrust, tool.min_trust)) {
      return fail(`Not authorized: ${toolName} requires ${tool.min_trust} access (this session is ${effectiveTrust})`, { code: 'forbidden' });
    }
    // ④ role allow-list
    if (tool.roles && context.role && !tool.roles.includes(context.role)) {
      return fail(`Not authorized: ${toolName} requires one of [${tool.roles.join(', ')}]`, { code: 'role_forbidden' });
    }
    // ⑤ daily budget — admin exempt so an operator is never locked out by its own guard
    if (this.costCapUsd && channel !== 'admin') {
      const spent = await this.spentTodayCents(tenant_id);
      if (spent >= this.costCapUsd * 100) {
        return fail('Daily AI budget reached for this account.', { code: 'cost_cap' });
      }
    }

    // ── the line that makes cross-tenant access unrepresentable ──────────
    const safeArgs = { ...args };
    delete safeArgs.tenant_id;

    // Approval gate — the handler does NOT run.
    if (tool.requires_approval) {
      const approval = await Approval.create({
        tenant_id,
        engagement_id: safeArgs.engagement_id || context.engagement_id || null,
        agent: tool.agent.id,
        tool: toolName,
        arguments: redact(safeArgs),
        reason: tool.approval_reason || 'Requires human approval',
        status: 'pending'
      });
      await this._audit({ tenant_id, context, toolName, args: safeArgs, success: true, latency: Date.now() - started, requires_approval: true });
      return {
        success: true, requires_approval: true, approval_id: approval.id,
        message: 'This is in the approval queue. It does not run until a person signs it off.'
      };
    }

    try {
      const result = await tool.handler(safeArgs, { ...context, tenant_id, brain: this });
      await this._audit({
        tenant_id, context, toolName, args: safeArgs,
        success: result && result.success !== false,
        error: result && result.error ? String(result.error) : null,
        latency: Date.now() - started,
        cost: (result && result.cost_cents) || tool.cost_cents || 0
      });
      return result;
    } catch (e) {
      // A thrown error becomes a structured failure. A sponsor mid-presentation
      // must always have something they can say.
      return fail(e.message);
    }
  }

  async _audit({ tenant_id, context, toolName, args, success, error, latency, cost = 0, requires_approval = false }) {
    try {
      const agent = (this.registry[toolName] || {}).agent;
      await Call.create({
        tenant_id,
        engagement_id: (args && args.engagement_id) || (context && context.engagement_id) || null,
        agent: agent ? agent.id : 'unknown',
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
      // Auditing must NEVER break the call it is auditing. Observability is not
      // allowed to become an availability dependency.
    }
  }

  async executeApproval({ tenant_id, approval_id, user_id, approve }) {
    const a = await Approval.findOne({ where: { tenant_id, id: approval_id } });
    if (!a) return { success: false, error: 'Approval not found' };
    if (a.status !== 'pending') return { success: false, error: `Already ${a.status}` };

    a.decided_by = user_id || null;
    a.decided_at = new Date();

    if (!approve) {
      a.status = 'rejected';
      await a.save();
      return { success: true, status: 'rejected' };
    }

    const tool = this.registry[a.tool];
    if (!tool) { a.status = 'rejected'; await a.save(); return { success: false, error: 'Tool no longer exists' }; }

    try {
      const result = await tool.handler(a.arguments || {}, { tenant_id, channel: 'admin', actor: `user:${user_id}`, role: 'owner', brain: this });
      a.status = 'executed'; a.result = result; await a.save();
      return { success: true, status: 'executed', result };
    } catch (e) {
      a.status = 'approved'; a.result = { error: e.message }; await a.save();
      return { success: false, error: e.message };
    }
  }
}

module.exports = { DepartmentBrain, defineAgent, CHANNEL_TRUST, TRUST_ORDER, CHANNELS, trustAtLeast, redact };
