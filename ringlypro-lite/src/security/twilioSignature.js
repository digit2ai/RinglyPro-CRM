'use strict';

/**
 * Twilio webhook signature check (X-Twilio-Signature).
 *
 * /voice/incoming, /voice/status and /voice/sms-fallback are public URLs. Without
 * this, anyone can POST a forged "incoming call" and make Lite open an AI session,
 * write call rows and spend model tokens on a call that never happened.
 *
 * Mode, via LITE_TWILIO_SIGNATURE:
 *   enforce — a bad or missing signature gets 403 and nothing runs.
 *   log     — (DEFAULT) every request is checked and counted, bad ones are logged,
 *             but the request still runs.
 *   off     — not checked.
 *
 * WHY THE DEFAULT IS `log`, NOT `enforce`. Twilio signs the exact URL it called.
 * If LITE_WEBHOOK_BASE_URL differs from the URL configured on the number by one
 * character (http vs https, a trailing slash, another host), every real call
 * fails the check. Under `enforce` that silently drops every caller. So the check
 * ships counting, /voice/health shows valid vs invalid, and once a real call
 * shows as valid the owner sets LITE_TWILIO_SIGNATURE=enforce.
 */
const twilio = require('twilio');

const counts = { valid: 0, invalid: 0, missing: 0, unchecked: 0, last_invalid_at: null };

function mode() {
  const m = String(process.env.LITE_TWILIO_SIGNATURE || 'log').toLowerCase();
  return ['enforce', 'log', 'off'].includes(m) ? m : 'log';
}

function token() {
  return String(process.env.LITE_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '').trim();
}

/** The URL Twilio signed: the configured public base + the path it called. */
function signedUrl(req) {
  const base = (process.env.LITE_WEBHOOK_BASE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
  return base + req.originalUrl;
}

/** Pure check, exported for the SIT. */
function isValid({ authToken, signature, url, params }) {
  if (!authToken || !signature) return false;
  try { return twilio.validateRequest(authToken, signature, url, params || {}); }
  catch (_) { return false; }
}

function middleware(req, res, next) {
  const m = mode();
  if (m === 'off') { counts.unchecked++; return next(); }
  const sig = req.headers['x-twilio-signature'];
  const params = req.method === 'POST' ? (req.body || {}) : {};
  let ok = false;
  if (!sig) counts.missing++;
  else if (isValid({ authToken: token(), signature: sig, url: signedUrl(req), params })) { ok = true; counts.valid++; }
  else counts.invalid++;

  if (!ok) {
    counts.last_invalid_at = new Date().toISOString();
    console.warn(`[lite:security] Twilio signature ${sig ? 'invalid' : 'missing'} on ${req.method} ${req.path} (mode=${m})`);
    if (m === 'enforce') return res.status(403).type('text/plain').send('Forbidden');
  }
  next();
}

/**
 * The ConversationRelay WebSocket (/voice-relay/ws) is the other public door.
 * Twilio signs the upgrade request against the wss:// URL it opened. Checked
 * under the same mode switch: `enforce` refuses the upgrade, `log` counts it.
 * Returns true when the upgrade may proceed.
 */
const wsCounts = { valid: 0, invalid: 0, missing: 0 };
function allowUpgrade(req) {
  const m = mode();
  if (m === 'off') return true;
  const sig = req.headers['x-twilio-signature'];
  const base = (process.env.LITE_WEBHOOK_BASE_URL || `https://${req.headers.host}`).replace(/\/$/, '').replace(/^http/, 'ws');
  let ok = false;
  if (!sig) wsCounts.missing++;
  else if (isValid({ authToken: token(), signature: sig, url: base + req.url, params: {} })) { ok = true; wsCounts.valid++; }
  else wsCounts.invalid++;
  if (!ok) console.warn(`[lite:security] relay WebSocket signature ${sig ? 'invalid' : 'missing'} (mode=${m})`);
  return ok || m !== 'enforce';
}

function status() { return { mode: mode(), ...counts, websocket: { ...wsCounts } }; }

module.exports = { middleware, allowUpgrade, isValid, status, signedUrl };
