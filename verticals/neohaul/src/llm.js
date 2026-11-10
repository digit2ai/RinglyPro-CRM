'use strict';
/**
 * El ÚNICO archivo de NeoHaul que llega a un modelo (la SIT lo verifica).
 * Lee la foto de un vale / ticket de báscula y PROPONE sus datos, copiados
 * tal como aparecen (la conversión kg -> t y las verificaciones las hace index.js). Nunca calcula un importe: el importe
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

// Escrito sobre el vale real de HTR (No. 41971, 10-nov-2026): una parte escrita a mano
// (cliente, placas, pedido, producto, destino, operador, temperatura) y un sello de báscula impreso
// (transportista, ID/placas, folio, fecha y hora, peso bruto, tara y neto en kg).
const SYSTEM = `Lees fotos de vales y tickets de báscula de plantas de asfalto en México (por ejemplo, el vale de HTR Infraestructura).
Devuelve SOLO un objeto JSON con estas llaves:
{"vale_no": string|null, "folio": string|null, "pedido": string|null, "fecha": string|null, "hora": string|null, "fecha_escrita": string|null,
 "placas": string|null, "placas_escritas": string|null, "cliente": string|null, "producto": string|null, "destino": string|null,
 "operador": string|null, "temperatura": string|null, "transportista": string|null,
 "peso_bruto": string|null, "peso_tara": string|null, "peso_neto": string|null, "toneladas": string|null, "legible": "si"|"parcial"|"no"}
Reglas:
- Copia cada valor tal como aparece. No corrijas, no conviertas, no calcules, no restes.
- "vale_no": el número impreso del vale (por ejemplo, junto a "Nº", en rojo).
- "folio": el folio del sello de báscula. "pedido": el No. de pedido escrito a mano.
- "fecha" y "hora": las IMPRESAS por la báscula (por ejemplo 28/09/2026 10:43). "fecha_escrita": la que está escrita a mano, si hay.
- "placas": las impresas en el sello (ID/Placas). "placas_escritas": las escritas a mano.
- "peso_bruto", "peso_tara", "peso_neto": con su unidad tal como aparece (por ejemplo "21070 kg").
- "toneladas": solo si el ticket imprime el neto en toneladas; si está en kg, null.
- Si un dato no se lee con claridad, null. Nunca adivines.
- Sin texto fuera del JSON.`;

/** Devuelve el objeto del lector (ver SYSTEM) o null en cualquier falla. */
async function leerTicket(jpegBuffer) {
  if (!aiEnabled() || !jpegBuffer) return null;
  try {
    client = client || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await client.messages.create({
      model: MODEL(), max_tokens: 700, temperature: 0, system: SYSTEM,
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
