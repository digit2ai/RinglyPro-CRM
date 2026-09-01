'use strict';

/**
 * THE DERIVER — observed runs become proposed processes.
 *
 * This is the module's actual claim: that watching how work happens produces a
 * better input to a cost model than asking someone to remember it. A CEO
 * estimating "the invoice run takes about four hours a week" is guessing, and
 * every dollar downstream inherits that guess.
 *
 * WHAT IT MAY CONCLUDE, AND WHAT IT MAY NOT.
 *
 *   MEASURED   how long a run took, how many runs happened, over what window,
 *              how many distinct people performed it, which systems it crossed.
 *   PROPOSED   that a group of runs constitutes one nameable process, and what
 *              to call it. A guess, marked as one, until a human confirms.
 *   NEVER      what anyone is paid, whether a customer sees the output, whether
 *              the data is regulated, or what an error costs. A browser cannot
 *              observe any of those, and inventing them is exactly how a
 *              readiness document becomes the oversold artifact this whole
 *              product exists to replace.
 *
 * THE EXTRAPOLATION RULE. Turning an observed window into "hours per week"
 * requires dividing by the window, and a two-day window multiplied to a week
 * is a 3.5x invention wearing a measurement's clothes. So: a window under
 * seven days yields the measured rate with `confidence:'low'`, the window
 * stated in days beside it, and a caveat that travels with the number into the
 * roadmap. It is never silently scaled up.
 */

const { fingerprint } = require('./redact');

const MIN_RUNS_FOR_MEDIUM = 3;
const MIN_RUNS_FOR_HIGH = 8;
const FULL_WINDOW_DAYS = 7;
const MAX_PROCESSES = 12;

/* Verbs a dominant action implies, for naming a proposal. */
const ACTION_VERB = {
  type: 'Data entry', paste: 'Re-keying', copy: 'Re-keying',
  upload: 'Document handling', download: 'Document handling',
  submit: 'Approvals', search: 'Lookups', navigate: 'Review',
  click: 'Processing', switch_app: 'Reconciliation'
};

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Similarity between two capture shapes, on the ordered app+action sequence.
 * Jaccard over bigrams: two runs of the same work that differ by one extra
 * lookup should merge; two genuinely different processes that both happen to
 * use Salesforce should not.
 */
function bigrams(steps) {
  const seq = steps.map(s => `${s.app}:${s.action}`);
  const out = new Set();
  for (let i = 0; i < seq.length - 1; i++) out.add(seq[i] + '>' + seq[i + 1]);
  if (seq.length === 1) out.add(seq[0]);
  return out;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  a.forEach(v => { if (b.has(v)) inter++; });
  return inter / (a.size + b.size - inter);
}

/**
 * Cluster captures into candidate processes.
 * @param {Array} captures  [{ id, label, actor_ref, started_at, duration_ms, fingerprint, steps:[...] }]
 */
function cluster(captures = [], { threshold = 0.6 } = {}) {
  const items = captures.map(c => ({
    capture: c,
    grams: bigrams(Array.isArray(c.steps) ? c.steps : [])
  }));

  const clusters = [];
  items.forEach(item => {
    // Identical shape hash is a certainty, not a similarity — check it first.
    let hit = clusters.find(cl => cl.fingerprints.has(item.capture.fingerprint));
    if (!hit) {
      let best = null, bestScore = 0;
      clusters.forEach(cl => {
        const score = jaccard(item.grams, cl.grams);
        if (score > bestScore) { bestScore = score; best = cl; }
      });
      if (best && bestScore >= threshold) hit = best;
    }
    if (hit) {
      hit.members.push(item.capture);
      hit.fingerprints.add(item.capture.fingerprint);
      item.grams.forEach(g => hit.grams.add(g));
    } else {
      clusters.push({
        members: [item.capture],
        fingerprints: new Set([item.capture.fingerprint]),
        grams: new Set(item.grams)
      });
    }
  });
  return clusters;
}

/** Human-readable name for a cluster. Prefers what an operator actually typed. */
function proposeName(members) {
  const labels = members.map(m => (m.label || '').trim()).filter(Boolean);
  if (labels.length) {
    // The most common operator label wins. A person naming their own work beats
    // anything we can infer from click shapes.
    const counts = {};
    labels.forEach(l => { counts[l.toLowerCase()] = (counts[l.toLowerCase()] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return labels.find(l => l.toLowerCase() === top) || labels[0];
  }
  const steps = members.flatMap(m => m.steps || []);
  const appCount = {}, actCount = {};
  steps.forEach(s => {
    appCount[s.app] = (appCount[s.app] || 0) + 1;
    if (s.action !== 'navigate' && s.action !== 'wait' && s.action !== 'scroll') {
      actCount[s.action] = (actCount[s.action] || 0) + 1;
    }
  });
  const apps = Object.entries(appCount).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const act = Object.entries(actCount).sort((a, b) => b[1] - a[1])[0];
  const verb = (act && ACTION_VERB[act[0]]) || 'Recurring work';
  if (apps.length >= 2) return `${verb} between ${apps[0]} and ${apps[1]}`;
  if (apps.length === 1) return `${verb} in ${apps[0]}`;
  return 'Unnamed recurring process';
}

function windowDays(members) {
  const times = members
    .map(m => new Date(m.started_at || m.created_at || 0).getTime())
    .filter(t => t > 0);
  if (times.length < 2) return times.length ? 1 : 0;
  const span = (Math.max(...times) - Math.min(...times)) / 86400000;
  // Inclusive. Runs on Monday and Tuesday span one day but were observed over
  // two, and the window is what the confidence rule and every caveat quote.
  return Math.max(1, Math.round(span) + 1);
}

/**
 * Turn one cluster into a proposed process.
 *
 * `hours_per_week` is PER PERSON, matching the readiness interview's own field
 * definition. Getting that wrong multiplies the entire cost model by headcount.
 */
function summarize(cluster, opts = {}) {
  const members = cluster.members;
  const runs = members.length;
  const days = windowDays(members);
  const people = new Set(members.map(m => m.actor_ref).filter(Boolean)).size || 1;

  const durations = members.map(m => Number(m.duration_ms) || 0).filter(v => v > 0);
  const medianMs = median(durations);
  const totalMs = durations.reduce((a, b) => a + b, 0);

  // Measured hours per week per person, over the window actually observed.
  const weeks = Math.max(days / 7, 1 / 7);   // a single day is 1/7 of a week
  const hoursPerWeek = totalMs / 3600000 / people / weeks;

  const confidence =
    (days >= FULL_WINDOW_DAYS && runs >= MIN_RUNS_FOR_HIGH) ? 'high'
      : (days >= FULL_WINDOW_DAYS && runs >= MIN_RUNS_FOR_MEDIUM) ? 'medium'
        : 'low';

  const caveats = [];
  if (days < FULL_WINDOW_DAYS) {
    caveats.push(`Observed over ${days} day${days === 1 ? '' : 's'}, not a full week. The rate is what was measured in that window and has not been scaled up to a week — a short window is reported, never multiplied.`);
  }
  if (runs < MIN_RUNS_FOR_MEDIUM) {
    caveats.push(`Only ${runs} run${runs === 1 ? '' : 's'} observed. Enough to see the shape of the work, not enough to be confident about how often it happens.`);
  }
  if (people === 1) {
    caveats.push('One person performed every observed run. If others do this work too, the hours here are that one person\'s only.');
  }

  const appAgg = {};
  members.forEach(m => (m.app_summary || []).forEach(a => {
    appAgg[a.app] = appAgg[a.app] || { app: a.app, steps: 0, ms: 0 };
    appAgg[a.app].steps += a.steps || 0;
    appAgg[a.app].ms += a.ms || 0;
  }));
  const apps = Object.values(appAgg).sort((a, b) => b.ms - a.ms);

  const steps = members.flatMap(m => m.steps || []);
  const switches = countAppSwitches(members);
  const rekeying = steps.filter(s => s.action === 'copy' || s.action === 'paste').length;

  return {
    name: proposeName(members),
    status: 'proposed',
    origin: 'derived',
    people,
    hours_per_week: Math.round(hoursPerWeek * 100) / 100,
    hours_source: 'measured',
    observed_runs: runs,
    observed_window_days: days,
    median_run_minutes: Math.round(medianMs / 600) / 100,
    apps,
    fingerprints: Array.from(cluster.fingerprints),

    // Everything a human still has to supply. Null is the honest value, and the
    // dashboard asks for exactly these — it does not default them to false,
    // because an unanswered question is not a "no".
    loaded_hourly_cost: null,
    customer_facing: null,
    involves_regulated_data: null,
    error_tolerance: null,

    evidence: {
      capture_ids: members.map(m => m.id).filter(Boolean),
      confidence,
      caveats,
      total_observed_minutes: Math.round(totalMs / 60000),
      distinct_shapes: cluster.fingerprints.size,
      app_switches_per_run: runs ? Math.round((switches / runs) * 10) / 10 : 0,
      rekeying_steps: rekeying,
      measured_at: new Date().toISOString(),
      window: { days, runs, people }
    }
  };
}

/** How many times a run leaves one application for another. */
function countAppSwitches(members) {
  let n = 0;
  members.forEach(m => {
    const seq = (m.steps || []).map(s => s.app);
    for (let i = 1; i < seq.length; i++) if (seq[i] && seq[i] !== seq[i - 1]) n++;
  });
  return n;
}

/**
 * Full pass: captures -> ranked proposals.
 * Ranked by observed minutes, because the process eating the most measured
 * time is the one worth confirming first.
 */
function derive(captures = [], opts = {}) {
  const usable = captures.filter(c => Array.isArray(c.steps) && c.steps.length);
  if (!usable.length) {
    return { processes: [], stats: { captures: 0, clusters: 0, usable: 0 } };
  }
  const clusters = cluster(usable, opts);
  const processes = clusters
    .map(cl => summarize(cl, opts))
    .sort((a, b) => (b.evidence.total_observed_minutes) - (a.evidence.total_observed_minutes))
    .slice(0, MAX_PROCESSES);

  return {
    processes,
    stats: {
      captures: captures.length,
      usable: usable.length,
      clusters: clusters.length,
      truncated: clusters.length > MAX_PROCESSES,
      window_days: windowDays(usable),
      people: new Set(usable.map(c => c.actor_ref).filter(Boolean)).size
    }
  };
}

module.exports = {
  derive, cluster, summarize, proposeName, bigrams, jaccard,
  countAppSwitches, windowDays, median,
  MIN_RUNS_FOR_MEDIUM, MIN_RUNS_FOR_HIGH, FULL_WINDOW_DAYS, MAX_PROCESSES
};
