'use strict';

/**
 * THE ONE PLACE A FINISHED HIGHLEVEL CALL BECOMES RINGLYPRO ROWS.
 *
 * Two things now tell us a call happened — the workflow webhook
 * (routes/webhooks-ghl.js) and the call-log poller (services/ghlCallLogs.js) —
 * and they must write IDENTICALLY. A second copy of this logic would drift:
 * one path would learn to mirror an appointment and the other would not, and
 * which one ran would depend on whether a workflow action happened to be
 * configured. So both call storeCallResult() and neither writes a row itself.
 *
 * WHY A POLLER EXISTS AT ALL. The webhook is configured by hand in HighLevel
 * and cannot be verified from here: the first real call on 2026-09-26 reached
 * the endpoint and was refused because its signature header was missing, and
 * for weeks before that nothing arrived at all. A message the customer left is
 * not allowed to depend on a checkbox in someone else's dashboard. The poller
 * reads the same facts from HighLevel's own API, so the webhook becomes an
 * optimisation for latency rather than the only path.
 *
 * THE TENANT IS NEVER TAKEN FROM THE PAYLOAD. Every RinglyPro tenant shares one
 * HighLevel sub-account, so a poll made with one tenant's credentials returns
 * EVERY tenant's calls in that location. The owner of the line that was dialled
 * is the tenant, resolved here from `lite_numbers` — by the dialled number, or
 * by the Voice AI agent id that is attached to exactly one of those numbers.
 * Guessing would file one client's caller in another client's dashboard.
 */
const { Tenant, Number: NumberModel, Call, Message, Appointment } = require('../models');
const tollFraud = require('../security/tollFraud');
const smsSvc = require('./sms');
const { t } = require('./i18n');

const MAX_TRANSCRIPT = () => Math.max(500, parseInt(process.env.LITE_GHL_MAX_TRANSCRIPT || '8000', 10) || 8000);

function normalizeOutcome(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('appoint') || s.includes('book')) return 'appointment';
  if (s.includes('transfer')) return 'transferred';
  if (s.includes('message') || s.includes('voicemail')) return 'message';
  if (s.includes('abandon') || s.includes('no-answer') || s.includes('missed')) return 'abandoned';
  return 'completed';
}

/**
 * Resolve the line that was called, and therefore the tenant.
 * `dialed` wins when the source gives one; otherwise the agent id, which is
 * stored on the number row at provisioning time. Returns null rather than a
 * best guess — an unattributable call is dropped and counted, never filed.
 */
async function resolveNumber({ dialed, agentId }) {
  if (dialed) {
    const chk = tollFraud.checkDestination(dialed, { defaultCountry: 'US' });
    const did = chk.ok ? chk.e164 : String(dialed);
    const num = await NumberModel.findOne({ where: { did, status: 'active' } });
    if (num) return num;
  }
  if (agentId) {
    const num = await NumberModel.findOne({ where: { ghl_agent_id: String(agentId), status: 'active' } });
    if (num) return num;
  }
  return null;
}

/**
 * Write one finished call. Idempotent on HighLevel's own call id within the
 * tenant, so a retried webhook, a re-poll of the same window, and a webhook
 * racing the poller all converge on ONE call row.
 *
 * Returns { stored:false, reason } rather than throwing on an expected refusal,
 * because both callers must carry on with the rest of their batch.
 */
async function storeCallResult(f, { source = 'unknown', notifyOwner = true } = {}) {
  if (!f || !f.callId) return { stored: false, reason: 'no_call_id' };

  const num = await resolveNumber({ dialed: f.dialed, agentId: f.agentId });
  if (!num) {
    console.warn(`[lite:call-mirror] unattributable call from ${source}: `
      + `${f.dialed ? tollFraud.mask(f.dialed) : 'no dialled number'}`
      + `${f.agentId ? ` agent=${String(f.agentId).slice(0, 8)}…` : ''} — dropped`);
    return { stored: false, reason: 'number_not_on_file' };
  }
  const tenantId = num.tenant_id;
  const did = num.did;

  const sid = `ghl:${String(f.callId).slice(0, 120)}`;
  const existing = await Call.findOne({ where: { tenant_id: tenantId, call_sid: sid } });
  if (existing) return { stored: false, reason: 'replayed', call_id: existing.id, tenant_id: tenantId };

  // A callback number is a real number or it is null — never free text. This
  // value is rendered in the owner's dashboard; attacker-chosen text here put
  // script into an href on the Calendar tab once already.
  const callerChk = f.caller ? tollFraud.checkDestination(f.caller, { defaultCountry: 'US' }) : null;
  const caller = callerChk && callerChk.ok ? callerChk.e164 : null;

  let wroteMessage = false;
  let wroteAppointment = null;

  const call = await Call.create({
    tenant_id: tenantId,
    call_sid: sid,
    caller,
    did,
    duration: Math.max(0, Math.round(Number(f.durationSec) || 0)),
    disposition: normalizeOutcome(f.outcome),
    transcript: f.transcript ? String(f.transcript).slice(0, MAX_TRANSCRIPT()) : null,
    ended_at: f.endedAt instanceof Date && !isNaN(f.endedAt.getTime()) ? f.endedAt : new Date(),
  });

  // The transcript is stored ONCE, on the call. Writing it again per-turn
  // doubled the row cost of every delivery for no extra information.
  if (f.summary || f.message) {
    await Message.create({
      tenant_id: tenantId, call_id: call.id,
      caller_name: f.callerName ? String(f.callerName).slice(0, 120) : null,
      callback_number: caller,
      body: String(f.summary || f.message).slice(0, 4000),
    }).then(() => { wroteMessage = true; })
      .catch((e) => console.warn('[lite:call-mirror] message not stored:', e.message));
  }

  if (f.apptStart) {
    const starts = new Date(f.apptStart);
    // A booking HighLevel has already told us about is not a second booking.
    const eid = f.apptId ? String(f.apptId).slice(0, 200) : null;
    const already = eid ? await Appointment.findOne({ where: { tenant_id: tenantId, ghl_event_id: eid } }) : null;
    if (!already && !isNaN(starts.getTime())) {
      const ends = f.apptEnd && !isNaN(new Date(f.apptEnd).getTime())
        ? new Date(f.apptEnd) : new Date(starts.getTime() + 30 * 60000);
      // origin:'ai' IS THE ECHO GUARD. This row was born in HighLevel; the
      // outbound push (services/ghlCalendar.js) only ever sends
      // origin='ringlypro', so a booking mirrored in here can never be pushed
      // straight back as a duplicate of itself. Nothing here calls the push.
      await Appointment.create({
        tenant_id: tenantId, call_id: call.id,
        caller_name: f.callerName ? String(f.callerName).slice(0, 120) : null, callback_number: caller,
        starts_at: starts, ends_at: ends, status: 'confirmed',
        origin: 'ai',
        ghl_event_id: eid,
      }).then(() => { wroteAppointment = starts.toISOString(); })
        .catch((e) => console.warn('[lite:call-mirror] appointment not mirrored:', e.message));
    }
  }

  // TELL THE OWNER. A message they only find by opening the dashboard is a
  // message they find tomorrow. Best-effort by design: an SMS failure must
  // never fail the mirror, or HighLevel retries a delivery already written.
  //
  // The CALLER is deliberately not texted: on this path HighLevel's own
  // workflow owns caller-facing messages, and a confirmation from both of us is
  // worse than one from neither.
  if (notifyOwner && (wroteMessage || wroteAppointment)) {
    try {
      const tenant = await Tenant.findByPk(tenantId);
      if (tenant && tenant.owner_phone && did) {
        const tt = t(tenant.locale);
        if (wroteMessage) {
          await smsSvc.send({ tenant, from: did, to: tenant.owner_phone,
            body: tt.smsMessageOwner(tenant.business_name, f.callerName || null, caller,
              String(f.summary || f.message).slice(0, 300)) });
        } else {
          await smsSvc.send({ tenant, from: did, to: tenant.owner_phone,
            body: tt.smsBookingOwner(tenant.business_name, f.callerName || null, wroteAppointment) });
        }
      }
    } catch (e) { console.warn('[lite:call-mirror] owner alert not sent:', e.message); }
  }

  return { stored: true, call_id: call.id, tenant_id: tenantId,
    message: wroteMessage, appointment: wroteAppointment };
}

module.exports = { storeCallResult, resolveNumber, normalizeOutcome };
