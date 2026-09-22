'use strict';

/**
 * THE LEVELUP MCP BRAIN — the only door to every agent.
 *
 * Every channel (the creator's app, the voice orb, an external MCP client)
 * calls the same tools through callTool(), so no two channels can disagree
 * about what an agent does. Enforced here, in code:
 *
 *   1. the tool exists            2. channel allow-list (human_only tools are
 *   3. API-key scope                 reachable from the signed-in app only)
 *   4. daily model-call cap per tenant
 *
 * TENANT_ID COMES FROM THE SESSION OR THE KEY AND IS DELETED FROM ARGUMENTS,
 * so an agent or an MCP client cannot name another creator's tenant.
 * Every call — denials included — writes an lu_calls row with no body text.
 * listTools() filters with the same rules callTool() applies.
 */

const { run, one } = require('./db');

// 'copilot' is the in-app natural-language agent: it may do everything the app
// can do EXCEPT the human_only actions, which stay the creator's own tap.
const CHANNELS = ['app', 'copilot', 'mcp', 'voice', 'system'];
const TOOLS = new Map(); // name -> def

function define(agentId, name, def) {
  const full = agentId + '.' + name;
  if (!/^[a-z]+\.[a-z_]+$/.test(full)) throw new Error('Bad tool name ' + full);
  if (typeof def.handler !== 'function') throw new Error(full + ': handler required');
  if (!def.description) throw new Error(full + ': description required');
  TOOLS.set(full, {
    name: full, agent: agentId,
    description: def.description,
    input_schema: def.input_schema || { type: 'object', properties: {} },
    human_only: !!def.human_only,          // approve / mark sent / mark posted
    scope: def.scope || 'agent',           // 'agent' | 'train'
    uses_model: !!def.uses_model,
    handler: def.handler
  });
}

const DAILY_CAP = () => Math.max(1, Number(process.env.LEVELUP_DAILY_MODEL_CALLS) || 300);

function allowed(tool, ctx) {
  if (!CHANNELS.includes(ctx.channel)) return 'Unknown channel';
  if (tool.human_only && ctx.channel !== 'app') return 'This action is yours alone: it can only be taken by you, signed in to the app.';
  if (ctx.channel === 'mcp') {
    const scopes = ctx.scopes || [];
    if (!scopes.includes(tool.scope)) return `This key lacks the "${tool.scope}" scope.`;
  }
  if (tool.scope === 'train' && ctx.channel === 'voice') return 'Training is not available by voice.';
  return null;
}

function listTools(ctx) {
  return [...TOOLS.values()]
    .filter((t) => !allowed(t, ctx))
    .map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema }));
}

async function audit(ctx, tool, outcome, reason, extra = {}) {
  try {
    await run(`INSERT INTO lu_calls (tenant_id, actor_id, channel, tool, outcome, reason, model_calls, composed_by, ms)
               VALUES (:t, :a, :c, :tool, :o, :r, :mc, :cb, :ms)`,
      { t: ctx.tenantId, a: ctx.actorId || null, c: String(ctx.channel || '?').slice(0, 12), tool: String(tool).slice(0, 80),
        o: outcome, r: reason ? String(reason).slice(0, 300) : null, mc: extra.model_calls || 0, cb: extra.composed_by || null, ms: extra.ms || null });
  } catch (e) { console.error('[levelup] audit write failed:', e.message); }
}

async function modelCallsToday(tenantId) {
  const r = await one(`SELECT COALESCE(SUM(model_calls),0)::int AS n FROM lu_calls WHERE tenant_id = :t AND created_at > now() - interval '24 hours'`, { t: tenantId });
  return r ? r.n : 0;
}

/**
 * callTool(name, args, ctx) — ctx = { tenantId, actorId, channel, scopes, lang }
 * Returns { ok, result } or { ok:false, error, status }.
 */
async function callTool(name, args, ctx) {
  const started = Date.now();
  if (!ctx || !Number.isInteger(ctx.tenantId) || ctx.tenantId < 1) return { ok: false, status: 401, error: 'No tenant' };
  const tool = TOOLS.get(name);
  if (!tool) { await audit(ctx, name, 'denied', 'unknown tool'); return { ok: false, status: 404, error: 'Unknown tool: ' + name }; }
  const why = allowed(tool, ctx);
  if (why) { await audit(ctx, name, 'denied', why); return { ok: false, status: 403, error: why }; }

  const clean = Object.assign({}, args && typeof args === 'object' ? args : {});
  delete clean.tenant_id; delete clean.tenantId; delete clean.tenant;

  let canModel = false;
  if (tool.uses_model) {
    const used = await modelCallsToday(ctx.tenantId);
    canModel = used < DAILY_CAP();
  }
  const meter = { model_calls: 0, composed_by: null };
  try {
    const result = await tool.handler(clean, Object.assign({}, ctx, { canModel, meter }));
    await audit(ctx, name, 'ok', canModel || !tool.uses_model ? null : 'daily model cap reached: deterministic path', { ...meter, ms: Date.now() - started });
    return { ok: true, result };
  } catch (e) {
    await audit(ctx, name, 'error', e.message, { ...meter, ms: Date.now() - started });
    return { ok: false, status: e.status || 500, error: e.message };
  }
}

module.exports = { define, callTool, listTools, TOOLS, CHANNELS, DAILY_CAP };
