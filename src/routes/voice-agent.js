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

const MAX_RONDAS_HERRAMIENTA = 4;   // ida y vuelta con el modelo antes de rendirse
const TOOL_TIMEOUT_MS = 8000;
const TOOL_LIMITE_HORA = Number(process.env.VOICE_AGENT_TOOL_CALLS_PER_HOUR || 60);

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ── HERRAMIENTAS (opt-in por pack) ────────────────────────────────────────
//
// Casi todos los orbes solo leen la página en la que están: para una landing
// eso basta y es lo que los hace honestos. Pero un orbe que ATIENDE a alguien
// necesita mirar el expediente de quien pregunta, y eso no está escrito en
// ninguna página. Un pack puede declarar `tools`; el que no lo hace se
// comporta exactamente igual que antes — nada de esto se activa sin la
// declaración.
//
// Las herramientas se ejecutan por HTTP de vuelta a este mismo proceso, contra
// endpoints que ya existen. Aquí no se reimplementa ninguna consulta: si la de
// ENRUTA cambia, esto la sigue sin enterarse.

function loopbackBase() {
  return `http://127.0.0.1:${process.env.PORT || 3000}`;
}

// El orbe es una superficie pública. Un techo por IP evita que la ventana de
// consulta se convierta en un raspador de expedientes a punta de fuerza bruta.
const _toolHits = new Map();
function excedeLimite(ip) {
  const ahora = Date.now();
  const hits = (_toolHits.get(ip) || []).filter((t) => ahora - t < 3600000);
  if (hits.length >= TOOL_LIMITE_HORA) { _toolHits.set(ip, hits); return true; }
  hits.push(ahora);
  _toolHits.set(ip, hits);
  if (_toolHits.size > 5000) {
    for (const [k, v] of _toolHits) if (!v.some((t) => ahora - t < 3600000)) _toolHits.delete(k);
  }
  return false;
}

async function ejecutarHerramienta(agent, nombre, argumentos) {
  const def = (agent.tools.definiciones || []).find((d) => d.name === nombre);
  // Un nombre que no está declarado no se llama: el modelo no elige la URL.
  if (!def) return { error: `herramienta desconocida: ${nombre}` };

  const url = loopbackBase() + agent.tools.base + def.ruta;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TOOL_TIMEOUT_MS);
  try {
    const opciones = def.metodo === 'GET'
      ? { method: 'GET', signal: ctl.signal }
      : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(argumentos || {}),
        signal: ctl.signal
      };
    const r = await fetch(url, opciones);
    const cuerpo = await r.json().catch(() => null);
    if (!cuerpo) return { error: `la consulta respondió ${r.status} sin datos` };
    return cuerpo;
  } catch (e) {
    // Se devuelve el fallo AL MODELO, no una respuesta vacía: así dice que no
    // pudo consultar en vez de inventar un estado.
    return { error: `no se pudo consultar: ${e.name === 'AbortError' ? 'tiempo agotado' : e.message}` };
  } finally {
    clearTimeout(t);
  }
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

// Un agente que agenda tiene que saber qué día es hoy.
//
// Pedirle "el quince de septiembre" a un modelo sin fecha en el prompt produce
// una fecha con el año que le parezca: la primera cita real de Laura quedó
// agendada para septiembre de 2024, un año y medio en el pasado, y la
// confirmó en voz alta como si nada. Es el mismo tropiezo que el agente de
// ConversationRelay ya resuelve con su tabla de fechas.
function hoyParaElModelo(lang) {
  const f = new Intl.DateTimeFormat(lang === 'es' ? 'es-CO' : 'en-US', {
    timeZone: 'America/Bogota', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(new Date());
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  return lang === 'es'
    ? `\nHOY es ${f} (${iso}). Toda fecha que calcules parte de hoy y va en el FUTURO. Si el ciudadano dice un día sin año, es el próximo que caiga. Nunca uses un año distinto al de hoy salvo que la fecha ya haya pasado este año.`
    : `\nTODAY is ${f} (${iso}). Every date you compute starts from today and lies in the FUTURE.`;
}

function buildSystem(agent, lang, context) {
  const persona = pick(agent.persona, lang, agent.defaultLang);
  const cta = pick(agent.cta, lang, agent.defaultLang);
  const rules = RULES[lang] || RULES.en;
  const header = lang === 'es' ? 'CONTENIDO DE LA PÁGINA' : 'PAGE CONTENT';
  const empty = lang === 'es'
    ? '(La página no envió contenido. Dilo con honestidad y pide que reformulen.)'
    : '(The page sent no content. Say so honestly and ask them to rephrase.)';
  // Solo para los packs con herramientas: los orbes de landing no agendan nada
  // y su prompt no tiene por qué moverse.
  const fecha = agent.tools ? hoyParaElModelo(lang) : '';

  return `${persona}

${rules}${cta ? '\n- ' + cta : ''}${fecha}

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
    // Sin modelo no hay consulta posible: un agente con herramientas que
    // responde de memoria es peor que uno que admite que no puede mirar.
    if (agent.tools) {
      return res.json({
        reply: lang === 'es'
          ? 'En este momento no puedo consultar su expediente. Puede llamar a la línea de atención al seis cero dos, tres ocho cero, ocho nueve cinco siete.'
          : "I can't look up your record right now. Please call the service line.",
        source: 'heuristic', degraded: true
      });
    }
    return res.json({ reply: heuristicReply(askedText, context, lang), source: 'heuristic' });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const conHerramientas = !!(agent.tools && Array.isArray(agent.tools.definiciones) && agent.tools.definiciones.length);
    const tools = conHerramientas
      ? agent.tools.definiciones.map(({ name, description, input_schema }) => ({ name, description, input_schema }))
      : undefined;

    // El historial crece dentro del bucle: cada resultado de herramienta vuelve
    // como un turno, que es como el modelo lo lee.
    const hilo = messages.slice();
    const usadas = [];
    let response = null;

    for (let ronda = 0; ronda < (conHerramientas ? MAX_RONDAS_HERRAMIENTA : 1); ronda++) {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: buildSystem(agent, lang, context),
        messages: hilo,
        ...(tools ? { tools } : {})
      });

      const pedidos = (response.content || []).filter((b) => b.type === 'tool_use');
      if (!pedidos.length) break;

      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'desconocida';
      hilo.push({ role: 'assistant', content: response.content });

      const resultados = [];
      for (const p of pedidos) {
        let salida;
        if (excedeLimite(ip)) {
          salida = { error: 'límite de consultas alcanzado, intente más tarde' };
        } else {
          salida = await ejecutarHerramienta(agent, p.name, p.input);
          usadas.push(p.name);
        }
        resultados.push({
          type: 'tool_result',
          tool_use_id: p.id,
          content: JSON.stringify(salida).slice(0, 6000)
        });
      }
      hilo.push({ role: 'user', content: resultados });
    }

    const reply = (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();

    if (!reply) {
      // Si se acabaron las rondas con el modelo todavía pidiendo datos, se dice
      // que no se pudo resolver. Una respuesta vacía se oiría como un cuelgue.
      if (usadas.length) {
        return res.json({
          reply: lang === 'es'
            ? 'No logré completar la consulta en este momento. Puede intentarlo de nuevo o llamar a la línea de atención.'
            : "I couldn't complete that lookup right now. Please try again or call the service line.",
          source: 'model', tools_used: usadas, incomplete: true
        });
      }
      return res.json({ reply: heuristicReply(askedText, context, lang), source: 'heuristic' });
    }
    res.json({ reply, source: 'model', ...(usadas.length ? { tools_used: usadas } : {}) });
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
