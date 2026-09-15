'use strict';

/**
 * SpeakUp AI Factory — the ONLY factory file that reaches Anthropic.
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

function configured() { return !!client; }

async function callJSON(kind, { system, user, max_tokens }) {
  if (!client) return null;
  const resp = await client.messages.create({
    model: MODELS[kind] || MODELS.intent,
    max_tokens: max_tokens || 3000,
    system,
    messages: [{ role: 'user', content: user }]
  });
  const raw = (resp.content || []).map(b => b.text || '').join('').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model returned no JSON object');
  return JSON.parse(raw.slice(start, end + 1));
}

// SIT only: swap the client (or null it) without touching the environment.
function __setClient(c) { client = c; }

module.exports = { MODELS, configured, callJSON, __setClient };
