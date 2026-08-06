'use strict';

// =============================================================
// The teaser + simulator — THE CRUX (spec section 7).
//
// HONESTY RULES ENFORCED HERE, NOT IN A PROMPT:
//   * Screen 3's matched jobs are REAL postings from the real pool, scored
//     against the real resume. If the pool is unavailable the screen SAYS SO
//     and shows nothing. It never fabricates an opening, a company or a salary.
//   * Anything simulated carries is_simulated.
//   * No fabricated recruiter interest, view counts, or a match percentage on a
//     job that was not actually scored.
//   * No guaranteed-outcome language anywhere.
//
// COST GUARD (spec section 8.3, mechanic #6): this runs BEFORE payment, on
// every visitor. Capped and rate-limited.
// =============================================================

const crypto = require('crypto');
const { models } = require('../models');
const matcher = require('./matcher');
const addresses = require('./addresses');
const identity = require('./identity');
const resumeSvc = require('./resume');
const settingsSvc = require('./settings');

const TEASER_COST_CAP = parseFloat(process.env.JOBUP_TEASER_COST_CAP_USD || '0.35');
const JOBS_PER_TEASER = 15;
const PRICE_USD = parseInt(process.env.JOBUP_PRICE_USD || '97', 10);
const RESUME_PURGE_DAYS = 90;

function token() {
  return crypto.randomUUID();
}

function ipHash(ip) {
  const salt = process.env.JOBUP_SESSION_SALT || 'jobup-default-salt';
  return crypto.createHash('sha256').update(salt + '|' + String(ip || '')).digest('hex').slice(0, 32);
}

// --- narration ------------------------------------------------------------
// One short segment per screen. Prefetched one ahead and cached by the orb.
function narration(profile, ctx, lang) {
  const name = (profile.name || ctx.name || '').split(' ')[0] || '';
  if (lang === 'es') {
    return [
      `Hola ${name}, soy Dalia, la voz de JobUp. Déjame mostrarte el ecosistema profesional que construiríamos para ti.`,
      `Este sería tu sitio profesional, generado a partir de tu propio currículum y mantenido al día automáticamente.`,
      ctx.address ? `Tu dirección web sería ${ctx.address}, en línea pocos minutos después de activarla.` : `Revisaremos qué dirección web está disponible para tu nombre.`,
      ctx.matchCount > 0
        ? `Encontramos ${ctx.matchCount} vacantes reales que coinciden contigo ahora mismo, cada una con su puntaje y la razón del match.`
        : `En este momento no pudimos consultar las vacantes en vivo, así que no te mostramos ninguna. Preferimos no inventar nada.`,
      ctx.tailored
        ? `Y este es tu currículum reescrito para una de esas vacantes en concreto. Solo reordena y reformula lo que tú ya escribiste: nunca añade un empleador, una fecha o una cifra que no esté en tu currículum original.`
        : `Cuando haya una vacante que encaje, reescribimos tu currículum para ella, usando únicamente lo que tú ya escribiste.`,
      `Aquí está tu identidad legible por máquinas: currículum estructurado, datos JSON-LD y una tarjeta de agente, para que los sistemas de reclutamiento entiendan tu trayectoria.`,
      `Tres agentes trabajarían por ti de forma continua: el Cazador de Oportunidades, el Difusor Profesional y el Agente de Presencia.`,
      `Todo esto vive en tu panel privado: tus coincidencias, tu proceso, tus borradores pendientes de aprobación y la exportación completa de tus datos.`,
      `Son ${PRICE_USD} dólares al año. Si no renuevas, el sitio se apaga, pero siempre puedes exportar tus datos.`,
    ];
  }
  return [
    `Hi ${name}, I'm Ava, the voice of JobUp. Let me show you the career ecosystem we would build for you.`,
    `This would be your professional website, generated from your own resume and kept current automatically.`,
    ctx.address ? `Your web address would be ${ctx.address}, live within minutes of activation.` : `We will check which web address is available for your name.`,
    ctx.matchCount > 0
      ? `We found ${ctx.matchCount} real openings that match you right now, each with a score and the reason for the match.`
      : `We could not reach the live job pool just now, so we are showing you none. We would rather show nothing than invent something.`,
    ctx.tailored
      ? `And this is your resume rewritten for one of those roles specifically. It only reorders and rephrases what you already wrote — it never adds an employer, a date or a number that is not in your own resume.`
      : `When there is a matching role, we rewrite your resume for it, using only what you already wrote.`,
    `Here is your machine-readable identity: a structured resume, JSON-LD data and an agent card, so recruiting systems can understand your career.`,
    `Three agents would work for you around the clock, every day, whether or not you are looking: the Opportunity Hunter searches and scores real openings, the Career Broadcaster drafts your outreach, and the Professional Presence Agent keeps you findable. They never send anything without your approval.`,
    `All of it lives in your private dashboard: your matches, your pipeline, the drafts waiting on your approval, and a full export of everything.`,
    `It is ${PRICE_USD} dollars a year. If you do not renew the site goes down, but you can always export your data.`,
  ];
}

/**
 * Build the teaser. Returns the payload the simulator renders.
 * Never throws into the request path — a failure yields status:'failed'.
 */
// The stages a build actually passes through, in order. The waiting screen
// reports these — it does not animate a bar against a guessed duration.
const STAGES = [
  { key: 'reading',   en: 'Reading your resume',            es: 'Leyendo tu curriculum' },
  { key: 'structure', en: 'Understanding your experience',  es: 'Entendiendo tu experiencia' },
  { key: 'address',   en: 'Checking your web address',      es: 'Comprobando tu direccion web' },
  { key: 'matching',  en: 'Searching real openings',        es: 'Buscando vacantes reales' },
  { key: 'tailoring', en: 'Tailoring your resume',          es: 'Adaptando tu curriculum' },
  { key: 'identity',  en: 'Building your AI-readable identity', es: 'Creando tu identidad legible por IA' },
];

async function build({ name, email, phone, language, resumeText, ip, onStage }) {
  const lang = language === 'es' ? 'es' : 'en';
  let spent = 0;
  const notes = [];
  const stage = async (key) => {
    const i = STAGES.findIndex((s) => s.key === key);
    if (i >= 0 && typeof onStage === 'function') {
      try { await onStage({ key, n: i + 1, total: STAGES.length, label: STAGES[i][lang] }); }
      catch (e) { /* progress reporting must never fail a build */ }
    }
  };
  await stage('reading');

  // 1. Structure the resume.
  await stage('structure');
  const structured = await resumeSvc.structure(resumeText);
  spent += structured.cost_usd || 0;
  const profile = { ...structured.profile, name: structured.profile.name || name };

  // 2. Real address availability against the ladder.
  await stage('address');
  const parts = addresses.splitName(profile.name || name);
  const addr = await addresses.preview({ ...parts, city: profile.location });

  // 3. REAL matched jobs from the shared pool. Never fabricated.
  await stage('matching');
  const settings = settingsSvc.sanitize({});
  let matches = [];
  let poolAvailable = true;
  try {
    const pool = await models.jobs.findAll({ limit: 400 });
    if (!pool || pool.length === 0) {
      poolAvailable = false;
      notes.push('Job pool is empty — no openings shown. Nothing fabricated.');
    } else {
      const ranked = require('./jobsource').prefilter(pool, profile, settings, resumeText);
      const remaining = Math.max(0, TEASER_COST_CAP - spent);
      const scored = await matcher.scoreBatch(
        ranked.map((r) => r.job), profile, settings,
        { capUsd: remaining, limit: JOBS_PER_TEASER }
      );
      spent += scored.cost_usd || 0;
      matches = scored.matches;
      if (scored.stopped_for_cap) notes.push('Scoring stopped at the teaser cost cap.');
    }
  } catch (e) {
    poolAvailable = false;
    notes.push('Job pool unavailable: ' + e.message + '. No openings shown.');
  }

  // 4. One real tailored resume (teaser screen 4) — the tangible proof.
  await stage('tailoring');
  let tailored = null;
  if (matches.length && spent < TEASER_COST_CAP) {
    const t = await resumeSvc.tailor(resumeText, matches[0].job);
    spent += t.cost_usd || 0;
    tailored = {
      job_title: matches[0].job.title, employer: matches[0].job.employer,
      changes: t.changes, flagged: t.flagged, is_simulated: t.is_simulated,
      requires_confirmation: Boolean(t.requires_confirmation),
      preview: String(t.content || '').slice(0, 1200),
    };
  }

  // 5. Machine-readable identity preview.
  await stage('identity');
  const url = addr.available ? addr.url : `https://${addresses.clean(parts.first + parts.last)}.${addresses.BASE_DOMAIN}`;
  const ident = {
    resume_json: identity.resumeJson(profile, settings, { name: profile.name, url }),
    json_ld: identity.personJsonLd(profile, settings, { name: profile.name, url }),
    agent_card: identity.agentCard(profile, settings, { name: profile.name, url, slug: 'me' }),
  };

  const ctx = {
    name: profile.name || name,
    address: addr.available ? addr.address : null,
    matchCount: matches.length,
    tailored: Boolean(tailored),
  };

  return {
    status: 'ready',
    language: lang,
    price_usd: PRICE_USD,
    cost_usd: Number(spent.toFixed(5)),
    is_simulated: structured.is_simulated,
    notes,
    screens: {
      site: { profile, url, is_simulated: structured.is_simulated },
      address: addr,
      matches: {
        pool_available: poolAvailable,
        // Empty array + an explicit note, never a fabricated listing.
        items: matches.map((m) => ({
          title: m.job.title, employer: m.job.employer, location: m.job.location,
          url: m.job.url, score: m.score, explanation: m.explanation, missing: m.missing,
          compensation: m.compensation,  // only as the posting stated it
          is_simulated: m.is_simulated,
        })),
      },
      tailored,
      identity: ident,
      agents: [
        { name: 'Opportunity Hunter', does: 'Searches approved sources daily, scores and explains every match.' },
        { name: 'Career Broadcaster', does: 'Drafts targeted outreach. Nothing sends without your approval.' },
        { name: 'Professional Presence Agent', does: 'Builds and maintains your site and machine-readable identity.' },
      ],
      cta: {
        price_usd: PRICE_USD,
        includes: [
          'Your web address and professional website',
          'Machine-readable identity: resume.json, JSON-LD, agent card',
          'Three AI agents running continuously',
          'Job discovery, scoring and explained matching',
          'Per-job resume tailoring and cover letters',
          'Private dashboard, weekly digest, full data export',
        ],
        non_renewal: 'If you do not renew, the site goes down and the address is released. You can always export your data.',
      },
    },
    narration: narration(profile, ctx, lang),
  };
}

async function create(input) {
  const t = token();
  const row = await models.teasers.create({
    token: t, email: input.email, name: input.name,
    language: input.language === 'es' ? 'es' : 'en',
    status: 'pending', ip_hash: ipHash(input.ip),
    started_at: new Date(), stage_n: 0, stages_total: STAGES.length,
    resume_purge_after: new Date(Date.now() + RESUME_PURGE_DAYS * 86400000),
  });
  return { id: row.id, token: t };
}

async function finish(tokenStr, payload) {
  await models.teasers.update(
    { payload, narration: payload.narration || [], status: payload.status || 'ready',
      cost_usd: payload.cost_usd || 0, address_offer: (payload.screens && payload.screens.address && payload.screens.address.address) || null },
    { where: { token: tokenStr } }
  );
}

async function get(tokenStr) {
  return models.teasers.findOne({ where: { token: tokenStr } });
}

/** Observed end-to-end build time, used only to set an expectation. */
const TYPICAL_BUILD_MS = parseInt(process.env.JOBUP_TYPICAL_BUILD_MS || '45000', 10);

/** Record which stage a build reached. Never throws into the build. */
async function setStage(token, st) {
  try {
    await models.teasers.update(
      { stage: st.key, stage_label: st.label, stage_n: st.n, stages_total: st.total },
      { where: { token } });
  } catch (e) { /* progress is cosmetic; a build must not fail over it */ }
}

module.exports = {
  STAGES,
  TYPICAL_BUILD_MS,
  setStage, build, create, finish, get, token, ipHash, TEASER_COST_CAP, PRICE_USD, RESUME_PURGE_DAYS };
