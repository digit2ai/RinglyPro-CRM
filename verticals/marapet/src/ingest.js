'use strict';
/**
 * THE INGEST CONTRACT — the one door every reading enters by.
 *
 * ISTC's own board, an off-the-shelf collar, a China ODM module, the in-browser
 * video breathing counter and a human typing a number are five sources of the
 * same shape. Nothing downstream knows which produced a row; a platform that
 * assumes one specific board has to be rewritten when the board changes, and
 * the board will change.
 *
 * TWO ALLOW-LISTS, AND A REJECTED KEY IS REPORTED RATHER THAN DROPPED.
 * A metric this platform does not know is named back to the caller in
 * `rejected`, because a firmware revision that starts sending a field we
 * silently discard looks, from the device side, exactly like success.
 */
const crypto = require('crypto');
const dbm = require('./db');
const bands = require('./bands');

const METRICS = {
  heart_rate_bpm: { unit: 'bpm',          min: 10,   max: 400 },
  resp_rate_bpm:  { unit: 'breaths/min',  min: 1,    max: 200 },
  hrv_ms:         { unit: 'ms',           min: 0,    max: 2000 },
  activity:       { unit: 'index',        min: 0,    max: 100 },
  temp_c:         { unit: 'C',            min: 20,   max: 45 },
  spo2_pct:       { unit: '%',            min: 50,   max: 100 }
};

const SOURCES = ['device', 'video', 'manual'];
const CONFIDENCES = ['high', 'medium', 'low'];

// A reading timestamped far in the future is a device with a wrong clock, not a
// measurement. A reading from long ago is accepted (a collar buffers while out
// of range) but is bounded so a bad clock cannot write into the last century.
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const PAST_TOLERANCE_MS = 90 * 24 * 60 * 60 * 1000;

function metricNames() { return Object.keys(METRICS); }

function dedupeKey(device_id, recorded_at, metric) {
  const iso = new Date(recorded_at).toISOString();
  return `${device_id == null ? '-' : device_id}|${iso}|${metric}`;
}

/**
 * Validate ONE sample. Returns {ok:true, row} or {ok:false, reason}.
 * Pure — no database, so the SIT can drive it directly.
 */
function validateSample(sample, ctx) {
  const now = (ctx && ctx.now) ? new Date(ctx.now).getTime() : Date.now();
  if (!sample || typeof sample !== 'object') return { ok: false, reason: 'not_an_object' };

  const metric = String(sample.metric || '');
  if (!Object.prototype.hasOwnProperty.call(METRICS, metric)) {
    return { ok: false, reason: 'unknown_metric', metric };
  }
  const spec = METRICS[metric];

  const value = Number(sample.value);
  if (!Number.isFinite(value)) return { ok: false, reason: 'value_not_a_number', metric };
  if (value < spec.min || value > spec.max) {
    return { ok: false, reason: 'value_out_of_physical_range', metric, allowed: [spec.min, spec.max] };
  }

  const source = String(sample.source || '');
  if (!SOURCES.includes(source)) return { ok: false, reason: 'unknown_source', metric, source };

  let confidence = sample.confidence == null ? null : String(sample.confidence);
  if (confidence !== null && !CONFIDENCES.includes(confidence)) {
    return { ok: false, reason: 'unknown_confidence', metric };
  }
  // A video estimate must say how sure it is. The screen renders an estimate
  // differently from a sensor reading, and it cannot do that without this.
  if (source === 'video' && confidence === null) {
    return { ok: false, reason: 'video_requires_confidence', metric };
  }

  const t = new Date(sample.recorded_at == null ? now : sample.recorded_at);
  if (Number.isNaN(t.getTime())) return { ok: false, reason: 'recorded_at_unparseable', metric };
  if (t.getTime() > now + FUTURE_TOLERANCE_MS) {
    return { ok: false, reason: 'recorded_at_in_the_future', metric };
  }
  if (t.getTime() < now - PAST_TOLERANCE_MS) {
    return { ok: false, reason: 'recorded_at_too_old', metric };
  }

  return {
    ok: true,
    row: { metric, value, source, confidence, recorded_at: t.toISOString(), unit: spec.unit }
  };
}

/**
 * Accept a batch for ONE pet. tenant_id and pet_id come from the authenticated
 * device or session — NEVER from the body. Returns a per-sample result, because
 * every sample gets an answer: a silent drop means the device never learns which
 * of its readings vanished.
 */
async function accept({ tenant_id, pet_id, device_id, samples, now }) {
  if (!Number.isInteger(tenant_id) || !Number.isInteger(pet_id)) {
    throw new Error('ingest.accept: tenant_id and pet_id must be integers from the session');
  }
  const list = Array.isArray(samples) ? samples : [];
  const accepted = [];
  const rejected = [];

  for (let i = 0; i < list.length; i++) {
    const v = validateSample(list[i], { now });
    if (!v.ok) { rejected.push({ index: i, ...v, ok: undefined }); continue; }
    accepted.push({ index: i, ...v.row });
  }

  let stored = 0;
  let duplicates = 0;
  for (const r of accepted) {
    const key = dedupeKey(device_id, r.recorded_at, r.metric);
    const rows = await dbm.run(
      `INSERT INTO mp_readings
         (tenant_id, pet_id, device_id, metric, value, source, confidence, recorded_at, dedupe_key)
       VALUES (:tenant_id, :pet_id, :device_id, :metric, :value, :source, :confidence, :recorded_at, :dedupe_key)
       ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
       RETURNING id`,
      {
        tenant_id, pet_id,
        device_id: device_id == null ? null : device_id,
        metric: r.metric, value: r.value, source: r.source,
        confidence: r.confidence, recorded_at: r.recorded_at, dedupe_key: key
      }
    );
    if (rows && rows.length) { stored++; r.id = rows[0].id; } else { duplicates++; r.duplicate = true; }
  }

  return {
    received: list.length,
    stored,
    duplicates,
    rejected,
    accepted: accepted.map((a) => ({ index: a.index, metric: a.metric, duplicate: Boolean(a.duplicate) })),
    // The VALIDATED rows, for the alert engine. Evaluating alerts against the
    // raw request body let a value this contract had just refused as physically
    // impossible still fire an alert no stored reading supports.
    stored_rows: accepted.filter((a) => !a.duplicate)
      .map((a) => ({ metric: a.metric, value: a.value, source: a.source, confidence: a.confidence }))
  };
}

/** Fire alert rows for readings that crossed an owner-set threshold. */
async function evaluateAlerts({ tenant_id, pet_id, samples }) {
  const rules = await dbm.q(
    `SELECT id, metric, min_value, max_value FROM mp_alert_rules
      WHERE tenant_id = :tenant_id AND pet_id = :pet_id AND enabled = TRUE`,
    { tenant_id, pet_id }
  );
  if (!rules.length) return [];
  const byMetric = new Map(rules.map((r) => [r.metric, r]));
  const fired = [];
  for (const s of samples || []) {
    const rule = byMetric.get(s.metric);
    if (!rule) continue;
    let direction = null;
    if (rule.max_value != null && Number(s.value) > Number(rule.max_value)) direction = 'above';
    else if (rule.min_value != null && Number(s.value) < Number(rule.min_value)) direction = 'below';
    if (!direction) continue;
    const rows = await dbm.run(
      `INSERT INTO mp_alerts (tenant_id, pet_id, rule_id, metric, value, direction)
       VALUES (:tenant_id, :pet_id, :rule_id, :metric, :value, :direction) RETURNING id`,
      { tenant_id, pet_id, rule_id: rule.id, metric: s.metric, value: s.value, direction }
    );
    fired.push({ id: rows[0] && rows[0].id, metric: s.metric, value: s.value, direction });
  }
  return fired;
}

module.exports = {
  METRICS, SOURCES, CONFIDENCES, metricNames,
  validateSample, accept, evaluateAlerts, dedupeKey,
  classify: bands.classify
};
