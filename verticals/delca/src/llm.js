'use strict';
/**
 * The ONLY file in the Delca vertical that reaches a model (the SIT greps it).
 * No key, DELCA_AI=off, or the registry switch off = enabled() is false and
 * Dalia takes the rule-based path, labelled composed_by:'heuristic'.
 */
let injected = null;
function _setClient(c) { injected = c; }

function enabled() {
  if (injected) return true;
  if (String(process.env.DELCA_AI || '').toLowerCase() === 'off') return false;
  if (!process.env.ANTHROPIC_API_KEY) return false;
  try { return require('../../../src/config/anthropic-flags').anthropicEnabled('delca'); } catch (e) { return true; }
}
function client() {
  if (injected) return injected;
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
const MODEL = () => process.env.DELCA_MODEL || 'claude-haiku-4-5-20251001';

/** One model turn with tools. Returns the raw message; the caller runs the tools. */
async function toolTurn({ system, messages, tools, max_tokens = 700 }) {
  return client().messages.create({ model: MODEL(), max_tokens, system, messages, tools });
}

module.exports = { enabled, toolTurn, _setClient, MODEL };
