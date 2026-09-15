'use strict';

/**
 * SpeakUp AI Factory — the ONLY factory file that reaches Anthropic.
 *
 * A CONFIGURED MODEL THAT THE KEY CANNOT USE MUST NOT LOOK LIKE "NO MODEL".
 * The first production plan came back labelled `heuristic` because the configured
 * model id was refused for that key, and the caller could not tell that apart from
 * having no key at all. So each kind has a fallback chain, the model that actually
 * answered is reported back (and shown as `composed_by`), and the last refusal is
 * kept for /factory/health instead of being swallowed.
 *
 * No key = callJSON returns null and every caller takes its labelled heuristic path.
 */

let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) { Anthropic = null; }

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
let client = (API_KEY && Anthropic) ? new Anthropic({ apiKey: API_KEY }) : null;

const MODELS = {
  intel: process.env.SPEAKUP_INTEL_MODEL || 'claude-sonnet-5',
  plan: process.env.SPEAKUP_PLAN_MODEL || 'claude-opus-5',
  intent: process.env.SPEAKUP_MODEL || 'claude-haiku-4-5-20251001'
};
// Tried in order until one answers. The last is the model the rest of the repo runs on.
const FALLBACK = ['claude-sonnet-5', 'claude-haiku-4-5-20251001'];
const working = {};   // kind -> model id that answered
const lastError = {}; // kind -> message

function chain(kind) {
  const list = [working[kind], MODELS[kind] || MODELS.intent].concat(FALLBACK);
  return list.filter((m, i) => m && list.indexOf(m) === i);
}

function configured() { return !!client; }
function activeModel(kind) { return working[kind] || MODELS[kind] || null; }
function status() { return { configured: !!client, configured_models: MODELS, working: Object.assign({}, working), last_error: Object.assign({}, lastError) }; }

// A model the key cannot use, or a name that does not exist: try the next one.
function isModelRefusal(e) {
  const s = e && (e.status || e.statusCode);
  const m = String((e && e.message) || '');
  return s === 404 || /not_found|model/i.test(m) && (s === 400 || s === 403 || s === 404);
}

async function callJSON(kind, { system, user, max_tokens }) {
  if (!client) return null;
  let err = null;
  for (const model of chain(kind)) {
    try {
      const resp = await client.messages.create({ model, max_tokens: max_tokens || 3000, system, messages: [{ role: 'user', content: user }] });
      const raw = (resp.content || []).map(b => b.text || '').join('').trim();
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start < 0 || end <= start) throw new Error('model returned no JSON object');
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (working[kind] !== model) console.log(`SpeakUp factory: ${kind} is using ${model}`);
      working[kind] = model;
      delete lastError[kind];
      return parsed;
    } catch (e) {
      err = e;
      lastError[kind] = `${model}: ${e.message}`.slice(0, 300);
      if (!isModelRefusal(e)) break; // a real failure (rate limit, credit, timeout) is not a model problem
      console.error(`SpeakUp factory: ${kind} model ${model} refused (${e.message}); trying the next one`);
    }
  }
  throw err || new Error('no model answered');
}

// SIT only: swap the client (or null it) without touching the environment.
function __setClient(c) { client = c; for (const k of Object.keys(working)) delete working[k]; }

module.exports = { MODELS, FALLBACK, configured, activeModel, status, callJSON, isModelRefusal, __setClient };
