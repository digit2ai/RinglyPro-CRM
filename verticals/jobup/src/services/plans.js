'use strict';

// =============================================================
// THE JOBUP PLAN CATALOG — one source of truth for tiers, prices and caps.
//
// Every surface that quotes a price or enforces a cap reads from HERE: the
// landing page, the dashboard, Eva's spoken lines, the entitlement guard, the
// admin console. A figure must never be hardcoded twice (the codebase already
// learned this with services/billing.js PRICE_USD — see that file's comment).
//
// DECISIONS (owner, 2026-08):
//   - NO trial period. The Free tier IS the try-before-buy, so Search/Landed
//     start billing immediately. JOBUP_SEARCH_TRIAL_DAYS defaults to 0.
//   - Downgrade to Free = cancel at period end (they keep paid time, then drop
//     to Free; no refund math). Landed->Search is a scheduled price swap.
//
// This module is PURE: no DB, no Stripe, no I/O. entitlement() resolves the
// caps a tenant is allowed RIGHT NOW from (plan, status), and is the single
// place the server guard consults. A hidden button is never a guard.
// =============================================================

function envInt(name, dflt) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) ? v : dflt;
}

// Trial length in days for the paid tiers. 0 = no trial (Free tier is the trial).
const SEARCH_TRIAL_DAYS = envInt('JOBUP_SEARCH_TRIAL_DAYS', 0);
const LANDED_TRIAL_DAYS = envInt('JOBUP_LANDED_TRIAL_DAYS', 0);

// The catalog. Prices in cents (Stripe's unit). Caps are per-plan ceilings the
// entitlement resolver hands to limits.js. `null` cap = unlimited.
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price_cents: 0,
    trial_days: 0,
    stripe_price_id: null,            // no charge, no Stripe price
    tagline_en: 'The growth surface, not a trial',
    tagline_es: 'La superficie de crecimiento, no una prueba',
    // What Free is FOR: a public AI CV site + a taste of matches. This is the
    // acquisition + SEO engine, so its only recurring AI cost is capped tight.
    caps: {
      matches_per_week: envInt('JOBUP_FREE_MATCHES_PER_WEEK', 5),
      // How many openings the Hunter SCANS per day for a Free account. Tier-
      // ranked (Free < Search < Landed) so a paid account always evaluates at
      // least as much of the pool — see hunter_scan_per_day on the paid tiers.
      hunter_scan_per_day: envInt('JOBUP_FREE_SCAN_PER_DAY', 8),
      // The DAILY model budget in cents. Tier-ranked too — the scan ceiling only
      // bites if the budget allows it, so budget and scan must rank together or
      // the shared budget flattens every tier to the same handful (Free $0.10 <
      // Search $0.60 < Landed $1.80 per day).
      hunter_budget_cents_day: envInt('JOBUP_FREE_BUDGET_CENTS_DAY', 10),
      scorings_per_day: 0,            // no on-demand scoring on Free
      tailorings_per_month: 0,        // no AI tailoring on Free
      outreach: false,
      pipeline: false,
      priority_scoring: false,
      interview_prep: false,
      human_review_per_month: 0,
    },
    includes_en: ['Public CV site at NameSurname.jobup.dev', 'Role pages + Getting-Found SEO',
      '5 job matches a week', 'Eva career chat (read-only)'],
    includes_es: ['Sitio de CV publico en NombreApellido.jobup.dev', 'Paginas de rol + SEO para ser encontrado',
      '5 coincidencias de empleo por semana', 'Eva, chat de carrera (solo lectura)'],
  },

  search: {
    id: 'search',
    name: 'Search',
    price_cents: envInt('JOBUP_PLAN_SEARCH_PRICE_CENTS', 2900),   // $29/mo
    trial_days: SEARCH_TRIAL_DAYS,
    stripe_price_id: process.env.JOBUP_STRIPE_PRICE_SEARCH || null,
    tagline_en: 'For someone actively looking',
    tagline_es: 'Para quien esta buscando activamente',
    caps: {
      matches_per_week: null,                                     // unlimited
      hunter_scan_per_day: envInt('JOBUP_SEARCH_SCAN_PER_DAY', 40),
      hunter_budget_cents_day: envInt('JOBUP_SEARCH_BUDGET_CENTS_DAY', 60),
      scorings_per_day: envInt('JOBUP_SEARCH_SCORINGS_PER_DAY', 40),
      tailorings_per_month: envInt('JOBUP_SEARCH_TAILORINGS_PER_MO', 10),
      outreach: true,
      pipeline: true,
      priority_scoring: false,
      interview_prep: false,
      human_review_per_month: 0,
    },
    includes_en: ['Everything in Free', 'Unlimited matches', '40 scorings a day',
      '10 tailored resumes a month', 'Outreach drafts', 'Pipeline board', 'All filters'],
    includes_es: ['Todo lo de Free', 'Coincidencias ilimitadas', '40 evaluaciones al dia',
      '10 curriculos adaptados al mes', 'Borradores de contacto', 'Tablero de pipeline', 'Todos los filtros'],
  },

  landed: {
    id: 'landed',
    name: 'Landed',
    price_cents: envInt('JOBUP_PLAN_LANDED_PRICE_CENTS', 9900),   // $99/mo
    trial_days: LANDED_TRIAL_DAYS,
    stripe_price_id: process.env.JOBUP_STRIPE_PRICE_LANDED || null,
    tagline_en: 'For senior roles and urgent searches',
    tagline_es: 'Para roles senior y busquedas urgentes',
    caps: {
      matches_per_week: null,
      // Landed scans the most of the pool and does it with priority (below),
      // so on the same resume it can only ever surface MORE strong matches than
      // Search, never fewer. This is what makes the tier ordering monotonic.
      hunter_scan_per_day: envInt('JOBUP_LANDED_SCAN_PER_DAY', 120),
      hunter_budget_cents_day: envInt('JOBUP_LANDED_BUDGET_CENTS_DAY', 180),
      scorings_per_day: envInt('JOBUP_LANDED_SCORINGS_PER_DAY', 200),  // fair-use, not "unlimited" fiction
      tailorings_per_month: null,                                 // unlimited
      outreach: true,
      pipeline: true,
      priority_scoring: true,
      interview_prep: true,
      human_review_per_month: envInt('JOBUP_LANDED_HUMAN_REVIEWS_PER_MO', 1),
    },
    includes_en: ['Everything in Search', 'Unlimited tailoring', 'Priority scoring',
      'Interview prep per posting', 'One human resume review a month'],
    includes_es: ['Todo lo de Search', 'Adaptacion ilimitada', 'Evaluacion prioritaria',
      'Preparacion de entrevista por vacante', 'Una revision humana de curriculo al mes'],
  },
};

const ORDER = ['free', 'search', 'landed'];          // rank, low -> high
function rank(planId) { const i = ORDER.indexOf(planId); return i < 0 ? 0 : i; }

function planFor(planId) { return PLANS[planId] || PLANS.free; }
function allPlans() { return ORDER.map((id) => PLANS[id]); }
function isPaid(planId) { return planId === 'search' || planId === 'landed'; }

// Subscription states that mean "not currently entitled to what you pay for".
// A past_due / paused / canceled / incomplete sub falls back to FREE caps until
// it recovers — dunning already exists in billing.js and drives the transition.
const DEGRADED = new Set(['past_due', 'paused', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'pending']);

/**
 * THE ENTITLEMENT RESOLVER — the single source the server guard consults.
 * @param {string} planId   subscribers.plan  (free|search|landed)
 * @param {string} status   subscribers.status (active|trialing|past_due|paused|canceled|pending)
 * @returns {{ effective_plan, caps, degraded, source_plan, status }}
 *
 * Rule: you get the caps of your plan ONLY while the subscription is healthy
 * (active or trialing). Otherwise you get Free caps. The plan column is a cache
 * of Stripe truth; on any doubt the caller re-reads Stripe, never trusts the
 * client. This function never charges, never calls Stripe — pure resolution.
 */
function entitlement(planId, status) {
  const src = PLANS[planId] ? planId : 'free';
  const st = String(status || '').toLowerCase();
  const healthy = st === 'active' || st === 'trialing';
  if (!isPaid(src) || healthy) {
    return { effective_plan: src, caps: planFor(src).caps, degraded: false, source_plan: src, status: st };
  }
  // Paid but not healthy -> Free caps (still keep the public CV site, which is
  // Free-tier anyway, so a paused/lapsed user is retained, not deleted).
  return { effective_plan: 'free', caps: PLANS.free.caps, degraded: true, source_plan: src, status: st };
}

/** Can `planId`+`status` use a named feature right now? (server guard helper) */
function allows(planId, status, feature) {
  const caps = entitlement(planId, status).caps;
  const v = caps[feature];
  return typeof v === 'boolean' ? v : (v === null || v > 0);
}

// Directionality helpers for the change flows.
function isUpgrade(fromId, toId) { return rank(toId) > rank(fromId); }
function isDowngrade(fromId, toId) { return rank(toId) < rank(fromId); }

// The change POLICY, encoded (owner decisions above). The billing layer reads
// this so the rule lives in one place, not scattered across endpoints.
//   upgrade            -> immediate, prorated (pay the difference now)
//   downgrade to free  -> cancel_at_period_end (keep paid time, then Free)
//   downgrade to paid  -> scheduled price swap at period end
function changePolicy(fromId, toId) {
  if (isUpgrade(fromId, toId)) return { kind: 'upgrade', when: 'immediate', proration: 'create_prorations' };
  if (toId === 'free') return { kind: 'downgrade', when: 'period_end', action: 'cancel_at_period_end' };
  if (isDowngrade(fromId, toId)) return { kind: 'downgrade', when: 'period_end', action: 'schedule_price_swap' };
  return { kind: 'noop', when: 'immediate' };
}

module.exports = {
  PLANS, ORDER, SEARCH_TRIAL_DAYS, LANDED_TRIAL_DAYS,
  planFor, allPlans, isPaid, rank, entitlement, allows,
  isUpgrade, isDowngrade, changePolicy, DEGRADED,
};
