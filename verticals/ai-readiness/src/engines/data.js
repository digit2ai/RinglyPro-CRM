'use strict';

/**
 * DATA READINESS ENGINE — the Data Readiness Agent's assessment.
 *
 * The fear this answers: "our data is a mess, so we are not ready."
 *
 * Almost every CEO says this, and almost every one of them is both right and
 * wrong. Their data IS a mess. It is also usually good enough for the first
 * process, because the first process needs a fraction of it. The failure mode
 * this engine exists to prevent is the eighteen-month data-warehouse project
 * that gets funded instead of the four-week pilot — a real, common and
 * expensive way for an AI initiative to die before it starts.
 *
 * So a red score here is never a verdict of "not ready". It is a costed
 * remediation plan plus a Phase 1 that routes around the gap. The engine
 * distinguishes explicitly between:
 *
 *   BLOCKING     — Phase 1 genuinely cannot proceed until this is fixed.
 *   NON-BLOCKING — real, worth fixing, and not a reason to wait.
 *
 * Only two things ever block: data that does not exist at all, and personal
 * data being processed without an agreement covering it. Everything else is
 * a scoping problem, not a stop.
 *
 * Deterministic. Identical answers produce identical scores with or without
 * a model available.
 */

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
const scale = (v) => Math.max(0, Math.min(5, num(v))); // 1-5, 0 = unanswered
const pct = (v) => Math.round((scale(v) / 5) * 100);

const WEIGHTS = {
  exists: 25,
  quality: 25,
  accessible: 20,
  structured: 10,
  governance: 10,
  history: 5,
  privacy: 5
};

/**
 * @param {object} input
 *   data_exists, data_quality, data_accessible, data_structured  (1-5)
 *   data_owner_exists, retention_policy, contains_pii, dpa_in_place (bool)
 *   history_months (number)
 *   systems[] (multi)
 *   processes[] — used to say which specific process a gap blocks
 */
function analyze(input = {}) {
  const systems = Array.isArray(input.systems) ? input.systems : [];
  const processes = Array.isArray(input.processes) ? input.processes : [];

  /* ── dimension scores ─────────────────────────────────────────────────── */
  const dims = {};

  dims.exists = {
    label: 'The data is captured at all',
    score: pct(input.data_exists),
    answered: scale(input.data_exists) > 0,
    note: scale(input.data_exists) >= 4
      ? 'The record of the work exists. That is the hard part and you already have it.'
      : scale(input.data_exists) >= 2
        ? 'Partly captured. Phase 1 should be chosen from a process where it is captured, not where it is not.'
        : 'The work is not being recorded in a form anything can read. This is the one gap that genuinely blocks a pilot.'
  };

  dims.quality = {
    label: 'You would trust a report pulled today',
    score: pct(input.data_quality),
    answered: scale(input.data_quality) > 0,
    note: scale(input.data_quality) >= 4
      ? 'Trusted enough to build on.'
      : scale(input.data_quality) >= 2
        ? 'Mixed. Workable: the pilot measures its own accuracy against real cases, so quality problems surface as a number instead of as a surprise.'
        : 'Low confidence in your own reports. Worth knowing that a pilot on a narrow slice is one of the cheaper ways to find out exactly where the quality actually breaks.'
  };

  dims.accessible = {
    label: 'Data can be got out of the systems',
    score: pct(input.data_accessible),
    answered: scale(input.data_accessible) > 0,
    note: scale(input.data_accessible) >= 4
      ? 'Export or an API exists. Integration is routine.'
      : scale(input.data_accessible) >= 2
        ? 'Awkward but possible. Budget integration time; it is in the cost model already.'
        : 'Locked in. This is the single most common source of cost overrun in a first project, so it is worth confirming before, not during.'
  };

  dims.structured = {
    label: 'Structured rather than documents and notes',
    score: pct(input.data_structured),
    answered: scale(input.data_structured) > 0,
    note: scale(input.data_structured) >= 3
      ? 'Structured enough for a first build.'
      : 'Mostly documents, email and notes. Worth saying plainly: this is the case current models handle best, so it lowers the score without lowering the odds.'
  };

  const ownerOk = !!input.data_owner_exists;
  const retentionOk = !!input.retention_policy;
  dims.governance = {
    label: 'Somebody owns data quality',
    score: (ownerOk ? 60 : 0) + (retentionOk ? 40 : 0),
    answered: true,
    note: ownerOk
      ? (retentionOk ? 'Owner named and a retention policy exists.' : 'Owner named. No written retention policy — a one-page document, not a project.')
      : 'No one owns data quality. Not a blocker for a pilot, but Phase 2 will stall without a name against it.'
  };

  const months = num(input.history_months);
  dims.history = {
    label: 'Enough history to measure against',
    score: months >= 24 ? 100 : months >= 12 ? 85 : months >= 6 ? 65 : months >= 3 ? 40 : months > 0 ? 20 : 0,
    answered: months > 0,
    note: months >= 6
      ? `${months} months of history is enough to build an evaluation set from real past cases.`
      : 'Little history. The evaluation set gets built from current cases instead, which takes slightly longer and works.'
  };

  const pii = !!input.contains_pii;
  const dpa = !!input.dpa_in_place;
  dims.privacy = {
    label: 'Personal data is covered by an agreement',
    score: !pii ? 100 : (dpa ? 80 : 0),
    answered: true,
    note: !pii
      ? 'No personal, health or payment data in scope. This removes an entire category of work.'
      : (dpa
        ? 'Personal data present and processing agreements are in place.'
        : 'Personal data present with no processing agreement on file. This blocks that data from Phase 1 — not as a policy preference, as a scope exclusion.')
  };

  /* ── composite ────────────────────────────────────────────────────────── */
  let total = 0, weightUsed = 0;
  Object.keys(WEIGHTS).forEach(k => {
    const d = dims[k];
    if (!d.answered) return;              // unanswered dimensions are excluded,
    total += d.score * WEIGHTS[k];        // never scored as zero — that would
    weightUsed += WEIGHTS[k];             // punish a CEO for a question we
  });                                      // failed to ask.
  const score = weightUsed ? Math.round(total / weightUsed) : 0;
  const rating = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';

  /* ── remediation plan ─────────────────────────────────────────────────── */
  const remediation = [];

  if (scale(input.data_exists) > 0 && scale(input.data_exists) <= 2) {
    remediation.push({
      gap: 'The work is not being recorded in a machine-readable form.',
      fix: 'Pick the one process where it IS recorded and pilot there. In parallel, add capture to the others — usually a form or a field, not a system.',
      effort_days: 5, blocks_phase_1: true,
      blocks_why: 'There is nothing for a pilot to read. Building anyway would be building on nothing.'
    });
  }
  if (pii && !dpa) {
    remediation.push({
      gap: 'Personal data is in scope with no processing agreement covering it.',
      fix: 'Either sign the agreement, or scope the personal data out of Phase 1. The second option takes a day and costs nothing.',
      effort_days: 2, blocks_phase_1: true,
      blocks_why: 'Processing personal data without an agreement is the specific risk the CEO said they wanted avoided.'
    });
  }
  if (scale(input.data_accessible) > 0 && scale(input.data_accessible) <= 2) {
    remediation.push({
      gap: 'Getting data out of the current systems is hard.',
      fix: 'Confirm the export path before build starts — an API, a scheduled export, or a database read. One afternoon of checking prevents the most common overrun in a first project.',
      effort_days: 3, blocks_phase_1: false
    });
  }
  if (scale(input.data_quality) > 0 && scale(input.data_quality) <= 2) {
    remediation.push({
      gap: 'Low confidence in the accuracy of your own records.',
      fix: 'The pilot measures accuracy against real cases, which locates the quality problem precisely instead of estimating it. No cleanup project before starting.',
      effort_days: 0, blocks_phase_1: false
    });
  }
  if (!ownerOk) {
    remediation.push({
      gap: 'No named owner for data quality.',
      fix: 'Name someone. It does not need to be their whole job, and Phase 2 does not work without it.',
      effort_days: 0, blocks_phase_1: false
    });
  }
  if (!retentionOk) {
    remediation.push({
      gap: 'No written retention or deletion policy.',
      fix: 'A one-page policy stating how long each category is kept and how deletion is requested.',
      effort_days: 1, blocks_phase_1: false
    });
  }
  if (!systems.length) {
    remediation.push({
      gap: 'The systems holding the work were not identified.',
      fix: 'List them in the next session. Fifteen minutes, and it sets the integration scope.',
      effort_days: 0, blocks_phase_1: false
    });
  }

  const blocking = remediation.filter(r => r.blocks_phase_1);

  /* ── which processes the gaps actually affect ─────────────────────────── */
  const process_impact = processes.filter(p => p && p.name).map(p => ({
    name: p.name,
    phase_1_safe: !(pii && !dpa && p.involves_regulated_data),
    note: (pii && !dpa && p.involves_regulated_data)
      ? 'Held out of Phase 1 until the processing agreement is signed.'
      : 'No data-side obstacle to including this in Phase 1.'
  }));

  const reasons = Object.keys(WEIGHTS)
    .filter(k => dims[k].answered)
    .map(k => `${dims[k].label}: ${dims[k].score}/100. ${dims[k].note}`);

  const to_green = remediation.filter(r => r.effort_days > 0 || r.blocks_phase_1)
    .map(r => r.fix);

  return {
    lane: 'data',
    score, rating,
    dimensions: dims,
    weights: WEIGHTS,
    reasons,
    to_green,
    remediation,
    blocking_count: blocking.length,
    blocking,
    remediation_days_total: remediation.reduce((a, r) => a + r.effort_days, 0),
    can_start_phase_1: blocking.length === 0,
    process_impact,
    // The framing that keeps a red score from killing the engagement.
    headline: blocking.length === 0
      ? (rating === 'green'
        ? 'Your data is ready for a first project.'
        : 'Your data is not perfect, and it does not need to be. Nothing here stops a first project.')
      : `${blocking.length} item(s) genuinely block a first project. Each is measured in days, not months, and both are listed with the fix.`,
    what_this_is_not: 'This is not an argument for a data-warehouse project before you start. A first process needs a narrow slice of data, and this score is deliberately about that slice.',
    computed_by: 'deterministic'
  };
}

module.exports = { analyze, WEIGHTS };
