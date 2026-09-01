'use strict';

/**
 * THE MCP SURFACE — the read direction of the API key.
 *
 * The same credential that pushes observed work in lets a company's own AI pull
 * its readiness assessment back out. That is the point of putting this on MCP
 * rather than behind a dashboard login only: a roadmap that a CEO's assistant,
 * their copilot, or their own agent can query is a roadmap that gets consulted
 * after the meeting instead of filed.
 *
 * WHAT IT WILL NOT DO, and the reasons are the same ones the AI Readiness
 * Department enforces:
 *
 *   IT NEVER RETURNS AN UNCONFIRMED PROCESS AS FACT. Proposals come back only
 *   from a tool that says `proposed` in its own name and marks every row.
 *
 *   IT NEVER RUNS AN EVALUATION THAT WOULD REFUSE IN THE UI. `get_roadmap` on
 *   an account with missing inputs returns the named gaps, not a roadmap built
 *   around them. An agent asking politely does not unlock a weaker standard.
 *
 *   IT NEVER MUTATES ANYTHING EXCEPT BY INGESTING A CAPTURE. There is no tool
 *   here that confirms a process, sets a rate, or answers a question. Those are
 *   the human judgements the entire model rests on, and an agent that could
 *   supply them could manufacture a roadmap end to end with nobody in the loop.
 *
 * Tenancy comes from the resolved key and is never read from tool arguments —
 * a `tenant_id` in a payload is ignored, the same rule the department's Brain
 * applies.
 */

const { Account, Process, Evaluation, Capture } = require('../models');
const captureStore = require('./capture-store');
const evaluate = require('./evaluate');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'orbup-discovery', version: '1.0.0' };

const TOOLS = [
  {
    name: 'discovery.push_capture',
    scope: 'ingest',
    description: 'Push one observed run of work. The server redacts before storing: URL query strings are dropped, path identifiers masked, and any field outside the allow-list discarded and counted. Only the shape of the work is kept — never typed values, page contents, or a URL beyond its host.',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'What the operator calls this work. The only free text that survives ingestion.' },
        actor: { type: 'string', description: 'Any stable reference for who performed it. Hashed with a per-tenant salt before storage; never stored in the clear.' },
        external_ref: { type: 'string', description: 'Your own id for this run. Re-pushing the same ref is a no-op, so a retry cannot double-count hours.' },
        started_at: { type: 'string' },
        ended_at: { type: 'string' },
        duration_ms: { type: 'integer' },
        steps: {
          type: 'array',
          description: 'Ordered steps. Recognised keys: action, url or host, path, native_app, target_role, dwell_ms. Everything else is dropped.',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['navigate', 'click', 'type', 'submit', 'copy', 'paste', 'upload', 'download', 'search', 'wait', 'switch_app', 'scroll', 'other'] },
              url: { type: 'string' },
              host: { type: 'string' },
              path: { type: 'string' },
              native_app: { type: 'string' },
              target_role: { type: 'string', enum: ['button', 'link', 'field', 'select', 'checkbox', 'table', 'row', 'file', 'tab', 'menu', 'dialog', 'editor', 'other'] },
              dwell_ms: { type: 'integer' }
            }
          }
        }
      },
      required: ['steps']
    }
  },
  {
    name: 'discovery.list_confirmed_processes',
    scope: 'read',
    description: 'The processes a person has confirmed. These, and only these, are what the roadmap is built from. Each carries whether its hours were measured or stated, over what window, and whether an hourly rate exists.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'discovery.list_proposed_processes',
    scope: 'read',
    description: 'Processes the capture has PROPOSED but nobody has confirmed. These are machine guesses about where one piece of work ends and the next begins. Do not present them as established fact; every row is marked proposed.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'discovery.get_scorecard',
    scope: 'read',
    description: 'The Red/Yellow/Green readiness scorecard across Cost Comfort, Risk Comfort and Data Readiness, with the one line that matters under each colour and what would move it.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'discovery.get_roadmap',
    scope: 'read',
    description: 'The full three-phase AI roadmap: scope, cost band, risk level, data requirements, success metrics and the gate for each phase. Returns the named missing inputs instead of a roadmap if the evaluation cannot honestly run.',
    inputSchema: { type: 'object', properties: { refresh: { type: 'boolean', description: 'Recompute rather than returning the last frozen version.' } } }
  },
  {
    name: 'discovery.get_next_step',
    scope: 'read',
    description: 'The single safe next step, sized to sit under the exposure ceiling the account stated. There is always one, including when the scorecard is red — a red scorecard yields a smaller step, never "come back later".',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'discovery.get_findings',
    scope: 'read',
    description: 'Neural findings from the observed work — swivel-chair patterns, re-keying, key-person exposure, uncosted hours. Every finding carries the evidence it was computed from. A dollar figure is present only where somebody supplied an hourly rate.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'discovery.get_coverage',
    scope: 'read',
    description: 'The provenance ledger: for every input the roadmap rests on, whether it was measured, stated by a person, derived from observed applications, or absent. Read this before quoting any figure from the roadmap.',
    inputSchema: { type: 'object', properties: {} }
  }
];

function listTools(scopes = []) {
  return TOOLS
    .filter(t => scopes.includes(t.scope))
    .map(({ scope, ...rest }) => rest);
}

function shape(p) {
  return {
    name: p.name,
    status: p.status,
    people: p.people,
    hours_per_week: p.hours_per_week,
    hours_source: p.hours_source,
    observed_runs: p.observed_runs,
    observed_window_days: p.observed_window_days,
    median_run_minutes: p.median_run_minutes,
    apps: (p.apps || []).map(a => a.app || a),
    loaded_hourly_cost: p.loaded_hourly_cost,
    rate_source: Number(p.loaded_hourly_cost) > 0 ? 'stated_by_account' : null,
    costed: Number(p.loaded_hourly_cost) > 0,
    customer_facing: p.customer_facing,
    involves_regulated_data: p.involves_regulated_data,
    error_tolerance: p.error_tolerance,
    confidence: (p.evidence || {}).confidence || null,
    caveats: (p.evidence || {}).caveats || []
  };
}

/** Everything the read tools need, computed once. */
async function context(tenant_id) {
  const account = await Account.findOne({ where: { id: tenant_id } });
  if (!account) return null;
  const processes = (await Process.findAll({ where: { tenant_id } })).map(p => p.toJSON());
  const answers = await loadAnswers(tenant_id);
  const captureStats = await captureStore.stats(tenant_id);
  return { account, processes, answers, captureStats };
}

async function loadAnswers(tenant_id) {
  const { Answer } = require('../models');
  const rows = await Answer.findAll({ where: { tenant_id } });
  const out = {};
  rows.forEach(r => { out[r.section] = r.payload || {}; });
  return out;
}

async function evaluateFor(tenant_id, lang) {
  const ctx = await context(tenant_id);
  if (!ctx) return { ok: false, error: 'account_not_found' };
  return evaluate.run({ ...ctx, lang: lang || ctx.account.lang || 'en' });
}

/**
 * Call one tool. `key` is the already-resolved ApiKey row — tenancy comes from
 * it and from nothing in `args`.
 */
async function callTool(name, args = {}, key) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };

  const scopes = Array.isArray(key.scopes) ? key.scopes : [];
  if (!scopes.includes(tool.scope)) {
    return { ok: false, error: `This key does not carry the "${tool.scope}" scope.` };
  }

  const tenant_id = key.tenant_id;

  // A tenant_id in the arguments is ignored rather than honoured. Reading it
  // would make every read tool a cross-tenant read for anyone who guessed an id.
  if (args && args.tenant_id !== undefined) delete args.tenant_id;

  switch (name) {
    case 'discovery.push_capture': {
      try {
        const r = await captureStore.ingest({ tenant_id, payload: args, channel: 'mcp' });
        return {
          ok: true,
          capture_id: r.capture.id,
          duplicate: !!r.duplicate,
          steps_stored: r.capture.step_count,
          redaction: r.redaction,
          note: r.duplicate
            ? 'A capture with this external_ref already exists. Nothing was double-counted.'
            : 'Stored. Run discovery.list_proposed_processes to see what this changed; proposals refresh on the next derivation.'
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    case 'discovery.list_confirmed_processes': {
      const rows = await Process.findAll({ where: { tenant_id, status: 'confirmed' } });
      return {
        ok: true,
        processes: rows.map(r => shape(r.toJSON())),
        note: 'These are the only processes any roadmap figure is built from.'
      };
    }

    case 'discovery.list_proposed_processes': {
      const rows = await Process.findAll({ where: { tenant_id, status: 'proposed' } });
      return {
        ok: true,
        processes: rows.map(r => shape(r.toJSON())),
        status: 'proposed',
        note: 'PROPOSED, not confirmed. These are machine groupings of observed runs. They are not in the roadmap and should not be quoted as established processes.'
      };
    }

    case 'discovery.get_scorecard': {
      const r = await evaluateFor(tenant_id);
      if (!r.ok) return { ok: false, error: r.error, message: r.message, missing: r.missing };
      return { ok: true, scorecard: r.scorecard, coverage: r.coverage };
    }

    case 'discovery.get_roadmap': {
      if (!args.refresh) {
        const last = await Evaluation.findOne({
          where: { tenant_id }, order: [['version', 'DESC']]
        });
        if (last) {
          return {
            ok: true, version: last.version, frozen_at: last.created_at,
            scorecard: last.scorecard, phases: last.phases,
            executive_summary: last.executive_summary,
            safe_next_step: last.safe_next_step,
            coverage: last.coverage, diagram: last.diagram,
            note: 'The frozen version last produced for this account. Pass refresh:true to recompute.'
          };
        }
      }
      const r = await evaluateFor(tenant_id);
      if (!r.ok) return { ok: false, error: r.error, message: r.message, missing: r.missing };
      return {
        ok: true, version: null,
        scorecard: r.scorecard, phases: r.phases,
        executive_summary: r.executive_summary,
        safe_next_step: r.safe_next_step,
        coverage: r.coverage, diagram: r.diagram,
        note: 'Computed live and not saved. Phase 3 deliberately carries no price.'
      };
    }

    case 'discovery.get_next_step': {
      const r = await evaluateFor(tenant_id);
      if (!r.ok) return { ok: false, error: r.error, message: r.message, missing: r.missing };
      return { ok: true, next_step: r.safe_next_step, verdict: r.scorecard.verdict };
    }

    case 'discovery.get_findings': {
      const ctx = await context(tenant_id);
      if (!ctx) return { ok: false, error: 'account_not_found' };
      const findingsService = require('./findings');
      return {
        ok: true,
        findings: findingsService.build({
          processes: ctx.processes, captures: ctx.captureStats, answers: ctx.answers
        })
      };
    }

    case 'discovery.get_coverage': {
      const r = await evaluateFor(tenant_id);
      if (!r.ok) return { ok: false, error: r.error, message: r.message, missing: r.missing };
      return { ok: true, coverage: r.coverage };
    }

    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

/** Minimal JSON-RPC envelope, so a standard MCP client can speak to this. */
async function rpc(body = {}, key) {
  const { id = null, method, params = {} } = body;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  const scopes = Array.isArray(key.scopes) ? key.scopes : [];

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: 'OrbUp AI Discovery. Push observed work in; read a readiness roadmap out. Every figure here traces to measured time or a stated rate — check discovery.get_coverage before quoting one. Proposed processes are machine guesses and are never in the roadmap.'
      });
    case 'tools/list':
      return reply({ tools: listTools(scopes) });
    case 'tools/call': {
      const result = await callTool(params.name, params.arguments || {}, key);
      return reply({
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: !result.ok
      });
    }
    case 'ping':
      return reply({});
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

module.exports = { TOOLS, listTools, callTool, rpc, shape, context, evaluateFor, PROTOCOL_VERSION, SERVER_INFO };
