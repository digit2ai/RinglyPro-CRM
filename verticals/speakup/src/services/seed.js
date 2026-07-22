'use strict';

/**
 * SpeakUp — optional demo seed (SPEAKUP_SEED_DEMO=1).
 * Inserts one sample recording + a REAL sample transcript (clearly a sample,
 * not a fake STT run) + an AI summary for the owner's tenant. Idempotent.
 */

const { User, Recording, Transcript, Summary } = require('../models');
const ai = require('./ai-editor');

const SAMPLE_TEXT =
  'Buenos días a todos, gracias por conectarse a la reunión semanal de producto. ' +
  'El objetivo de hoy es cerrar el alcance del lanzamiento de SpeakUp para el equipo. ' +
  'Primero, confirmamos que la grabación en vivo desde el navegador ya funciona sin configuración. ' +
  'Segundo, necesitamos definir quién carga el modelo de transcripción propio la próxima semana. ' +
  'Tercero, María va a preparar los textos en español e inglés para la interfaz. ' +
  'Voy a enviar el resumen de esta reunión por correo hoy mismo. ' +
  'Recordemos que ninguna llamada usa un bot que se une a la reunión: capturamos el audio del propio dispositivo. ' +
  'Cerramos con la meta de tener la app en producción esta semana.';

async function seedDemo() {
  const owner = await User.findOne({ where: { email: 'mstagg@digit2ai.com' } });
  const tenant_id = owner ? (owner.tenant_id || owner.id) : 1;

  const existing = await Recording.count({ where: { tenant_id } });
  if (existing > 0) return { seeded: false, recordings: existing };

  const rec = await Recording.create({
    tenant_id,
    user_id: owner ? owner.id : null,
    title: 'Reunión semanal de producto (ejemplo)',
    source: 'meeting',
    lang: 'es',
    duration_sec: 92,
    status: 'done',
    engine: 'sample'
  });

  await Transcript.create({
    tenant_id,
    recording_id: rec.id,
    text: SAMPLE_TEXT,
    segments: [{ start: 0, end: 92, speaker: 'spk_1', text: SAMPLE_TEXT }],
    lang_detected: 'es',
    engine: 'sample',
    is_simulated: true
  });

  try {
    const s = await ai.summarize(SAMPLE_TEXT, 'es');
    await Summary.create({
      tenant_id, recording_id: rec.id,
      summary: s.summary, bullets: s.bullets, action_items: s.action_items,
      model: ai.activeModel()
    });
  } catch (e) { /* summary is optional for the seed */ }

  return { seeded: true, recording_id: rec.id };
}

module.exports = { seedDemo };
