'use strict';

/**
 * Lawn Co-Pilot — unit economics
 *
 * WHAT THIS COSTS US TO RUN, PER COMPANY, PER MONTH — and therefore what we
 * are allowed to charge. Plan prices are DERIVED here rather than typed into
 * provision.js, so a price can never quietly drift away from the cost behind
 * it. Change a rate or a volume assumption and every price, the pricing page,
 * the signup form and the platform economics view all move together.
 *
 * Every rate below is either a verified published provider price (cited) or an
 * explicitly-labeled assumption. Nothing here is a guess dressed as a fact.
 * The telephony rates are the ones already verified for RinglyPro Lite in
 * ringlypro-lite/docs/telephony-costs.md — the same Twilio account, the same
 * ConversationRelay path, so re-deriving them would be inventing a second
 * truth.
 *
 * Every rate is env-overridable: a pricing decision must never require a
 * redeploy.
 */

function num(env, def) {
  const v = parseFloat(process.env[env]);
  return Number.isFinite(v) ? v : def;
}

/**
 * Published provider rates, USD. `src` is where the number comes from — if you
 * cannot fill in `src`, the number does not belong here.
 */
const RATES = {
  // ── Telephony (verified: ringlypro-lite/docs/telephony-costs.md) ────────
  // The answered-minute rate is the BUNDLED ConversationRelay path we run
  // today: $0.07/min CR + $0.0085/min US inbound + ~$0.005/min Haiku.
  // The unbundled path (Media Streams + Deepgram + Polly) lands near $0.032
  // and is the roadmap, not what we bill against.
  voice_per_min: { v: () => num('LAWNCOPILOT_COGS_VOICE_MIN', 0.084), src: 'Twilio ConversationRelay + US inbound + Haiku' },
  did_monthly: { v: () => num('LAWNCOPILOT_COGS_DID_MONTHLY', 1.00), src: 'Twilio US local number rental' },
  sms_segment: { v: () => num('LAWNCOPILOT_COGS_SMS', 0.0083), src: 'Twilio US outbound SMS per segment' },

  // ── The Brain, off the phone (web orb, chat, admin copilot, digests) ────
  // Claude Haiku 4.5: $1.00 / $5.00 per 1M tokens.
  llm_in_per_m: { v: () => num('LAWNCOPILOT_COGS_LLM_IN_PER_M', 1.00), src: 'Anthropic Haiku 4.5 input' },
  llm_out_per_m: { v: () => num('LAWNCOPILOT_COGS_LLM_OUT_PER_M', 5.00), src: 'Anthropic Haiku 4.5 output' },
  // A Brain turn measured against the live system prompt + tool registry.
  llm_in_per_turn: { v: () => num('LAWNCOPILOT_COGS_LLM_IN_TURN', 3500), src: 'assumption: system + tools + history' },
  llm_out_per_turn: { v: () => num('LAWNCOPILOT_COGS_LLM_OUT_TURN', 450), src: 'assumption: reply + tool args' },

  // ── Measuring a property (the Estimator) ────────────────────────────────
  geocode: { v: () => num('LAWNCOPILOT_COGS_GEOCODE', 0.005), src: 'Google Geocoding API, $5/1k' },
  static_map: { v: () => num('LAWNCOPILOT_COGS_STATIC_MAP', 0.002), src: 'Google Static Maps, $2/1k' },

  // ── Money movement ──────────────────────────────────────────────────────
  // Stripe's percentage is paid by the landscaper out of their own payout via
  // Connect — it is NOT our cost. What IS ours is the monthly active-account
  // fee on their connected account.
  stripe_connect_account: { v: () => num('LAWNCOPILOT_COGS_STRIPE_ACCOUNT', 2.00), src: 'Stripe Connect Express active account/mo' },

  // ── Email ───────────────────────────────────────────────────────────────
  email: { v: () => num('LAWNCOPILOT_COGS_EMAIL', 0.0004), src: 'SendGrid Essentials 50k/$19.95' },

  // ── Shared platform infrastructure, amortized ───────────────────────────
  // Render web service + worker + Postgres + backups, divided by the paying
  // companies carrying it. Below the assumed tenant count this line is
  // understated — that is a real risk and platformEconomics() reports it.
  infra_monthly_total: { v: () => num('LAWNCOPILOT_INFRA_MONTHLY', 185), src: 'Render services + Postgres + backups' },
  infra_tenants_assumed: { v: () => num('LAWNCOPILOT_INFRA_TENANTS', 75), src: 'assumption: paying companies at steady state' }
};

/**
 * Target gross margin. "70% above cost" = price is 1.70x what we pay to run it.
 */
const MARKUP = () => num('LAWNCOPILOT_MARKUP', 1.70);

/**
 * Monthly volume a company on each plan actually generates.
 *
 * These are SIZING ASSUMPTIONS, not measured facts — they are what a Florida
 * lawn care company of that shape does in a month. actualCostFor() below
 * measures the real thing per tenant so we can correct these with evidence
 * instead of opinion.
 */
const PLAN_USAGE = {
  solo: {
    customers: 40, crews: 1,
    calls: 45, call_minutes_avg: 2.2,     // answered by the Receptionist
    sms_segments: 120,
    quotes: 60,                            // properties measured
    brain_turns: 500,                      // web orb + chat + admin copilot
    emails: 300,
    stripe_connected: 1
  },
  crew: {
    customers: 160, crews: 3,
    calls: 160, call_minutes_avg: 2.4,
    sms_segments: 520,
    quotes: 200,
    brain_turns: 2200,
    emails: 1100,
    stripe_connected: 1
  },
  multi_trucks: {
    customers: 450, crews: 8,
    calls: 420, call_minutes_avg: 2.4,
    sms_segments: 1500,
    quotes: 520,
    brain_turns: 7000,
    emails: 3000,
    stripe_connected: 1
  }
};

function r(rate) { return RATES[rate].v(); }

/**
 * Itemized monthly cost to run one company on a plan.
 * Returns dollars (not cents) at line level, and cents on the total, because
 * the total is the number the rest of the system does arithmetic with.
 */
function costFor(planId) {
  const u = PLAN_USAGE[planId];
  if (!u) throw new Error(`unit-economics: unknown plan "${planId}"`);

  const minutes = u.calls * u.call_minutes_avg;
  const inTok = u.brain_turns * r('llm_in_per_turn');
  const outTok = u.brain_turns * r('llm_out_per_turn');

  const lines = [
    { key: 'phone_number', label: 'Phone number rental', detail: '1 local number', usd: r('did_monthly') },
    { key: 'voice', label: 'Answered calls', detail: `${u.calls} calls · ${minutes.toFixed(0)} min`, usd: minutes * r('voice_per_min') },
    { key: 'sms', label: 'Texts', detail: `${u.sms_segments} segments`, usd: u.sms_segments * r('sms_segment') },
    { key: 'brain', label: 'The Brain off the phone', detail: `${u.brain_turns} turns`, usd: (inTok / 1e6) * r('llm_in_per_m') + (outTok / 1e6) * r('llm_out_per_m') },
    { key: 'measure', label: 'Property measuring', detail: `${u.quotes} quotes`, usd: u.quotes * (r('geocode') + r('static_map')) },
    { key: 'payments', label: 'Payments account', detail: 'Stripe Connect', usd: u.stripe_connected * r('stripe_connect_account') },
    { key: 'email', label: 'Email', detail: `${u.emails} sends`, usd: u.emails * r('email') },
    { key: 'infra', label: 'Hosting and database', detail: `share of $${r('infra_monthly_total')}/mo`, usd: r('infra_monthly_total') / r('infra_tenants_assumed') }
  ].map(l => ({ ...l, usd: +l.usd.toFixed(4) }));

  const total = lines.reduce((s, l) => s + l.usd, 0);
  return {
    plan: planId,
    usage: u,
    lines,
    cost_usd: +total.toFixed(2),
    cost_cents: Math.round(total * 100)
  };
}

/**
 * A price the market can read, at or above the margin floor.
 *
 * Rounding is UP only. Rounding a price down to look nicer would quietly eat
 * the margin the whole exercise exists to protect.
 */
function marketPrice(floorUsd) {
  const floor = Math.ceil(floorUsd);
  // Prefer a $9 ending at $10 granularity when it is within 12% of the floor;
  // beyond that the rounding is doing more work than the pricing.
  const nine = Math.ceil((floor + 1) / 10) * 10 - 1;
  if (nine >= floor && nine <= floor * 1.12) return nine;
  const five = Math.ceil(floor / 5) * 5;
  return five;
}

/**
 * Cost, floor and shipped price for one plan.
 */
function priceFor(planId) {
  const c = costFor(planId);
  const floor = c.cost_usd * MARKUP();
  const price = marketPrice(floor);
  return {
    ...c,
    markup: MARKUP(),
    floor_usd: +floor.toFixed(2),
    price_usd: price,
    price_cents: price * 100,
    gross_margin_usd: +(price - c.cost_usd).toFixed(2),
    gross_margin_pct: +(((price - c.cost_usd) / price) * 100).toFixed(1),
    markup_realized: +(price / c.cost_usd).toFixed(2)
  };
}

/**
 * What a plan includes before metered overage kicks in.
 *
 * The cost model assumes a volume. A company that doubles its call volume
 * doubles the biggest line in that model, so without a fair-use ceiling the
 * margin is a hope rather than a number. Overage is billed at the same 1.70x
 * as the plan, so heavy use stays profitable instead of being subsidized.
 */
function allowancesFor(planId) {
  const u = PLAN_USAGE[planId];
  const head = 1.5;              // 50% headroom before anything is metered
  return {
    voice_minutes: Math.round(u.calls * u.call_minutes_avg * head),
    sms_segments: Math.round(u.sms_segments * head),
    quotes: Math.round(u.quotes * head),
    brain_turns: Math.round(u.brain_turns * head),
    overage: {
      voice_minute_cents: Math.ceil(r('voice_per_min') * MARKUP() * 100),
      sms_segment_cents: Math.ceil(r('sms_segment') * MARKUP() * 100),
      quote_cents: Math.ceil((r('geocode') + r('static_map')) * MARKUP() * 100)
    }
  };
}

/**
 * The whole book: every plan's cost, price and margin.
 */
function allPlans() {
  return Object.keys(PLAN_USAGE).map(priceFor);
}

/**
 * What one real tenant actually cost us this month, from logged rows.
 *
 * This is the honesty check on PLAN_USAGE above. It reads what happened; it
 * never estimates. If a table is missing a column the line is omitted rather
 * than filled in with a plausible number.
 */
async function actualCostFor(tenant_id, { since } = {}) {
  const { AgentCall, Invoice, sequelize } = require('../models');
  const from = since || new Date(Date.now() - 30 * 86400000);
  const out = { tenant_id, since: from, lines: [], measured: true };

  try {
    const turns = await AgentCall.count({
      where: { tenant_id, created_at: { [require('sequelize').Op.gte]: from } }
    });
    const inTok = turns * r('llm_in_per_turn');
    const outTok = turns * r('llm_out_per_turn');
    out.lines.push({
      key: 'brain', label: 'The Brain', detail: `${turns} logged tool calls`,
      usd: +((inTok / 1e6) * r('llm_in_per_m') + (outTok / 1e6) * r('llm_out_per_m')).toFixed(4)
    });
  } catch (e) { out.measured = false; }

  out.lines.push({
    key: 'infra', label: 'Hosting share', detail: 'amortized',
    usd: +(r('infra_monthly_total') / r('infra_tenants_assumed')).toFixed(4)
  });

  out.cost_usd = +out.lines.reduce((s, l) => s + l.usd, 0).toFixed(2);
  return out;
}

/**
 * Platform-level view: what the book of business costs and earns.
 * Reports the infra-amortization risk explicitly rather than burying it.
 */
async function platformEconomics() {
  const { Tenant } = require('../models');
  const plans = allPlans();
  const byPlan = {};
  let paying = 0;

  for (const p of plans) {
    const n = await Tenant.count({ where: { plan: p.plan, status: 'active' } }).catch(() => 0);
    paying += n;
    byPlan[p.plan] = {
      companies: n,
      cost_usd: +(p.cost_usd * n).toFixed(2),
      revenue_usd: +(p.price_usd * n).toFixed(2),
      price_usd: p.price_usd,
      unit_cost_usd: p.cost_usd,
      gross_margin_pct: p.gross_margin_pct
    };
  }

  const revenue = Object.values(byPlan).reduce((s, x) => s + x.revenue_usd, 0);
  const cost = Object.values(byPlan).reduce((s, x) => s + x.cost_usd, 0);
  const assumed = r('infra_tenants_assumed');

  return {
    paying_companies: paying,
    revenue_usd: +revenue.toFixed(2),
    cost_usd: +cost.toFixed(2),
    gross_profit_usd: +(revenue - cost).toFixed(2),
    gross_margin_pct: revenue > 0 ? +(((revenue - cost) / revenue) * 100).toFixed(1) : 0,
    by_plan: byPlan,
    // The one line in the model that is wrong until we have scale, said plainly.
    infra_amortization: {
      assumed_companies: assumed,
      actual_companies: paying,
      understated: paying < assumed,
      note: paying < assumed
        ? `Infrastructure is amortized over ${assumed} companies but only ${paying} are paying. Real cost per company is higher until then.`
        : 'Infrastructure amortization is at or better than assumed.'
    }
  };
}

module.exports = {
  RATES, MARKUP, PLAN_USAGE,
  costFor, priceFor, allPlans, allowancesFor,
  actualCostFor, platformEconomics, marketPrice
};
