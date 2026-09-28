'use strict';

/**
 * Owner/caller SMS via the telephony provider. Returns { sent, segments }.
 * Segment count feeds unit economics. No-ops safely if creds are missing.
 */
const { getProvider } = require('../telephony');
const { t } = require('./i18n');

function segments(body) { return Math.max(1, Math.ceil((body || '').length / 153)); }

/**
 * Demo confirmation — texts the person who called/chatted the demo so they
 * experience a real SMS (booking confirmation or "message received"). Sent from
 * the verified toll-free (LITE_SMS_FROM). Returns { sent, segments }.
 */
async function sendDemoConfirm(ctx, ev) {
  const to = (ev.data && ev.data.callback_number) || ctx.from;
  if (!to) return { sent: false, segments: 0, reason: 'no_number' };
  const tt = t(ctx.locale);
  let body;
  if (ev.type === 'appointment') {
    body = tt.smsBookingCaller(ctx.businessName, ev.data.display || ev.data.starts_at);
  } else if (ev.type === 'message') {
    body = ctx.locale === 'es'
      ? `${ctx.businessName} (demo): recibimos su mensaje. Así se le avisaría a su negocio al instante — y su cliente recibe esta confirmación.`
      : `${ctx.businessName} (demo): we got your message. This is how your business is alerted instantly — and your caller gets this confirmation.`;
  } else { return { sent: false, segments: 0 }; }

  // THE DEMO TEXT GOES OUT ON THE DEMO LINE, THROUGH THE SAME PROVIDER AS
  // EVERYTHING ELSE. This was the ONE caller that passed no tenant, so it fell
  // to the legacy carrier — the last routine path still depending on it, and
  // the reason a stale credential there was still worth reporting at all. The
  // demo tenant owns the number the landing page prints, so passing it sends
  // from that line: same toll-fraud gate, same separate `demo` budget, one
  // fewer account to keep alive.
  let tenant = null;
  if (ctx && ctx.tenantId) {
    try { tenant = await require('../models').Tenant.findByPk(ctx.tenantId); } catch (_) { tenant = null; }
  }
  return send({ from: ctx.to, to, body, purpose: 'demo', tenant });
}

/**
 * A TENANT ON HIGHLEVEL IS TEXTED FROM THEIR OWN HIGHLEVEL NUMBER.
 *
 * Numbers and voice moved to HighLevel; SMS did not, so every text went out
 * through Twilio from a toll-free unrelated to the client — on the account
 * whose voice is disabled and whose token had since been rotated, which is why
 * no alert had been delivered at all and nothing said so. Pass the tenant and
 * the text goes out on their own line; without one, nothing changes and Twilio
 * still carries it (the demo lines and every pre-HighLevel number).
 */
async function providerFor(tenant) {
  if (!tenant) return { p: getProvider(), via: 'twilio' };
  try {
    const accounts = require('./ghlAccounts');
    const creds = await accounts.credsFor(tenant);
    if (creds && creds.token && creds.locationId) {
      const GhlProvider = require('../telephony/ghlProvider');
      return { p: new GhlProvider({ creds }), via: 'ghl' };
    }
  } catch (e) { console.warn('[lite:sms] could not resolve HighLevel creds, using the default provider:', e.message); }
  return { p: getProvider(), via: 'twilio' };
}

async function send({ from, to, body, purpose, tenant }) {
  if (!to || !from) return { sent: false, segments: 0, reason: 'missing_from_or_to' };
  const { p, via } = await providerFor(tenant);
  try {
    await p.sendSMS({ from, to, body, purpose });
    return { sent: true, segments: segments(body), via };
  } catch (e) {
    console.error(`[lite:sms] send failed via ${via}:`, e.message);
    return { sent: false, segments: 0, reason: e.message, via };
  }
}

module.exports = { send, segments, sendDemoConfirm };
