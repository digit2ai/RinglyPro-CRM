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
  return send({ from: ctx.to, to, body });   // from is overridden by LITE_SMS_FROM
}

async function send({ from, to, body }) {
  if (!to || !from) return { sent: false, segments: 0, reason: 'missing_from_or_to' };
  try {
    const provider = getProvider();
    await provider.sendSMS({ from, to, body });
    return { sent: true, segments: segments(body) };
  } catch (e) {
    console.error('[lite:sms] send failed:', e.message);
    return { sent: false, segments: 0, reason: e.message };
  }
}

module.exports = { send, segments, sendDemoConfirm };
