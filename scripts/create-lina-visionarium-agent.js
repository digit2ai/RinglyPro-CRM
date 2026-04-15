#!/usr/bin/env node
/**
 * Creates Lina - Visionarium ElevenLabs ConvAI agent
 * - Bilingual EN/ES with auto language detection
 * - Knowledge base: the Visionarium whitepaper (EN + ES)
 * - Built-in tool: transfer_to_number -> Lala +16462098900
 */

'use strict';
require('dotenv').config();

const API = 'https://api.elevenlabs.io/v1';
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY missing'); process.exit(1); }

const EN_URL = 'https://aiagent.ringlypro.com/youth-talent-global/whitepaper.html';
const ES_URL = 'https://aiagent.ringlypro.com/youth-talent-global/whitepaper-es.html';
const LALA_NUMBER = '+16462098900';
const LINA_VOICE_ID = 'zl7szWVBXnpgrJmAalgz';

async function req(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function createKbFromUrl(name, url) {
  const payload = { name, url };
  const res = await req('POST', '/convai/knowledge-base/url', payload);
  return res.id;
}

const EN_PROMPT = `You are Lina, the official AI ambassador of Visionarium — a leadership, creativity, and global youth talent foundation. You speak warmly, clearly, and with conviction about the Visionarium program, its pillars, sponsor tiers, and founding story. You are fluent in both English and Spanish; detect the caller's language automatically and respond in the same language.

Your core purpose:
1. Answer any question about the Visionarium white paper: mission, cohorts, curriculum, sponsor tiers (Founding Program Sponsor, Pillar Sponsor, Partner), Demo Day, Advisory Council, LATAM talent pipeline, and the founding attribution program.
2. Reference Maria Clara Garcia as the Founding Program Sponsor and Manuel Stagg as the founder when appropriate.
3. When the caller wants to speak with a human, asks to speak with Lala, asks for a representative, or requests to be transferred, IMMEDIATELY use the transfer_to_number tool to connect them to Lala at ${LALA_NUMBER}. Announce the transfer briefly before executing.
4. Never invent facts that are not supported by the whitepaper or the knowledge base. If unsure, offer to transfer the caller to Lala for details.

Style:
- Warm, confident, mission-driven
- Short, natural sentences suitable for voice
- Mirror the caller's language (EN or ES)
- Close every answer with a light invitation: offer more detail, offer to transfer to Lala, or ask a follow-up question`;

const ES_PROMPT = `Eres Lina, la embajadora oficial de IA de Visionarium — una fundación de liderazgo, creatividad y talento juvenil global. Hablas con calidez, claridad y convicción sobre el programa Visionarium, sus pilares, niveles de patrocinio y la historia fundadora. Eres bilingüe; detecta el idioma de quien llama y responde en el mismo idioma.

Tu propósito:
1. Responder cualquier pregunta sobre el white paper de Visionarium: misión, cohortes, currículo, niveles de patrocinio (Patrocinador Fundador del Programa, Patrocinador de Pilar, Socio), Demo Day, Consejo Asesor, pipeline de talento LATAM y el programa de atribución fundadora.
2. Menciona a Maria Clara García como la Patrocinadora Fundadora del Programa y a Manuel Stagg como el fundador cuando sea apropiado.
3. Cuando la persona quiera hablar con un humano, pregunte por Lala, pida un representante o solicite una transferencia, USA INMEDIATAMENTE la herramienta transfer_to_number para conectarla con Lala al ${LALA_NUMBER}. Anuncia la transferencia brevemente antes de ejecutarla.
4. Nunca inventes hechos que no estén respaldados por el whitepaper o la base de conocimiento. Si no estás segura, ofrece transferir a Lala.

Estilo:
- Cálida, segura, orientada a la misión
- Frases cortas y naturales, aptas para voz
- Refleja el idioma de quien llama (EN o ES)
- Cierra cada respuesta con una invitación: más detalle, transferir a Lala, o una pregunta de seguimiento`;

(async () => {
  // Reuse existing KBs if provided via env; otherwise create new ones
  const enKbId = process.env.VISIONARIUM_EN_KB_ID || await createKbFromUrl('Visionarium Whitepaper (EN)', EN_URL);
  const esKbId = process.env.VISIONARIUM_ES_KB_ID || await createKbFromUrl('Visionarium Whitepaper (ES)', ES_URL);
  console.log('   EN KB:', enKbId);
  console.log('   ES KB:', esKbId);

  const knowledgeBase = [
    { id: enKbId, type: 'url', name: 'Visionarium Whitepaper (EN)', usage_mode: 'auto' },
    { id: esKbId, type: 'url', name: 'Visionarium Whitepaper (ES)', usage_mode: 'auto' }
  ];

  const transferToLala = {
    type: 'system',
    name: 'transfer_to_number',
    description: '',
    response_timeout_secs: 20,
    disable_interruptions: false,
    force_pre_tool_speech: false,
    assignments: [],
    tool_call_sound: null,
    tool_call_sound_behavior: 'auto',
    tool_error_handling_mode: 'auto',
    params: {
      system_tool_type: 'transfer_to_number',
      transfers: [{
        custom_sip_headers: [],
        transfer_destination: { type: 'phone', phone_number: LALA_NUMBER },
        transfer_type: 'conference',
        post_dial_digits: null,
        phone_number: LALA_NUMBER,
        condition: 'When the caller asks to speak with Lala, a human, a representative, a person, someone from the team, or requests a transfer. Cuando la persona pida hablar con Lala, un humano, un representante, o pida una transferencia.'
      }],
      enable_client_message: true
    }
  };

  const languageDetection = {
    type: 'system',
    name: 'language_detection',
    description: '',
    response_timeout_secs: 20,
    params: { system_tool_type: 'language_detection' }
  };

  const agentPayload = {
    name: 'Lina - Visionarium',
    conversation_config: {
      agent: {
        first_message: "Hi, I'm Lina — welcome to Visionarium. Ask me anything about the program, the cohorts, or our sponsor tiers, and I can connect you with Lala if you'd like to speak with a human.",
        language: 'en',
        prompt: {
          prompt: EN_PROMPT,
          llm: 'gemini-2.5-flash',
          temperature: 0.4,
          max_tokens: -1,
          tools: [transferToLala, languageDetection],
          knowledge_base: knowledgeBase,
          rag: { enabled: true }
        }
      },
      tts: {
        voice_id: LINA_VOICE_ID,
        model_id: 'eleven_turbo_v2'
      },
      asr: { quality: 'high' },
      turn: { turn_timeout: 7 }
    },
    language_presets: {
      es: {
        overrides: {
          agent: {
            first_message: 'Hola, soy Lina — bienvenida a Visionarium. Pregúntame lo que quieras sobre el programa, las cohortes o los niveles de patrocinio, y puedo conectarte con Lala si deseas hablar con una persona.',
            language: 'es',
            prompt: { prompt: ES_PROMPT }
          }
        }
      }
    },
    platform_settings: {
      widget: {
        variant: 'full',
        placement: 'bottom-right',
        avatar: { type: 'orb', color_1: '#2563eb', color_2: '#8b5cf6' }
      }
    },
    tags: ['visionarium', 'youth-talent-global']
  };

  console.log('3) Creating agent...');
  const agent = await req('POST', '/convai/agents/create', agentPayload);
  console.log('\n=== AGENT CREATED ===');
  console.log('agent_id:', agent.agent_id);
  console.log('Embed widget:');
  console.log(`<elevenlabs-convai agent-id="${agent.agent_id}"></elevenlabs-convai>`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
