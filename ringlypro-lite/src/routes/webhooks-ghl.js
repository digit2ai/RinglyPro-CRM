'use strict';

/**
 * The post-call mirror: HighLevel tells us what happened, we write it into
 * RinglyPro's own database.
 *
 * WHY A MIRROR AND NOT A LIVE CALL. GHL Voice AI exposes exactly five action
 * types — APPOINTMENT_BOOKING, CALL_TRANSFER, SMS, DATA_EXTRACTION and
 * IN_CALL_DATA_EXTRACTION (probed against the live account 2026-09-22). There
 * is NO custom/webhook action, so the agent cannot call our API mid-call and
 * cannot write a booking into our Postgres. HighLevel is therefore the system
 * of record for the instant a booking happens and we are the mirror, seconds
 * later. That is a real limitation, it is stated in CLAUDE.md, and no prompt
 * wording changes it.
 *
 * THE RULES THIS FILE ENFORCES, because a webhook that writes contacts,
 * transcripts and appointments into a customer's account is a public write:
 *
 *  - AUTHENTICATED, AND IT FAILS SHUT. A shared secret, compared in constant
 *    time. **No secret configured = 503, always**, whatever the mode: the first
 *    draft treated "not configured" as just another unauthenticated delivery
 *    and, on the shipped default, logged a warning and wrote the rows anyway —
 *    so anyone who knew a customer's number could forge calls, messages and
 *    confirmed appointments into their account. `log` now means only "a secret
 *    IS set and this delivery's was wrong", which is the narrow case it was
 *    meant for (a rollout typo), and the default is `enforce`.
 *  - THE TENANT COMES FROM THE DIALLED NUMBER, never from the body. A payload
 *    that names a tenant is a payload that can name someone else's.
 *  - REPLAY-SAFE. HighLevel retries. Every write is keyed on the call id, so a
 *    second delivery updates rather than duplicates.
 *  - IT NEVER CREATES A TENANT and never moves a number between tenants. An
 *    unknown number is recorded as unmatched and dropped, not guessed at.
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
// `Number` is deliberately aliased: the Sequelize model would shadow the
// global Number(), and `Number(duration)` then throws at runtime — a bug
// node --check cannot see and the SIT caught.
const { Tenant, Number: NumberModel, Call, Message, Appointment, Transcript } = require('../models');
const tollFraud = require('../security/tollFraud');
const smsSvc = require('../services/sms');
const { t } = require('../services/i18n');

const stats = { received: 0, accepted: 0, unauthenticated: 0, unmatched: 0, replayed: 0, throttled: 0, failed: 0, last_at: null };

function mode() {
  const m = String(process.env.LITE_GHL_WEBHOOK_MODE || 'enforce').toLowerCase();
  return ['off', 'log', 'enforce'].includes(m) ? m : 'enforce';
}
function secret() { return String(process.env.LITE_GHL_WEBHOOK_SECRET || '').trim(); }

/**
 * Header only. A secret in a query string lands in Render's logs, Cloudflare's
 * logs, every proxy in between and the Referer of any redirect.
 */
function authOk(req) {
  const want = secret();
  if (!want) return { ok: false, why: 'no_secret_configured' };
  const got = String(req.headers['x-ringlypro-signature'] || '');
  if (!got) return { ok: false, why: 'missing' };
  const a = crypto.createHash('sha256').update(want).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return { ok: crypto.timingSafeEqual(a, b), why: 'mismatch' };
}

/**
 * Per-IP ceiling. The route is reachable by anyone who knows a phone number,
 * every accepted delivery writes several rows, and there is no other limiter in
 * this service. In memory, per instance — stated rather than implied.
 */
const HITS = new Map();
function overLimit(ip) {
  const perMin = Math.max(1, parseInt(process.env.LITE_GHL_WEBHOOK_PER_MIN || '60', 10) || 60);
  const now = Date.now();
  const win = Math.floor(now / 60000);
  const k = `${ip}:${win}`;
  for (const key of HITS.keys()) if (!key.endsWith(`:${win}`)) HITS.delete(key);
  const n = (HITS.get(k) || 0) + 1;
  HITS.set(k, n);
  return n > perMin;
}

/** Pull the fields we need out of whatever shape the workflow sends. */
function read(body) {
  const b = body || {};
  const pick = (...keys) => { for (const k of keys) { const v = k.split('.').reduce((o, p) => (o == null ? o : o[p]), b); if (v != null && v !== '') return v; } return null; };
  return {
    callId: pick('call_id', 'callId', 'conversation_id', 'conversationId', 'id'),
    dialed: pick('to', 'to_number', 'toNumber', 'dialed_number', 'location_phone', 'agent_number'),
    // Validated below through the toll-fraud normaliser: this value is rendered
    // in the owner's dashboard, so it is an E.164 number or it is null. Storing
    // attacker-chosen text here put script into an href on the Calendar tab.
    caller: pick('from', 'from_number', 'fromNumber', 'caller', 'contact.phone'),
    callerName: pick('contact_name', 'contactName', 'contact.name', 'caller_name'),
    durationSec: Number(pick('duration', 'call_duration', 'durationSeconds')) || 0,
    summary: pick('summary', 'call_summary', 'callSummary'),
    transcript: pick('transcript', 'full_transcript', 'transcription'),
    outcome: pick('outcome', 'call_status', 'status'),
    apptStart: pick('appointment.startTime', 'appointment_start', 'appointmentStartTime'),
    apptEnd: pick('appointment.endTime', 'appointment_end', 'appointmentEndTime'),
    // HighLevel's own event id when the workflow sends one, so a later
    // cancellation in RinglyPro can reach the right event on their side.
    apptId: pick('appointment.id', 'appointment_id', 'appointmentId', 'calendar_event_id'),
    message: pick('message', 'note', 'message_body'),
  };
}

function normalizeOutcome(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('appoint') || s.includes('book')) return 'appointment';
  if (s.includes('transfer')) return 'transferred';
  if (s.includes('message') || s.includes('voicemail')) return 'message';
  if (s.includes('abandon') || s.includes('no-answer') || s.includes('missed')) return 'abandoned';
  return 'completed';
}

const MAX_TRANSCRIPT = Math.max(500, parseInt(process.env.LITE_GHL_MAX_TRANSCRIPT || '8000', 10) || 8000);

router.post('/ghl/call', async (req, res) => {
  stats.received++; stats.last_at = new Date().toISOString();
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown';
  if (overLimit(ip)) { stats.throttled++; return res.status(429).json({ error: 'slow_down' }); }

  const m = mode();
  const auth = authOk(req);
  // FAILS SHUT. Not configured is refused in every mode — see the file note.
  if (auth.why === 'no_secret_configured') {
    stats.unauthenticated++;
    console.error('[lite:ghl-webhook] LITE_GHL_WEBHOOK_SECRET is not set; refusing every delivery');
    return res.status(503).json({ error: 'not_configured' });
  }
  if (!auth.ok) {
    stats.unauthenticated++;
    console.warn(`[lite:ghl-webhook] unauthenticated (${auth.why}); mode=${m}`);
    if (m !== 'log') return res.status(403).json({ error: 'forbidden' });
  }

  try {
    const f = read(req.body);
    if (!f.dialed) { stats.unmatched++; return res.json({ ok: true, ignored: 'no dialled number in payload' }); }
    // The dedupe key must come from HighLevel, not from the caller. Minting one
    // from the clock let a replay-shaped flood defeat the replay guard.
    if (!f.callId) { stats.unmatched++; return res.json({ ok: true, ignored: 'no call id' }); }

    // THE TENANT IS THE OWNER OF THE NUMBER THAT WAS CALLED. Never the body.
    const chk = tollFraud.checkDestination(f.dialed, { defaultCountry: 'US' });
    const did = chk.ok ? chk.e164 : String(f.dialed);
    const num = await NumberModel.findOne({ where: { did, status: 'active' } });
    if (!num) {
      stats.unmatched++;
      console.warn(`[lite:ghl-webhook] no tenant owns ${tollFraud.mask(did)} — dropped`);
      return res.json({ ok: true, ignored: 'number not on file' });
    }
    const tenantId = num.tenant_id;

    // Replay-safe: keyed on HighLevel's own call id within this tenant.
    const sid = `ghl:${String(f.callId).slice(0, 120)}`;
    const existing = await Call.findOne({ where: { tenant_id: tenantId, call_sid: sid } });
    if (existing) { stats.replayed++; return res.json({ ok: true, replayed: true, call_id: existing.id }); }

    // A callback number is a real number or it is null — never free text.
    const callerChk = f.caller ? tollFraud.checkDestination(f.caller, { defaultCountry: 'US' }) : null;
    const caller = callerChk && callerChk.ok ? callerChk.e164 : null;

    const from = num.did;            // the tenant's own line, for the owner alert
    let wroteMessage = false;
    let wroteAppointment = null;     // the display string, when one was booked

    const call = await Call.create({
      tenant_id: tenantId,
      call_sid: sid,
      caller,
      did,
      duration: Math.max(0, Math.round(f.durationSec)),
      disposition: normalizeOutcome(f.outcome),
      transcript: f.transcript ? String(f.transcript).slice(0, MAX_TRANSCRIPT) : null,
      ended_at: new Date(),
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
        .catch((e) => console.warn('[lite:ghl-webhook] message not stored:', e.message));
    }
    if (f.apptStart) {
      const starts = new Date(f.apptStart);
      // A booking HighLevel has already told us about is not a second booking.
      // Without this the only thing stopping a duplicate row was the partial
      // unique index, and that error was swallowed by the .catch below — so a
      // re-delivery under a new call id quietly logged a warning and moved on.
      const eid = f.apptId ? String(f.apptId).slice(0, 200) : null;
      const already = eid ? await Appointment.findOne({ where: { tenant_id: tenantId, ghl_event_id: eid } }) : null;
      if (already) { /* same event, already mirrored */ }
      else if (!isNaN(starts.getTime())) {
        const ends = f.apptEnd && !isNaN(new Date(f.apptEnd).getTime())
          ? new Date(f.apptEnd) : new Date(starts.getTime() + 30 * 60000);
        // origin:'ai' IS THE ECHO GUARD. This row was born in HighLevel; the
        // outbound push (services/ghlCalendar.js) only ever sends
        // origin='ringlypro', so a booking mirrored in here can never be
        // pushed straight back as a duplicate of itself. Nothing in this file
        // calls the push — the mirror writes and stops.
        await Appointment.create({
          tenant_id: tenantId, call_id: call.id,
          caller_name: f.callerName ? String(f.callerName).slice(0, 120) : null, callback_number: caller,
          starts_at: starts, ends_at: ends, status: 'confirmed',
          origin: 'ai',
          ghl_event_id: eid,
        }).then(() => { wroteAppointment = starts.toISOString(); })
          .catch((e) => console.warn('[lite:ghl-webhook] appointment not mirrored:', e.message));
      }
    }

    // TELL THE OWNER, the way the Twilio path always has.
    //
    // A message the owner only finds by opening the dashboard is a message they
    // find tomorrow. On the ConversationRelay path `fireSms` texts them the
    // moment one is taken; the HighLevel path had NO alert at all, so the same
    // product answered the same call and said nothing. Best-effort by design:
    // an SMS failure must never fail the mirror, or HighLevel retries a
    // delivery whose rows are already written.
    //
    // The CALLER is deliberately not texted here. On this path HighLevel's own
    // workflow owns caller-facing messages, and a confirmation from both of us
    // is worse than one from neither.
    try {
      const tenant = await Tenant.findByPk(tenantId);
      if (tenant && tenant.owner_phone && from) {
        const tt = t(tenant.locale);
        if (wroteMessage) {
          await smsSvc.send({ tenant, from, to: tenant.owner_phone,
            body: tt.smsMessageOwner(tenant.business_name, f.callerName || null, caller, String(f.summary || f.message).slice(0, 300)) });
        } else if (wroteAppointment) {
          await smsSvc.send({ tenant, from, to: tenant.owner_phone,
            body: tt.smsBookingOwner(tenant.business_name, f.callerName || null, wroteAppointment) });
        }
      }
    } catch (e) { console.warn('[lite:ghl-webhook] owner alert not sent:', e.message); }

    stats.accepted++;
    return res.json({ ok: true, call_id: call.id });
  } catch (e) {
    stats.failed++;
    console.error('[lite:ghl-webhook] failed:', e.message);
    // 200 on purpose: HighLevel retries hard, and a retry storm on a bug of
    // ours helps nobody. The failure is counted and visible in /voice/health.
    return res.json({ ok: false, error: 'not_stored' });
  }
});

/**
 * Deliberately says nothing about whether a secret is set or which mode is on —
 * that was a free oracle telling an attacker in advance that forgery would
 * work. Counts only; the full picture is in /internal/security behind the key.
 */
router.get('/ghl/health', (req, res) => res.json({ ok: true, received: stats.received, last_at: stats.last_at }));

module.exports = router;
module.exports.stats = stats;
module.exports.mode = mode;
module.exports.secretConfigured = () => !!secret();
