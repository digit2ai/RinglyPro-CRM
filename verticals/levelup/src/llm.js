'use strict';

/**
 * LevelUp — the ONLY file that reaches a model. SIT greps the vertical for
 * this. Every call carries the agent's system prompt with the creator's
 * training (rules first, then documents) appended by knowledge.js.
 *
 * No ANTHROPIC_API_KEY, or any model error, returns null and the caller uses
 * its deterministic path, labelled composed_by:'heuristic'. The caller never
 * sees a half answer.
 */

const MODEL_FAST = () => process.env.LEVELUP_MODEL || 'claude-haiku-4-5-20251001';
const MODEL_DEEP = () => process.env.LEVELUP_MODEL_DEEP || 'claude-sonnet-5';

let client = null;
let injected = null; // SIT injects a fake client here
function getClient() {
  if (injected) return injected;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}
function _inject(fake) { injected = fake; }
function configured() { return !!getClient(); }

/**
 * text({ system, user, deep, max_tokens }) -> { text, model } | null
 */
async function text({ system, user, deep = false, max_tokens = 1200 }) {
  const c = getClient();
  if (!c) return null;
  const model = deep ? MODEL_DEEP() : MODEL_FAST();
  try {
    const r = await c.messages.create({
      model, max_tokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: String(user).slice(0, 30000) }]
    });
    const out = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    return out ? { text: out, model } : null;
  } catch (e) {
    console.error('[levelup] model error:', e.message);
    return null;
  }
}

/** json(...) -> parsed object | null. Anything unparsable is null, never a guess. */
async function json(opts) {
  const r = await text(opts);
  if (!r) return null;
  const m = r.text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return { data: JSON.parse(m[0]), model: r.model }; } catch (e) { return null; }
}

/**
 * toolTurn — one model turn that may ask for tools. The LOOP lives in
 * copilot.js; this file stays the only one that reaches a model.
 * Returns { content, stop_reason, model } or null (no model / failure).
 */
async function toolTurn({ system, messages, tools, deep = false, max_tokens = 1200 }) {
  const c = getClient();
  if (!c) return null;
  const model = deep ? MODEL_DEEP() : MODEL_FAST();
  try {
    const r = await c.messages.create({
      model, max_tokens, tools,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages
    });
    return { content: r.content || [], stop_reason: r.stop_reason, model };
  } catch (e) {
    console.error('[levelup] copilot model error:', e.message);
    return null;
  }
}

module.exports = { text, json, configured, _inject, toolTurn, MODEL_FAST, MODEL_DEEP };
