'use strict';
/**
 * Ana — asistente de IA del Gobierno del País Milagro (Defensores de la Patria).
 *
 * Es el "cerebro" del orbe de /hablar-con-ana.html. Sustituye al agente
 * conversacional de ElevenLabs (que empaquetaba STT + LLM + TTS) por la pila
 * propia y sin llaves de terceros que ya usamos en el resto del ecosistema:
 *
 *   STT  -> Web Speech API en el navegador (es-CO, cero costo)
 *   LLM  -> este endpoint (Claude Haiku)
 *   TTS  -> /api/tts/edge (Microsoft Edge neural, cero costo)
 *
 * Sin ANTHROPIC_API_KEY responde con una guía heurística basada en el plan
 * (nunca inventa cifras) para que la página siga funcionando.
 */

const express = require('express');
const router = express.Router();

const MODEL = process.env.ANA_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TURNS = 12;

// El plan de los primeros 100 días, tal como está publicado en
// public/defensores-landing.html. Ana solo puede hablar de esto.
const PLAN = `
GOBIERNO DEL PAÍS MILAGRO — Abelardo de la Espriella, Presidente de Colombia.
Posesión presidencial: viernes 7 de agosto de 2026.

METAS PÚBLICAS DE LOS PRIMEROS 100 DÍAS
- 100% de los contratos públicos en Blockchain 2030.
- 50 trámites en línea sin papel.
- 1.000 veredas con conectividad gratuita.
- Atención ciudadana con IA 24/7.

LOS SEIS PROYECTOS TECNOLÓGICOS
01. Blockchain 2030 — toda la contratación pública en una cadena de bloques inmutable y auditable por cualquier ciudadano. Cada peso del Estado, trazable en tiempo real. Piloto en Ecopetrol desde el día uno. (Propuesta 07, anticorrupción radical.)
02. Universidad Virtual en Casa — plataforma nacional de educación a distancia con ciclos cortos en tecnología, gratis para todos. (Propuesta 11, educación transformadora.)
03. Conectividad Nacional Gratuita — internet libre para las veredas y los municipios olvidados; conectividad como derecho, no como privilegio. (Propuestas 03 y 11, los nunca vistos.)
04. Estado Digital — trámites del ciudadano 100% en línea, sin filas ni papel; ventanilla única digital. (Propuesta 04, 100 días de resultados.)
05. Ana · IA Ciudadana — asistente de inteligencia artificial del Estado, 24/7, para resolver dudas y orientar trámites en lenguaje claro. (Ese es mi propio proyecto.)
06. Bloque de Búsqueda Digital — analítica de datos e IA contra la corrupción, la extorsión y los dineros del narcotráfico. (Propuestas 06 y 07, seguridad sin concesiones.)

CRONOGRAMA
Días 1–30 (Encender el motor): Decreto de Transparencia Digital y tablero público de resultados; piloto de Blockchain 2030 en Ecopetrol; Ana IA Ciudadana activada 24/7; inventario nacional de conectividad.
Días 31–60 (Conectar y formar): lanzamiento beta de la Universidad Virtual en Casa; primeras veredas con conectividad gratuita; ampliación de Blockchain 2030 a nuevas entidades; arranca el Bloque de Búsqueda Digital.
Días 61–100 (Entregar resultados): primeros 50 trámites 100% en línea; meta de 1.000 veredas conectadas; primer informe público de resultados verificables; hoja de ruta tecnológica del cuatrienio.

COMUNICACIONES
Boletines oficiales: https://defensoresdelapatria.com/
Sumarse a la reconstrucción: https://unete.defensoresdelapatria.com/
Sitio del plan tecnológico: defensoresdelapatria.app
`.trim();

const SYSTEM = `Eres Ana, la asistente de inteligencia artificial del Gobierno del País Milagro (Colombia), presidido por Abelardo de la Espriella. Hablas con ciudadanos por voz, en español colombiano.

CÓMO HABLAS
- Cálida, directa y respetuosa. Tratas al ciudadano de "usted".
- Respuestas CORTAS: dos o tres frases como máximo, porque tus respuestas se leen en voz alta. Si el tema es amplio, das lo esencial y ofreces ampliar.
- Sin emojis, sin markdown, sin viñetas, sin asteriscos. Solo texto corrido para ser leído en voz alta.
- Números en palabras cuando sea natural ("mil veredas", "cien días").

QUÉ SABES
Solo el plan tecnológico de los primeros 100 días que aparece abajo. Es tu única fuente.

REGLAS DE HONESTIDAD (obligatorias)
- Nunca inventes cifras, fechas, nombres, presupuestos ni promesas que no estén en el plan.
- Si preguntan algo que no está en el plan, dilo con claridad: "Eso todavía no está definido en el plan de los primeros cien días" y ofrece lo que sí sabe.
- No opinas de otros candidatos, partidos ni personas. No haces promesas a nombre del Presidente.
- Si piden trámites concretos, datos personales o ayuda legal, explica que aún no está habilitado y remite a los boletines oficiales en defensoresdelapatria.com.
- Si la persona quiere sumarse, menciona unete.defensoresdelapatria.com.

EL PLAN
${PLAN}`;

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Respuesta sin modelo: encuentra la sección del plan más pertinente. Nunca
// improvisa datos — si no reconoce el tema, lo dice.
function heuristicReply(text) {
  const q = String(text || '').toLowerCase();
  const has = (...w) => w.some((k) => q.includes(k));

  if (has('blockchain', 'contrato', 'corrupci', 'ecopetrol'))
    return 'Blockchain 2030 pone toda la contratación pública en una cadena de bloques que cualquier ciudadano puede auditar, con piloto en Ecopetrol desde el primer día. La meta es el cien por ciento de los contratos en los primeros cien días.';
  if (has('universidad', 'educaci', 'estudiar', 'curso'))
    return 'La Universidad Virtual en Casa es una plataforma nacional de educación a distancia, con ciclos cortos en tecnología y gratuita para todos. El lanzamiento beta va entre los días treinta y uno y sesenta.';
  if (has('internet', 'conectividad', 'vereda', 'señal', 'wifi'))
    return 'La Conectividad Nacional Gratuita lleva internet libre a las veredas y municipios olvidados. La meta de los primeros cien días son mil veredas conectadas.';
  if (has('tr[aá]mite', 'tramite', 'estado digital', 'papel', 'fila'))
    return 'El Estado Digital pone los trámites del ciudadano cien por ciento en línea, sin filas ni papel. Los primeros cincuenta trámites entran entre los días sesenta y uno y cien.';
  if (has('seguridad', 'extorsi', 'narco', 'delito'))
    return 'El Bloque de Búsqueda Digital usa analítica de datos e inteligencia artificial contra la corrupción, la extorsión y los dineros del narcotráfico. Arranca entre los días treinta y uno y sesenta.';
  if (has('100 d', 'cien d', 'plan', 'cronograma', 'proyecto'))
    return 'El plan tiene seis proyectos y tres fases: encender el motor en los primeros treinta días, conectar y formar hasta el día sesenta, y entregar resultados verificables al día cien. ¿Sobre cuál quiere que le cuente?';
  if (has('posesi', 'agosto', 'cu[aá]ndo empieza'))
    return 'El gobierno se posesiona el viernes siete de agosto de dos mil veintiséis, y desde ese día corre el reloj de los primeros cien días.';
  if (has('sumar', 'unir', 'apoyar', 'voluntari'))
    return 'Puede sumarse a la reconstrucción en unete punto defensoresdelapatria punto com. Ahí están los canales oficiales para participar.';
  if (has('hola', 'buenas', 'buenos d'))
    return 'Con mucho gusto. Soy Ana, la asistente de inteligencia artificial del Gobierno del País Milagro. ¿Qué quiere saber del plan de los primeros cien días?';

  return 'Le puedo contar del plan de los primeros cien días digitales: Blockchain dos mil treinta, la Universidad Virtual en Casa, la conectividad gratuita para las veredas o el Estado Digital. ¿Cuál le interesa?';
}

/**
 * POST /api/ana/chat
 * Body: { messages: [{role:'user'|'assistant', content:'...'}] }
 * -> { reply, source: 'model'|'heuristic' }
 */
router.post('/chat', async (req, res) => {
  try {
    const raw = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
    const messages = raw
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
      .slice(-MAX_TURNS)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    if (!messages.length) return res.status(400).json({ error: 'messages required' });
    // La API exige que el primer turno sea del ciudadano.
    while (messages.length && messages[0].role !== 'user') messages.shift();
    if (!messages.length) return res.status(400).json({ error: 'messages required' });

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');

    if (!isConfigured()) {
      return res.json({ reply: heuristicReply(lastUser && lastUser.content), source: 'heuristic' });
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages
    });

    const reply = (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();

    if (!reply) {
      return res.json({ reply: heuristicReply(lastUser && lastUser.content), source: 'heuristic' });
    }
    res.json({ reply, source: 'model' });
  } catch (err) {
    console.error('[ana-chat]', err.message);
    const raw = Array.isArray(req.body && req.body.messages) ? req.body.messages : [];
    const lastUser = [...raw].reverse().find((m) => m && m.role === 'user');
    res.json({ reply: heuristicReply(lastUser && lastUser.content), source: 'heuristic', degraded: true });
  }
});

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'ana-chat',
    model: MODEL,
    brain: isConfigured() ? 'anthropic' : 'heuristic',
    voice: 'edge-tts (/api/tts/edge)'
  });
});

module.exports = router;
