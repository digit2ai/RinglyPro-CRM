'use strict';

/**
 * The ONLY file in RinglyPro Supply that reaches a model (SIT greps).
 * The model writes prose and proposes scores within fixed vocabularies; it
 * never writes a price, a saving, an inventory figure or an id. Callers
 * verify every output. No ANTHROPIC_API_KEY or any error = null, and the
 * caller uses its deterministic path, labelled 'rules'.
 */

const MODEL = () => process.env.SUPPLY_MODEL || 'claude-haiku-4-5-20251001';
let client = null;
let injected = null;
function getClient() {
  if (injected) return injected;
  if (process.env.SUPPLY_MODEL === 'off' || !process.env.ANTHROPIC_API_KEY) return null;
  if (!client) { const Anthropic = require('@anthropic-ai/sdk'); client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }
  return client;
}
function _inject(fake) { injected = fake; }
function configured() { return !!getClient(); }

async function json({ system, user, max_tokens = 900 }) {
  const c = getClient();
  if (!c) return null;
  try {
    const r = await c.messages.create({ model: MODEL(), max_tokens, system, messages: [{ role: 'user', content: String(user).slice(0, 20000) }] });
    const text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (e) { console.error('[supply] model error:', e.message); return null; }
}

module.exports = { json, configured, MODEL, _inject };
