'use strict';

/**
 * SpeakUp — AI editing brain (the ONE external dependency: Claude).
 * Reuses ANTHROPIC_API_KEY. Model = SPEAKUP_MODEL (default Haiku).
 *
 *  - summarize(text, lang)             -> { summary, bullets[], action_items[] }
 *  - translate(text, targetLang)       -> { text, source_lang }
 *  - rewrite(text, tone, customPrompt) -> string
 *
 * Every function has a deterministic ZERO-KEY heuristic fallback so the whole
 * app works end-to-end with no API key. Translation NEVER fabricates a result:
 * with no key it returns the original text plus an explicit notice.
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.SPEAKUP_MODEL || 'claude-haiku-4-5-20251001';
const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const anthropic = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

function activeModel() { return anthropic ? MODEL : 'heuristic-fallback'; }

async function callClaude({ system, user, max_tokens = 1200 }) {
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens,
    system,
    messages: [{ role: 'user', content: user }]
  });
  return (resp.content || []).map(b => b.text || '').join('').trim();
}

// ── Summaries + bullets + action items ──────────────────────────────────────
async function summarize(text, lang) {
  const clean = String(text || '').trim();
  if (!anthropic || !clean) return heuristicSummary(clean);

  const system = 'You summarize meeting/voice transcripts. Reply with ONLY a JSON object, no prose.';
  const user = `Transcript:\n"""${clean.slice(0, 24000)}"""\n\n` +
    `Return this exact shape:\n{\n  "summary": "3-6 sentence summary",\n  "bullets": ["key point", "..."],\n  "action_items": ["concrete next action", "..."]\n}\n` +
    `Match the language of the transcript. 3-8 bullets. 0-8 action items (imperative). No emojis.`;

  try {
    const raw = await callClaude({ system, user });
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const p = JSON.parse(json);
    return {
      summary: String(p.summary || '').slice(0, 4000),
      bullets: Array.isArray(p.bullets) ? p.bullets.filter(Boolean).slice(0, 10).map(b => String(b).slice(0, 400)) : [],
      action_items: Array.isArray(p.action_items) ? p.action_items.filter(Boolean).slice(0, 10).map(a => String(a).slice(0, 400)) : []
    };
  } catch (e) {
    console.error('SpeakUp summarize error:', e.message);
    return heuristicSummary(clean);
  }
}

function heuristicSummary(text) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 4);
  const cues = /(voy a|tengo que|debo|hay que|necesito|will |i'?ll |need to|have to|let'?s|todo:|acción|action)/i;
  const bullets = sentences.slice(0, 6).map(s => s.trim().slice(0, 200));
  const action_items = sentences.filter(s => cues.test(s)).slice(0, 6).map(s => s.trim().slice(0, 200));
  return {
    summary: sentences.slice(0, 4).join(' ').slice(0, 1200) || '(sin contenido para resumir)',
    bullets,
    action_items
  };
}

// ── Translation (never fabricated) ──────────────────────────────────────────
async function translate(text, targetLang) {
  const clean = String(text || '').trim();
  if (!clean) return { text: '', source_lang: null };
  if (!anthropic) {
    return {
      text: `[Traducción no disponible sin ANTHROPIC_API_KEY. Texto original abajo.]\n\n${clean}`,
      source_lang: null
    };
  }
  const system = 'You are a professional translator. Auto-detect the source language. Output ONLY the translation, no notes.';
  const user = `Translate the following into ${targetLang}. Preserve meaning, tone and line breaks.\n\n"""${clean.slice(0, 24000)}"""`;
  try {
    const out = await callClaude({ system, user, max_tokens: 2000 });
    return { text: out || clean, source_lang: null };
  } catch (e) {
    console.error('SpeakUp translate error:', e.message);
    return { text: `[No se pudo traducir: ${e.message}]\n\n${clean}`, source_lang: null };
  }
}

// ── Tone adjustment / rewrite ────────────────────────────────────────────────
const TONES = {
  professional: 'Rewrite in a clear, professional tone. Fix grammar and punctuation.',
  concise: 'Rewrite to be as concise as possible while keeping all key information.',
  friendly: 'Rewrite in a warm, friendly, approachable tone.',
  email: 'Rewrite as a well-structured professional email with a greeting and sign-off.',
  bullets: 'Rewrite the content as a clean bulleted list of the key points.',
  grammar: 'Fix only grammar, spelling and punctuation. Keep wording and meaning intact.'
};

async function rewrite(text, tone, customPrompt) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  const instruction = customPrompt && customPrompt.trim()
    ? customPrompt.trim()
    : (TONES[tone] || TONES.professional);

  if (!anthropic) return heuristicRewrite(clean, tone);

  const system = 'You rewrite text as instructed. Output ONLY the rewritten text, no preamble. Match the input language. No emojis.';
  const user = `Instruction: ${instruction}\n\nText:\n"""${clean.slice(0, 24000)}"""`;
  try {
    return (await callClaude({ system, user, max_tokens: 2000 })) || heuristicRewrite(clean, tone);
  } catch (e) {
    console.error('SpeakUp rewrite error:', e.message);
    return heuristicRewrite(clean, tone);
  }
}

function heuristicRewrite(text, tone) {
  // Minimal, honest transformations without an LLM.
  if (tone === 'bullets') {
    return String(text).split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 3)
      .map(s => '- ' + s.trim()).join('\n');
  }
  if (tone === 'concise') {
    const s = String(text).split(/(?<=[.!?])\s+/).filter(Boolean);
    return s.slice(0, Math.max(1, Math.ceil(s.length / 2))).join(' ');
  }
  // grammar/professional/friendly/email: tidy whitespace + capitalization only.
  const tidy = String(text).replace(/\s+/g, ' ').trim();
  const cap = tidy.charAt(0).toUpperCase() + tidy.slice(1);
  return cap + '\n\n[Edición completa disponible al configurar ANTHROPIC_API_KEY.]';
}

module.exports = { summarize, translate, rewrite, activeModel, TONES: Object.keys(TONES) };
