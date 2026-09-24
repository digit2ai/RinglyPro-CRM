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


/* ── The GoHighLevel path ──────────────────────────────────────────────────
 * Verified 2026-09-24 (gohighlevel.com/pricing + the Voice AI pricing pages).
 *
 * THE SHAPE OF THE COST INVERTS ON THIS PATH, and that is the whole point.
 * Twilio's cost is almost entirely VARIABLE (per minute). HighLevel's is mostly
 * FIXED and MONTHLY — an agency plan plus, optionally, AI Employee Unlimited —
 * with a small per-minute LC Phone charge on top. So a per-minute comparison
 * flatters whichever path you already prefer, and the number that decides the
 * business is the BREAK-EVEN CLIENT COUNT, not $/min. `platformEconomics()`
 * computes it and refuses to average the fixed stack away.
 *
 * ON PAY-PER-USE GHL IS DEARER THAN WHAT WE RUN TODAY (~$0.13/min against
 * ~$0.084). The case for it rests on the flat plan and on the fact that our own
 * Twilio voice is disabled — not on a per-minute saving, and the report must
 * never present one.
 */
const GHL = {
  // Pay-per-use Voice AI, all-in via LC Phone.
  voicePerMin: () => num('LITE_COGS_GHL_VOICE_MIN', 0.13),
  // LC Phone telephony only, used when AI Employee Unlimited covers the agent.
  telephonyPerMin: () => num('LITE_COGS_GHL_TELEPHONY_MIN', 0.012),
  didMonthly: () => num('LITE_COGS_GHL_DID_MONTHLY', 1.15),
  // Fixed monthly stack. agencyPlan: 97 Starter | 297 Unlimited | 497 Agency Pro.
  agencyPlanMonthly: () => num('LITE_COGS_GHL_PLAN_MONTHLY', 97),
  // AI Employee Unlimited, per enabled location. 0 = pay-per-use instead.
  aiEmployeeMonthly: () => num('LITE_COGS_GHL_AI_EMPLOYEE_MONTHLY', 0),
  // Our own hosting etc., shared across tenants.
  infraMonthly: () => num('LITE_COGS_INFRA_MONTHLY', 25),
};

/** Per-answered-minute cost on the HighLevel path, for one call. */
function callCostGhl(call, smsSegments = 0) {
  const minutes = Math.max(0, (call.duration || 0) / 60);
  // With AI Employee Unlimited the agent minute is already paid for monthly, so
  // only LC Phone telephony is variable. Without it, the full pay-per-use rate.
  const perMin = GHL.aiEmployeeMonthly() > 0 ? GHL.telephonyPerMin() : GHL.voicePerMin();
  const voice = minutes * perMin;
  const sms = smsSegments * RATES.smsSegment();
  const total = voice + sms;
  return {
    minutes: +minutes.toFixed(3),
    voice: +voice.toFixed(5),
    sms: +sms.toFixed(5),
    total: +total.toFixed(5),
    perMinute: minutes > 0 ? +(total / minutes).toFixed(5) : 0,
    basis: GHL.aiEmployeeMonthly() > 0
      ? 'AI Employee Unlimited: agent minutes are in the monthly fee, only LC Phone telephony is metered'
      : 'pay-per-use Voice AI via LC Phone',
  };
}

/**
 * Whether the business works, at a given number of paying clients.
 *
 * THE FIXED STACK IS NOT DIVIDED BY AN OPTIMISTIC TENANT COUNT. It is reported
 * at the count actually given, and the break-even is computed rather than
 * asserted — a shared cost divided by a hoped-for number of clients is the
 * classic way a margin table lies.
 *
 * @param {object} o
 * @param {number} o.clients        paying clients today
 * @param {number} o.priceCents     what each pays per month
 * @param {number} o.minutesEach    answered minutes per client per month
 */
function platformEconomics({ clients = 1, priceCents = 2600, minutesEach = 150 } = {}) {
  const fixed = GHL.agencyPlanMonthly() + GHL.aiEmployeeMonthly() + GHL.infraMonthly();
  const perMin = GHL.aiEmployeeMonthly() > 0 ? GHL.telephonyPerMin() : GHL.voicePerMin();
  const variablePerClient = (minutesEach * perMin) + GHL.didMonthly();
  const price = priceCents / 100;

  const marginPerClient = price - variablePerClient;   // before the fixed stack
  const breakEven = marginPerClient > 0 ? Math.ceil(fixed / marginPerClient) : null;

  const at = (n) => {
    const revenue = n * price;
    const cost = fixed + n * variablePerClient;
    return {
      clients: n,
      revenue_usd: +revenue.toFixed(2),
      cost_usd: +cost.toFixed(2),
      profit_usd: +(revenue - cost).toFixed(2),
      fixed_per_client_usd: +(fixed / n).toFixed(2),
      gross_margin_pct: revenue > 0 ? +(((revenue - cost) / revenue) * 100).toFixed(1) : null,
    };
  };

  return {
    fixed_monthly_usd: +fixed.toFixed(2),
    fixed_breakdown: {
      ghl_agency_plan: GHL.agencyPlanMonthly(),
      ghl_ai_employee: GHL.aiEmployeeMonthly(),
      infra: GHL.infraMonthly(),
    },
    variable_per_client_usd: +variablePerClient.toFixed(2),
    price_per_client_usd: price,
    per_minute_usd: perMin,
    break_even_clients: breakEven,
    // Stated, not implied: one pilot client cannot carry a $97+ stack.
    honest_note: breakEven && clients < breakEven
      ? `At ${clients} client(s) this LOSES money. The fixed stack needs ${breakEven} paying clients to break even at $${price}/mo.`
      : 'Above break-even at the given client count.',
    scenarios: [1, 3, 5, 10, 25].map(at),
    today: at(Math.max(1, clients)),
  };
}

module.exports = { callCost, callCostUnbundled, callCostGhl, platformEconomics, RATES, GHL, TARGET_PER_MIN };
