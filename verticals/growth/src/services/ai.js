'use strict';

/**
 * Digit2AI Growth — LLM wrapper.
 *
 * Reuses ANTHROPIC_API_KEY (Claude). Model via GROWTH_MODEL (default Haiku for
 * cheap drafting). Every caller degrades gracefully to a labeled heuristic when
 * no key is present, so the whole tool runs with zero external keys.
 *
 * Returns { text, is_simulated, cost_usd }. cost_usd is a rough estimate from
 * token usage (Haiku pricing) so Runs can be cost-capped later.
 */

const MODEL = process.env.GROWTH_MODEL || 'claude-haiku-4-5-20251001';
const KEY = process.env.ANTHROPIC_API_KEY;

// Rough Haiku pricing ($/1M tokens) — used only for cost telemetry, not billing.
const IN_PER_M = 1.0;
const OUT_PER_M = 5.0;

async function callClaude(system, user, maxTokens = 1200) {
  if (!KEY) return { text: null, is_simulated: true, cost_usd: 0 };
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!resp.ok) {
      return { text: null, is_simulated: true, cost_usd: 0, error: `anthropic ${resp.status}` };
    }
    const data = await resp.json();
    const text = (data.content || []).map(b => b.text || '').join('').trim();
    const u = data.usage || {};
    const cost = ((u.input_tokens || 0) * IN_PER_M + (u.output_tokens || 0) * OUT_PER_M) / 1e6;
    return { text, is_simulated: false, cost_usd: cost };
  } catch (e) {
    return { text: null, is_simulated: true, cost_usd: 0, error: e.message };
  }
}

/** Parse a JSON object out of an LLM reply that may be fenced or chatty. */
function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

module.exports = { callClaude, extractJson, MODEL, hasKey: !!KEY };
