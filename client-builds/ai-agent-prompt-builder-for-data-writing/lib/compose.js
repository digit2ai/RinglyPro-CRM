// =====================================================
// lib/compose.js — ONE BOX in, a complete agent definition out.
//
// This is the only file in the app that talks to a model, and it is worth being
// precise about what it does with it: it AUTHORS A SPECIFICATION from the
// sentence the user typed or spoke. It never executes the prompt it produces.
// The artifact is still the JSON — lib/promptBuilder.js assembles it, exactly as
// it did for the wizard, from the fields this file fills in.
//
// The wizard asked a person to be a prompt engineer across four steps. Most
// people describing an agent already say everything the wizard asks for, just in
// prose ("read the invoices in raw_documents and pull the vendor and total into
// a table, never guess a number"). The model's job is to transpose that prose
// into the fields, not to add product decisions the user never made.
//
// HONESTY, ENFORCED IN CODE AND NOT ONLY IN THE PROMPT:
//  - Any concrete identifier the model introduces that the user did not type
//    (a table, a column, an endpoint) is checked against the input, and what
//    is not found there is reported back in `assumptions[]`. The UI renders
//    them as "you should check this", so a spec is never handed to a build
//    agent with an invented table name reading as fact.
//  - With no ANTHROPIC_API_KEY the heuristic path runs, produces a genuinely
//    usable definition built from the user's own words, and labels itself
//    `composed_by:'heuristic'` / `is_simulated:true`. Never a silent fake.
//  - The composer never invents an output schema shape the user described in
//    different terms; when the request implies no fields, it says so in
//    `assumptions` rather than inventing a plausible-looking one.
// =====================================================

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const pb = require('./promptBuilder');

// Spec authoring is a one-shot call a handful of times a day, and the quality of
// this one call is the entire product — so it defaults to the strongest model
// rather than the cheap one the rest of the repo uses for high-volume work.
// APB_MODEL overrides it with no redeploy.
const MODEL = process.env.APB_MODEL || 'claude-opus-5';
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

// The box accepts a paragraph, not a document. Speech-to-text can run long, so
// the cap is generous, but it is a cap: an unbounded body is a cost incident.
const MAX_INPUT = 8000;

function hasModel() { return !!anthropic; }
function activeModel() { return anthropic ? MODEL : 'heuristic'; }

// ---------------------------------------------------------------- the prompt

const SYSTEM = `You are a specification author. You turn one plain-language description of a data-writing AI agent into a complete, buildable agent definition.

You are NOT writing the agent's answer, and you are NOT executing anything. You are filling in a spec that a human will paste into a build tool.

Return ONE JSON object and nothing else. No prose, no markdown, no code fences.

{
  "name": "short Title Case name for the agent, e.g. Invoice Field Extractor",
  "role": "one line: who this agent is",
  "description": "one line: where it sits in the pipeline",
  "goal": "one or two sentences: the single outcome this agent is responsible for",
  "dataSources": ["what it reads — one per entry, be specific where the user was specific"],
  "instructions": ["ordered steps the agent follows — one per entry, imperative voice"],
  "constraints": ["what the agent must never do — one per entry"],
  "outputSchema": { "the exact JSON shape the agent must return": "as a real JSON object, not a string" },
  "model": "a Claude model id if the user named one, otherwise omit",
  "temperature": 0,
  "assumptions": ["every concrete detail you supplied that the user did NOT state"],
  "clarifications": ["questions whose answer would change the spec — at most three"]
}

RULES:
1. Use the user's own nouns. If they said "invoices" do not rename it "documents".
2. Never invent a table, column, file path, API endpoint, or metric name that the
   user did not mention. If you need one to make the spec concrete, use an obvious
   placeholder (e.g. "<source table>") AND list it in assumptions.
3. Every entry in assumptions must be a detail you added, phrased so a human can
   confirm or correct it in one read. If you added nothing, return [].
4. instructions must be steps, not restatements of the goal. 4-9 entries.
5. constraints must always include at least: never fabricate a value, and return
   the declared JSON shape only.
6. outputSchema is a real JSON object describing the shape. If the user described
   no fields at all, return a minimal shape and say so in assumptions.
7. If the description is too vague to build from, still return a usable spec from
   what was said, and put what is missing in clarifications.
8. Write in the language the user wrote in.`;

function userPrompt(text, lang) {
  return [
    lang === 'es'
      ? 'Descripción del agente (en las palabras del usuario):'
      : 'Agent description (in the user\'s own words):',
    '"""',
    text,
    '"""',
    '',
    'Return the JSON object now.'
  ].join('\n');
}

// ------------------------------------------------------------------ parsing

/**
 * Pull the first balanced JSON object out of a model response. Tolerates a
 * stray code fence or a leading sentence, because a hard parse failure here
 * would throw away a good spec over punctuation.
 */
function extractJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  const start = s.indexOf('{');
  if (start === -1) return null;

  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch (e) { return null; }
      }
    }
  }
  return null;
}

/** Normalize whatever the model returned into the wizard's field shape. */
function shape(obj) {
  const o = obj || {};
  const list = (v, cap) => pb.toList(v, cap).slice(0, 40);
  const one = (v, cap) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/\s+/g, ' ').trim();
    return cap && s.length > cap ? s.slice(0, cap) : s;
  };

  let schema = o.outputSchema !== undefined ? o.outputSchema : o.output_schema;
  if (typeof schema === 'string') schema = pb.parseSchema(schema).value;
  if (!schema || typeof schema !== 'object') schema = {};

  const temp = o.temperature;
  return {
    name: one(o.name, 200),
    role: one(o.role, 500),
    description: one(o.description, 1000),
    goal: one(o.goal, 2000),
    dataSources: list(o.dataSources !== undefined ? o.dataSources : o.data_sources, 500),
    instructions: list(o.instructions, 2000),
    constraints: list(o.constraints, 1000),
    outputSchema: schema,
    model: one(o.model, 100),
    temperature: (temp === null || temp === undefined || temp === '') ? '' : Number(temp),
    assumptions: list(o.assumptions, 500),
    clarifications: list(o.clarifications, 500).slice(0, 3)
  };
}

// --------------------------------------------------------- honesty checking

/**
 * Identifier-shaped tokens the spec introduces: snake_case, dotted paths,
 * <placeholders>, /endpoints, *.ext. Anything of that shape which does NOT
 * appear in what the user wrote is something a human has to confirm.
 *
 * The question this answers is "does this thing already exist under this name?",
 * so it scans the fields that REFER to the outside world — data sources, the
 * goal, the procedure, the rules — and deliberately NOT the output schema. A
 * schema names fields the agent is about to create; asking someone to confirm
 * that `source_file` exists is nonsense, and the model already reports invented
 * fields in `assumptions`. Scanning it once produced three noisy flags per spec
 * and buried the one that mattered.
 */
function unstatedIdentifiers(fields, input) {
  const hay = String(input || '').toLowerCase();
  const seen = new Set();
  const out = [];

  const scan = (s) => {
    const text = typeof s === 'object' ? JSON.stringify(s) : String(s || '');
    // Placeholders may contain spaces ("<source table>"), so the first branch
    // deliberately does not exclude whitespace — a placeholder that slipped
    // through unflagged is exactly the case this check exists for.
    const re = /<[^<>]{2,60}>|\/[a-z0-9][a-z0-9/_-]{3,60}|[a-z][a-z0-9]*(?:[._][a-z0-9]+)+/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const tok = m[0];
      const key = tok.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // A placeholder is honest by construction — it is visibly not a real name.
      if (/^<.*>$/.test(tok)) { out.push(tok); continue; }
      if (hay.indexOf(key) !== -1) continue;               // the user said it
      // People write "invoice number" and schemas say `invoice_number`. Flagging
      // that as unverified would bury the real finds in noise, so a token whose
      // separators are the only difference counts as stated.
      if (hay.indexOf(key.replace(/[._/-]+/g, ' ')) !== -1) continue;
      if (/^\d/.test(tok)) continue;                        // versions, decimals
      out.push(tok);
    }
  };

  fields.dataSources.forEach(scan);
  fields.instructions.forEach(scan);
  fields.constraints.forEach(scan);
  scan(fields.goal);

  return out.slice(0, 12);
}

// ------------------------------------------------------------- the fallback

const STOP = new Set(('a an the and or but so that this these those it its of to in on for with from by as at is are be ' +
  'i we you they my our your please need want would like should can make build create agent ai que de la el los las un una ' +
  'y o para con por en del al es son necesito quiero hacer crear').split(/\s+/));

function titleFrom(text) {
  const words = String(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const picked = [];
  for (const w of words) {
    if (STOP.has(w.toLowerCase())) continue;
    picked.push(w[0].toUpperCase() + w.slice(1).toLowerCase());
    if (picked.length === 3) break;
  }
  return (picked.join(' ') || 'Untitled') + ' Agent';
}

function sentences(text) {
  return String(text)
    .split(/(?<=[.!?;\n])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 3);
}

/**
 * The zero-key path. It is deliberately NOT a stub: it produces a definition
 * built entirely from the user's own sentences, which is a genuinely usable
 * starting point, and it says plainly that no model shaped it.
 */
function heuristic(text, lang) {
  const es = lang === 'es';
  const sents = sentences(text);
  const sources = sents.filter((s) => /\b(table|tabla|file|archivo|api|feed|database|base de datos|csv|json|column|columna|sheet|inbox|bucket|s3|endpoint)\b/i.test(s));

  const fields = {
    name: titleFrom(text),
    role: es ? 'un agente de escritura de datos' : 'a data-writing agent',
    description: '',
    goal: sents[0] || String(text).slice(0, 300),
    dataSources: sources.length ? sources : [es ? '<fuente de datos por confirmar>' : '<data source to confirm>'],
    instructions: (sents.length > 1 ? sents.slice(1) : sents).slice(0, 9),
    constraints: es
      ? ['Nunca inventes un valor para satisfacer un campo obligatorio.', 'Devuelve solo el JSON declarado. Sin prosa, sin bloques de código.']
      : ['Never fabricate a value to satisfy a required field.', 'Return the declared JSON only. No prose, no code fences.'],
    outputSchema: { result: 'object', notes: 'string|null' },
    model: '',
    temperature: 0,
    assumptions: [
      es
        ? 'Sin modelo disponible: esta especificación se armó con tus propias frases, no fue redactada por un modelo. Revisa cada paso.'
        : 'No model available: this spec was assembled from your own sentences rather than authored. Review every step.',
      es
        ? 'El esquema de salida es un marcador de posición — sustituye los campos por los que realmente necesitas.'
        : 'The output schema is a placeholder — replace the fields with the ones you actually need.'
    ],
    clarifications: []
  };

  if (!fields.instructions.length) {
    fields.instructions = [es ? 'Lee la fuente completa antes de escribir nada.' : 'Read the full source before writing anything.'];
  }
  return fields;
}

// ------------------------------------------------------------------- public

/**
 * compose({ text, lang }) -> {
 *   definition,        // wizard-shaped fields, ready for buildPrompt()
 *   payload,           // the built JSON prompt payload
 *   command,           // the paste-ready /ringlypro-architect block
 *   assumptions[], clarifications[], unverified[],
 *   composed_by, is_simulated, model, usage
 * }
 *
 * Never throws — a model failure degrades to the heuristic path and says so.
 */
async function compose(input) {
  const raw = String((input && input.text) || '');
  const text = raw.trim().slice(0, MAX_INPUT);
  const lang = (input && input.lang) === 'es' ? 'es' : 'en';

  if (!text) {
    const err = new Error('empty_description');
    err.code = 'empty_description';
    throw err;
  }

  let fields = null;
  let composed_by = 'heuristic';
  let usage = null;
  let note = null;

  if (anthropic) {
    try {
      // Generous max_tokens on purpose: on current models it caps thinking AND
      // response text together, and a spec truncated mid-object parses as
      // nothing at all — which would silently demote every composition to the
      // heuristic path. A spec is a couple of KB; the headroom is nearly free.
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt(text, lang) }]
      });
      const body = (res.content || [])
        .filter((b) => b && b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      const parsed = res.stop_reason === 'max_tokens' ? null : extractJson(body);
      if (res.stop_reason === 'max_tokens') {
        note = 'The spec was cut off before it finished; fell back to your own words. Try a shorter description.';
      } else if (res.stop_reason === 'refusal') {
        note = 'The model declined to write this spec; fell back to your own words.';
      }
      if (parsed) {
        fields = shape(parsed);
        composed_by = 'model';
        usage = res.usage
          ? { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens }
          : null;
      } else if (!note) {
        note = 'The model did not return parseable JSON; fell back to your own words.';
      }
    } catch (e) {
      note = 'Model call failed (' + e.message + '); fell back to your own words.';
      console.error('[ai-agent-prompt-builder] compose model call failed:', e.message);
    }
  }

  if (!fields || !fields.name) {
    const h = heuristic(text, lang);
    // Keep whatever the model did manage to produce; fill the gaps.
    fields = Object.assign(h, fields && fields.name ? fields : {});
    composed_by = composed_by === 'model' ? 'model' : 'heuristic';
  }

  const assumptions = fields.assumptions.slice();
  if (note) assumptions.unshift(note);

  const unverified = unstatedIdentifiers(fields, text);

  const definition = {
    name: fields.name,
    role: fields.role,
    description: fields.description,
    goal: fields.goal,
    dataSources: fields.dataSources,
    instructions: fields.instructions,
    constraints: fields.constraints,
    outputSchema: fields.outputSchema,
    model: fields.model,
    temperature: fields.temperature
  };

  const payload = pb.buildPrompt(definition);
  payload.source = {
    composed_by,
    model: composed_by === 'model' ? MODEL : 'heuristic',
    is_simulated: composed_by !== 'model',
    described_as: text
  };
  if (assumptions.length) payload.assumptions = assumptions;

  return {
    definition,
    payload,
    command: pb.architectCommand(payload),
    assumptions,
    clarifications: fields.clarifications || [],
    unverified,
    composed_by,
    is_simulated: composed_by !== 'model',
    model: composed_by === 'model' ? MODEL : 'heuristic',
    usage
  };
}

module.exports = { compose, hasModel, activeModel, extractJson, heuristic, unstatedIdentifiers, MAX_INPUT };
