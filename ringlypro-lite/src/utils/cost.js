'use strict';

/**
 * Per-call unit economics. Every rate is env-configurable so pricing decisions
 * don't require a redeploy. Defaults reflect the build-up documented in
 * docs/telephony-costs.md (verify against live provider pricing before pricing
 * the product). All figures USD.
 */
function num(env, def) { const v = parseFloat(process.env[env]); return Number.isFinite(v) ? v : def; }

// Defaults reflect VERIFIED 2026 provider pricing (docs/telephony-costs.md).
// v1 path = Twilio ConversationRelay ($0.07/min, STT+TTS bundled) + inbound PSTN.
// This DELIBERATELY exceeds the $0.06 target — the COGS report surfaces that
// honestly rather than faking a pass; the unbundled path (§ cost doc) is the
// route under target. Override any rate via env for pricing scenarios.
const RATES = {
  // Voice per answered minute = ConversationRelay bundle + inbound PSTN.
  //   US:  $0.07 CR + $0.0085 inbound (US local)          = $0.0785
  //   CO:  $0.07 CR + $0.0945 inbound (CO local)          = $0.1645
  voicePerMinUS: () => num('LITE_COGS_VOICE_MIN_US', 0.0785),
  voicePerMinCO: () => num('LITE_COGS_VOICE_MIN_CO', 0.1645),
  smsSegment: () => num('LITE_COGS_SMS', 0.0083),          // Twilio US outbound SMS/segment
  smsSegmentCO: () => num('LITE_COGS_SMS_CO', 0.06),       // CO outbound SMS/segment
  // Claude Haiku 4.5 token prices (per 1M tokens): in $1.00 / out $5.00.
  llmInPerM: () => num('LITE_COGS_LLM_IN_PER_M', 1.0),
  llmOutPerM: () => num('LITE_COGS_LLM_OUT_PER_M', 5.0),
  didMonthlyUS: () => num('LITE_COGS_DID_MONTHLY_US', 1.0),
  didMonthlyCO: () => num('LITE_COGS_DID_MONTHLY_CO', 14.0),
  // Projected UNBUNDLED path (Media Streams + Deepgram Nova-3 + Polly Neural),
  // used only for the target-gap projection in the COGS report.
  unbundledVoicePerMinUS: () => num('LITE_COGS_VOICE_MIN_US_UNBUNDLED', 0.032),
  unbundledVoicePerMinCO: () => num('LITE_COGS_VOICE_MIN_CO_UNBUNDLED', 0.045)
};

const TARGET_PER_MIN = () => num('LITE_COGS_TARGET_PER_MIN', 0.06);

/**
 * @param {object} call - { duration(sec), country, llm_input_tokens, llm_output_tokens }
 * @param {number} smsSegments - number of SMS segments sent for this call
 * @returns {object} cost breakdown
 */
function callCost(call, smsSegments = 0) {
  const minutes = Math.max(0, (call.duration || 0) / 60);
  const co = (call.country || 'US') === 'CO';
  const voiceRate = co ? RATES.voicePerMinCO() : RATES.voicePerMinUS();
  const smsRate = co ? RATES.smsSegmentCO() : RATES.smsSegment();
  const voice = minutes * voiceRate;
  const sms = smsSegments * smsRate;
  const llm = ((call.llm_input_tokens || 0) / 1e6) * RATES.llmInPerM()
            + ((call.llm_output_tokens || 0) / 1e6) * RATES.llmOutPerM();
  const total = voice + sms + llm;
  return {
    minutes: +minutes.toFixed(3),
    voice: +voice.toFixed(5),
    sms: +sms.toFixed(5),
    llm: +llm.toFixed(5),
    total: +total.toFixed(5),
    perMinute: minutes > 0 ? +(total / minutes).toFixed(5) : 0
  };
}

// Same call under the projected unbundled pipeline (for the target-gap view).
function callCostUnbundled(call, smsSegments = 0) {
  const minutes = Math.max(0, (call.duration || 0) / 60);
  const co = (call.country || 'US') === 'CO';
  const voiceRate = co ? RATES.unbundledVoicePerMinCO() : RATES.unbundledVoicePerMinUS();
  const smsRate = co ? RATES.smsSegmentCO() : RATES.smsSegment();
  const llm = ((call.llm_input_tokens || 0) / 1e6) * RATES.llmInPerM()
            + ((call.llm_output_tokens || 0) / 1e6) * RATES.llmOutPerM();
  const total = minutes * voiceRate + smsSegments * smsRate + llm;
  return { total: +total.toFixed(5), perMinute: minutes > 0 ? +(total / minutes).toFixed(5) : 0 };
}

module.exports = { callCost, callCostUnbundled, RATES, TARGET_PER_MIN };
