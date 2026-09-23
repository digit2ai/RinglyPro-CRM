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

module.exports = { getProvider, TwilioProvider };
