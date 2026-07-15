'use strict';
// =====================================================
// promptBuilder — turns a free-form natural-language description of a video
// into a structured video-generation prompt:
//   { scenes:[{n,description,camera,action}], style, durationSec, aspectRatio, platform, title, source }
//
// Path 1: Anthropic Claude (if ANTHROPIC_API_KEY present). Two attempts.
// Path 2: deterministic in-memory mock (template-fills fields from raw text).
//         SIT always runs this path (OKHOLA_INMEM / no key) so it never depends
//         on a live external call.
// =====================================================

const MODEL = process.env.OKHOLA_MODEL || 'claude-haiku-4-5-20251001';

const ASPECTS = ['9:16', '16:9', '1:1'];
const PLATFORMS = ['tiktok', 'youtube', 'instagram', 'facebook', 'general'];

// ---- deterministic mock (no external calls, // TODO: real LLM) ----
function buildMock(rawText) {
  const text = String(rawText || '').trim();
  const lower = text.toLowerCase();

  // style inference
  let style = 'cinematográfico';
  if (/3d|tres dimensiones|render/.test(lower)) style = '3D animado';
  else if (/cartoon|caricatura|dibujo/.test(lower)) style = 'cartoon 2D';
  else if (/anime/.test(lower)) style = 'anime';
  else if (/profesional|corporativo|empresa/.test(lower)) style = 'profesional corporativo';
  else if (/miniserie|serie|episod/.test(lower)) style = 'miniserie narrativa';
  else if (/realista|foto|real/.test(lower)) style = 'foto-realista';

  // platform inference
  let platform = 'general';
  if (/tiktok/.test(lower)) platform = 'tiktok';
  else if (/youtube|yt/.test(lower)) platform = 'youtube';
  else if (/instagram|insta|reel/.test(lower)) platform = 'instagram';
  else if (/facebook|fb/.test(lower)) platform = 'facebook';

  // aspect ratio inference (vertical for short-form, else landscape)
  let aspectRatio = '16:9';
  if (/vertical|reel|tiktok|short|historia|story/.test(lower)) aspectRatio = '9:16';
  else if (/cuadrado|square|1:1/.test(lower)) aspectRatio = '1:1';

  // duration inference (seconds)
  let durationSec = 30;
  const secMatch = lower.match(/(\d{1,3})\s*(segundos?|seg|s\b)/);
  const minMatch = lower.match(/(\d{1,2})\s*(minutos?|min)/);
  if (minMatch) durationSec = Math.min(600, parseInt(minMatch[1], 10) * 60);
  else if (secMatch) durationSec = Math.min(600, parseInt(secMatch[1], 10));
  else if (/miniserie|serie|episod/.test(lower)) durationSec = 120;

  // scene breakdown: split raw text into sentence-ish chunks; cap at 6 scenes.
  const chunks = text
    .split(/(?<=[.!?\n])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  const usable = chunks.length ? chunks : [text || 'Escena principal del video.'];
  const sceneCount = Math.max(1, Math.min(6, usable.length));
  const scenes = [];
  for (let i = 0; i < sceneCount; i++) {
    const desc = usable[i] || usable[usable.length - 1];
    scenes.push({
      n: i + 1,
      description: desc.slice(0, 400),
      camera: i === 0 ? 'plano general de apertura' : (i === sceneCount - 1 ? 'primer plano de cierre' : 'plano medio dinámico'),
      action: 'Transición suave; ritmo acorde al estilo ' + style + '.'
    });
  }

  const title = (text.split(/[.\n]/)[0] || 'Nuevo video').slice(0, 80).trim() || 'Nuevo video';

  return { scenes, style, durationSec, aspectRatio, platform, title, source: 'mock' };
}

// ---- normalize/validate whatever the LLM returned into the strict contract ----
function normalize(obj, rawText) {
  const mock = buildMock(rawText);
  if (!obj || typeof obj !== 'object') return mock;
  const out = {
    scenes: Array.isArray(obj.scenes) && obj.scenes.length ? obj.scenes.map((s, i) => ({
      n: Number(s.n) || i + 1,
      description: String(s.description || s.desc || '').slice(0, 400) || mock.scenes[0].description,
      camera: String(s.camera || 'plano medio').slice(0, 120),
      action: String(s.action || '').slice(0, 200)
    })) : mock.scenes,
    style: String(obj.style || mock.style).slice(0, 120),
    durationSec: Number.isFinite(Number(obj.durationSec)) ? Math.max(1, Math.min(600, Math.round(Number(obj.durationSec)))) : mock.durationSec,
    aspectRatio: ASPECTS.includes(obj.aspectRatio) ? obj.aspectRatio : mock.aspectRatio,
    platform: PLATFORMS.includes(String(obj.platform || '').toLowerCase()) ? String(obj.platform).toLowerCase() : mock.platform,
    title: String(obj.title || mock.title).slice(0, 80),
    source: 'llm'
  };
  return out;
}

async function callAnthropic(rawText) {
  // Lazy require so the app boots even if the SDK is absent.
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const sys = [
    'Eres un asistente que convierte una descripción libre de un video en un PROMPT ESTRUCTURADO de generación de video.',
    'Devuelve EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional, con esta forma exacta:',
    '{"title": string, "scenes": [{"n": number, "description": string, "camera": string, "action": string}], "style": string, "durationSec": number, "aspectRatio": "9:16"|"16:9"|"1:1", "platform": "tiktok"|"youtube"|"instagram"|"facebook"|"general"}',
    'No inventes limitaciones de longitud. Respeta el idioma del usuario. Máximo 8 escenas.'
  ].join('\n');
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: sys,
    messages: [{ role: 'user', content: 'Descripción del video:\n\n' + String(rawText) }]
  });
  const textPart = (resp.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const jsonStr = textPart.slice(textPart.indexOf('{'), textPart.lastIndexOf('}') + 1);
  return JSON.parse(jsonStr);
}

async function build(rawText) {
  const hasKey = !!process.env.ANTHROPIC_API_KEY && process.env.OKHOLA_FORCE_MOCK !== '1';
  if (!hasKey) return buildMock(rawText); // // TODO: real LLM integration (no key)

  // Two attempts, then deterministic fallback.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callAnthropic(rawText);
      return normalize(raw, rawText);
    } catch (e) {
      process.stderr.write(`[okhola] LLM attempt ${attempt} failed: ${e.message}\n`);
    }
  }
  return buildMock(rawText); // // TODO: real LLM integration (fell back after 2 failures)
}

module.exports = { build, buildMock, normalize };
