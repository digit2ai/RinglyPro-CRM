// =====================================================
// patterns — cross-analysis intelligence for a binomio (horse+rider).
//
// Pure functions over a list of stored analysis rows. Three products the brief
// asks for:
//   detectPatterns(rows)  -> repeat-pattern ALERTS ("you release short on oxers",
//                            "you load the right side")
//   workload(rows, opts)  -> jump VOLUME per session/week + an overload flag
//   records(rows, opts)   -> personal RECORDS: max height over time per binomio
//
// Everything is deterministic and store-agnostic (works on memory or Postgres
// rows), so sit.js can exercise it directly.
// =====================================================

'use strict';

const round = (n, d) => { const p = Math.pow(10, d || 0); return Math.round(n * p) / p; };
function dayKey(ts) { const d = new Date(ts); return d.toISOString().slice(0, 10); }
// ISO week key YYYY-Www (Monday-based) — no external deps.
function weekKey(ts) {
  const d = new Date(ts); const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  const jan1 = new Date(Date.UTC(monday.getUTCFullYear(), 0, 1));
  const wk = Math.floor((monday - jan1) / 604800000) + 1;
  return monday.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
}

function faultsOf(row) { return Array.isArray(row && row.faults) ? row.faults : []; }
function manualOf(row) { return Array.isArray(row && row.manual_faults) ? row.manual_faults : []; }

// ---- Repeat-pattern alerts ----------------------------------------------------
// Looks at the most recent `window` analyses. Emits an alert when a signature
// recurs in >= `minShare` of them (default 40%, min 2 occurrences).
function detectPatterns(rows, opts) {
  opts = opts || {};
  const window = opts.window || 12;
  const minShare = opts.minShare || 0.4;
  const recent = (rows || []).slice(0, window);
  const n = recent.length;
  const alerts = [];
  if (n < 2) return { count: 0, sample: n, alerts };

  const need = Math.max(2, Math.ceil(n * minShare));

  // 1) Recurring fault types
  const faultCount = {};
  recent.forEach((r) => { const seen = new Set(); faultsOf(r).forEach((f) => { if (!seen.has(f.type)) { seen.add(f.type); faultCount[f.type] = (faultCount[f.type] || 0) + 1; } }); });
  Object.keys(faultCount).forEach((type) => {
    if (faultCount[type] >= need) alerts.push({ code: 'recurring_fault', signal: type, occurrences: faultCount[type], of: n, severity: faultCount[type] >= n * 0.7 ? 'high' : 'medium' });
  });

  // 2) Rails/refusals concentrated on a fence type (verticals vs oxers)
  const byFence = {};
  recent.forEach((r) => manualOf(r).forEach((m) => { if (m.kind === 'rail') { byFence[m.fence_type] = (byFence[m.fence_type] || 0) + 1; } }));
  const fenceTotal = Object.values(byFence).reduce((a, b) => a + b, 0);
  if (fenceTotal >= 3) {
    const top = Object.keys(byFence).sort((a, b) => byFence[b] - byFence[a])[0];
    if (byFence[top] / fenceTotal >= 0.5) alerts.push({ code: 'rail_fence_bias', signal: top, occurrences: byFence[top], of: fenceTotal, severity: 'medium' });
  }

  // 3) Refusal location clustering (early/mid/late in the course by at_sec quartile)
  const refPos = [];
  recent.forEach((r) => { const dur = r.duration_sec || 0; manualOf(r).forEach((m) => { if (m.kind === 'refusal' && m.at_sec != null && dur > 0) refPos.push(m.at_sec / dur); }); });
  if (refPos.length >= 2) {
    const late = refPos.filter((p) => p >= 0.66).length, early = refPos.filter((p) => p <= 0.33).length;
    if (late >= 2 && late >= refPos.length * 0.5) alerts.push({ code: 'refusal_cluster', signal: 'late_course', occurrences: late, of: refPos.length, severity: 'high' });
    else if (early >= 2 && early >= refPos.length * 0.5) alerts.push({ code: 'refusal_cluster', signal: 'early_course', occurrences: early, of: refPos.length, severity: 'medium' });
  }

  // 4) Symmetry side load (load_left / load_right recurring)
  ['load_left', 'load_right'].forEach((t) => { if (faultCount[t] >= need) alerts.push({ code: 'lateral_load', signal: t, occurrences: faultCount[t], of: n, severity: 'medium' }); });

  // 5) Dimension trend (declining rider_score across the window)
  const scored = recent.map((r) => r.rider_score).filter((s) => s != null);
  if (scored.length >= 4) {
    const firstHalf = scored.slice(Math.ceil(scored.length / 2)); // older (rows are newest-first)
    const lastHalf = scored.slice(0, Math.floor(scored.length / 2)); // newer
    const older = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const newer = lastHalf.reduce((a, b) => a + b, 0) / lastHalf.length;
    if (newer - older <= -6) alerts.push({ code: 'score_declining', signal: 'rider_score', occurrences: round(older - newer, 0), of: scored.length, severity: 'high' });
    else if (newer - older >= 6) alerts.push({ code: 'score_improving', signal: 'rider_score', occurrences: round(newer - older, 0), of: scored.length, severity: 'info' });
  }

  return { count: alerts.length, sample: n, alerts };
}

// ---- Workload / overload ------------------------------------------------------
// Groups analyses by ISO week; each analysis == one recorded jumping effort.
// Flags overload when weekly count exceeds `maxPerWeek` (default 40) OR big-fence
// (>=130cm) volume exceeds `maxBigPerWeek` (default 12) in the current week.
function workload(rows, opts) {
  opts = opts || {};
  const maxPerWeek = opts.maxPerWeek || 40;
  const maxBigPerWeek = opts.maxBigPerWeek || 12;
  const byWeek = {};
  (rows || []).forEach((r) => {
    const wk = weekKey(r.created_at || Date.now());
    byWeek[wk] = byWeek[wk] || { week: wk, count: 0, big: 0 };
    byWeek[wk].count++;
    if ((r.height_cm || 0) >= 130) byWeek[wk].big++;
  });
  const weeks = Object.values(byWeek).sort((a, b) => (a.week < b.week ? 1 : -1));
  const current = weeks[0] || { count: 0, big: 0 };
  const overload = current.count > maxPerWeek || current.big > maxBigPerWeek;
  return { weeks: weeks.slice(0, 12), current, overload, thresholds: { maxPerWeek, maxBigPerWeek } };
}

// ---- Records ------------------------------------------------------------------
// Per binomio (horse+rider), the max jumped height over time + a simple PB list.
// `key` groups by horse_name|rider_name (falls back to horse_name, then 'default').
function binomioKey(r) {
  const h = (r.horse_name || '').trim().toLowerCase();
  const j = (r.rider_name || '').trim().toLowerCase();
  return (h || j) ? (h + '|' + j) : 'default';
}
function records(rows, opts) {
  const groups = {};
  (rows || []).forEach((r) => {
    const k = binomioKey(r);
    groups[k] = groups[k] || { key: k, horse_name: r.horse_name || null, rider_name: r.rider_name || null, best_cm: 0, best_at: null, count: 0, timeline: [] };
    const g = groups[k];
    g.count++;
    const cm = r.height_cm || 0;
    if (cm > g.best_cm) { g.best_cm = cm; g.best_at = r.created_at || null; }
    g.timeline.push({ at: r.created_at || null, height_cm: cm, rider_score: r.rider_score != null ? r.rider_score : null });
  });
  const out = Object.values(groups).map((g) => { g.timeline.sort((a, b) => (new Date(a.at) - new Date(b.at))); return g; });
  if (opts && opts.horse_name) return out.filter((g) => (g.horse_name || '').toLowerCase() === String(opts.horse_name).toLowerCase());
  return out;
}

// Compare multiple horses for one rider: best height + avg rider_score per horse.
function compareHorses(rows) {
  const byHorse = {};
  (rows || []).forEach((r) => {
    const h = (r.horse_name || '').trim(); if (!h) return;
    byHorse[h] = byHorse[h] || { horse_name: h, count: 0, best_cm: 0, scoreSum: 0, scoreN: 0 };
    const g = byHorse[h]; g.count++;
    if ((r.height_cm || 0) > g.best_cm) g.best_cm = r.height_cm || 0;
    if (r.rider_score != null) { g.scoreSum += r.rider_score; g.scoreN++; }
  });
  return Object.values(byHorse).map((g) => ({ horse_name: g.horse_name, count: g.count, best_cm: g.best_cm, avg_rider_score: g.scoreN ? round(g.scoreSum / g.scoreN, 0) : null }))
    .sort((a, b) => b.best_cm - a.best_cm);
}

module.exports = { detectPatterns, workload, records, compareHorses, weekKey, binomioKey };
