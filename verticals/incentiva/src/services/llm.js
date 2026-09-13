'use strict';

/**
 * The only file in BuyersLine that reaches a model. Everything that calls it
 * verifies the output afterwards; nothing here is trusted as fact.
 */

let client = null;
function configured() { return !!process.env.ANTHROPIC_API_KEY; }

function getClient() {
  if (!configured()) return null;
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    const Ctor = Anthropic.default || Anthropic.Anthropic || Anthropic;
    client = new Ctor({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

async function text({ model, system, user, max_tokens = 1500 }) {
  const c = getClient();
  if (!c) return null;
  const resp = await c.messages.create({ model, max_tokens, system, messages: [{ role: 'user', content: user }] });
  return (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function json(opts) {
  const out = await text(opts);
  if (!out) return null;
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

module.exports = { configured, text, json };
