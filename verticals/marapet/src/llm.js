'use strict';
/**
 * The ONLY file in MaraPet that reaches a model. The SIT greps every other file
 * in this vertical and fails if one imports the Anthropic SDK, so there is
 * exactly one place to gate, meter or switch off.
 *
 * It is gated by the per-vertical registry key `marapet` in
 * src/config/anthropic-flags.js, so "pause AI on MaraPet" is one line there or
 * ANTHROPIC_ENABLED_MARAPET=false on Render.
 */
let Anthropic = null;
let flags = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) { Anthropic = null; }
try { flags = require('../../../src/config/anthropic-flags'); } catch (_) { flags = null; }

const MODEL = () => process.env.MARAPET_MODEL || 'claude-haiku-4-5-20251001';

function aiEnabled() {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  if (!Anthropic) return false;
  if (flags && typeof flags.anthropicEnabled === 'function') {
    try { return Boolean(flags.anthropicEnabled('marapet')); } catch (_) { return false; }
  }
  return true;
}

let client = null;
function sdk() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * One short prose turn. Returns the text, or null for EVERY failure mode —
 * no key, paused, rate limited, out of credit, malformed. The caller's own
 * deterministic path then runs. A thrown error here would turn a billing
 * problem into a broken screen.
 */
async function prose({ system, user, maxTokens = 400, temperature = 0.4 }) {
  if (!aiEnabled()) return null;
  try {
    const r = await sdk().messages.create({
      model: MODEL(),
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }]
    });
    const txt = (r && r.content || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return txt || null;
  } catch (_) {
    return null;
  }
}

module.exports = { aiEnabled, prose, MODEL };
