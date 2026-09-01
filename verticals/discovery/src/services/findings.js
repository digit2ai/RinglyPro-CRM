'use strict';

/**
 * NEURAL FINDINGS — what the observed work says, in OrbUp's existing vocabulary.
 *
 * Shaped deliberately like the CRM's Neural findings
 * (`{ id, severity, title, explanation, dollarImpact, source, treatment }` —
 * see src/routes/neural.js) so a Discovery finding renders wherever a Neural
 * finding already renders, instead of inventing a second dialect for the same
 * idea.
 *
 * TWO RULES, BOTH ENFORCED HERE RATHER THAN REQUESTED OF A MODEL:
 *
 *  1. A FINDING WITHOUT EVIDENCE IS NOT EMITTED. Every entry carries the rows
 *     and counts it was computed from. Nothing is generated to fill a section.
 *
 *  2. `dollarImpact` IS EMPTY UNLESS SOMEBODY TYPED A RATE. Time is measured;
 *     money is stated. A process with no loaded hourly cost produces a finding
 *     about hours and an explicit blank where the dollars would be — which is
 *     also, itself, a finding worth surfacing.
 *
 * These are the model's OBD codes: stable machine codes so a finding can be
 * tracked across evaluations rather than re-derived as a new string each run.
 */

function usd(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  return '$' + Math.round(n).toLocaleString('en-US');
}

const HOURS_PER_YEAR = 52;

/** Annualised cost of one process — only when a human supplied the rate. */
function annualCost(p) {
  const rate = Number(p.loaded_hourly_cost);
  const hrs = Number(p.hours_per_week);
  const people = Math.max(1, Number(p.people) || 1);
  if (!(rate > 0) || !(hrs > 0)) return null;
  return hrs * people * HOURS_PER_YEAR * rate;
}

/**
 * @param {object} input
 *   processes[]   — confirmed and proposed, with their evidence
 *   captures      — { count, window_days, people, redaction }
 *   answers       — the stated sections {fears, cost, risk, data}
 *   lang
 */
function build(input = {}) {
  const processes = Array.isArray(input.processes) ? input.processes : [];
  const confirmed = processes.filter(p => p.status === 'confirmed');
  const caps = input.captures || {};
  const answers = input.answers || {};
  const out = [];
  let n = 0;
  const push = (f) => { n++; out.push({ id: `dsc${n}`, ...f }); };

  /* ── nothing observed yet ─────────────────────────────────────────────── */
  if (!processes.length) {
    push({
      code: 'DSC-NO-CAPTURE', severity: 'OPPORTUNITY',
      title: 'No work has been observed yet',
      explanation: 'Connect a capture source and go about a normal few days. The module reads the shape of the work — which systems, which actions, how long — and proposes the processes it saw. It never records what was typed, the contents of a page, or a URL beyond its host.',
      dollarImpact: '', source: 'Capture',
      evidence: {},
      treatment: { label: 'Connect a source', href: '/discovery/connect' }
    });
    return out;
  }

  /* ── swivel-chair work: the highest-value pattern a capture can see ────── */
  // A person moving the same information between two systems by hand is the
  // single most automatable thing in an office, and it is close to invisible
  // in an interview because nobody describes it as a process — they describe
  // it as "then I put it in the other system".
  processes.forEach(p => {
    const sw = (p.evidence && p.evidence.app_switches_per_run) || 0;
    const apps = (p.apps || []).length;
    if (sw >= 4 && apps >= 2) {
      const cost = annualCost(p);
      push({
        code: 'DSC-SWIVEL-CHAIR', severity: 'WARNING',
        title: `"${p.name}" moves between ${apps} systems ${sw} times per run`,
        explanation: `Observed across ${p.observed_runs} run${p.observed_runs === 1 ? '' : 's'}, this work leaves one application for another ${sw} times on average — ${(p.apps || []).slice(0, 3).map(a => a.app).join(', ')}. Information carried between systems by a person is the pattern with the shortest path to automation, and the one least likely to be described in an interview, because it is remembered as part of the work rather than as work.`,
        dollarImpact: cost ? usd(cost) + '/yr in observed time' : '',
        source: 'Capture', process_id: p.id || null,
        evidence: { app_switches_per_run: sw, apps: (p.apps || []).map(a => a.app), runs: p.observed_runs },
        treatment: { label: 'Confirm this process', href: '/discovery/#processes' }
      });
    }
  });

  /* ── re-keying ─────────────────────────────────────────────────────────── */
  processes.forEach(p => {
    const rk = (p.evidence && p.evidence.rekeying_steps) || 0;
    if (rk >= 6) {
      push({
        code: 'DSC-REKEYING', severity: 'WARNING',
        title: `"${p.name}" contains ${rk} copy or paste steps`,
        explanation: 'Copying a value out of one screen and typing it into another is transcription, and transcription has a measurable error rate no amount of care removes. This is usually the cheapest thing to fix and the easiest to prove, which makes it a strong Phase 1 candidate.',
        dollarImpact: '', source: 'Capture', process_id: p.id || null,
        evidence: { rekeying_steps: rk, runs: p.observed_runs },
        treatment: null
      });
    }
  });

  /* ── measured but uncosted ─────────────────────────────────────────────── */
  // This is the finding that keeps the whole model honest, so it is loud.
  const uncosted = confirmed.filter(p => !(Number(p.loaded_hourly_cost) > 0) && Number(p.hours_per_week) > 0);
  if (uncosted.length) {
    const hrs = uncosted.reduce((a, p) => a + Number(p.hours_per_week) * Math.max(1, p.people || 1), 0);
    push({
      code: 'DSC-UNCOSTED', severity: 'WARNING',
      title: `${uncosted.length} confirmed process${uncosted.length === 1 ? '' : 'es'} ${uncosted.length === 1 ? 'carries' : 'carry'} hours but no hourly rate`,
      explanation: `We measured roughly ${Math.round(hrs * 10) / 10} hours a week across ${uncosted.map(p => `"${p.name}"`).join(', ')}, and those hours contribute nothing to the savings figures in your roadmap. A browser can watch how long work takes; it cannot know what the person doing it is paid. Rather than apply an industry average and present it as your number, we leave it out and tell you it is out. Enter a loaded hourly cost and these hours become dollars.`,
      dollarImpact: '', source: 'Answers',
      evidence: { processes: uncosted.map(p => p.name), weekly_hours: Math.round(hrs * 10) / 10 },
      treatment: { label: 'Add hourly rates', href: '/discovery/#processes' }
    });
  }

  /* ── short observation window ──────────────────────────────────────────── */
  const short = processes.filter(p => (p.observed_window_days || 0) < 7);
  if (short.length && short.length === processes.length) {
    push({
      code: 'DSC-SHORT-WINDOW', severity: 'WARNING',
      title: `Everything was observed over ${caps.window_days || short[0].observed_window_days || 1} day${(caps.window_days || 1) === 1 ? '' : 's'}`,
      explanation: 'The rates below are what was measured in that window. They have not been multiplied up to a week, because scaling two days by three and a half produces an invention that looks exactly like a measurement. Leave capture running for a full week — including whatever day the month-end work lands on — and these numbers stop carrying this caveat.',
      dollarImpact: '', source: 'Capture',
      evidence: { window_days: caps.window_days || null, processes: short.length },
      treatment: null
    });
  }

  /* ── one person carries it ─────────────────────────────────────────────── */
  processes.filter(p => (p.people || 1) === 1 && (p.hours_per_week || 0) >= 2).forEach(p => {
    push({
      code: 'DSC-KEY-PERSON', severity: 'OPPORTUNITY',
      title: `"${p.name}" was performed by one person every time`,
      explanation: 'Every observed run came from the same operator. That is a continuity exposure independent of any AI question — the process exists in one person\'s hands and nowhere in writing. A captured, documented process is worth having even if nothing is ever automated.',
      dollarImpact: '', source: 'Capture', process_id: p.id || null,
      evidence: { people: 1, hours_per_week: p.hours_per_week },
      treatment: null
    });
  });

  /* ── the largest measured cost ─────────────────────────────────────────── */
  const costed = confirmed.map(p => ({ p, c: annualCost(p) })).filter(x => x.c);
  if (costed.length) {
    costed.sort((a, b) => b.c - a.c);
    const top = costed[0];
    push({
      code: 'DSC-TOP-COST', severity: 'OPPORTUNITY',
      title: `"${top.p.name}" is the most expensive observed process`,
      explanation: `${top.p.hours_per_week} hours a week per person across ${top.p.people} ${top.p.people === 1 ? 'person' : 'people'}, at the rate you entered, is the largest measured line in your operation among the processes confirmed so far. Every dollar here traces to time we watched and a rate you typed — no industry benchmark is used anywhere in this figure.`,
      dollarImpact: usd(top.c) + '/yr',
      source: 'Cost', process_id: top.p.id || null,
      evidence: { annual_cost_usd: Math.round(top.c), hours_per_week: top.p.hours_per_week, people: top.p.people, rate_stated_by: 'account' },
      treatment: null
    });
  }

  /* ── proposals waiting on a human ──────────────────────────────────────── */
  const pending = processes.filter(p => p.status === 'proposed');
  if (pending.length) {
    push({
      code: 'DSC-UNCONFIRMED', severity: 'OPPORTUNITY',
      title: `${pending.length} proposed process${pending.length === 1 ? '' : 'es'} awaiting confirmation`,
      explanation: 'Grouping observed runs into "a process" is a good machine guess about where one piece of work ends and the next begins. It is not authority to put a name into a board document, so a proposal stays a proposal until somebody who does the work confirms it. Only confirmed processes enter the roadmap.',
      dollarImpact: '', source: 'Capture',
      evidence: { pending: pending.map(p => p.name) },
      treatment: { label: 'Review proposals', href: '/discovery/#processes' }
    });
  }

  /* ── regulated work observed ───────────────────────────────────────────── */
  const regulated = confirmed.filter(p => p.involves_regulated_data === true);
  if (regulated.length) {
    push({
      code: 'DSC-REGULATED', severity: 'CRITICAL',
      title: `${regulated.length} confirmed process${regulated.length === 1 ? '' : 'es'} ${regulated.length === 1 ? 'touches' : 'touch'} regulated data`,
      explanation: `${regulated.map(p => `"${p.name}"`).join(', ')} ${regulated.length === 1 ? 'was' : 'were'} marked as touching regulated or personal data. These are excluded from Phase 1 by rule, not by preference — a first project should not be the thing that tests your compliance posture. They become Phase 2 candidates once the obligations in your roadmap's risk section are satisfied.`,
      dollarImpact: '', source: 'Risk',
      evidence: { processes: regulated.map(p => p.name) },
      treatment: null
    });
  }

  /* ── what the boundary actually stripped ───────────────────────────────── */
  const red = caps.redaction || {};
  if ((red.text_values_dropped || 0) + (red.query_strings_dropped || 0) + (red.identifiers_masked || 0) > 0) {
    push({
      code: 'DSC-REDACTION', severity: 'OPPORTUNITY',
      title: 'The privacy boundary was exercised and held',
      explanation: `Across the captures received, the server discarded ${red.text_values_dropped || 0} text value${(red.text_values_dropped || 0) === 1 ? '' : 's'}, dropped ${red.query_strings_dropped || 0} query string${(red.query_strings_dropped || 0) === 1 ? '' : 's'} and masked ${red.identifiers_masked || 0} identifier${(red.identifiers_masked || 0) === 1 ? '' : 's'} before anything was stored. This is counted rather than asserted so your compliance officer can see the boundary doing work instead of being asked to trust it was never tested.`,
      dollarImpact: '', source: 'Capture',
      evidence: red,
      treatment: null
    });
  }

  /* ── the stated fear, answered ─────────────────────────────────────────── */
  const fear = (answers.fears || {}).biggest_fear;
  if (fear === 'data') {
    push({
      code: 'DSC-FEAR-DATA', severity: 'OPPORTUNITY',
      title: 'You said your data is a mess. The capture disagrees in one specific way.',
      explanation: `Whatever state your databases are in, the record of how the work is actually done now exists: ${processes.length} process shape${processes.length === 1 ? '' : 's'} across ${caps.count || 0} observed run${(caps.count || 0) === 1 ? '' : 's'}. That record is the input a first project needs, and you did not have it a week ago. "Our data is a mess" is usually true about the warehouse and false about the workflow.`,
      dollarImpact: '', source: 'Data',
      evidence: { processes: processes.length, captures: caps.count || 0 },
      treatment: null
    });
  }

  return out;
}

module.exports = { build, annualCost, usd, HOURS_PER_YEAR };
