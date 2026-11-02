'use strict';
/**
 * The ONLY file in Style Studio that reaches a language model (SIT greps the
 * rest). It re-words the stylist's explanation; it never produces a score.
 * Gated by the registry key `stylestudio` in src/config/anthropic-flags.js.
 */
let Anthropic = null, flags = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) {}
try { flags = require('../../../src/config/anthropic-flags'); } catch (_) {}

const MODEL = () => process.env.STYLE_STUDIO_MODEL || 'claude-haiku-4-5-20251001';
function aiEnabled() {
  if (!process.env.ANTHROPIC_API_KEY || !Anthropic) return false;
  if (flags && flags.anthropicEnabled) { try { return !!flags.anthropicEnabled('stylestudio'); } catch (_) { return false; } }
  return true;
}
let client = null;

/** Returns text or null on EVERY failure, so the caller's rules text runs. */
async function prose({ system, user, maxTokens = 300 }) {
  if (!aiEnabled()) return null;
  try {
    client = client || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await client.messages.create({ model: MODEL(), max_tokens: maxTokens, temperature: 0.5, system, messages: [{ role: 'user', content: user }] });
    return (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || null;
  } catch (e) { console.warn('[stylestudio] model:', e.message); return null; }
}

/**
 * A rewrite is kept only if it adds no digit (scores stay the engine's),
 * no promise, no brand the evidence did not name, and stays short.
 */
function acceptRewrite(text, evidence) {
  if (!text || text.length > 700) return false;
  if (/\d/.test(text)) return false;
  if (/guarantee|always flatter|perfect for everyone|100%/i.test(text)) return false;
  const brands = ['Gucci', 'Prada', 'Hugo Boss', 'Zara', 'Nike', 'Adidas', 'Tommy', 'J.Crew', 'Brooks Brothers'];
  if (brands.some((b) => text.includes(b) && !evidence.includes(b))) return false;
  return true;
}

module.exports = { aiEnabled, prose, acceptRewrite, MODEL };
