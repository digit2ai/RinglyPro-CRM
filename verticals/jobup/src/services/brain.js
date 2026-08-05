'use strict';

// =============================================================
// The LLM brain. Claude Haiku 4.5 by default (spec section 8).
//
// DEGRADATION (spec section 21): with no ANTHROPIC_API_KEY every call returns a
// labelled heuristic result marked is_simulated — never a silent fake. This is
// what lets the SIT run green with zero external keys.
//
// COST MECHANIC #3: the resume/settings block is identical across every scoring
// call, so it is sent as a cached prefix. Cache reads bill at one tenth of input
// rate. cache_control goes on the LAST block of the stable prefix.
// =============================================================

const MODEL = process.env.JOBUP_MODEL || 'claude-haiku-4-5';
const TEASER_MODEL = process.env.JOBUP_TEASER_MODEL || MODEL;

// Haiku 4.5 list price, USD per million tokens.
const RATE_IN = 1.0;
const RATE_OUT = 5.0;
const RATE_CACHE_READ = 0.1;
const RATE_CACHE_WRITE = 1.25;

let client = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (client) return client;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic();
    return client;
  } catch (e) {
    console.warn('[brain] SDK unavailable:', e.message);
    return null;
  }
}

function enabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && Boolean(anthropic());
}

function costOf(usage) {
  if (!usage) return 0;
  const i = (usage.input_tokens || 0) / 1e6 * RATE_IN;
  const o = (usage.output_tokens || 0) / 1e6 * RATE_OUT;
  const cr = (usage.cache_read_input_tokens || 0) / 1e6 * RATE_CACHE_READ;
  const cw = (usage.cache_creation_input_tokens || 0) / 1e6 * RATE_CACHE_WRITE;
  return i + o + cr + cw;
}

// Ask for JSON. `cachedPrefix` is the stable block (resume + settings).
async function json({ system, cachedPrefix, prompt, maxTokens = 1024, model = MODEL }) {
  const c = anthropic();
  if (!c) return { ok: false, reason: 'no ANTHROPIC_API_KEY', is_simulated: true, cost_usd: 0 };

  const systemBlocks = [];
  if (system) systemBlocks.push({ type: 'text', text: system });
  if (cachedPrefix) {
    // Cache breakpoint on the last stable block — everything volatile goes after.
    systemBlocks.push({ type: 'text', text: cachedPrefix, cache_control: { type: 'ephemeral' } });
  }

  try {
    const res = await c.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemBlocks.length ? systemBlocks : undefined,
      messages: [{ role: 'user', content: prompt }],
    });
    if (res.stop_reason === 'refusal') {
      return { ok: false, reason: 'refusal', is_simulated: false, cost_usd: costOf(res.usage) };
    }
    const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    let data = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      data = m ? JSON.parse(m[0]) : null;
    } catch (e) { /* fall through */ }
    return {
      ok: Boolean(data), data, raw: text, is_simulated: false,
      cost_usd: costOf(res.usage), usage: res.usage, model,
    };
  } catch (e) {
    console.warn('[brain] call failed:', e.message);
    return { ok: false, reason: e.message, is_simulated: true, cost_usd: 0 };
  }
}

module.exports = { json, enabled, costOf, MODEL, TEASER_MODEL, RATE_IN, RATE_OUT };
