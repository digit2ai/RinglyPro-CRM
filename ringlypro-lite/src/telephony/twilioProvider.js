'use strict';

const tollFraud = require('../security/tollFraud');

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

  async sendSMS({ from, to, body, purpose }) {
    // TOLL-FRAUD GATE. Checked here, at the provider, so no caller can reach
    // Twilio around it: owner alerts, demo confirmations, and any path added
    // later all pass through this line. A refusal throws; nothing is sent.
    // Demo confirmations (anyone on the internet can trigger one) draw on their
    // own budget, so they can never exhaust the one carrying owner alerts.
    const gate = tollFraud.authorize(purpose === 'demo' ? 'demo_sms' : 'sms', to);
    if (!gate.ok) {
      const e = new Error(`sms_refused:${gate.reason}`);
      e.code = 'TOLL_FRAUD_GUARD';
      throw e;
    }
    to = gate.e164;

    // TWILIO IS OFF ON THIS SERVICE ONCE HIGHLEVEL IS CONFIGURED (owner
    // decision 2026-09-25). Numbers and voice moved months ago; SMS silently
    // did not, so every text went out through a Twilio toll-free unrelated to
    // the client, on an account whose voice is disabled and whose token had
    // been rotated — and each failure was swallowed, so nothing said so. A
    // silent fallback is what hid it, so there is no fallback any more: this
    // refuses loudly and HighLevel is the only path. LITE_TWILIO_SMS=on
    // re-enables it deliberately.
    //
    // AFTER the toll-fraud gate, never before: a refused destination must be
    // counted by the guard whether or not the transport happens to be off.
    if (TwilioProvider.smsDisabled()) {
      const e = new Error('twilio_sms_disabled: this service sends through HighLevel. Set LITE_TWILIO_SMS=on to re-enable Twilio.');
      e.code = 'TWILIO_DISABLED'; throw e;
    }

    const c = this.client();
    // Delivery to US numbers requires an A2P-registered sender (else error 30034).
    // Default sender = Digit2AI's verified toll-free (+18886103810), which is
    // TWILIO_APPROVED and delivers to US. Override with LITE_SMS_FROM, or route
    // through an A2P Messaging Service via LITE_MESSAGING_SERVICE_SID.
    const smsFrom = process.env.LITE_SMS_FROM || TwilioProvider.DEFAULT_SMS_FROM;
    let payload;
    if (process.env.LITE_MESSAGING_SERVICE_SID) {
      payload = { messagingServiceSid: process.env.LITE_MESSAGING_SERVICE_SID, to, body };
    } else {
      payload = { from: smsFrom || from, to, body };
    }
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
    // TOLL-FRAUD GATE. transfer_to_human dials a number the tenant typed, and
    // signup is open — this is the one line that keeps a self-served premium
    // destination from becoming a call we pay for.
    const gate = tollFraud.authorize('call', number);
    if (!gate.ok) {
      const e = new Error(`transfer_refused:${gate.reason}`);
      e.code = 'TOLL_FRAUD_GUARD';
      throw e;
    }
    number = gate.e164;
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

// Digit2AI verified toll-free (TWILIO_APPROVED) — default SMS sender for US
// A2P delivery. Overridable via LITE_SMS_FROM.
TwilioProvider.DEFAULT_SMS_FROM = '+18886103810';

/**
 * Twilio SMS is disabled whenever HighLevel is configured, unless explicitly
 * turned back on. Read at call time, not at boot, so flipping the env var on
 * Render takes effect on the next request.
 */
TwilioProvider.smsDisabled = function () {
  const forced = String(process.env.LITE_TWILIO_SMS || '').trim().toLowerCase();
  if (['on', '1', 'true', 'yes'].includes(forced)) return false;
  if (['off', '0', 'false', 'no'].includes(forced)) return true;
  const ghlConfigured = !!(String(process.env.LITE_GHL_TOKEN || '').trim()
    && String(process.env.LITE_GHL_LOCATION_ID || '').trim());
  return ghlConfigured;
};

module.exports = TwilioProvider;
