'use strict';

/**
 * The only file in BuyersLine that reaches a model. Everything that calls it
 * verifies the output afterwards; nothing here is trusted as fact.
 */

let client = null;
// MASTER SWITCH (owner decision 2026-10-01): BuyersLine makes NO Anthropic call
// unless INCENTIVA_AI=on. The project is paused, and its morning research refresh
// was the main daily Anthropic cost in September 2026. Every model path in this
// vertical checks aiEnabled(); with it off they all take their labelled no-model path.
function aiEnabled() {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  return process.env.INCENTIVA_AI === 'on' || require('../../../../src/config/anthropic-flags').anthropicEnabled('buyersline');
}
function configured() { return aiEnabled(); }

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

module.exports = { aiEnabled, configured, text, json };
