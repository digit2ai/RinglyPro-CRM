'use strict';

/**
 * COST COMFORT ENGINE — the Cost Comfort Agent's arithmetic.
 *
 * The fear this answers: "it will cost more than it returns, and I will have
 * spent money I cannot justify."
 *
 * Three rules make the output survive a CEO's pushback, and they are enforced
 * here rather than requested in a prompt:
 *
 *   1. EVERY DOLLAR TRACES TO AN INPUT. Savings are computed from the hours,
 *      headcount and loaded rates the CEO gave us. There are no industry
 *      benchmarks in the savings math. If they did not tell us, we omit it —
 *      we never estimate a loss on their behalf.
 *   2. ASSUMPTIONS ARE NAMED AND SHOWN. Build rates, capture rates and run
 *      costs are constants in this file, every one carrying a `basis` string
 *      that is rendered in the deliverable. A CEO can argue with a number they
 *      can see; an invisible one destroys trust when discovered.
 *   3. THE PILOT IS BUILT TO FIT THE CEILING. We do not size a pilot and then
 *      ask the CEO to stretch. We take the number they said they could lose
 *      without losing sleep and design under it — and if nothing meaningful
 *      fits, we say that plainly instead of shrinking the promise silently.
 *
 * Deterministic. Given identical answers this returns identical figures with
 * or without a language model available. The SIT asserts that.
 */

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const round = (n) => Math.round(n);
const band = (n, pct) => ({ low: round(n * (1 - pct)), high: round(n * (1 + pct)), mid: round(n) });

/* ── Named assumptions. Every one is shown to the CEO. ──────────────────── */
const A = {
  build_rate_usd_hr: num(process.env.AIR_BUILD_RATE_USD_HR, 70),
  basis_build_rate: 'Digit2AI delivery rate, AI-native build model.',

  hours_per_process_pilot: num(process.env.AIR_HOURS_PER_PROCESS, 40),
  basis_hours_per_process: 'Design, build, evaluation set and human-in-the-loop wiring for one process.',

  hours_per_integration: num(process.env.AIR_HOURS_PER_INTEGRATION, 16),
  basis_hours_per_integration: 'One system connected: auth, read path, field mapping, failure handling.',

  hours_per_remediation_item: num(process.env.AIR_HOURS_PER_REMEDIATION, 12),
  basis_hours_per_remediation: 'One data gap closed to the standard Phase 1 needs.',

  // Deliberately conservative. A pilot that removes 40% of the manual hours in
  // its scope is a success; promising 80% is how the CEO got burned last time.
  capture_rate_pilot: Number(process.env.AIR_CAPTURE_RATE_PILOT || 0.40),
  basis_capture_pilot: 'Conservative: share of in-scope manual hours actually removed during a pilot, with a human still reviewing output.',

  capture_rate_scale: Number(process.env.AIR_CAPTURE_RATE_SCALE || 0.60),
  basis_capture_scale: 'Share of in-scope manual hours removed once the pilot has evidence and review is relaxed on proven paths.',

  run_cost_per_process_month_usd: num(process.env.AIR_RUN_COST_PER_PROCESS, 120),
  basis_run_cost: 'Model tokens, hosting and monitoring for one automated process at small-business volume.',

  support_month_usd: num(process.env.AIR_SUPPORT_MONTH, 250),
  basis_support: 'Ongoing tuning and support during the pilot window.',

  band_pct: Number(process.env.AIR_COST_BAND_PCT || 0.30),
  basis_band: 'Every build figure is a range, not a point. A point estimate on unbuilt software is a fiction.'
};

/**
 * What the named processes cost to run by hand, per year.
 *
 * This is NOT a savings claim and the deliverable says so in those words. It
 * is the current, ongoing, already-being-paid cost of the work — the thing a
 * CEO is comparing against, and the only honest framing of "doing nothing".
 */
function costOfDoingNothing(processes = [], knownLeakUsd) {
  const lines = processes.filter(p => p && p.name).map(p => {
    const people = num(p.people, 1) || 1;
    const hrs = num(p.hours_per_week);
    const rate = num(p.loaded_hourly_cost);
    const annual_hours = people * hrs * 52;
    return {
      name: p.name,
      people, hours_per_week: hrs, loaded_hourly_cost: rate,
      annual_hours: round(annual_hours),
      annual_cost_usd: round(annual_hours * rate),
      traceable: hrs > 0 && rate > 0
    };
  });

  const process_annual_usd = lines.reduce((a, l) => a + l.annual_cost_usd, 0);
  const leak = num(knownLeakUsd);

  return {
    lines,
    process_annual_usd: round(process_annual_usd),
    // Included only when the CEO supplied it. Never inferred.
    stated_leak_annual_usd: leak > 0 ? round(leak) : null,
    total_annual_usd: round(process_annual_usd + leak),
    total_annual_hours: round(lines.reduce((a, l) => a + l.annual_hours, 0)),
    what_this_is: 'The cost you are already paying, every year, to do this work by hand — computed from the hours and rates you gave us.',
    what_this_is_not: 'This is not a savings projection. Nobody removes all of it. The savings figure below is a fraction of this, and the fraction is stated.',
    incomplete: lines.some(l => !l.traceable)
  };
}

/**
 * Rank processes for Phase 1. Lowest risk first, then biggest time drain.
 *
 * The ordering IS the risk posture: regulated data and customer-visible output
 * are disqualifying for a first pilot, not merely down-weighted. A CEO whose
 * first exposure to AI is a regulated, customer-facing process has been set up
 * to fail regardless of how good the software is.
 */
function rankForPilot(processes = []) {
  return processes.filter(p => p && p.name).map(p => {
    const annual_cost = num(p.people, 1) * num(p.hours_per_week) * 52 * num(p.loaded_hourly_cost);
    const blockers = [];
    if (p.involves_regulated_data) blockers.push('touches regulated or personal data');
    if (p.customer_facing) blockers.push('output is seen by a customer');
    if (p.error_tolerance === 'zero') blockers.push('zero tolerance for error');

    // 'low' error tolerance is a caution, not a blocker — human-in-the-loop
    // covers it. 'zero' means an error is unrecoverable; that is different.
    const cautions = [];
    if (p.error_tolerance === 'low') cautions.push('low error tolerance — human review stays mandatory');

    return {
      ...p,
      annual_cost_usd: round(annual_cost),
      pilot_eligible: blockers.length === 0,
      blockers, cautions
    };
  }).sort((a, b) => {
    if (a.pilot_eligible !== b.pilot_eligible) return a.pilot_eligible ? -1 : 1;
    return b.annual_cost_usd - a.annual_cost_usd;
  });
}

/**
 * Build the phase cost model and the start-small budget path.
 *
 * @param {object} input
 *   processes            — from the pain section
 *   known_leak_annual_usd
 *   comfortable_pilot_budget_usd  — the ceiling. Load-bearing.
 *   monthly_run_comfort_usd
 *   current_software_spend_monthly_usd
 *   remediation_items    — count of blocking data gaps (from the data engine)
 *   systems_count        — how many systems must be connected
 */
function analyze(input = {}) {
  const processes = Array.isArray(input.processes) ? input.processes : [];
  const ranked = rankForPilot(processes);
  const eligible = ranked.filter(p => p.pilot_eligible);
  const doingNothing = costOfDoingNothing(processes, input.known_leak_annual_usd);

  const ceiling = num(input.comfortable_pilot_budget_usd);
  const runComfort = num(input.monthly_run_comfort_usd);
  const remediation = Math.max(0, num(input.remediation_items));
  const systems = Math.max(1, num(input.systems_count, 1));

  /* ── size a pilot that fits under the ceiling ─────────────────────────── */
  // Start from two processes (enough to prove a pattern, small enough to kill)
  // and shrink until it fits. Shrinking is reported, never silent.
  const pilotCostFor = (count) => {
    const buildHours = count * A.hours_per_process_pilot
      + Math.min(systems, count + 1) * A.hours_per_integration
      + remediation * A.hours_per_remediation_item;
    return round(buildHours * A.build_rate_usd_hr);
  };

  let scopeCount = Math.min(2, eligible.length);
  let narrowed = false;
  let fits_ceiling = true;

  if (ceiling > 0) {
    while (scopeCount > 1 && pilotCostFor(scopeCount) > ceiling) { scopeCount--; narrowed = true; }
    if (scopeCount >= 1 && pilotCostFor(scopeCount) > ceiling) fits_ceiling = false;
  }

  const pilotScope = eligible.slice(0, Math.max(scopeCount, 0));
  const pilotBuildUsd = pilotScope.length ? pilotCostFor(pilotScope.length) : 0;
  const pilotRunMonthly = round(pilotScope.length * A.run_cost_per_process_month_usd + A.support_month_usd);

  // Savings: a stated fraction of the in-scope manual cost only. Never of the
  // whole company, never of processes outside the pilot.
  const inScopeAnnual = pilotScope.reduce((a, p) => a + p.annual_cost_usd, 0);
  const pilotAnnualSavings = round(inScopeAnnual * A.capture_rate_pilot);
  const pilotMonthlySavings = round(pilotAnnualSavings / 12);
  const netMonthly = pilotMonthlySavings - pilotRunMonthly;

  const payback_months = netMonthly > 0 ? Math.ceil(pilotBuildUsd / netMonthly) : null;

  /* ── the exposure ceiling: the honest maximum downside ────────────────── */
  // What the CEO can lose if the pilot returns literally nothing and is killed
  // at the first gate. This is the number that ends the cost conversation.
  const pilot_weeks = num(process.env.AIR_PILOT_WEEKS, 4);
  const max_exposure_usd = round(pilotBuildUsd + pilotRunMonthly * Math.ceil(pilot_weeks / 4));

  /* ── phases ───────────────────────────────────────────────────────────── */
  const remaining = ranked.filter(p => !pilotScope.includes(p));
  const expansionCount = Math.min(remaining.length, 3);
  const expansionBuild = expansionCount
    ? round((expansionCount * A.hours_per_process_pilot * 0.8 + systems * A.hours_per_integration) * A.build_rate_usd_hr)
    : 0;
  const expansionInScope = remaining.slice(0, expansionCount).reduce((a, p) => a + p.annual_cost_usd, 0);

  const phases = {
    phase_1: {
      build_usd: band(pilotBuildUsd, A.band_pct),
      run_monthly_usd: pilotRunMonthly,
      in_scope_annual_manual_cost_usd: round(inScopeAnnual),
      projected_annual_savings_usd: pilotAnnualSavings,
      capture_rate_applied: A.capture_rate_pilot,
      payback_months,
      max_exposure_usd,
      process_count: pilotScope.length
    },
    phase_2: {
      build_usd: band(expansionBuild, A.band_pct),
      run_monthly_usd: round((pilotScope.length + expansionCount) * A.run_cost_per_process_month_usd + A.support_month_usd),
      projected_annual_savings_usd: round((inScopeAnnual + expansionInScope) * A.capture_rate_scale),
      capture_rate_applied: A.capture_rate_scale,
      process_count: expansionCount,
      conditional: true,
      condition: 'Only funded if Phase 1 hit its success metrics. Unfunded otherwise — that is the point of the gate.'
    },
    phase_3: {
      build_usd: null,
      run_monthly_usd: null,
      costed: false,
      why_not_costed: 'Phase 3 is deliberately not priced. Costing a transformation against today\'s unknowns would be a fabricated number, and it is the fabricated number in these documents that CEOs learn to distrust. It gets priced when Phase 2 has produced evidence.'
    }
  };

  /* ── the start-small budget path ──────────────────────────────────────── */
  const budget_path = [
    { step: 1, label: 'Prove one process', spend_usd: band(pilotCostFor(1), A.band_pct).mid,
      commitment: 'One-time. Nothing recurring until it works.',
      you_can_stop_here: true },
    { step: 2, label: 'Run it for a month', spend_usd: pilotRunMonthly,
      commitment: 'Month to month. Cancel leaves you with the data and the process documentation.',
      you_can_stop_here: true },
    { step: 3, label: 'Add the second process', spend_usd: pilotBuildUsd - pilotCostFor(1),
      commitment: 'Only after step 1 shows measured hours removed.',
      you_can_stop_here: true },
    { step: 4, label: 'Expand (Phase 2)', spend_usd: phases.phase_2.build_usd.mid,
      commitment: 'Gated on Phase 1 evidence. Never auto-triggered.',
      you_can_stop_here: true }
  ];

  /* ── scoring ──────────────────────────────────────────────────────────── */
  let score = 0;
  const reasons = [];

  // Headroom against the stated ceiling (0-40)
  if (ceiling > 0 && pilotBuildUsd > 0) {
    const ratio = ceiling / pilotBuildUsd;
    const pts = ratio >= 2 ? 40 : ratio >= 1.5 ? 32 : ratio >= 1 ? 24 : ratio >= 0.75 ? 12 : 0;
    score += pts;
    reasons.push(pts >= 24
      ? `The pilot fits inside the budget you said you could risk (${fmt(pilotBuildUsd)} against ${fmt(ceiling)}).`
      : `The pilot as scoped exceeds the budget you said you could risk (${fmt(pilotBuildUsd)} against ${fmt(ceiling)}).`);
  } else {
    reasons.push('No comfortable pilot budget was stated, so budget fit could not be scored.');
  }

  // Payback (0-35)
  if (payback_months !== null) {
    const pts = payback_months <= 6 ? 35 : payback_months <= 12 ? 28 : payback_months <= 18 ? 18 : payback_months <= 24 ? 10 : 0;
    score += pts;
    reasons.push(`At the conservative ${Math.round(A.capture_rate_pilot * 100)}% capture rate, the build pays for itself in about ${payback_months} months.`);
  } else {
    reasons.push('Projected savings do not exceed the monthly run cost at the conservative capture rate, so there is no payback to report. That is a finding, not an omission.');
  }

  // Leverage: how large the existing manual cost is next to the ask (0-25)
  if (pilotBuildUsd > 0 && doingNothing.total_annual_usd > 0) {
    const lev = doingNothing.total_annual_usd / pilotBuildUsd;
    const pts = lev >= 10 ? 25 : lev >= 5 ? 20 : lev >= 3 ? 14 : lev >= 1.5 ? 7 : 0;
    score += pts;
    reasons.push(`You are already spending ${fmt(doingNothing.total_annual_usd)} a year on this work by hand — ${lev.toFixed(1)}x the one-time cost of the pilot.`);
  }

  score = Math.max(0, Math.min(100, round(score)));
  const rating = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';

  const to_green = [];
  if (ceiling > 0 && pilotBuildUsd > ceiling) to_green.push(`Narrow Phase 1 to a single process (about ${fmt(pilotCostFor(1))}) so it sits under your stated ceiling.`);
  if (payback_months === null) to_green.push('Pick a process with more weekly hours in it — the current scope does not carry enough manual cost to pay back its own run cost.');
  if (payback_months !== null && payback_months > 12) to_green.push('Add the second-highest-hour process to Phase 1; payback shortens as fixed integration cost is shared.');
  if (!ceiling) to_green.push('State a pilot budget you could lose without pain — the whole model is built to fit under it.');

  return {
    lane: 'cost',
    score, rating,
    reasons,
    to_green,
    cost_of_doing_nothing: doingNothing,
    pilot_scope: pilotScope.map(p => ({ name: p.name, annual_cost_usd: p.annual_cost_usd, cautions: p.cautions })),
    excluded_from_pilot: ranked.filter(p => !p.pilot_eligible)
      .map(p => ({ name: p.name, blockers: p.blockers, annual_cost_usd: p.annual_cost_usd,
                   note: 'Deliberately out of Phase 1. It returns in Phase 2 once the guardrails have been proven on something safer.' })),
    narrowed_to_fit: narrowed,
    fits_ceiling,
    ceiling_usd: ceiling || null,
    // Stated plainly rather than papered over.
    ceiling_shortfall_usd: (!fits_ceiling && ceiling > 0) ? round(pilotBuildUsd - ceiling) : null,
    run_comfort_ok: runComfort > 0 ? pilotRunMonthly <= runComfort : null,
    software_spend_comparison: num(input.current_software_spend_monthly_usd) > 0
      ? { current_monthly_usd: round(num(input.current_software_spend_monthly_usd)),
          pilot_monthly_usd: pilotRunMonthly,
          cheaper_than_current_stack: pilotRunMonthly < num(input.current_software_spend_monthly_usd) }
      : null,
    phases,
    budget_path,
    assumptions: assumptionList(),
    computed_by: 'deterministic'
  };
}

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Every assumption, rendered into the deliverable so none of them are hidden. */
function assumptionList() {
  return [
    { key: 'build_rate_usd_hr', value: A.build_rate_usd_hr, basis: A.basis_build_rate },
    { key: 'hours_per_process_pilot', value: A.hours_per_process_pilot, basis: A.basis_hours_per_process },
    { key: 'hours_per_integration', value: A.hours_per_integration, basis: A.basis_hours_per_integration },
    { key: 'hours_per_remediation_item', value: A.hours_per_remediation_item, basis: A.basis_hours_per_remediation },
    { key: 'capture_rate_pilot', value: A.capture_rate_pilot, basis: A.basis_capture_pilot },
    { key: 'capture_rate_scale', value: A.capture_rate_scale, basis: A.basis_capture_scale },
    { key: 'run_cost_per_process_month_usd', value: A.run_cost_per_process_month_usd, basis: A.basis_run_cost },
    { key: 'support_month_usd', value: A.support_month_usd, basis: A.basis_support },
    { key: 'cost_band_pct', value: A.band_pct, basis: A.basis_band }
  ];
}

module.exports = { analyze, costOfDoingNothing, rankForPilot, assumptionList, ASSUMPTIONS: A, fmt };
