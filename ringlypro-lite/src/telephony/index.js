'use strict';

/**
 * Telephony provider factory. Swap implementations via LITE_TELEPHONY_PROVIDER.
 * Design intent: add a TelnyxProvider for Colombia (cheaper DID/per-minute)
 * without touching any caller — they only see the TelephonyProvider contract.
 */
const TwilioProvider = require('./twilioProvider');

let _instance = null;

function getProvider() {
  if (_instance) return _instance;
  const which = (process.env.LITE_TELEPHONY_PROVIDER || 'twilio').toLowerCase();
  switch (which) {
    case 'twilio':
      _instance = new TwilioProvider();
      break;
    // case 'telnyx': _instance = new TelnyxProvider(); break;  // Phase 2 (Colombia)
    default:
      _instance = new TwilioProvider();
  }
  return _instance;
}

/**
 * Where NEW numbers come from. HighLevel (LC Phone + Voice AI) when the pilot
 * token is configured, since the account's own Twilio voice is disabled;
 * LITE_NUMBER_PROVIDER=twilio forces the old path. Deliberately separate from
 * getProvider(): calls to existing Twilio numbers and the demo lines still
 * arrive at /voice/incoming and must keep the Twilio provider.
 */
function getNumberProvider() {
  const forced = String(process.env.LITE_NUMBER_PROVIDER || '').toLowerCase();
  const GhlProvider = require('./ghlProvider');
  if (forced === 'twilio') return getProvider();
  if (forced === 'ghl' || GhlProvider.configured()) return new GhlProvider();
  return getProvider();
}

module.exports = { getProvider, getNumberProvider, TwilioProvider };
