'use strict';

/**
 * Fraud watch — reads the Twilio account itself on a timer and raises an alarm
 * on the three signatures of the 2026-08-06 attack:
 *
 *   unknown_number   a number on the account that nobody here bought
 *                    (the attack started by buying "auto-bought +14108921440")
 *   bad_destination  an outbound call or text to a place the allow-list forbids
 *                    (it then dialled Cameroon and Tunisia)
 *   call_burst       more outbound calls in one window than a small business makes
 *                    (ten calls in forty seconds)
 *
 * WHAT IT CAN AND CANNOT DO — stated, not implied. It DETECTS. An attacker who
 * holds the account's master credentials can buy and dial without this app ever
 * being involved, and nothing inside Lite can stop that; the Twilio-side
 * controls (2FA, a rotated token, geo permissions) are what prevent it. What this
 * does is turn an 18-day silent outage into an alert within one watch interval,
 * and — with auto-lock on — stop Lite itself from placing any further outbound
 * call or text until a person looks.
 *
 * It never releases a number or changes the account on its own. The account is
 * shared with the main CRM, a number it does not recognise may be legitimate,
 * and a release cannot be undone. It reports and locks Lite's own outbound; a
 * human decides the rest.
 *
 * Runs only when NODE_ENV=production or LITE_FRAUD_WATCH=on; LITE_FRAUD_WATCH=off
 * stops it anywhere. The local .env of this repo has pointed at production
 * services before — a laptop must not start polling a live account by accident.
 */
const tollFraud = require('./tollFraud');

// Numbers legitimately on this shared account that Lite did not buy. The CRM's
// production lines and Lite's two demo lines. Override with LITE_KNOWN_NUMBERS.
const DEFAULT_KNOWN = [
  '+12232949184',  // RinglyPro CRM production (OrbUp)
  '+18886103810',  // toll-free SMS sender
  '+12396103810',  // CRM / ElevenLabs line
  '+18132120813',  // Lite demo ES
  '+17627611589',  // Lite demo EN
];

function knownNumbers() {
  const env = String(process.env.LITE_KNOWN_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return new Set(env.length ? env : DEFAULT_KNOWN);
}
function intervalMin() { return Math.max(2, parseInt(process.env.LITE_FRAUD_WATCH_MIN || '10', 10) || 10); }
// Burst = outbound calls inside any single minute. The attack was ten in forty
// seconds. Counted per minute, not per watch window, because this account is
// shared with the main CRM, whose own outbound work spread over twenty minutes
// must not read as an attack and lock Lite.
function burstThreshold() { return Math.max(2, parseInt(process.env.LITE_FRAUD_CALL_BURST || '8', 10) || 8); }
function maxPerMinute(calls) {
  const ts = calls.map((c) => new Date(c.startTime || c.dateCreated || 0).getTime()).filter((n) => n > 0).sort((a, b) => a - b);
  let best = 0, i = 0;
  for (let j = 0; j < ts.length; j++) { while (ts[j] - ts[i] > 60 * 1000) i++; best = Math.max(best, j - i + 1); }
  return best;
}
function autoLock() { return process.env.LITE_FRAUD_AUTOLOCK !== '0'; }
function enabled() {
  const f = String(process.env.LITE_FRAUD_WATCH || '').toLowerCase();
  if (f === 'off') return false;
  return f === 'on' || process.env.NODE_ENV === 'production';
}

const state = { last_run_at: null, last_error: null, runs: 0, alerts: [] };
const seen = new Set();   // in-process dedupe; deps.hasSeen/markSeen make it survive restarts

/**
 * WHAT LOCKS AND WHAT ONLY ALERTS. This Twilio account is shared with the main
 * CRM, which has its own numbers, its own outbound calls and its own senders.
 * Locking Lite over something the CRM did would take Lite down for nothing, and
 * locking Lite does not stop an attacker holding the master credentials anyway.
 * So an alert only LOCKS when the bad traffic came FROM a Lite number (a DID
 * Lite bought or a Lite demo line) — the one case where stopping Lite's own
 * outbound actually stops the bleeding. Everything account-wide is an alert.
 */
async function raise(alert, deps) {
  if (seen.has(alert.key)) return false;
  if (deps && deps.hasSeen) { try { if (await deps.hasSeen(alert.key)) { seen.add(alert.key); return false; } } catch (_) {} }
  seen.add(alert.key);
  if (deps && deps.markSeen) { try { await deps.markSeen(alert.key, alert); } catch (_) {} }
  const entry = { at: new Date().toISOString(), ...alert };
  state.alerts.unshift(entry);
  if (state.alerts.length > 50) state.alerts.length = 50;
  console.error(`[lite:security] FRAUD ALERT ${alert.type}${alert.lite ? ' (Lite traffic)' : ''}: ${alert.detail}`);
  const locks = autoLock() && alert.lite === true;
  if (locks) tollFraud.lock(`fraud_watch:${alert.type}`);
  const to = process.env.LITE_SECURITY_ALERT_PHONE;
  if (to && deps && deps.sendAlert) {
    try {
      // Goes through the same guard as every other text; the alert phone must be
      // an allowed destination. It is exempt only from the auto-lock, because an
      // alarm that the alarm itself silences is useless.
      await deps.sendAlert(to, `RinglyPro Lite security alert: ${alert.type}. ${alert.detail}. Lite outbound is ${tollFraud.lockState() ? 'LOCKED' : 'still on'}. Check Twilio now.`);
    } catch (e) { console.error('[lite:security] alert SMS failed:', e.message); }
  }
  return true;
}

/**
 * One pass. `deps.client` is a Twilio REST client (injectable for the SIT);
 * `deps.ownedDids` returns the DIDs Lite bought (from lite_numbers).
 */
async function runOnce(deps) {
  state.runs++;
  state.last_run_at = new Date().toISOString();
  const raised = [];
  try {
    const c = deps.client;
    const known = knownNumbers();
    const owned = (await deps.ownedDids()) || [];
    for (const d of owned) known.add(d);
    // Lite's own voice lines: what it bought plus the two demo lines.
    const liteLines = new Set([...owned,
      process.env.LITE_DEMO_NUMBER || '+18132120813', process.env.LITE_DEMO_NUMBER_EN || '+17627611589']);
    // Only real phone numbers are judged. client:, sip: and whatsapp: legs are
    // app/SIP/WhatsApp traffic (the CRM uses them), not a PSTN destination.
    const pstn = (to) => !String(to || '').includes(':');

    // 1. Numbers on the account that nobody here accounts for.
    const nums = await c.incomingPhoneNumbers.list({ limit: 200 });
    for (const n of nums) {
      if (known.has(n.phoneNumber)) continue;
      // Alert only: an unknown number is the attacker's footprint on the ACCOUNT,
      // and locking Lite would not stop someone holding the master credentials.
      const a = { type: 'unknown_number', key: `num:${n.sid}`, lite: false,
        // The label is attacker-controlled and the 2026-08-06 one carried the
        // full number ("auto-bought +14108921440"), so digits in it are masked too.
        detail: `number ${tollFraud.mask(n.phoneNumber)} ("${String(n.friendlyName || '').replace(/\+?\d[\d\s().-]{5,}\d/g, '***').slice(0, 40)}") is on the account and is not a known number` };
      if (await raise(a, deps)) raised.push(a);
    }

    // 2 + 3. Outbound calls in the recent window: bad destinations and bursts.
    const since = new Date(Date.now() - 2 * intervalMin() * 60 * 1000);
    const calls = await c.calls.list({ startTimeAfter: since, limit: 500 });
    const outbound = calls.filter((x) => String(x.direction || '').startsWith('outbound'));
    for (const x of outbound) {
      if (!pstn(x.to) || tollFraud.checkDestination(x.to).ok) continue;
      const a = { type: 'bad_destination', key: `call:${x.sid}`, lite: liteLines.has(x.from),
        detail: `outbound call from ${tollFraud.mask(x.from)} to a forbidden destination ${tollFraud.mask(x.to)}` };
      if (await raise(a, deps)) raised.push(a);
    }
    const peak = maxPerMinute(outbound);
    if (peak >= burstThreshold()) {
      const litePeak = maxPerMinute(outbound.filter((x) => liteLines.has(x.from)));
      const a = { type: 'call_burst', key: `burst:${since.toISOString().slice(0, 16)}`, lite: litePeak >= burstThreshold(),
        detail: `${peak} outbound calls inside one minute (threshold ${burstThreshold()} per minute)` };
      if (await raise(a, deps)) raised.push(a);
    }

    // Outbound texts to forbidden destinations (SMS pumping).
    const msgs = await c.messages.list({ dateSentAfter: since, limit: 500 });
    for (const m of msgs) {
      if (!String(m.direction || '').startsWith('outbound')) continue;
      if (!pstn(m.to) || tollFraud.checkDestination(m.to).ok) continue;
      // The toll-free sender is shared with the CRM, so an SMS alert never locks.
      const a = { type: 'bad_destination', key: `sms:${m.sid}`, lite: false,
        detail: `outbound text to a forbidden destination ${tollFraud.mask(m.to)}` };
      if (await raise(a, deps)) raised.push(a);
    }
    state.last_error = null;
  } catch (e) {
    // A watch that cannot read the account says so; it never reports "all clear".
    state.last_error = e.message;
    console.error('[lite:security] fraud watch run failed:', e.message);
  }
  return raised;
}

let timer = null;
function start(depsFactory) {
  if (timer || !enabled()) return false;
  const tick = () => { let d; try { d = depsFactory(); } catch (e) { state.last_error = e.message; return; } runOnce(d).catch(() => {}); };
  timer = setInterval(tick, intervalMin() * 60 * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 30 * 1000).unref();   // first pass shortly after boot
  return true;
}

function status() {
  return {
    enabled: enabled(), running: !!timer, interval_min: intervalMin(), auto_lock: autoLock(),
    call_burst_threshold: burstThreshold(), alert_phone_set: !!process.env.LITE_SECURITY_ALERT_PHONE,
    known_numbers: knownNumbers().size, ...state,
    healthy: state.last_error == null && state.last_run_at != null,
  };
}

function _reset() { state.alerts.length = 0; state.runs = 0; state.last_run_at = null; state.last_error = null; seen.clear(); }

module.exports = { runOnce, start, status, enabled, knownNumbers, maxPerMinute, _reset, DEFAULT_KNOWN };
