'use strict';

/**
 * MODEL CLIENT — the only file in the factory that reaches Anthropic.
 *
 * Tiers, not model names, live in the registry: 'deep' agents (core, AI
 * Services SMEs, vertical SMEs) default to Sonnet 5 for judgment, 'fast'
 * specialists to Haiku 4.5 for volume. Both are env overrides, so a model
 * change is a Render variable, not a deploy.
 *
 * COST IS COMPUTED FROM THE RESPONSE'S OWN usage BLOCK against cited
 * first-party prices (USD per million tokens, Anthropic pricing, cached
 * 2026-06-24): Opus 5 $5/$25 · Sonnet 5 $2/$10 · Haiku 4.5 $1/$5. A model not
 * in the table records cost null rather than a guess.
 *
 * No ANTHROPIC_API_KEY = available() is false and the runtime returns a
 * labelled not-executed result. It never fabricates an artifact.
 */

const PRICES = {
  'claude-opus-5': [5, 25],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
  'claude-haiku-4-5-20251001': [1, 5]
};

const TIER_MODEL = {
  deep: () => process.env.FACTORY_MODEL_DEEP || 'claude-sonnet-5',
  fast: () => process.env.FACTORY_MODEL_FAST || 'claude-haiku-4-5-20251001'
};

let injected = null;     // SIT injects a fake; production uses the SDK
let client = null;

function available() { return Boolean(injected || process.env.ANTHROPIC_API_KEY); }
function modelFor(tier) { return (TIER_MODEL[tier] || TIER_MODEL.fast)(); }

function costUsd(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return null;
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1;
  return Math.round(((inTok * p[0]) + ((usage.output_tokens || 0) * p[1])) / 1e6 * 1e6) / 1e6;
}

async function complete({ model, system, user, maxTokens = 8000 }) {
  if (injected) return injected({ model, system, user, maxTokens });
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90000 });
  }
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }]
  });
  const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return { text, usage: res.usage || {}, stop_reason: res.stop_reason, model: res.model || model };
}

function _inject(fn) { injected = fn; }

module.exports = { available, modelFor, costUsd, complete, PRICES, _inject };
