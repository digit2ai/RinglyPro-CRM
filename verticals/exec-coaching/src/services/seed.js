'use strict';

/**
 * Executive English Coaching — optional demo seed (EXEC_COACHING_SEED_DEMO=1).
 * Seeds Fernando's coach tenant with the Minister as a student + one finalized
 * sample session with transcript + 5-deliverable report. Idempotent.
 */

const { User, Student, Session, Transcript, Report } = require('../models');

async function seedDemo() {
  const coach = await User.findOne({ where: { email: 'fernandodelae@gmail.com' } });
  if (!coach) return { seeded: false, reason: 'coach account not found' };
  const tenant = coach.tenant_id || coach.id;

  const existing = await Student.count({ where: { tenant_id: tenant } });
  if (existing > 0) return { seeded: false, students: existing };

  const student = await Student.create({
    tenant_id: tenant, coach_id: coach.id,
    name: 'Dr. Mauricio Gómez Amín',
    role_title: 'Ministro de Comercio, Industria y Turismo',
    target_level: 'C1', native_language: 'es',
    goals: 'Interlocución directa y de alto nivel en inglés con gobiernos, organismos internacionales, inversionistas y medios desde el primer día de gestión.'
  });

  const s = await Session.create({
    tenant_id: tenant, student_id: student.id, coach_name: 'Fernando',
    scenario: 'Rueda de prensa internacional',
    subject: 'Investor press briefing on FDI',
    summary: 'El alumno practicó una rueda de prensa sobre inversión extranjera directa. Mostró buen dominio del vocabulario de comercio, con oportunidades de mejora en la fluidez de respuestas largas y el uso de conectores diplomáticos.',
    status: 'finalized', duration_min: 50,
    student_words: 210, coach_words: 48, speaking_pct: 81
  });

  const turns = [
    { role: 'coach', text: 'Good morning, Minister. Let us simulate a press briefing. A journalist asks: what is Colombia doing to attract foreign direct investment?' },
    { role: 'student', text: 'Thank you. Colombia is open for business. We are working to improve the legal framework and to give more confidence to the investors that want to come to our country.' },
    { role: 'coach', text: 'Good. Try to use a stronger opening and connectors. How would you respond to a follow-up on supply chains?' },
    { role: 'student', text: 'Our position is strategic. We have ports in two oceans and we want to be a hub for the region. We are going to invest in infrastructure to support the global supply chains.' }
  ];
  let i = 0;
  for (const t of turns) {
    await Transcript.create({ session_id: s.id, turn_index: i++, role: t.role, text: t.text, source: 'typed' });
  }

  await Report.create({
    tenant_id: tenant, session_id: s.id, student_id: student.id,
    fortalezas: JSON.stringify(['Vocabulario sólido de comercio e inversión.', 'Mensaje claro y postura estratégica bien comunicada.']),
    aspectos_mejorar: JSON.stringify(['Fluidez en respuestas largas sin pausas.', 'Uso de conectores diplomáticos para suavizar afirmaciones.']),
    expresiones: JSON.stringify(['"Let me put this in context."', '"That said, our priority remains competitiveness."', '"We are firmly committed to..."']),
    vocabulario: JSON.stringify(['foreign direct investment', 'legal framework', 'supply chain hub', 'competitiveness', 'regulatory certainty']),
    ejercicio: 'Prepare y grabe una respuesta de dos minutos a la pregunta: "How will Colombia protect investors during economic uncertainty?" usando al menos dos conectores diplomáticos.',
    correcciones: JSON.stringify([{ error: 'give more confidence to the investors', correccion: 'build greater confidence among investors' }])
  });

  return { seeded: true, students: 1, sessions: 1 };
}

module.exports = { seedDemo };
