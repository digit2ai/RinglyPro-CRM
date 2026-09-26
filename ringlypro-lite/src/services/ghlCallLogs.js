'use strict';

/**
 * PULL FINISHED CALLS FROM HIGHLEVEL, so a customer's message never depends on
 * a webhook action somebody has to remember to configure.
 *
 * The evidence this exists for: on 2026-09-26 the owner called their own line,
 * talked to the AI and left a message. Nothing appeared in RinglyPro. The
 * webhook HAD fired — one delivery — and was refused because its signature
 * header was missing, so the message existed only inside HighLevel. Before that
 * a "Test workflow" run in HighLevel produced no delivery at all while a
 * hand-signed probe to the same URL succeeded, proving our endpoint and not
 * theirs. A voicemail is the product; it cannot hang on a field in a form.
 *
 * WHAT THIS IS NOT. It is not a second opinion about what happened on a call —
 * it reads the same facts HighLevel would have posted and hands them to the
 * SAME writer (services/callMirror.js), keyed on the same call id. Run the
 * webhook and the poller together and the second one to arrive is a no-op.
 *
 * COST AND BLAST RADIUS. One request per run per sub-account (page size 50,
 * newest first). Because every tenant shares a sub-account, one run covers all
 * of them, and each log is attributed by the line that was dialled — never by
 * whose credentials fetched it.
 */
const ghl = require('../telephony/ghl');
const accounts = require('./ghlAccounts');
const mirror = require('./callMirror');
const { Tenant, Number: NumberModel } = require('../models');

const VOICE_VERSION = () => String(process.env.LITE_GHL_VOICE_VERSION || 'v3').trim();
const PAGE_SIZE = () => Math.min(100, Math.max(1, parseInt(process.env.LITE_GHL_CALLS_PAGE || '50', 10) || 50));
const LOOKBACK_MIN = () => Math.max(5, parseInt(process.env.LITE_GHL_CALLS_LOOKBACK_MIN || '180', 10) || 180);

const stats = { runs: 0, fetched: 0, stored: 0, replayed: 0, unattributed: 0,
  last_at: null, last_error: null };

function firstArray(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    if (Array.isArray(d.callLogs)) return d.callLogs;
    if (d.data && Array.isArray(d.data.callLogs)) return d.data.callLogs;
    for (const v of Object.values(d)) if (Array.isArray(v)) return v;
  }
  return [];
}

/**
 * One HighLevel call log, in the shape callMirror expects.
 *
 * `fromNumber` on an inbound log is the CALLER; the line that was dialled is
 * `toNumber` when HighLevel sends one, and otherwise is derived from the agent.
 * Both are passed through and the mirror decides — a call it cannot attribute
 * is dropped there, in one place, rather than guessed at here.
 */
function readLog(l) {
  const actions = Array.isArray(l.executedCallActions) ? l.executedCallActions : [];
  const booking = actions.find((a) => String(a.actionType || a.type || '').toUpperCase().includes('APPOINTMENT'));
  const transfer = actions.find((a) => String(a.actionType || a.type || '').toUpperCase().includes('TRANSFER'));
  const ex = (l.extractedData && typeof l.extractedData === 'object') ? l.extractedData : {};
  // An outcome is DERIVED from what HighLevel says it did, not from a guess:
  // an executed booking action is a booking, an executed transfer is a
  // transfer, a summary with no action is a message taken.
  const outcome = booking ? 'appointment'
    : transfer ? 'transferred'
      : (l.summary || l.transcript) ? 'message'
        : 'completed';
  return {
    callId: l.id || l.callId || null,
    agentId: l.agentId || null,
    dialed: l.toNumber || l.to || l.inboundNumber || null,
    caller: l.fromNumber || l.from || (l.contact && l.contact.phone) || null,
    callerName: l.contactName || (l.contact && (l.contact.name || l.contact.firstName)) || ex.name || null,
    durationSec: l.duration != null ? Number(l.duration) : 0,
    summary: l.summary || null,
    transcript: typeof l.transcript === 'string' ? l.transcript
      : (Array.isArray(l.transcript) ? l.transcript.map((x) => `${x.role || x.speaker || ''}: ${x.message || x.text || ''}`).join('\n') : null),
    outcome,
    // A booking action tells us one happened; HighLevel does not put the slot
    // in the call log, so the appointment itself arrives through the calendar
    // webhook or the calendar read. Claiming a time we were not given would be
    // a fabricated appointment in a customer's calendar.
    apptStart: null, apptEnd: null, apptId: null,
    endedAt: l.createdAt ? new Date(l.createdAt) : null,
    _direction: l.direction || null,
    _trial: !!l.trialCall,
  };
}

/** Read the recent call logs for one sub-account. Read-only; stores nothing. */
async function fetchRecent(creds, { minutes, agentId } = {}) {
  const loc = ghl.locationId(creds);
  const mins = minutes || LOOKBACK_MIN();
  const now = Date.now();
  const query = {
    locationId: loc, page: 1, pageSize: PAGE_SIZE(),
    sortBy: 'createdAt', sort: 'descend',
    startDate: Math.floor((now - mins * 60000) / 1000),
    endDate: Math.floor(now / 1000),
  };
  if (agentId) query.agentId = agentId;
  const d = await ghl.call('GET', '/voice-ai/dashboard/call-logs',
    { query, creds, version: VOICE_VERSION() });
  return firstArray(d).map(readLog);
}

/**
 * Read the window and store anything RinglyPro has not already got.
 *
 * `creds` may be any tenant's, because the sub-account is shared and every log
 * is attributed by the dialled line. Given none, the first tenant with a
 * HighLevel location is used purely as the API credential.
 */
async function importRecent({ creds, minutes, dryRun = false } = {}) {
  stats.runs++; stats.last_at = new Date().toISOString();
  let c = creds;
  if (!c) {
    const anchor = await Tenant.findOne({ where: { ghl_location_id: { [require('sequelize').Op.ne]: null } }, order: [['id', 'ASC']] });
    c = anchor ? await accounts.credsFor(anchor) : null;
  }
  if (!c || !ghl.configured(c)) { stats.last_error = 'no_credentials'; return { ok: false, error: 'no_credentials' }; }

  let logs;
  try { logs = await fetchRecent(c, { minutes }); }
  catch (e) {
    stats.last_error = String(e.message || e).slice(0, 200);
    return { ok: false, error: 'fetch_failed', status: e.status || null, detail: stats.last_error };
  }
  stats.fetched += logs.length;

  const results = [];
  for (const f of logs) {
    if (!f.callId) { stats.unattributed++; results.push({ reason: 'no_call_id' }); continue; }
    if (dryRun) {
      const num = await mirror.resolveNumber({ dialed: f.dialed, agentId: f.agentId });
      results.push({ call_id: f.callId, would_store: !!num, tenant_id: num ? num.tenant_id : null,
        outcome: f.outcome, has_summary: !!f.summary, has_transcript: !!f.transcript });
      continue;
    }
    try {
      // notifyOwner stays TRUE: a message found by a poll is still a message
      // the owner has not seen. It is guarded by the call-id idempotency, so a
      // re-poll of the same window cannot text them twice.
      const r = await mirror.storeCallResult(f, { source: 'poller' });
      if (r.stored) stats.stored++;
      else if (r.reason === 'replayed') stats.replayed++;
      else stats.unattributed++;
      results.push(Object.assign({ call_id: f.callId }, r));
    } catch (e) {
      stats.last_error = String(e.message || e).slice(0, 200);
      results.push({ call_id: f.callId, stored: false, error: stats.last_error });
    }
  }
  return { ok: true, fetched: logs.length, results };
}

/**
 * The loop. Production only unless forced, and only when HighLevel is the
 * number provider — there is nothing to poll on the Twilio path.
 */
let timer = null;
function start() {
  const flag = String(process.env.LITE_GHL_CALL_POLL || '').toLowerCase();
  if (flag === 'off') { console.log('[lite:ghl-calls] poller off by env'); return null; }
  if (flag !== 'on' && process.env.NODE_ENV !== 'production') return null;
  if (!ghl.configured()) { console.log('[lite:ghl-calls] no HighLevel credentials; poller not started'); return null; }
  const everySec = Math.max(60, parseInt(process.env.LITE_GHL_CALL_POLL_SEC || '120', 10) || 120);
  const tick = async () => {
    try {
      const r = await importRecent({});
      if (r.ok && r.results.some((x) => x.stored)) {
        console.log(`[lite:ghl-calls] stored ${r.results.filter((x) => x.stored).length} of ${r.fetched}`);
      }
    } catch (e) { console.warn('[lite:ghl-calls] tick failed:', e.message); }
  };
  timer = setInterval(tick, everySec * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 15000).unref?.();
  console.log(`[lite:ghl-calls] poller on, every ${everySec}s, ${LOOKBACK_MIN()}min window`);
  return timer;
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { fetchRecent, importRecent, readLog, start, stop, stats };
