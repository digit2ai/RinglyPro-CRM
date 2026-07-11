'use strict';

/**
 * TelephonyProvider — the single abstraction all telephony flows through.
 * v1 implementation = Twilio. A Telnyx implementation can be dropped in for
 * Colombia (cheaper DID / per-minute) with zero changes to callers, as long
 * as it honors this contract.
 *
 * Contract:
 *   buyNumber({ country, areaCode, tenantId })     -> { did, providerSid, provider, monthlyCostUsd }
 *   releaseNumber({ providerSid })                 -> { released: boolean }
 *   configureInboundWebhook({ providerSid, voiceUrl }) -> { ok: boolean }
 *   inboundWebhook(req)                            -> normalized { callSid, from, to }
 *   sendSMS({ from, to, body })                    -> { sid }
 *   answerTwiml({ wssUrl, ttsProvider, voice, language, interruptible }) -> TwiML string
 */
class TelephonyProvider {
  constructor(config = {}) { this.config = config; this.name = 'base'; }
  async buyNumber() { throw new Error('buyNumber not implemented'); }
  async releaseNumber() { throw new Error('releaseNumber not implemented'); }
  async configureInboundWebhook() { throw new Error('configureInboundWebhook not implemented'); }
  inboundWebhook() { throw new Error('inboundWebhook not implemented'); }
  async sendSMS() { throw new Error('sendSMS not implemented'); }
  answerTwiml() { throw new Error('answerTwiml not implemented'); }
  // Redirect a live call to <Dial> a human number (used for transfer_to_human).
  async redirectCall() { throw new Error('redirectCall not implemented'); }
}

module.exports = TelephonyProvider;
