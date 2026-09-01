'use strict';

/**
 * CAPTURE STORE — ingest, persist, derive.
 *
 * INGEST NEVER BLOCKS. The same lesson AI Radar learned from the share sheet
 * applies with more force here: capture runs on an employee's laptop while they
 * are trying to do their job, and anything that makes the recorder feel slow
 * gets uninstalled by the end of the week. A push redacts, writes, and returns.
 * Clustering into proposed processes happens afterwards, on demand or on a
 * later push, never inside the request.
 *
 * Idempotency is by `external_ref` per tenant: a client that retries after a
 * timeout must not double-count a run, because a double-counted run inflates
 * the hours that become dollars in the roadmap.
 */

const { Capture, Step, Process, Source, Event, sequelize } = require('../models');
const { redactCapture } = require('./redact');
const derive = require('./derive');
const { Op } = require('sequelize');

/** Persist one capture. Returns { capture, created, redaction }. */
async function ingest({ tenant_id, source_id = null, payload = {}, channel = 'api' }) {
  const red = redactCapture(payload, { tenant_id });

  if (red.external_ref) {
    const dupe = await Capture.findOne({
      where: { tenant_id, external_ref: red.external_ref }
    });
    if (dupe) {
      return { capture: dupe, created: false, redaction: dupe.redaction_report || {}, duplicate: true };
    }
  }

  if (!red.steps.length) {
    const err = new Error('A capture needs at least one step');
    err.code = 'empty_capture';
    throw err;
  }

  const cap = await Capture.create({
    tenant_id, source_id,
    external_ref: red.external_ref,
    label: red.label,
    actor_ref: red.actor_ref,
    started_at: red.started_at,
    ended_at: red.ended_at,
    duration_ms: red.duration_ms,
    step_count: red.step_count,
    app_summary: red.app_summary,
    fingerprint: red.fingerprint,
    redaction_report: red.redaction_report,
    status: 'received'
  });

  await Step.bulkCreate(red.steps.map(s => ({ ...s, tenant_id, capture_id: cap.id })));

  if (source_id) {
    await Source.update(
      { last_seen_at: new Date(), capture_count: sequelize.literal('capture_count + 1') },
      { where: { id: source_id, tenant_id } }
    ).catch(() => {});
  }

  await Event.create({
    tenant_id, kind: 'capture.ingested', channel,
    detail: { capture_id: cap.id, steps: red.step_count, redaction: red.redaction_report }
  }).catch(() => {});

  return { capture: cap, created: true, redaction: red.redaction_report };
}

/** Load captures with their steps, for the deriver. */
async function loadForDerive(tenant_id, { limit = 500 } = {}) {
  const caps = await Capture.findAll({
    where: { tenant_id },
    order: [['created_at', 'DESC']],
    limit
  });
  if (!caps.length) return [];
  const ids = caps.map(c => c.id);
  const steps = await Step.findAll({
    where: { tenant_id, capture_id: { [Op.in]: ids } },
    order: [['capture_id', 'ASC'], ['seq', 'ASC']]
  });
  const byCapture = {};
  steps.forEach(s => { (byCapture[s.capture_id] = byCapture[s.capture_id] || []).push(s.toJSON()); });
  return caps.map(c => ({ ...c.toJSON(), steps: byCapture[c.id] || [] }));
}

/**
 * Re-derive proposals from everything captured so far.
 *
 * A CONFIRMED PROCESS IS NEVER OVERWRITTEN. Re-deriving refreshes the measured
 * numbers on a confirmed row (more observation is better observation) but never
 * touches the fields a human supplied — the rate, the flags, the name they may
 * have corrected. Nor does it resurrect a rejected proposal: a person who said
 * "that is not a process" should not have to say it again every week.
 */
async function rederive(tenant_id) {
  const caps = await loadForDerive(tenant_id);
  const { processes, stats } = derive.derive(caps);

  const existing = await Process.findAll({ where: { tenant_id } });
  const byFp = new Map();
  existing.forEach(p => (p.fingerprints || []).forEach(fp => byFp.set(fp, p)));

  let created = 0, refreshed = 0, skipped = 0;

  for (const proposal of processes) {
    const match = proposal.fingerprints.map(fp => byFp.get(fp)).find(Boolean);

    if (!match) {
      await Process.create({ tenant_id, ...proposal });
      created++;
      continue;
    }
    if (match.status === 'rejected') { skipped++; continue; }

    // Measured fields refresh. Human-supplied fields do not.
    match.people = proposal.people;
    match.hours_per_week = proposal.hours_per_week;
    match.observed_runs = proposal.observed_runs;
    match.observed_window_days = proposal.observed_window_days;
    match.median_run_minutes = proposal.median_run_minutes;
    match.apps = proposal.apps;
    match.fingerprints = Array.from(new Set([...(match.fingerprints || []), ...proposal.fingerprints]));
    match.evidence = proposal.evidence;
    match.updated_at = new Date();
    // A name the operator corrected survives re-derivation.
    if (match.status === 'proposed' && match.origin === 'derived') match.name = proposal.name;
    await match.save();
    refreshed++;
  }

  await Event.create({
    tenant_id, kind: 'processes.derived', channel: 'system',
    detail: { created, refreshed, skipped, ...stats }
  }).catch(() => {});

  return { created, refreshed, skipped, stats };
}

/** Aggregate capture statistics for the findings + coverage layers. */
async function stats(tenant_id) {
  const caps = await Capture.findAll({ where: { tenant_id } });
  if (!caps.length) return { count: 0, window_days: 0, people: 0, redaction: {}, steps: 0 };

  const times = caps.map(c => new Date(c.started_at || c.created_at).getTime()).filter(t => t > 0);
  // Inclusive, matching derive.windowDays — the dashboard and the process rows
  // must never quote different windows for the same captures.
  const window_days = times.length > 1
    ? Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 86400000) + 1)
    : 1;

  const redaction = caps.reduce((acc, c) => {
    const r = c.redaction_report || {};
    Object.keys(r).forEach(k => { acc[k] = (acc[k] || 0) + (Number(r[k]) || 0); });
    return acc;
  }, {});

  return {
    count: caps.length,
    steps: caps.reduce((a, c) => a + (c.step_count || 0), 0),
    minutes: Math.round(caps.reduce((a, c) => a + (c.duration_ms || 0), 0) / 60000),
    people: new Set(caps.map(c => c.actor_ref).filter(Boolean)).size,
    window_days,
    first_seen: times.length ? new Date(Math.min(...times)) : null,
    last_seen: times.length ? new Date(Math.max(...times)) : null,
    redaction
  };
}

module.exports = { ingest, rederive, loadForDerive, stats };
