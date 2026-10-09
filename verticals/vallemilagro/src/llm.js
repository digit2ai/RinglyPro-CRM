'use strict';
/**
 * El ÚNICO archivo de este vertical que llega a un modelo (el SIT lo revisa).
 * Sin llave, o con el interruptor apagado, enabled() es false y cada agente
 * toma su ruta sin modelo, marcada como tal.
 */
let injected = null;
function _setClient(c) { injected = c; }

function enabled() {
  if (injected) return true;
  if (String(process.env.VALLEMILAGRO_AI || '').toLowerCase() === 'off') return false;
  if (!process.env.ANTHROPIC_API_KEY) return false;
  try { return require('../../../src/config/anthropic-flags').anthropicEnabled('vallemilagro'); } catch (e) { return true; }
}

function client() {
  if (injected) return injected;
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const VALLE_MODEL = () => process.env.VALLEMILAGRO_VALLE_MODEL || 'claude-haiku-4-5-20251001';
const SCOUT_MODEL = () => process.env.VALLEMILAGRO_SCOUT_MODEL || 'claude-sonnet-5';

/** Una respuesta de texto. Lanza si el modelo falla; quien llama decide la ruta sin modelo. */
async function text({ system, messages, model, max_tokens = 700 }) {
  const msg = await client().messages.create({ model: model || VALLE_MODEL(), max_tokens, system, messages });
  return (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

/**
 * Búsqueda web del lado del servidor. Devuelve el texto final y TODO lo que el
 * buscador devolvió (url, título, fecha), que es lo único que el código acepta
 * como fuente.
 */
async function search({ system, prompt, maxSearches = 25, allowedDomains }) {
  const tool = { type: process.env.VALLEMILAGRO_SCOUT_TOOL || 'web_search_20250305', name: 'web_search', max_uses: maxSearches,
    user_location: { type: 'approximate', city: 'Cali', region: 'Valle del Cauca', country: 'CO', timezone: 'America/Bogota' } };
  if (allowedDomains && allowedDomains.length) tool.allowed_domains = allowedDomains;
  const messages = [{ role: 'user', content: prompt }];
  const results = [];
  let searches = 0, out = '';
  for (let turn = 0; turn < 6; turn++) {
    const msg = await client().messages.create({ model: SCOUT_MODEL(), max_tokens: 8000, system, tools: [tool], messages });
    for (const b of msg.content || []) {
      if (b.type === 'server_tool_use') searches += 1;
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        b.content.forEach((x) => { if (x && x.url) results.push({ url: String(x.url), title: String(x.title || ''), page_age: x.page_age || null }); });
      }
      if (b.type === 'text') out += b.text;
    }
    if (msg.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: msg.content });
  }
  return { text: out, results, searches };
}

module.exports = { enabled, text, search, _setClient, VALLE_MODEL, SCOUT_MODEL };
