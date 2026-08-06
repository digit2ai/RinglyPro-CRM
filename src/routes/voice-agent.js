'use strict';
/**
 * Own-stack conversational brain for the voice orb — the replacement for
 * ElevenLabs Conversational AI across the whole ecosystem.
 *
 *   Ear   -> Web Speech API in the browser (on-device, $0)
 *   Brain -> this route (Claude Haiku)            <-- you are here
 *   Voice -> /api/tts/edge (Microsoft Edge neural, $0)
 *
 * ElevenLabs charged per conversation minute for all three, and each product
 * needed its own hosted agent configured by hand in their dashboard. Here the
 * persona is a pack in src/config/voice-agents.js and the FACTS come from the
 * page itself: the orb extracts the visible text of the page it is embedded in
 * and sends it as `context` on every turn. The model is instructed to answer
 * only from that text. Consequences worth keeping:
 *
 *   - Editing a landing page updates its voice agent. No dashboard, no redeploy.
 *   - The agent cannot invent a price, a metric or a claim the page never made.
 *   - Adding the orb to a new page needs zero server-side knowledge authoring.
 *
 * With no ANTHROPIC_API_KEY the route degrades to an honest extractive answer
 * drawn from the page text (labelled source:'heuristic'), never a fabrication.
 */

const express = require('express');
const router = express.Router();
const { getAgent, agentConfig, pick } = require('../config/voice-agents');

const MODEL = process.env.VOICE_AGENT_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TURNS = 12;
const MAX_CONTEXT = 9000;   // chars of page text handed to the model
const MAX_MSG = 1200;

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function cleanContext(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTEXT);
}

const RULES = {
  es: `CÓMO HABLAS
- Respuestas CORTAS: dos o tres frases como máximo, porque se leen en voz alta.
- Sin emojis, sin markdown, sin viñetas, sin asteriscos. Solo texto corrido.
- Números en palabras cuando sea natural.
- Cálida, directa y profesional.

REGLAS DE HONESTIDAD (obligatorias)
- Tu ÚNICA fuente es el CONTENIDO DE LA PÁGINA que aparece abajo.
- Nunca inventes cifras, precios, plazos, nombres ni promesas que no estén ahí.
- Si preguntan algo que la página no dice, dilo con claridad ("eso no lo dice esta página") y ofrece lo que sí sabes.
- No hablas de competidores ni das consejo legal, médico ni financiero.`,
  en: `HOW YOU SPEAK
- SHORT answers: two or three sentences at most, because they are read aloud.
- No emojis, no markdown, no bullets, no asterisks. Plain running text only.
- Warm, direct, professional.

HONESTY RULES (mandatory)
- Your ONLY source is the PAGE CONTENT below.
- Never invent figures, prices, timelines, names or promises that are not in it.
- If asked something the page does not cover, say so plainly ("this page doesn't cover that") and offer what you do know.
- Do not discuss competitors and do not give legal, medical or financial advice.`
};

function buildSystem(agent, lang, context) {
  const persona = pick(agent.persona, lang, agent.defaultLang);
  const cta = pick(agent.cta, lang, agent.defaultLang);
  const rules = RULES[lang] || RULES.en;
  const header = lang === 'es' ? 'CONTENIDO DE LA PÁGINA' : 'PAGE CONTENT';
  const empty = lang === 'es'
    ? '(La página no envió contenido. Dilo con honestidad y pide que reformulen.)'
    : '(The page sent no content. Say so honestly and ask them to rephrase.)';
  return `${persona}

${rules}${cta ? '\n- ' + cta : ''}

${header}
${context || empty}`;
}

// No model: answer extractively from the page text. Picks the sentences that
// share the most meaningful words with the question. Never composes a claim.
function heuristicReply(question, context, lang) {
  const ctx = String(context || '').trim();
  const none = lang === 'es'
    ? 'En este momento no tengo el detalle a la mano. ¿Puede reformular la pregunta o revisar la página?'
    : "I don't have that detail to hand right now. Could you rephrase, or take a look at the page?";
  if (!ctx) return none;

  const stop = new Set(('the a an and or of to in for on with is are what how why who when where '
    + 'que de la el los las un una y o en para por con como cual cuales quien cuando donde es son del al se su sus más mas').split(' '));
  const words = String(question || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter((w) => w.length > 3 && !stop.has(w));

  const sentences = ctx.split(/(?<=[.!?])\s+/).filter((s) => s.length > 40 && s.length < 320);
  if (!sentences.length) return none;

  let best = null, bestScore = 0;
  for (const s of sentences) {
    const low = s.toLowerCase();
    let score = 0;
    for (const w of words) if (low.includes(w)) score++;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (!best || bestScore === 0) {
    const intro = lang === 'es'
      ? 'Le cuento lo que dice esta página: '
      : "Here's what this page says: ";
    return intro + sentences[0];
  }
  return best.trim();
}

/**
 * GET /api/voice-agent/config?agent=camaravirtual&lang=es
 * Boot payload for the orb: display name, Edge voice and greeting.
 */
router.get('/config', (req, res) => {
  const cfg = agentConfig(req.query.agent, String(req.query.lang || '').toLowerCase());
  res.json({ ...cfg, brain: isConfigured() ? 'anthropic' : 'heuristic' });
});

/**
 * POST /api/voice-agent/chat
 * Body: { agent, lang, context, messages:[{role:'user'|'assistant', content}] }
 * ->    { reply, source: 'model'|'heuristic' }
 */
router.post('/chat', async (req, res) => {
  const body = req.body || {};
  const agent = getAgent(body.agent);
  const lang = agent.langs.includes(String(body.lang || '').toLowerCase())
    ? String(body.lang).toLowerCase()
    : agent.defaultLang;
  const context = cleanContext(body.context);

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_MSG) }));

  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length) return res.status(400).json({ error: 'messages required' });

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const askedText = lastUser ? lastUser.content : '';

  if (!isConfigured()) {
    return res.json({ reply: heuristicReply(askedText, context, lang), source: 'heuristic' });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: buildSystem(agent, lang, context),
      messages
    });

    const reply = (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();

    if (!reply) {
      return res.json({ reply: heuristicReply(askedText, context, lang), source: 'heuristic' });
    }
    res.json({ reply, source: 'model' });
  } catch (err) {
    console.error('[voice-agent]', err.message);
    res.json({ reply: heuristicReply(askedText, context, lang), source: 'heuristic', degraded: true });
  }
});

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'voice-agent',
    model: MODEL,
    brain: isConfigured() ? 'anthropic' : 'heuristic',
    voice: 'edge-tts (/api/tts/edge)',
    replaces: 'elevenlabs convai'
  });
});

module.exports = router;
