'use strict';

/**
 * Owner/caller SMS via the telephony provider. Returns { sent, segments }.
 * Segment count feeds unit economics. No-ops safely if creds are missing.
 */
const { getProvider } = require('../telephony');

function segments(body) { return Math.max(1, Math.ceil((body || '').length / 153)); }

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

module.exports = { send, segments };
