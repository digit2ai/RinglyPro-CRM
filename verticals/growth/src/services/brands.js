'use strict';

/**
 * Digit2AI Growth — brand registry.
 *
 * The "brands" this tool markets are Digit2AI's OWN verticals. Seeded once per
 * owner (idempotent by slug). Edit positioning/keywords in the cockpit; the seed
 * only fills gaps, it never clobbers owner edits.
 */

const { Brand } = require('../models');

// Canonical portfolio. Keep URLs pointing at the live landing surface.
const PORTFOLIO = [
  {
    slug: 'lawncopilot', name: 'Lawn Co-Pilot', url: 'https://lawncopilot.com',
    tagline: 'The multi-tenant AI office for landscaping companies',
    positioning: 'A platform landscaping companies run on: their own booking/quote page plus a back office staffed by eight AI employees. Vagaro-style distribution via Google Business Profile, no custom domains.',
    icp: 'Small US landscaping companies (Florida first), solo operators to multi-truck crews.',
    voice: 'Plain, confident, emoji-free, operator-to-operator.',
    keywords: ['lawn care software', 'landscaping crm', 'automatic lawn quote', 'landscaping answering service', 'ai for landscapers']
  },
  {
    slug: 'speakly', name: 'Speakly', url: 'https://speakly.vip',
    tagline: 'Executive English coaching for international leadership',
    positioning: 'Premium AI-guided English coaching for executives (trade, investment, diplomacy, press). Coach track + student self-serve with a personalized AI curriculum. Spanish-first.',
    icp: 'Latin American executives, ministers, and professionals who must operate in English at a leadership level.',
    voice: 'Elegant, executive, Spanish-first, emoji-free.',
    keywords: ['executive english coaching', 'business english for leaders', 'ingles ejecutivo', 'english for diplomats', 'ai english tutor']
  },
  {
    slug: 'equimind', name: 'EquiMind', url: 'https://aiagent.ringlypro.com/equimind-gs-engine',
    tagline: 'AI jump coach + 3D horse analysis for Paso Fino and sport horses',
    positioning: 'Turns a phone video into AI riding feedback and a navigable 3D horse scene with a shareable conformation report. Live paying-customer product.',
    icp: 'Competitive riders, trainers, and Paso Fino breeders in Latin America and the US.',
    voice: 'Knowledgeable equestrian, precise, respectful of the sport.',
    keywords: ['ai riding coach', 'horse conformation analysis', 'paso fino scoring', 'jump coach app', 'equestrian ai']
  },
  {
    slug: 'veritas', name: 'Veritas', url: 'https://aiagent.ringlypro.com/veritas',
    tagline: 'AI deepfake detection and takedown',
    positioning: 'Detects and removes deepfakes and impersonations at scale — brand, executive, and likeness protection with automated DMCA/impersonation takedown drafting.',
    icp: 'Public figures, political campaigns, and brands facing impersonation and deepfake abuse.',
    voice: 'Authoritative, protective, trust-and-safety tone.',
    keywords: ['deepfake detection', 'impersonation takedown', 'brand protection ai', 'likeness protection', 'remove deepfake']
  },
  {
    slug: 'torna-idioma', name: 'Torna Idioma', url: 'https://aiagent.ringlypro.com/Torna_Idioma',
    tagline: 'AI English learning built for the Philippines',
    positioning: 'A modular AI English-learning platform (UVEG SFL curriculum, Metodo Rizal SRS) for Filipino learners. Launching in Makati, Zamboanga, and Cavite.',
    icp: 'Filipino learners and institutions (University of Makati partnership).',
    voice: 'Encouraging, culturally grounded (EN/FIL), motivating.',
    keywords: ['learn english philippines', 'ai english course', 'english for filipinos', 'sfl english curriculum', 'english learning app']
  },
  {
    slug: 'visionarium', name: 'Visionarium Coaching', url: 'https://visionarium.app',
    tagline: 'AI coaching tracker for creativity and leadership',
    positioning: 'Log 1:1 coaching sessions, auto-extract the subject and action items, and ask AI coach Lina for guidance. Open free self-signup. Spanish-first.',
    icp: 'Coaches and coachees in the Visionarium creativity/leadership incubator.',
    voice: 'Warm, growth-minded, Spanish-first, emoji-free.',
    keywords: ['ai coaching tracker', 'coaching accountability app', 'session notes ai', 'leadership coaching software', 'seguimiento coaching']
  },
  {
    slug: 'roundshare', name: 'RoundShare', url: 'https://aiagent.ringlypro.com/roundshare',
    tagline: 'Ride. Improve. Share.',
    positioning: 'The community/social layer of the EquiMind ecosystem: record a round, get AI feedback, share it with friends, trainers, and barn circles.',
    icp: 'Amateur and youth riders who want to share progress and get feedback socially.',
    voice: 'Friendly, community-first, upbeat but not hype.',
    keywords: ['riding community app', 'share horse rounds', 'equestrian social app', 'ai ride feedback', 'barn circle app']
  },
  {
    slug: 'agromercado', name: 'AgroMercadoDigital', url: 'https://agromercado-vzla.vercel.app',
    tagline: 'National agro marketplace for Venezuela',
    positioning: 'Marketplace for Venezuela\'s agricultural sector — livestock, machinery, inputs, live auctions, BCV currency. Built by ISTC with a Digit2AI AI layer.',
    icp: 'Venezuelan producers, buyers, and agro-service providers.',
    voice: 'Trustworthy, practical, Spanish, sector-savvy.',
    keywords: ['mercado agropecuario venezuela', 'subastas ganado', 'maquinaria agricola venezuela', 'insumos agricolas', 'agro marketplace']
  },
  {
    slug: 'digit2ai', name: 'Digit2AI', url: 'https://digit2ai.com',
    tagline: 'From natural language to production AI',
    positioning: 'The company behind the portfolio: 21 live platforms, 22 verticals, an 83-agent AI workforce that converts natural language into deployed software. Partnership/joint-venture model.',
    icp: 'Founders, operators, and partners who need a custom AI product shipped fast.',
    voice: 'Confident, technical-but-clear, partnership-oriented.',
    keywords: ['custom ai development', 'ai agents for business', 'nlp to production', 'ai product studio', 'ai automation partner']
  }
];

async function seedBrands(ownerId) {
  let created = 0;
  for (const b of PORTFOLIO) {
    const [, made] = await Brand.findOrCreate({
      where: { owner_id: ownerId, slug: b.slug },
      defaults: { ...b, owner_id: ownerId }
    });
    if (made) created++;
  }
  return created;
}

module.exports = { seedBrands, PORTFOLIO };
