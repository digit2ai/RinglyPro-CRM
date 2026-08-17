'use strict';

// clientPlanFromTriage — the SAFETY KEYSTONE.
//
// Pure function. Transforms our INTERNAL analysis (triage_structured +
// premortem_structured) into the client-safe "Feasibility & Build Plan" a
// prospect sees on the OrbUp / Torna Studio page.
//
// POLICY (Option B — public lead-gen, decided by the owner):
//   SHOW the deep analysis — it is impressive and builds trust:
//     fit (reframed as Feasibility), the problem in our words, recommended v1
//     build, key considerations (from regulatory flags), the competitive
//     landscape, the risks we plan around (from the premortem), and what we
//     will need from the client (from conditions).
//   HIDE, ALWAYS — the only two internal things:
//     1. monetization_options  (how WE would price/earn — never shown)
//     2. the raw verdict / go-no-go (PROCEED/RESHAPE/DECLINE, base rates)
//   The verdict is NEVER printed; it only steers the call-to-action (§gate).
//
// This is an ALLOWLIST, not a denylist: the plan is assembled key-by-key from
// named safe fields, so an internal field that is not explicitly mapped here
// can NEVER reach the client. A scrubber runs over every free-text value as a
// second line of defence. Adding a field to triage_structured does not leak it.

// ---- fields that must never appear in the output, at any depth ----
const FORBIDDEN_KEYS = new Set([
  'monetization_options', 'go_no_go_recommendation', 'verdict',
  'verdict_rationale', 'base_rate_estimate', 'likelihood_rank', 'danger_rank',
  'prevention_cost_rank', 'portfolio_synergies', 'conflict_of_interest'
]);

// Words/phrases that mark internal-only reasoning. A free-text value whose
// SENTENCE contains one is dropped from the client plan (defence in depth).
const SCRUB_SENTENCE = [
  /\bdecline\b/i, /\breshape\b/i, /\bgo[\s/-]?no[\s/-]?go\b/i, /\bno-go\b/i,
  /\bconflict of interest\b/i, /\bprincipal\b/i, /\bmanuel stagg\b/i,
  /\bmanny\b/i, /\bmonetiz/i, /\brevenue share\b/i, /\bmargin\b/i,
  /\bupsell\b/i, /\bcross-?sell\b/i, /\bportfolio synerg/i,
  /\bthe company (fail|die|dead|collapse)/i, /\bbase[\s-]?rate\b/i,
  /\d+\s*[-–]\s*\d+\s*%\s*(chance|probability|likelihood)/i,
  // Internal build-vs-buy / analyst posture — honest, but never client-facing.
  // (Caught live on a low-fit test: "commodity … direct the submitter to an
  //  off-the-shelf solution … buy-before-build audit … synergy leverage.")
  /\bdigit2ai\b/i, /\bportfolio\b/i, /\bsynerg/i, /\bcommodity\b/i,
  /\boff[\s-]?the[\s-]?shelf\b/i, /\bbuild[\s-]?vs[\s-]?buy\b/i,
  /\bbuy[\s-]?before[\s-]?build\b/i, /\bcustom development\b/i,
  /\bthe submitter\b/i, /\bdirect(?:ing)? (?:the )?(?:submitter|them|client)\b/i,
  /\badopt an existing (?:tool|solution|product)\b/i,
  /\blittle differentiation\b/i, /\bjustify (?:custom|the) (?:build|development)\b/i,
  /\bwillingness to pay\b/i, /\brepeatable market\b/i, /\bstakeholder interview\b/i
];

// Softeners: catastrophic premortem language → neutral client-facing risk.
function softenRisk(s) {
  return String(s || '')
    .replace(/\bthe (company|startup|product|project) (fails?|dies?|is dead|collapses?)\b/gi, 'the effort stalls')
    .replace(/\b(fails? catastrophically|catastrophic failure)\b/gi, 'a serious setback')
    .replace(/\b\d+\s*[-–]\s*\d+\s*%\s*(chance|probability|likelihood)\b/gi, 'a real risk')
    .replace(/\bwe (should )?(decline|reject|walk away)\b/gi, 'we would want to talk it through')
    .trim();
}

function scrubText(s) {
  if (!s) return '';
  const soft = softenRisk(s);
  // Sentence-level drop: keep only sentences with no internal marker.
  const parts = soft.split(/(?<=[.!?])\s+/);
  const kept = parts.filter(p => !SCRUB_SENTENCE.some(rx => rx.test(p)));
  return kept.join(' ').replace(/\s{2,}/g, ' ').trim();
}

function arr(x) { return Array.isArray(x) ? x : []; }
function clampN(n, lo, hi) { n = Number(n); return isNaN(n) ? null : Math.max(lo, Math.min(hi, n)); }

// ---- fit → positive, client-facing feasibility label (never a go/no-go) ----
function feasibility(score, es) {
  const s = clampN(score, 1, 10);
  if (s == null) return { score: null, label: es ? 'En evaluación' : 'Under review', band: 'review' };
  if (s >= 8) return { score: s, label: es ? 'Encaje excelente' : 'Excellent fit', band: 'strong' };
  if (s >= 6) return { score: s, label: es ? 'Encaje sólido' : 'Strong fit', band: 'strong' };
  if (s >= 4) return { score: s, label: es ? 'Encaje viable' : 'Workable fit', band: 'workable' };
  return { score: s, label: es ? 'Requiere afinamiento' : 'Needs shaping', band: 'shape' };
}

// ---- verdict GATE — never printed, only steers the CTA ----
// Combines the premortem verdict with the triage go/no-go + fit so a weak
// project can never surface a rosy "book your build" CTA.
function ctaGate(triage, premortem, es) {
  const verdict = String(premortem && premortem.verdict || '').toUpperCase();
  const gono = String(triage && triage.go_no_go_recommendation || '').toLowerCase();
  const fit = clampN(triage && triage.fit_score, 1, 10) || 0;

  const hardNo = verdict === 'DECLINE' || /reject|no[\s_-]?go|^no$/.test(gono) || fit <= 3;
  const reshape = verdict === 'RESHAPE' || /condition/.test(gono) || (fit >= 4 && fit <= 5);

  if (hardNo) {
    return {
      mode: 'conversation',
      cta: es ? 'Hablemos antes de dimensionar el proyecto' : 'Let\'s talk before we scope a build',
      note: es
        ? 'Esta idea merece una conversación con nuestro equipo antes de definir un plan de construcción.'
        : 'This idea deserves a conversation with our team before we define a build plan.'
    };
  }
  if (reshape) {
    return {
      mode: 'refine',
      cta: es ? 'Afinémoslo juntos — agenda una llamada de alcance' : 'Let\'s refine it together — book a scoping call',
      note: es
        ? 'Vamos por buen camino. Un par de ajustes de alcance y queda listo para construir.'
        : 'We\'re on the right track. A couple of scope adjustments and it\'s ready to build.'
    };
  }
  return {
    mode: 'go',
    cta: es ? 'Avancemos — agenda tu llamada de construcción' : 'Move forward — book your build call',
    note: es
      ? 'Es un buen encaje. Estás listo para dimensionar la primera versión.'
      : 'This is a good fit. You\'re ready to scope the first version.'
  };
}

/**
 * Build the client-safe plan.
 * @param {object} project  d2_projects row (needs triage_structured, premortem_structured, name/description)
 * @param {object} [opts]   { lang, showCompetitors, showConsiderations }
 * @returns {object|null}   allowlisted plan, or null when triage not ready
 */
function clientPlanFromTriage(project, opts = {}) {
  const p = project || {};
  const triage = p.triage_structured || null;
  const premortem = p.premortem_structured || null;
  if (!triage || typeof triage.fit_score === 'undefined') return null; // not ready yet

  const es = String(opts.lang || p.lang || 'en').toLowerCase().startsWith('es');
  const showCompetitors = opts.showCompetitors !== false; // Option B default: show
  const feas = feasibility(triage.fit_score, es);
  const gate = ctaGate(triage, premortem, es);

  // The problem, in our words — prefer a clean restatement, else the prospect's
  // OWN description. Never the internal fit_reasoning (it is analyst-voiced).
  const problem = scrubText(triage.problem_in_our_words || p.description || '');

  // Why it's feasible — sanitized reasoning. The only reasoning field is
  // analyst-voiced, so after scrubbing internal posture it can come back thin;
  // omit rather than show a stub or a dismissive fragment.
  let whyReasoning = scrubText(triage.fit_reasoning || '');
  if (whyReasoning.length < 40) whyReasoning = '';

  // Recommended first build.
  const v1 = scrubText(triage.wedge_recommendation || '');

  // Key considerations — from regulatory flags, reframed (drop internal severity).
  const considerations = arr(triage.regulatory_flags)
    .map(f => scrubText([f.risk, f.what_to_check].filter(Boolean).join(' — ')))
    .filter(Boolean)
    .slice(0, 8);

  // Competitive landscape we account for.
  const landscape = showCompetitors
    ? arr(triage.competitors_to_watch).map(c => scrubText(String(c))).filter(Boolean).slice(0, 8)
    : [];

  // Risks we plan around — from the premortem, softened (no base rates, no
  // "the company dies"). Pair the failure modes with our mitigations.
  const risks = arr(premortem && premortem.failure_modes)
    .map(f => {
      const risk = scrubText(f.title || '');
      const detail = scrubText(f.narrative || '');
      if (!risk && !detail) return null;
      return { risk: risk || detail.slice(0, 80), detail: risk && detail && detail !== risk ? detail : '' };
    })
    .filter(Boolean)
    .slice(0, 6);
  const mitigations = arr(premortem && premortem.top_mitigations)
    .map(m => scrubText(typeof m === 'string' ? m : (m.action || m.mitigation || m.text || '')))
    .filter(Boolean)
    .slice(0, 6);

  // What we'll need from you — from conditions, reframed (client-actionable).
  const needFromYou = arr(triage.conditions_if_any)
    .map(c => scrubText(String(c)))
    .filter(Boolean)
    .slice(0, 6);

  const L = es ? {
    heading: 'Plan de factibilidad y construcción',
    disclaimer: 'Alcance preliminar generado por nuestro análisis de IA. Un humano lo revisa antes de cualquier construcción.',
    feas: 'Factibilidad', problem: 'El problema, en nuestras palabras', why: 'Por qué es factible',
    v1: 'Primera versión recomendada', cons: 'Puntos clave a considerar',
    land: 'Panorama competitivo que contemplamos', risks: 'Riesgos que anticipamos',
    mit: 'Cómo los manejamos', need: 'Lo que necesitaremos de ti'
  } : {
    heading: 'Feasibility & Build Plan',
    disclaimer: 'Preliminary scope from our AI analysis. A human reviews it before any build.',
    feas: 'Feasibility', problem: 'The problem, in our words', why: 'Why it\'s feasible',
    v1: 'Recommended first build', cons: 'Key considerations to address',
    land: 'Competitive landscape we account for', risks: 'Risks we plan around',
    mit: 'How we handle them', need: 'What we\'ll need from you'
  };

  return {
    is_simulated: !!p.__heuristic,
    lang: es ? 'es' : 'en',
    labels: L,
    disclaimer: L.disclaimer,
    feasibility: feas,
    problem,
    why: whyReasoning,
    v1,
    considerations,
    landscape,
    risks,
    mitigations,
    need_from_you: needFromYou,
    gate // { mode, cta, note } — mode drives the button; the verdict itself is never here
  };
}

// A test hook: assert an object carries NONE of the internal fields/markers.
// Used by the boundary SIT. Returns [] when clean, else a list of leaks.
function findLeaks(obj) {
  const leaks = [];
  const json = JSON.stringify(obj || {});
  for (const k of FORBIDDEN_KEYS) {
    if (new RegExp('"' + k + '"').test(json)) leaks.push('key:' + k);
  }
  const markers = [/monetiz/i, /revenue share/i, /go[\s/-]?no[\s/-]?go/i, /\bRESHAPE\b/, /\bDECLINE\b/, /conflict of interest/i, /\bManuel Stagg\b/i];
  for (const rx of markers) { if (rx.test(json)) leaks.push('marker:' + rx.source); }
  return leaks;
}

module.exports = { clientPlanFromTriage, findLeaks, scrubText, feasibility, ctaGate, FORBIDDEN_KEYS };
