'use strict';

/**
 * 15 starter badges for Torna Idioma Learner v2.
 *
 * Categories:
 *   - progress: lesson/vocabulary milestones
 *   - streak: daily habit rewards
 *   - mastery: depth of learning
 *   - social: community engagement (Isabel, leaderboard)
 *   - heritage: Filipino cultural connection
 *
 * Colors: gold | emerald | sapphire | ruby | amethyst
 * Icons: Short text codes (not emojis) — frontend renders via styled chips.
 */

module.exports = [
  // --- Progress (starter milestones) ---
  {
    code: 'first_word',
    name_en: 'First Word',
    name_es: 'Primera Palabra',
    name_fil: 'Unang Salita',
    description: 'You reviewed your very first vocabulary card.',
    icon: 'I',
    color: 'gold',
    category: 'progress',
    xp_reward: 10,
    sort_order: 1
  },
  {
    code: 'first_lesson',
    name_en: 'First Lesson',
    name_es: 'Primera Lección',
    name_fil: 'Unang Aralin',
    description: 'You completed your first lesson.',
    icon: 'II',
    color: 'gold',
    category: 'progress',
    xp_reward: 20,
    sort_order: 2
  },
  {
    code: 'one_hundred_words',
    name_en: '100 Words Mastered',
    name_es: '100 Palabras Dominadas',
    name_fil: '100 Salitang Natutunan',
    description: 'You have mastered 100 vocabulary cards.',
    icon: 'C',
    color: 'sapphire',
    category: 'progress',
    xp_reward: 100,
    sort_order: 3
  },
  {
    code: 'a1_complete',
    name_en: 'A1 Complete',
    name_es: 'A1 Completado',
    name_fil: 'A1 Natapos',
    description: 'You finished the A1 beginner course.',
    icon: 'A1',
    color: 'emerald',
    category: 'progress',
    xp_reward: 200,
    sort_order: 4
  },

  // --- Streaks ---
  {
    code: 'streak_3',
    name_en: '3-Day Streak',
    name_es: 'Racha de 3 Días',
    name_fil: '3-Araw na Sunod-sunod',
    description: 'Studied 3 days in a row.',
    icon: '3',
    color: 'ruby',
    category: 'streak',
    xp_reward: 15,
    sort_order: 10
  },
  {
    code: 'streak_7',
    name_en: '7-Day Streak',
    name_es: 'Racha de 7 Días',
    name_fil: '7-Araw na Sunod-sunod',
    description: 'One full week of daily practice.',
    icon: '7',
    color: 'ruby',
    category: 'streak',
    xp_reward: 50,
    sort_order: 11
  },
  {
    code: 'streak_30',
    name_en: '30-Day Streak',
    name_es: 'Racha de 30 Días',
    name_fil: '30-Araw na Sunod-sunod',
    description: 'A full month of unbroken dedication.',
    icon: '30',
    color: 'amethyst',
    category: 'streak',
    xp_reward: 300,
    sort_order: 12
  },
  {
    code: 'comeback_kid',
    name_en: 'Comeback Kid',
    name_es: 'El Regreso',
    name_fil: 'Muling Pagbalik',
    description: 'Returned and restarted your streak after a break.',
    icon: 'R',
    color: 'ruby',
    category: 'streak',
    xp_reward: 10,
    sort_order: 13
  },

  // --- Mastery ---
  {
    code: 'cognate_master',
    name_en: 'Cognate Master',
    name_es: 'Maestro de Cognados',
    name_fil: 'Dalubhasa sa mga Cognate',
    description: 'Added 25 cards from the Filipino-Spanish cognate database.',
    icon: 'CM',
    color: 'gold',
    category: 'mastery',
    xp_reward: 75,
    sort_order: 20
  },
  {
    code: 'bilingual_bridge',
    name_en: 'Bilingual Bridge',
    name_es: 'Puente Bilingüe',
    name_fil: 'Tulay na Bilingguwal',
    description: 'You connect Tagalog and Spanish — a true heritage learner.',
    icon: 'BB',
    color: 'amethyst',
    category: 'mastery',
    xp_reward: 150,
    sort_order: 21
  },
  {
    code: 'perfect_week',
    name_en: 'Perfect Week',
    name_es: 'Semana Perfecta',
    name_fil: 'Perpektong Linggo',
    description: '7 days, zero Again grades — pure accuracy.',
    icon: 'PW',
    color: 'emerald',
    category: 'mastery',
    xp_reward: 100,
    sort_order: 22
  },

  // --- Social ---
  {
    code: 'isabel_favorite',
    name_en: "Isabel's Favorite",
    name_es: 'La Favorita de Isabel',
    name_fil: 'Paborito ni Isabel',
    description: 'Completed your first conversation with Profesora Isabel.',
    icon: 'IF',
    color: 'gold',
    category: 'social',
    xp_reward: 30,
    sort_order: 30
  },
  {
    code: 'conversation_starter',
    name_en: 'Conversation Starter',
    name_es: 'Iniciador de Conversación',
    name_fil: 'Tagasimula ng Usapan',
    description: 'First voice conversation with Isabel in Spanish.',
    icon: 'CS',
    color: 'sapphire',
    category: 'social',
    xp_reward: 50,
    sort_order: 31
  },

  // --- Heritage ---
  {
    code: 'rizals_heir',
    name_en: "Rizal's Heir",
    name_es: 'Heredero de Rizal',
    name_fil: 'Tagapagmana ni Rizal',
    description: 'Honoring José Rizal — you are reclaiming your heritage language.',
    icon: 'RH',
    color: 'amethyst',
    category: 'heritage',
    xp_reward: 100,
    sort_order: 40
  },

  // --- Engagement ---
  {
    code: 'marathon_learner',
    name_en: 'Marathon Learner',
    name_es: 'Aprendiz Maratonista',
    name_fil: 'Maratonistang Nag-aaral',
    description: '50 cards reviewed in a single day.',
    icon: 'M',
    color: 'emerald',
    category: 'progress',
    xp_reward: 60,
    sort_order: 50
  }
];
