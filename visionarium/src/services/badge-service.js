const BADGE_TRIGGERS = {
  first_login: {
    name_en: 'First Steps', name_es: 'Primeros Pasos',
    description_en: 'Logged in for the first time', description_es: 'Inicio sesion por primera vez',
    category: 'community', points: 5,
    check: (member) => true // awarded on first login
  },
  profile_complete: {
    name_en: 'Identity Ready', name_es: 'Identidad Lista',
    description_en: 'Completed all profile fields', description_es: 'Completo todos los campos del perfil',
    category: 'community', points: 10,
    check: (member) => !!(member.phone && member.school_or_university && member.field_of_interest && member.country && member.city && member.age)
  },
  first_rsvp: {
    name_en: 'Event Explorer', name_es: 'Explorador de Eventos',
    description_en: 'RSVPed to your first event', description_es: 'Confirmo asistencia a su primer evento',
    category: 'community', points: 10,
    check: () => true // awarded when RSVP happens
  },
  lina_5: {
    name_en: 'Lina Explorer', name_es: 'Explorador de Lina',
    description_en: 'Had 5 conversations with Lina AI', description_es: 'Tuvo 5 conversaciones con Lina AI',
    category: 'technology', points: 15,
    check: (member) => (member.lina_conversation_count || 0) >= 5
  },
  lina_20: {
    name_en: 'Lina Power User', name_es: 'Usuario Avanzado de Lina',
    description_en: 'Had 20 conversations with Lina AI', description_es: 'Tuvo 20 conversaciones con Lina AI',
    category: 'technology', points: 25,
    check: (member) => (member.lina_conversation_count || 0) >= 20
  },
  applicant: {
    name_en: 'Bold Move', name_es: 'Movimiento Audaz',
    description_en: 'Submitted a fellowship application', description_es: 'Envio una solicitud de fellowship',
    category: 'leadership', points: 20,
    check: () => true // awarded when application submitted
  },
  fellow_accepted: {
    name_en: 'The 5%', name_es: 'El 5%',
    description_en: 'Accepted into the Visionarium Fellowship', description_es: 'Aceptado en la Fellowship Visionarium',
    category: 'leadership', points: 50,
    check: () => true // awarded when accepted
  },
  engagement_10: {
    name_en: 'Rising Star', name_es: 'Estrella en Ascenso',
    description_en: 'Reached engagement score of 10', description_es: 'Alcanzo un puntaje de participacion de 10',
    category: 'community', points: 15,
    check: (member) => (member.engagement_score || 0) >= 10
  },
  engagement_50: {
    name_en: 'Community Leader', name_es: 'Lider de la Comunidad',
    description_en: 'Reached engagement score of 50', description_es: 'Alcanzo un puntaje de participacion de 50',
    category: 'leadership', points: 30,
    check: (member) => (member.engagement_score || 0) >= 50
  }
};

async function ensureBadgesSeeded(models) {
  for (const [trigger, def] of Object.entries(BADGE_TRIGGERS)) {
    const existing = await models.VisionariumBadge.findOne({ where: { name_en: def.name_en } });
    if (!existing) {
      await models.VisionariumBadge.create({
        name_en: def.name_en, name_es: def.name_es,
        description_en: def.description_en, description_es: def.description_es,
        category: def.category, points: def.points,
        criteria: { trigger }
      });
    }
  }
}

async function awardBadge(models, memberId, trigger) {
  const def = BADGE_TRIGGERS[trigger];
  if (!def) return null;

  const badge = await models.VisionariumBadge.findOne({ where: { name_en: def.name_en } });
  if (!badge) return null;

  // Check if already earned
  const existing = await models.VisionariumMemberBadge.findOne({
    where: { community_member_id: memberId, badge_id: badge.id }
  });
  if (existing) return null;

  // Award it
  await models.VisionariumMemberBadge.create({ community_member_id: memberId, badge_id: badge.id });
  await models.VisionariumCommunityMember.increment('total_badges', { where: { id: memberId } });
  await models.VisionariumCommunityMember.increment('engagement_score', { by: def.points, where: { id: memberId } });

  return { badge: badge.name_en, points: def.points, trigger };
}

async function checkAndAwardAll(models, memberId) {
  const member = await models.VisionariumCommunityMember.findByPk(memberId);
  if (!member) return [];

  const awarded = [];
  for (const [trigger, def] of Object.entries(BADGE_TRIGGERS)) {
    // Skip event-based badges (awarded directly)
    if (['first_rsvp', 'applicant', 'fellow_accepted', 'first_login'].includes(trigger)) continue;

    if (def.check(member)) {
      const result = await awardBadge(models, memberId, trigger);
      if (result) awarded.push(result);
    }
  }
  return awarded;
}

module.exports = { BADGE_TRIGGERS, ensureBadgesSeeded, awardBadge, checkAndAwardAll };
