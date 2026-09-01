'use strict';

/**
 * THE EVALUATION — observed work plus stated posture becomes a roadmap.
 *
 * This file does NOT reimplement the AI Readiness Department. It calls the same
 * six engines the department calls, in the same order, and the honesty
 * properties they enforce (every dollar traced to an input, Phase 3 never
 * priced, regulated work never in Phase 1, the model writing prose but never a
 * number) hold here unchanged because the code enforcing them is the code
 * running. Reimplementing them inline would lose every one of those properties
 * silently — the output would still look right.
 *
 * WHAT THIS FILE ADDS is the substitution at the front:
 *
 *   the Department  asks a CEO to describe their processes in an interview
 *   Discovery       measures them, and asks the CEO only what cannot be measured
 *
 * THE ORDER IS LOAD-BEARING AND MUST NOT BE PARALLELISED: data first (its
 * blocking-gap count becomes remediation hours in the cost model), then cost
 * (its Phase 1 scope is what risk writes guardrails around), then risk, then
 * the roadmap. Fanned out concurrently the three lanes quietly disagree about
 * which processes are in the pilot.
 */

const path = require('path');
const ENGINES = path.join(__dirname, '..', '..', '..', 'ai-readiness', 'src', 'engines');

const dataEngine = require(path.join(ENGINES, 'data'));
const costEngine = require(path.join(ENGINES, 'cost'));
const riskEngine = require(path.join(ENGINES, 'risk'));
const scorecardEngine = require(path.join(ENGINES, 'scorecard'));
const roadmapEngine = require(path.join(ENGINES, 'roadmap'));

const { systemsFrom } = require('./redact');
const findingsService = require('./findings');

/**
 * The questions a capture can never answer, and which the evaluation refuses to
 * run without. Deliberately far shorter than the Department's full interview —
 * everything in the `pain` section, and the `systems` half of `data`, is now
 * measured instead of asked. That reduction IS the product.
 */
const REQUIRED = [
  { section: 'fears', key: 'biggest_fear',
    q: { en: 'Which concern is the real blocker for you?', es: '¿Cuál preocupación es el bloqueo real?' } },
  { section: 'cost', key: 'comfortable_pilot_budget_usd',
    q: { en: 'What could you spend once, on a pilot, and not lose sleep if it returned nothing?',
         es: '¿Cuánto podría gastar una vez, en un piloto, sin perder el sueño si no devolviera nada?' } },
  { section: 'risk', key: 'risk_concerns',
    q: { en: 'Which risks keep you up at night?', es: '¿Cuáles riesgos le quitan el sueño?' } },
  { section: 'data', key: 'data_quality',
    q: { en: 'If you pulled a report right now, would you trust it?', es: 'Si sacara un reporte ahora, ¿confiaría en él?' } },
  { section: 'data', key: 'data_accessible',
    q: { en: 'How hard is it to get data out of those systems?', es: '¿Qué tan difícil es sacar datos de esos sistemas?' } },
  { section: 'data', key: 'contains_pii',
    q: { en: 'Does the work touch personal, health or payment data?', es: '¿El trabajo toca datos personales, de salud o de pago?' } }
];

/** Which required answers are still missing, named. */
function missingRequired(answers = {}) {
  return REQUIRED.filter(r => {
    const v = (answers[r.section] || {})[r.key];
    if (v === undefined || v === null || v === '') return true;
    if (Array.isArray(v) && !v.length) return true;
    return false;
  }).map(r => ({ section: r.section, key: r.key, question: r.q }));
}

/**
 * Assemble the engine input for one account.
 *
 * ONLY CONFIRMED PROCESSES REACH THE ENGINES. A machine-proposed grouping of
 * clicks is a hypothesis; a roadmap is a document someone takes to a board.
 * The gap between those two is a human pressing confirm, and it is the whole
 * reason the deliverable is defensible.
 */
function buildInputs({ account, processes = [], answers = {}, captureStats = {} }) {
  const confirmed = processes
    .filter(p => p.status === 'confirmed')
    .map(p => ({
      name: p.name,
      people: Number(p.people) || 1,
      hours_per_week: Number(p.hours_per_week) || 0,
      // Null rate stays null. The cost engine computes 0 for it and flags the
      // whole line `traceable:false`, which is exactly the behaviour we want —
      // an uncosted process appears in the roadmap with its hours and without
      // invented dollars, rather than being dropped or averaged.
      loaded_hourly_cost: Number(p.loaded_hourly_cost) || 0,
      customer_facing: p.customer_facing === true,
      involves_regulated_data: p.involves_regulated_data === true,
      error_tolerance: p.error_tolerance || 'medium',
      // Provenance travels with the process into every downstream document.
      measured: p.hours_source === 'measured',
      observed_runs: p.observed_runs || 0,
      observed_window_days: p.observed_window_days || 0,
      confidence: (p.evidence && p.evidence.confidence) || 'low'
    }));

  // Systems are DERIVED from what the capture actually saw, not asked. This is
  // the second thing observation buys: a CEO listing their systems from memory
  // routinely forgets the spreadsheet the work actually lives in.
  const observedApps = [];
  processes.forEach(p => (p.apps || []).forEach(a => observedApps.push(a.app || a)));
  const derivedSystems = systemsFrom(observedApps);
  const statedSystems = Array.isArray((answers.data || {}).systems) ? answers.data.systems : [];
  const systems = Array.from(new Set([...derivedSystems, ...statedSystems]));

  return {
    account, confirmed, systems, derivedSystems, statedSystems,
    answers, captureStats
  };
}

/**
 * Run the department's engines over the assembled inputs.
 * Returns findings, scorecard, roadmap phases, diagram and coverage.
 */
function run({ account, processes = [], answers = {}, captureStats = {}, lang = 'en' } = {}) {
  const L = lang === 'es' ? 'es' : 'en';
  const gaps = missingRequired(answers);
  const confirmedCount = processes.filter(p => p.status === 'confirmed').length;

  // The department's own refusal, inherited. An evaluation that runs on absent
  // inputs is the oversold artifact the whole product exists to replace, and a
  // self-serve front door makes it easier to produce, not harder.
  if (!confirmedCount) {
    return {
      ok: false,
      error: 'no_confirmed_processes',
      message: L === 'es'
        ? 'Ningún proceso confirmado. La captura propone; una persona confirma. Solo los procesos confirmados entran en la hoja de ruta.'
        : 'No confirmed processes. Capture proposes; a person confirms. Only confirmed processes enter the roadmap.',
      missing: gaps
    };
  }
  if (gaps.length) {
    return {
      ok: false,
      error: 'missing_required_answers',
      message: L === 'es'
        ? 'Faltan respuestas que ninguna observación puede dar. Se nombran a continuación en vez de rellenarse.'
        : 'Answers are missing that no amount of observation can supply. They are named below rather than filled in.',
      missing: gaps
    };
  }

  const inputs = buildInputs({ account, processes, answers, captureStats });
  const A = inputs.answers;

  /* ── 1. DATA (first: its blocking count feeds the cost model) ─────────── */
  const data = dataEngine.analyze({
    data_exists: (A.data || {}).data_exists,
    data_quality: (A.data || {}).data_quality,
    data_accessible: (A.data || {}).data_accessible,
    data_structured: (A.data || {}).data_structured,
    data_owner_exists: (A.data || {}).data_owner_exists,
    retention_policy: (A.data || {}).retention_policy,
    contains_pii: (A.data || {}).contains_pii,
    dpa_in_place: (A.data || {}).dpa_in_place,
    history_months: (A.data || {}).history_months,
    systems: inputs.systems,
    processes: inputs.confirmed
  });

  /* ── 2. COST (second: its Phase 1 scope is what risk guards) ──────────── */
  const cost = costEngine.analyze({
    processes: inputs.confirmed,
    known_leak_annual_usd: (A.cost || {}).known_leak_annual_usd,
    comfortable_pilot_budget_usd: (A.cost || {}).comfortable_pilot_budget_usd,
    monthly_run_comfort_usd: (A.cost || {}).monthly_run_comfort_usd,
    current_software_spend_monthly_usd: (A.cost || {}).current_software_spend_monthly_usd,
    remediation_items: data.blocking_count || 0,
    systems_count: inputs.systems.length || 1
  });

  /* ── 3. RISK ───────────────────────────────────────────────────────────── */
  const risk = riskEngine.analyze({
    regulatory_regimes: (A.risk || {}).regulatory_regimes,
    risk_concerns: (A.risk || {}).risk_concerns,
    worst_case: (A.risk || {}).worst_case,
    workforce_sensitivity: (A.risk || {}).workforce_sensitivity,
    headcount_intent: (A.risk || {}).headcount_intent,
    political_cost_of_failure: (A.cost || {}).political_cost_of_failure,
    security_review_required: (A.risk || {}).security_review_required,
    pilot_scope: cost.pilot_scope || [],
    excluded_from_pilot: cost.excluded_from_pilot || [],
    lang: L
  }, L);

  /* ── 4. SCORECARD + ROADMAP ────────────────────────────────────────────── */
  const scorecard = scorecardEngine.build({ cost, risk, data }, L);

  const engagement = {
    company_name: account.company_name,
    ceo_name: account.name,
    industry: account.industry,
    country: account.country,
    headcount: account.headcount,
    lang: L,
    // The roadmap engine reads the stated fear to open with it.
    biggest_fear: (A.fears || {}).biggest_fear,
    top_fears: (A.fears || {}).top_fears
  };

  const roadmap = roadmapEngine.build({
    engagement,
    findings: { cost, risk, data },
    scorecard,
    lang: L
  });

  /* ── 5. NEURAL FINDINGS ────────────────────────────────────────────────── */
  const neural = findingsService.build({
    processes, captures: captureStats, answers: A, lang: L
  });

  /* ── 6. THE DIAGRAM ────────────────────────────────────────────────────── */
  const diagram = buildDiagram({ scorecard, roadmap, cost, risk, data, processes, lang: L });

  /* ── 7. COVERAGE — what was measured, stated, or absent ────────────────── */
  const coverage = buildCoverage({ inputs, processes, data, captureStats, lang: L });

  return {
    ok: true,
    findings: { cost, risk, data },
    scorecard,
    phases: roadmap.phases || [],
    executive_summary: roadmap.executive_summary || '',
    safe_next_step: scorecard.safe_next_step || {},
    talk_track: roadmap.talk_track || [],
    neural,
    diagram,
    coverage,
    inputs: {
      processes: inputs.confirmed,
      systems: inputs.systems,
      derived_systems: inputs.derivedSystems,
      answers: A
    }
  };
}

/**
 * The roadmap as a graph the dashboard can draw.
 *
 * A three-phase plan read as prose is a wall of text a CEO skims; the same plan
 * drawn as phases with gates between them is a thing they can point at in a
 * meeting. The diagram is generated FROM the phases rather than authored
 * beside them, so a picture can never disagree with the document under it.
 */
function buildDiagram({ scorecard, roadmap, cost, risk, data, processes, lang }) {
  const es = lang === 'es';
  const phases = roadmap.phases || [];

  const lanes = (scorecard.lanes || []).map(l => ({
    key: l.key, title: l.title, rating: l.rating,
    score: l.score, headline: l.headline
  }));

  const blockers = (data.blocking || []).map(b => ({
    gap: b.gap, fix: b.fix, days: b.effort_days || 0
  }));

  const nodes = [];
  const edges = [];

  nodes.push({
    id: 'start', kind: 'start', column: 0,
    label: es ? 'Trabajo observado' : 'Observed work',
    detail: es
      ? `${processes.filter(p => p.status === 'confirmed').length} procesos confirmados`
      : `${processes.filter(p => p.status === 'confirmed').length} confirmed processes`
  });

  let col = 1;
  if (blockers.length) {
    nodes.push({
      id: 'remediate', kind: 'blocker', column: col,
      label: es ? 'Resolver primero' : 'Clear first',
      detail: blockers.map(b => b.fix),
      days: blockers.reduce((a, b) => a + b.days, 0)
    });
    edges.push({ from: 'start', to: 'remediate', kind: 'blocked' });
    col++;
  }

  phases.forEach((p, i) => {
    const id = `phase${p.number || i + 1}`;
    nodes.push({
      id, kind: 'phase', column: col,
      number: p.number || i + 1,
      label: p.title,
      objective: p.objective,
      scope: p.scope || [],
      weeks: p.timeline_weeks || null,
      risk_level: p.risk_level || null,
      cost: p.cost || {},
      priced: !!(p.cost && (p.cost.build_usd_range || p.cost.run_monthly_usd)),
      metrics: (p.success_metrics || []).slice(0, 4)
    });
    const prev = i === 0 ? (blockers.length ? 'remediate' : 'start') : `phase${phases[i - 1].number || i}`;
    edges.push({ from: prev, to: id, kind: i === 0 ? 'start' : 'gate' });

    if (p.gate) {
      const gid = `gate${p.number || i + 1}`;
      nodes.push({
        id: gid, kind: 'gate', column: col,
        label: p.gate.title,
        conditions: p.gate.conditions || [],
        if_not_met: p.gate.if_not_met || null,
        after: id
      });
    }
    col++;
  });

  const excluded = (cost.excluded_from_pilot || []).map(p => ({
    name: p.name, why: (p.blockers || []).join('; ')
  }));

  return {
    lanes, nodes, edges, blockers, excluded,
    verdict: scorecard.verdict,
    verdict_label: scorecard.verdict_label,
    overall_rating: scorecard.overall_rating,
    next_step: scorecard.safe_next_step || {},
    legend: scorecard.legend || {},
    // Phase 3 carries no price on purpose, and the diagram says so where the
    // number would otherwise be — a blank cell reads as an oversight.
    unpriced_note: es
      ? 'La Fase 3 no lleva precio. Costear una transformación contra incógnitas produce una cifra inventada.'
      : 'Phase 3 carries no price. Costing a transformation against unknowns produces a fabricated figure.'
  };
}

/**
 * The provenance ledger: for every input the roadmap rests on, whether it was
 * measured, stated by a person, derived, or absent.
 *
 * This is rendered in the deliverable. A CEO who has been oversold before does
 * not need to be told the document is honest; they need to be able to check.
 */
function buildCoverage({ inputs, processes, data, captureStats, lang }) {
  const confirmed = processes.filter(p => p.status === 'confirmed');
  const costed = confirmed.filter(p => Number(p.loaded_hourly_cost) > 0);
  const answeredFlags = confirmed.filter(p => p.customer_facing !== null && p.involves_regulated_data !== null);

  return {
    processes: {
      proposed: processes.filter(p => p.status === 'proposed').length,
      confirmed: confirmed.length,
      rejected: processes.filter(p => p.status === 'rejected').length
    },
    hours: {
      source: 'measured',
      note: 'Hours per week came from observed runs, not from an estimate.',
      window_days: captureStats.window_days || null,
      runs: captureStats.count || 0,
      low_confidence: confirmed.filter(p => (p.evidence && p.evidence.confidence) === 'low').map(p => p.name)
    },
    rates: {
      source: 'stated',
      note: 'Hourly rates can only be entered by a person. A browser cannot observe what anyone is paid.',
      costed: costed.length,
      uncosted: confirmed.length - costed.length,
      uncosted_names: confirmed.filter(p => !(Number(p.loaded_hourly_cost) > 0)).map(p => p.name),
      uncosted_effect: 'Uncosted processes contribute zero dollars to every figure in this roadmap and are listed rather than averaged.'
    },
    systems: {
      source: 'derived',
      note: 'Systems were read from the applications the capture actually saw.',
      derived: inputs.derivedSystems,
      also_stated: inputs.statedSystems
    },
    process_attributes: {
      source: 'stated',
      answered: answeredFlags.length,
      unanswered: confirmed.length - answeredFlags.length,
      note: 'Whether a customer sees the output, and whether the data is regulated, are judgements. An unanswered flag is treated as unknown, never as no.'
    },
    data_posture: { source: 'stated', score: data.score, rating: data.rating },
    absent: buildAbsent({ confirmed, captureStats })
  };
}

function buildAbsent({ confirmed, captureStats }) {
  const out = [];
  if (!(captureStats.window_days >= 7)) {
    out.push('A full week of capture. Rates were measured over a shorter window and are reported unscaled.');
  }
  const uncosted = confirmed.filter(p => !(Number(p.loaded_hourly_cost) > 0));
  if (uncosted.length) out.push(`An hourly rate for: ${uncosted.map(p => p.name).join(', ')}.`);
  if (confirmed.some(p => p.error_tolerance == null)) out.push('An error-tolerance judgement on at least one process.');
  return out;
}

module.exports = { run, buildInputs, missingRequired, buildDiagram, buildCoverage, REQUIRED };
