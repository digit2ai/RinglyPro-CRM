'use strict';

// =============================================================
// HISP-102 — enriquecimiento asistido por IA.
//
// LA IA PROPONE CAMPO A CAMPO. NO PUBLICA NADA.
//
// Cada valor sugerido entra en hd_entry_fields con estado 'propuesto' y su
// fuente. El validador acepta, edita o rechaza CADA UNO por separado — nunca
// en bloque, porque aceptar diez campos de golpe es no revisar ninguno. La
// ficha permanece 'pendiente_validacion' hasta que una persona la valida.
//
// SIN FUENTE, EL CAMPO SE QUEDA VACIO. El modelo devuelve null cuando no sabe,
// y una propuesta sin fuente se descarta aqui antes de guardarse. Rellenar por
// verosimilitud es exactamente lo que este modulo no puede hacer: una cifra
// inventada en una ficha de fundacion sobrevive a la revision porque parece
// razonable.
// =============================================================

const MODEL = process.env.HISPANOTEC_MODEL || 'claude-haiku-4-5-20251001';

// Solo estos. El presupuesto de una fundacion NO esta aqui a proposito: lo
// gobierna HISP-104 con fuente y ejercicio obligatorios, y no se deja a una
// sugerencia de modelo.
const CAMPOS = ['sector', 'pais', 'tamano', 'especialidad', 'localizacion', 'web', 'lineas_actuacion'];

const SYSTEM = `Eres un asistente de enriquecimiento de fichas para el directorio de HISPANOTEC.

Recibes una ficha incompleta. Propones UNICAMENTE los campos que faltan, y solo si tienes una base real para hacerlo.

REGLAS ABSOLUTAS
- Si no sabes un dato con una fuente concreta, devuelves null para ese campo. NUNCA rellenas por verosimilitud ni por lo que "suele ser".
- Cada campo propuesto lleva una "fuente": el tipo de origen del que procede (registro publico, web institucional, memoria anual, conocimiento general verificable). Si no puedes nombrar una fuente, el valor es null.
- No propones presupuestos, dotaciones ni cifras economicas de ningun tipo. Ese dato lo gobierna otro modulo con fuente y ejercicio obligatorios.
- No propones datos de contacto personales (email, telefono) que no consten ya en la ficha.
- No inventas nombres de personas, cargos ni relaciones.

Devuelves SOLO JSON con esta forma, sin texto alrededor:
{"campos":[{"campo":"sector","valor":"...","fuente":"...","confianza":"alta|media|baja"}]}

Un campo que no puedas fundamentar simplemente NO aparece en el array. Un array vacio es una respuesta correcta y frecuente.`;

function configurado() { return Boolean(process.env.ANTHROPIC_API_KEY); }

/**
 * Propone valores para los campos vacios de una ficha.
 * No escribe: devuelve las propuestas para que la ruta las guarde como
 * 'propuesto' y una persona las revise.
 */
async function proponer(ficha) {
  const vacios = CAMPOS.filter((c) => {
    const v = ficha[c];
    return v == null || v === '' || (Array.isArray(v) && !v.length);
  });

  if (!vacios.length) {
    return { ok: true, propuestas: [], nota: 'La ficha no tiene campos vacios que enriquecer.' };
  }
  if (!configurado()) {
    return { ok: false, propuestas: [], sin_modelo: true,
      nota: 'No hay modelo de lenguaje configurado en este despliegue. El enriquecimiento '
          + 'asistido no esta disponible; los campos pueden completarse a mano.' };
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await client.messages.create({
      model: MODEL, max_tokens: 900, system: SYSTEM,
      messages: [{ role: 'user', content:
        'FICHA ACTUAL:\n' + JSON.stringify({
          nombre: ficha.nombre, naturaleza: ficha.naturaleza, pais: ficha.pais,
          sector: ficha.sector, especialidad: ficha.especialidad,
          localizacion: ficha.localizacion, web: ficha.web, tamano: ficha.tamano,
          lineas_actuacion: ficha.lineas_actuacion,
        }, null, 1)
        + '\n\nCAMPOS VACIOS QUE PUEDES PROPONER: ' + vacios.join(', ')
        + '\n\nDevuelve solo los que puedas fundamentar con una fuente.' }],
    });

    const texto = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const m = texto.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, propuestas: [], nota: 'El modelo no devolvio un JSON interpretable.' };
    const data = JSON.parse(m[0]);

    // EL FILTRO ES LO QUE HACE FIABLE ESTO, no el prompt. Se descarta:
    //  - cualquier campo fuera de la lista permitida,
    //  - cualquier campo que no estuviera vacio (no se pisa lo ya confirmado),
    //  - cualquier propuesta sin fuente,
    //  - cualquier valor con forma de cifra economica.
    const propuestas = (Array.isArray(data.campos) ? data.campos : [])
      .filter((c) => c && CAMPOS.includes(c.campo) && vacios.includes(c.campo))
      .filter((c) => c.valor != null && String(c.valor).trim() !== '')
      .filter((c) => c.fuente && String(c.fuente).trim() !== '')
      .filter((c) => !/(\d[\d.,]{4,})\s*(eur|euros|€|\$|usd|millones)/i.test(String(c.valor)))
      .map((c) => ({
        campo: c.campo,
        valor: String(c.valor).slice(0, 500),
        fuente: String(c.fuente).slice(0, 300),
        confianza: ['alta', 'media', 'baja'].includes(c.confianza) ? c.confianza : 'baja',
      }));

    const descartadas = (Array.isArray(data.campos) ? data.campos.length : 0) - propuestas.length;
    return { ok: true, propuestas, campos_vacios: vacios,
      descartadas: descartadas > 0 ? descartadas : 0,
      nota: propuestas.length
        ? 'Propuestas de la IA, sin publicar. Acepta, edita o rechaza cada campo por separado.'
        : 'La IA no ha podido fundamentar ningun campo con una fuente. Los campos siguen vacios, '
        + 'que es la respuesta correcta cuando no hay dato.' };
  } catch (e) {
    console.error('[hispanotec/enriquecer]', e.message);
    return { ok: false, propuestas: [], nota: 'No se pudo consultar el modelo: ' + e.message };
  }
}

module.exports = { proponer, configurado, CAMPOS, MODEL, SYSTEM };
