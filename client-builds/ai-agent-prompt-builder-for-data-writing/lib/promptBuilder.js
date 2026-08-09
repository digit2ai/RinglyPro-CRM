// =====================================================
// lib/promptBuilder.js — the pure function at the centre of the product.
//
// agent definition fields  ->  a structured JSON prompt payload.
//
// PURE. No I/O, no database, no model call. The sprint brief is explicit: this
// app ASSEMBLES a payload, it does not execute one. If you ever find an
// `openai` / `anthropic` import in this file, something has gone wrong — the
// exported artifact is the JSON itself, which the user runs elsewhere.
//
// Because it is pure and dependency-free it is shared verbatim by the server
// (POST /api/v1/agents/generate) and the browser (the live preview pane), so
// what the wizard shows on every keystroke is byte-identical to what the
// download and the API return. A preview that drifts from the export is worse
// than no preview.
// =====================================================

'use strict';

const SCHEMA_VERSION = '1.0';

/** Trim, collapse newlines, and cap. Never throws on a non-string. */
function str(v, max) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return max && s.length > max ? s.slice(0, max) : s;
}

/**
 * Accepts an array, or a newline/comma-separated string, and returns a clean
 * array of non-empty strings. The wizard uses textareas (one item per line);
 * the API accepts either shape so a script can post an array directly.
 */
function toList(v, max) {
  let arr;
  if (Array.isArray(v)) arr = v;
  else if (typeof v === 'string') arr = v.split(/\r?\n/);
  else if (v === null || v === undefined) arr = [];
  else arr = [String(v)];

  const out = [];
  for (const item of arr) {
    if (item === null || item === undefined) continue;
    // An entry may itself be an object (e.g. a data source with a type).
    if (typeof item === 'object') { out.push(item); continue; }
    const s = String(item).trim();
    if (s) out.push(max && s.length > max ? s.slice(0, max) : s);
  }
  return out;
}

/**
 * Output schema may arrive as an object (from a template), or as raw JSON text
 * the user typed. Invalid JSON is NOT silently discarded — it comes back under
 * `_raw` with a parse error, so the preview can tell the user their schema is
 * malformed instead of quietly exporting an empty object.
 */
function parseSchema(v) {
  if (v === null || v === undefined || v === '') return { value: {}, error: null };
  if (typeof v === 'object') return { value: v, error: null };
  const s = String(v).trim();
  if (!s) return { value: {}, error: null };
  try {
    return { value: JSON.parse(s), error: null };
  } catch (e) {
    return { value: { _raw: s }, error: 'output_schema is not valid JSON: ' + e.message };
  }
}

/**
 * Build the structured prompt payload.
 *
 * The returned object ALWAYS carries the three keys the acceptance criteria
 * name — `agent`, `instructions`, `output_schema` — regardless of how sparse
 * the input is. A half-filled wizard still produces a parseable artifact; that
 * is what makes the live preview useful from the first keystroke.
 */
function buildPrompt(input) {
  const a = input || {};
  const schema = parseSchema(a.outputSchema !== undefined ? a.outputSchema : a.output_schema);

  const dataSources = toList(a.dataSources !== undefined ? a.dataSources : a.data_sources, 500);
  const instructions = toList(a.instructions, 2000);
  const constraints = toList(a.constraints, 1000);

  const name = str(a.name, 200) || 'Untitled Agent';
  const role = str(a.role, 500);
  const goal = str(a.goal, 2000);

  const payload = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),

    agent: {
      name,
      role: role || 'Data-writing agent',
      goal,
      description: str(a.description, 1000) || undefined,
      model: str(a.model, 100) || undefined,
      temperature: (a.temperature === '' || a.temperature === null || a.temperature === undefined)
        ? undefined
        : Number(a.temperature)
    },

    data_sources: dataSources,

    instructions,

    constraints,

    output_schema: schema.value,

    // A ready-to-paste system prompt assembled from the same fields, so the
    // artifact is usable by a runner that wants prose rather than structure.
    system_prompt: composeSystemPrompt({ name, role, goal, dataSources, instructions, constraints, schema: schema.value })
  };

  // Drop undefined agent keys so the exported JSON stays clean.
  Object.keys(payload.agent).forEach((k) => {
    if (payload.agent[k] === undefined || (typeof payload.agent[k] === 'number' && !isFinite(payload.agent[k]))) {
      delete payload.agent[k];
    }
  });

  if (schema.error) payload.warnings = [schema.error];

  return payload;
}

/** Deterministic prose assembly — no model involved. */
function composeSystemPrompt(p) {
  const lines = [];
  lines.push(`You are ${p.name}${p.role ? ', ' + p.role : ''}.`);
  if (p.goal) lines.push('', 'GOAL', p.goal);

  if (p.dataSources.length) {
    lines.push('', 'DATA SOURCES');
    p.dataSources.forEach((d) => {
      lines.push('- ' + (typeof d === 'object' ? JSON.stringify(d) : d));
    });
  }

  if (p.instructions.length) {
    lines.push('', 'INSTRUCTIONS');
    p.instructions.forEach((s, i) => {
      lines.push(`${i + 1}. ` + (typeof s === 'object' ? JSON.stringify(s) : s));
    });
  }

  if (p.constraints.length) {
    lines.push('', 'CONSTRAINTS');
    p.constraints.forEach((c) => {
      lines.push('- ' + (typeof c === 'object' ? JSON.stringify(c) : c));
    });
  }

  const hasSchema = p.schema && typeof p.schema === 'object' && Object.keys(p.schema).length;
  if (hasSchema) {
    lines.push('', 'OUTPUT FORMAT',
      'Respond with JSON only, matching this schema exactly. No prose, no code fences.',
      JSON.stringify(p.schema, null, 2));
  }

  return lines.join('\n');
}

/**
 * The paste-ready block for VS Code.
 *
 * The JSON payload is the artifact, but a payload sitting in a clipboard is not
 * yet a command. This wraps it in the exact line the operator runs in Claude
 * Code — `/ringlypro-architect` followed by the spec — so the whole flow is
 * describe -> copy -> paste -> enter, with no editing step in between where a
 * field can be lost.
 *
 * Pure string assembly, shared by the server and the browser like everything
 * else here, so the button and the API can never disagree about what gets run.
 */
function architectCommand(payload, opts) {
  const o = opts || {};
  const command = str(o.command, 60) || '/ringlypro-architect';
  const p = payload || {};
  const name = (p.agent && p.agent.name) || 'Untitled Agent';

  const lines = [
    command,
    '',
    `Build the AI agent specified below and take it to production. Its name is "${name}".`,
    '',
    'The spec is JSON. Treat every field as a hard requirement:',
    '- `agent` is the identity and the goal.',
    '- `data_sources` is what it reads. `instructions` is the ordered procedure.',
    '- `constraints` are absolute — enforce them in code, not only in the prompt.',
    '- `output_schema` is the exact shape it must return.',
    '- `system_prompt` is a ready-to-use assembly of the same fields.'
  ];

  if (Array.isArray(p.assumptions) && p.assumptions.length) {
    lines.push('',
      'The spec carries assumptions its author did not state explicitly. Confirm each',
      'against the real system before you build on it, and say which ones you changed:');
    p.assumptions.forEach((a) => lines.push('- ' + (typeof a === 'object' ? JSON.stringify(a) : a)));
  }

  lines.push('',
    'Follow the repo conventions: multi-tenant with tenant_id on every table, a SIT',
    'that proves the constraints hold, and deploy when it is green.',
    '',
    '```json',
    JSON.stringify(p, null, 2),
    '```');

  return lines.join('\n');
}

/**
 * Validate an agent definition for persistence. Returns {valid, errors[]}.
 * `name` is the only hard requirement — a saved draft with everything else
 * blank is a legitimate state in a wizard.
 */
function validateAgent(input) {
  const a = input || {};
  const errors = [];
  const name = str(a.name, 200);
  if (!name) errors.push('name is required');
  if (name.length > 200) errors.push('name exceeds 200 characters');

  const schema = parseSchema(a.outputSchema !== undefined ? a.outputSchema : a.output_schema);
  if (schema.error) errors.push(schema.error);

  return { valid: errors.length === 0, errors };
}

/** Normalize a request body into the shape the model column expects. */
function normalizeAgent(input) {
  const a = input || {};
  const schema = parseSchema(a.outputSchema !== undefined ? a.outputSchema : a.output_schema);
  return {
    name: str(a.name, 200) || 'Untitled Agent',
    role: str(a.role, 500),
    goal: str(a.goal, 4000),
    description: str(a.description, 2000),
    data_sources: toList(a.dataSources !== undefined ? a.dataSources : a.data_sources, 500),
    instructions: toList(a.instructions, 4000),
    constraints: toList(a.constraints, 2000),
    output_schema: schema.value
  };
}

module.exports = {
  buildPrompt,
  composeSystemPrompt,
  architectCommand,
  validateAgent,
  normalizeAgent,
  toList,
  parseSchema,
  SCHEMA_VERSION
};
