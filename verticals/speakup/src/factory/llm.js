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

const subscription = require('./claude-subscription');
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
let client = (API_KEY && Anthropic) ? new Anthropic({ apiKey: API_KEY }) : null;

const MODELS = {
  intel: process.env.SPEAKUP_INTEL_MODEL || 'claude-sonnet-5',
  plan: process.env.SPEAKUP_PLAN_MODEL || 'claude-opus-5',
  intent: process.env.SPEAKUP_MODEL || 'claude-haiku-4-5-20251001',
  // The meetings chat: minutes, action items and build prompts are judgment work over a
  // long transcript, so it defaults to Sonnet, not the Haiku the intent classifier uses.
  chat: process.env.SPEAKUP_CHAT_MODEL || 'claude-sonnet-5'
};
// Tried in order until one answers. The last is the model the rest of the repo runs on.
const FALLBACK = ['claude-sonnet-5', 'claude-haiku-4-5-20251001'];
const working = {};   // kind -> model id that answered
const lastError = {}; // kind -> message

function chain(kind) {
  const list = [working[kind], MODELS[kind] || MODELS.intent].concat(FALLBACK);
  return list.filter((m, i) => m && list.indexOf(m) === i);
}

// THE SUBSCRIPTION IS PREFERRED FOR EVERY KIND, NOT ONLY THE CHAT (owner request 2026-09-17).
// The API account is out of credit, so plans, intel, answers and intent all came back
// heuristic. Suites that inject a fake client unset CLAUDE_CODE_OAUTH_TOKEN first.
function useSubscription() { return subscription.available(); }
function configured() { return !!client || useSubscription(); }
// The meetings chat can also run on the owner's Claude subscription (claude-subscription.js).
function chatConfigured() { return useSubscription() || !!client; }
function activeModel(kind) { return working[kind] || MODELS[kind] || null; }
function status() { return { configured: !!client, configured_models: MODELS, working: Object.assign({}, working), last_error: Object.assign({}, lastError), subscription: subscription.status() }; }

// A model the key cannot use, or a name that does not exist: try the next one.
function isModelRefusal(e) {
  const s = e && (e.status || e.statusCode);
  const m = String((e && e.message) || '');
  return s === 404 || /not_found|model/i.test(m) && (s === 400 || s === 403 || s === 404);
}

function parseJSON(raw) {
  raw = String(raw || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model returned no JSON object');
  return JSON.parse(raw.slice(start, end + 1));
}

async function callJSON(kind, { system, user, max_tokens }) {
  if (useSubscription()) {
    const r = await viaSubscription(kind, { system, messages: [{ role: 'user', content: String(user || '') }] });
    return parseJSON(r.text);
  }
  if (!client) return null;
  let err = null;
  for (const model of chain(kind)) {
    try {
      const resp = await client.messages.create({ model, max_tokens: max_tokens || 3000, system, messages: [{ role: 'user', content: user }] });
      const parsed = parseJSON((resp.content || []).map(b => b.text || '').join(''));
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

/**
 * Plain-text calls for the meetings chat. Same fallback chain and the same reporting as
 * callJSON, with one rule of its own: a model refusal may move to the next model ONLY
 * before the first token. Once text has reached the person, switching models mid-answer
 * would splice two different replies into one.
 */
// system: the rules (short). context: the long material (a transcript). On the API they become
// two system blocks with the long one cacheable; on the subscription the rules are the system
// prompt and the context travels in the message.
function apiSystem(system, context) {
  if (!context) return system;
  return [{ type: 'text', text: String(system || '') }, { type: 'text', text: String(context), cache_control: { type: 'ephemeral' } }];
}

// THE CHAT PREFERS THE SUBSCRIPTION. When the token and the CLI are present it is used, and a
// failure there is reported as that failure — not silently retried on the API account, which is
// the one that ran out of credit and would only replace a clear reason with a confusing one.
async function viaSubscription(kind, opts, onText) {
  try {
    const r = await subscription.run({ system: opts.system, context: opts.context, messages: opts.messages, model: MODELS[kind] || MODELS.chat, signal: opts.signal, onText });
    working[kind] = r.model; delete lastError[kind];
    return r;
  } catch (e) { lastError[kind] = String(e.message).slice(0, 300); throw e; }
}

async function streamText(kind, { system, context, messages, max_tokens, signal }, onText) {
  if (useSubscription()) return viaSubscription(kind, { system, context, messages, signal }, onText);
  if (!client) return null;
  system = apiSystem(system, context);
  let err = null;
  for (const model of chain(kind)) {
    let started = false;
    try {
      // signal: the person closed the tab — stop paying for an answer nobody will read.
      const stream = client.messages.stream({ model, max_tokens: max_tokens || 2500, system, messages }, signal ? { signal } : undefined);
      stream.on('text', (t) => { started = true; onText(t); });
      const final = await stream.finalMessage();
      const text = (final.content || []).map(b => b.text || '').join('');
      if (working[kind] !== model) console.log(`SpeakUp: ${kind} is using ${model}`);
      working[kind] = model;
      delete lastError[kind];
      return { model, text };
    } catch (e) {
      err = e;
      lastError[kind] = `${model}: ${e.message}`.slice(0, 300);
      if (started || (signal && signal.aborted) || !isModelRefusal(e)) break;
    }
  }
  throw err || new Error('no model answered');
}

async function callText(kind, { system, context, messages, max_tokens }) {
  if (useSubscription()) return viaSubscription(kind, { system, context, messages });
  if (!client) return null;
  system = apiSystem(system, context);
  let err = null;
  for (const model of chain(kind)) {
    try {
      const resp = await client.messages.create({ model, max_tokens: max_tokens || 2500, system, messages });
      working[kind] = model;
      delete lastError[kind];
      return { model, text: (resp.content || []).map(b => b.text || '').join('') };
    } catch (e) {
      err = e;
      lastError[kind] = `${model}: ${e.message}`.slice(0, 300);
      if (!isModelRefusal(e)) break;
    }
  }
  throw err || new Error('no model answered');
}

// SIT only: swap the client (or null it) without touching the environment.
function __setClient(c) { client = c; for (const k of Object.keys(working)) delete working[k]; }

module.exports = { useSubscription, MODELS, FALLBACK, configured, chatConfigured, activeModel, status, callJSON, streamText, callText, isModelRefusal, __setClient };
