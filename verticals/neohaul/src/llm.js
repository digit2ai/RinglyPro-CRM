'use strict';
/**
 * El ÚNICO archivo de NeoHaul que llega a un modelo (la SIT lo verifica).
 * Lee la foto de un ticket de planta y PROPONE número de ticket, fecha y
 * toneladas, copiados tal como aparecen. Nunca calcula un importe: el importe
 * lo calcula money.js cuando Andrés confirma la cantidad. Sin llave, o con la
 * IA apagada en src/config/anthropic-flags.js (clave `neohaul`), devuelve null
 * y la pantalla pide capturar a mano.
 */
let Anthropic = null, flags = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) {}
try { flags = require('../../../src/config/anthropic-flags'); } catch (_) {}

const MODEL = () => process.env.NEOHAUL_OCR_MODEL || 'claude-haiku-4-5-20251001';
function aiEnabled() {
  if (!process.env.ANTHROPIC_API_KEY || !Anthropic) return false;
  if (process.env.NEOHAUL_AI === 'off') return false;
  if (flags && flags.anthropicEnabled) { try { return !!flags.anthropicEnabled('neohaul'); } catch (_) { return false; } }
  return true;
}
let client = null;

const SYSTEM = `Lees fotos de tickets de báscula de plantas de asfalto en México.
Devuelve SOLO un objeto JSON con estas llaves:
{"ticket_no": string|null, "fecha": string|null, "toneladas": string|null, "placas": string|null, "legible": "si"|"parcial"|"no"}
Reglas:
- Copia cada valor tal como aparece impreso. No corrijas, no conviertas, no calcules.
- "toneladas" es el PESO NETO. Si solo ves bruto y tara, devuelve null: no restes.
- "fecha" tal como está impresa (por ejemplo 08/10/2026).
- Si un dato no se lee con claridad, devuelve null. Nunca adivines.
- Sin texto fuera del JSON.`;

/** Devuelve {ticket_no, fecha, toneladas, placas, legible} o null en cualquier falla. */
async function leerTicket(jpegBuffer) {
  if (!aiEnabled() || !jpegBuffer) return null;
  try {
    client = client || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await client.messages.create({
      model: MODEL(), max_tokens: 300, temperature: 0, system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBuffer.toString('base64') } },
        { type: 'text', text: 'Lee este ticket.' }
      ] }]
    });
    const text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (e) { console.warn('[neohaul] ocr:', e.message); return null; }
}

module.exports = { aiEnabled, leerTicket, MODEL };
