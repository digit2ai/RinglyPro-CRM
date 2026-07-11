'use strict';

/**
 * Telephony webhook surface for Lite.
 *  POST /voice/incoming  — Twilio Voice webhook → returns ConversationRelay TwiML
 *                          (or fallback voicemail if the tenant is suspended).
 *  POST /voice/status    — call status callback (records duration on completion).
 *  GET  /voice/health    — config check.
 *  GET  /voice/transcripts/:callSid — turn-by-turn (auth-gated).
 */
const express = require('express');
const router = express.Router();
const { getProvider, TwilioProvider } = require('../telephony');
const { getBusinessInfo } = require('../services/booking');
const { t, relayLang } = require('../services/i18n');
const { Call } = require('../models');

function wssUrl(req) {
  const base = (process.env.LITE_WEBHOOK_BASE_URL || `https://${req.headers.host}`).replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `wss://${base}/voice-relay/ws`;
}

async function incoming(req, res) {
  const provider = getProvider();
  const { callSid, from, to } = provider.inboundWebhook ? provider.inboundWebhook(req) : {};
  const dialed = to || req.query.to;
  let info = { success: false };
  try { info = await getBusinessInfo({ did: dialed }); } catch (_) {}

  res.set('Content-Type', 'text/xml');

  // Unknown DID → generic voicemail.
  if (!info.success) {
    return res.send(TwilioProvider.voicemailTwiml('Thank you for calling. Please leave a message after the beep.'));
  }

  // Suspended tenant (failed payment) → fallback voicemail, keep the DID.
  if (info.suspended) {
    return res.send(TwilioProvider.voicemailTwiml(t(info.locale).voicemail(info.business_name)));
  }

  // Create the call row up front so the WS session can attach to it.
  try {
    await Call.create({
      tenant_id: info.tenant_id, call_sid: callSid, caller: from, did: dialed,
      language: info.locale, disposition: 'in_progress'
    });
  } catch (e) { console.error('[lite:voice] call row error:', e.message); }

  const voice = info.locale === 'es'
    ? (process.env.LITE_POLLY_VOICE_ES || 'Lupe-Neural')
    : (process.env.LITE_POLLY_VOICE_EN || 'Joanna-Neural');

  const twiml = provider.answerTwiml({
    wssUrl: wssUrl(req),
    ttsProvider: 'Amazon',
    voice,
    language: relayLang(info.locale, info.country),
    interruptible: true
  });
  res.send(twiml);
}

router.post('/incoming', incoming);
router.get('/incoming', incoming);

// SMS fallback endpoint (Lite does not process inbound SMS in v1).
router.post('/sms-fallback', (req, res) => { res.set('Content-Type', 'text/xml').send('<Response/>'); });

// Twilio status callback — finalize duration/disposition.
router.post('/status', async (req, res) => {
  try {
    const b = req.body || {};
    const sid = b.CallSid;
    const duration = parseInt(b.CallDuration || '0', 10);
    if (sid) {
      const call = await Call.findOne({ where: { call_sid: sid } });
      if (call) {
        call.duration = duration || call.duration;
        call.ended_at = new Date();
        if (call.disposition === 'in_progress') call.disposition = 'abandoned';
        if (b.RecordingUrl) call.recording_url = b.RecordingUrl;
        await call.save();
      }
    }
  } catch (e) { console.error('[lite:voice] status error:', e.message); }
  res.sendStatus(204);
});

router.get('/health', async (req, res) => {
  const out = {
    service: 'ringlypro-lite-voice',
    model: process.env.LITE_VOICE_MODEL || 'claude-haiku-4-5-20251001',
    tts: 'Amazon Polly (ConversationRelay)',
    provider: (process.env.LITE_TELEPHONY_PROVIDER || 'twilio'),
    wss: wssUrl(req),
    incoming_webhook: `${(process.env.LITE_WEBHOOK_BASE_URL || 'https://<host>')}/voice/incoming`,
    anthropic_key_set: !!(process.env.LITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY),
    sms_from: process.env.LITE_SMS_FROM || require('../telephony').TwilioProvider.DEFAULT_SMS_FROM + ' (default toll-free)',
    sms_messaging_service: process.env.LITE_MESSAGING_SERVICE_SID || '(unset)',
    twilio_sid_prefix: (process.env.LITE_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || '').slice(0, 2) || 'unset',
    twilio_token_set: !!(process.env.LITE_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN),
    // lengths only (no secrets): correct SID = 34 chars, Auth Token = 32 chars.
    twilio_sid_len_raw: (process.env.LITE_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || '').length,
    twilio_sid_len_trim: (process.env.LITE_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || '').trim().length,
    twilio_token_len_raw: (process.env.LITE_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '').length,
    twilio_token_len_trim: (process.env.LITE_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '').trim().length,
    ok: true
  };
  // ?check=twilio actively verifies credentials by making the same class of API
  // call number-provisioning uses. Reveals no secrets, only auth pass/fail.
  if (req.query.check === 'twilio') {
    try {
      const { getProvider } = require('../telephony');
      const client = getProvider().client();
      const nums = await client.availablePhoneNumbers('US').local.list({ limit: 1 });
      out.twilio_auth = 'ok';
      out.twilio_sample_available = nums.length;
    } catch (e) {
      out.twilio_auth = 'fail';
      out.twilio_error = e.message;
      out.twilio_code = e.code || null;
      out.twilio_status = e.status || null;
    }
  }
  res.json(out);
});

module.exports = router;
