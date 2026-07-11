'use strict';

const TelephonyProvider = require('./TelephonyProvider');

/**
 * Twilio implementation of TelephonyProvider (v1).
 * Uses a SEPARATE Twilio subaccount from full RinglyPro via LITE_TWILIO_*.
 * Falls back to the shared TWILIO_* creds only for local dev.
 */
class TwilioProvider extends TelephonyProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'twilio';
    // Defensively strip whitespace/quotes — pasting into a dashboard often
    // appends a trailing newline or wrapping quotes, which Twilio rejects (20003).
    const clean = (v) => (v == null ? v : String(v).trim().replace(/^["']|["']$/g, ''));
    this.accountSid = clean(process.env.LITE_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID);
    this.authToken = clean(process.env.LITE_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN);
    this.webhookBase = (process.env.LITE_WEBHOOK_BASE_URL || '').replace(/\/$/, '');
    this._client = null;
  }

  client() {
    if (!this._client) {
      if (!this.accountSid || !this.authToken) {
        throw new Error('Twilio credentials missing (LITE_TWILIO_ACCOUNT_SID / LITE_TWILIO_AUTH_TOKEN)');
      }
      this._client = require('twilio')(this.accountSid, this.authToken);
    }
    return this._client;
  }

  // Estimated monthly DID rental (documented in docs/telephony-costs.md).
  static monthlyCost(country) { return country === 'CO' ? 3.0 : 1.15; }

  async buyNumber({ country = 'US', areaCode, tenantId }) {
    const c = this.client();
    const voiceUrl = `${this.webhookBase}/voice/incoming`;
    // Find an available local number in-country.
    const searchOpts = { limit: 5 };
    if (areaCode && country === 'US') searchOpts.areaCode = areaCode;
    const available = await c.availablePhoneNumbers(country).local.list(searchOpts);
    if (!available.length) throw new Error(`No local ${country} numbers available on Twilio`);
    const pick = available[0].phoneNumber;
    const created = await c.incomingPhoneNumbers.create({
      phoneNumber: pick,
      friendlyName: `RinglyPro Lite tenant ${tenantId || '?'}`,
      voiceUrl,
      voiceMethod: 'POST',
      voiceFallbackUrl: voiceUrl,
      voiceFallbackMethod: 'POST',
      smsUrl: `${this.webhookBase}/voice/sms-fallback`,
      smsMethod: 'POST'
    });
    return {
      did: created.phoneNumber,
      providerSid: created.sid,
      provider: 'twilio',
      monthlyCostUsd: TwilioProvider.monthlyCost(country)
    };
  }

  async releaseNumber({ providerSid }) {
    const c = this.client();
    await c.incomingPhoneNumbers(providerSid).remove();
    return { released: true };
  }

  async configureInboundWebhook({ providerSid, voiceUrl }) {
    const c = this.client();
    await c.incomingPhoneNumbers(providerSid).update({
      voiceUrl: voiceUrl || `${this.webhookBase}/voice/incoming`,
      voiceMethod: 'POST'
    });
    return { ok: true };
  }

  // Normalize an inbound Twilio voice webhook (application/x-www-form-urlencoded).
  inboundWebhook(req) {
    const b = req.body || {};
    return {
      callSid: b.CallSid || b.callSid,
      from: b.From || b.from,
      to: b.To || b.to,
      raw: b
    };
  }

  async sendSMS({ from, to, body }) {
    const c = this.client();
    // Prefer an A2P-registered Messaging Service (required for US 10DLC delivery;
    // otherwise US carriers reject with error 30034). Falls back to `from`.
    const msgSvc = process.env.LITE_MESSAGING_SERVICE_SID;
    const payload = msgSvc ? { messagingServiceSid: msgSvc, to, body } : { from, to, body };
    const msg = await c.messages.create(payload);
    return { sid: msg.sid };
  }

  /**
   * TwiML that hands the call to Twilio ConversationRelay (STT + Polly TTS +
   * turn-taking). Emitted as raw XML — the twilio 4.x SDK has no builder for
   * <ConversationRelay>. No welcomeGreeting: the agent speaks the opening
   * line over the socket so it can be personalized + localized.
   */
  answerTwiml({ wssUrl, ttsProvider = 'Amazon', voice = 'Joanna-Neural', language = 'en-US', interruptible = true }) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${esc(wssUrl)}" ttsProvider="${esc(ttsProvider)}" voice="${esc(voice)}" transcriptionProvider="Google" language="${esc(language)}" interruptible="${interruptible ? 'true' : 'false'}" />
  </Connect>
</Response>`;
  }

  /**
   * Redirect a live call to a human by updating it with <Dial> TwiML.
   * Used by transfer_to_human. Note: if the owner's own phone unconditionally
   * forwards back to the Lite DID, this can loop — set a dedicated
   * transfer_number that isn't forwarded (or use no-answer forwarding).
   */
  async redirectCall({ callSid, number, message, voice, language }) {
    const c = this.client();
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Speak the hand-off line with the SAME premium Amazon Polly voice Lina uses
    // (Twilio <Say> accepts Polly voices as "Polly.<VoiceId>"), not the default
    // robotic voice.
    const sayOpen = voice
      ? `<Say voice="Polly.${esc(voice)}"${language ? ` language="${esc(language)}"` : ''}>`
      : '<Say>';
    const say = message ? `${sayOpen}${esc(message)}</Say>` : '';
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Dial timeout="25">${esc(number)}</Dial></Response>`;
    await c.calls(callSid).update({ twiml });
    return { ok: true };
  }

  // Fallback voicemail TwiML used when a tenant is suspended (failed payment).
  static voicemailTwiml(message) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${esc(message)}</Say>
  <Record maxLength="120" playBeep="true" />
</Response>`;
  }
}

module.exports = TwilioProvider;
