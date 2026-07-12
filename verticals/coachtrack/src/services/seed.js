'use strict';

/**
 * CoachTrack — optional demo seed (COACHTRACK_SEED_DEMO=1).
 * One finalized sample session with transcript + action items. Idempotent.
 */

const { Session, Transcript, ActionItem } = require('../models');

async function seedDemo() {
  const existing = await Session.count({ where: { tenant_id: 1 } });
  if (existing > 0) return { seeded: false, sessions: existing };

  const s = await Session.create({
    tenant_id: 1,
    coach_name: 'Lala',
    subject: 'Priorizar el lanzamiento y delegar tareas',
    summary: 'Revisamos la carga de trabajo de la semana. Identifiqué que estoy reteniendo demasiadas tareas operativas. Acordamos delegar la parte de reportes y bloquear tiempo para el trabajo estratégico del lanzamiento.',
    status: 'finalized',
    duration_min: 45
  });

  const turns = [
    { role: 'coach', text: '¿Cuál es el tema más importante de hoy?' },
    { role: 'me', text: 'Siento que no avanzo en el lanzamiento porque me la paso apagando incendios.' },
    { role: 'coach', text: '¿Qué tareas podrías delegar esta semana?' },
    { role: 'me', text: 'Voy a delegar los reportes semanales al equipo y voy a bloquear dos horas diarias para el lanzamiento.' }
  ];
  let i = 0;
  for (const t of turns) {
    await Transcript.create({ session_id: s.id, turn_index: i++, role: t.role, text: t.text, source: 'typed' });
  }

  await ActionItem.create({ tenant_id: 1, session_id: s.id, text: 'Delegar los reportes semanales al equipo', status: 'open' });
  await ActionItem.create({ tenant_id: 1, session_id: s.id, text: 'Bloquear dos horas diarias para el trabajo del lanzamiento', status: 'in_progress' });

  return { seeded: true, sessions: 1 };
}

module.exports = { seedDemo };
