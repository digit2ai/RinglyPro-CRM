'use strict';

/**
 * Lawn Co-Pilot — pricing engine (the Estimator's arithmetic)
 *
 * Deterministic and rule-driven. NO LLM in the pricing path, ever. The orb, the
 * phone Receptionist, the web wizard, and the admin all call this one function
 * and therefore always agree to the cent.
 *
 * price = max(sqft * rate, minimum)
 *         -> tier adjustment -> frequency modifier -> surcharges
 *         -> addons -> discounts -> tax
 */

const { PricingRule, ServicePlan, AddonService } = require('../models');

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'one_time'];

// ── Florida defaults. Seeded into lc_pricing_rules on boot and editable by the
//    admin — these constants exist only so a fresh tenant is never priceless.
const FL_DEFAULTS = {
  // USD per serviceable sqft, per visit. Chosen so a TYPICAL Florida lawn prices
  // ABOVE the minimum, so area actually drives the number. At the old 0.0042 the
  // break-even against a $45 minimum was ~10,700 sqft — above nearly every
  // residential lawn — so the minimum floored almost everything to one price and
  // two different-sized yards looked identical. At 0.0065 the break-even against
  // a $40 minimum is ~6,150 sqft, so normal lawns differentiate by size.
  rate_per_sqft: 0.0065,
  minimum_cents: 4000,
  tiers: [
    { max_sqft: 5000, multiplier: 1.0 },
    { max_sqft: 10000, multiplier: 0.95 },
    { max_sqft: 20000, multiplier: 0.88 },
    { max_sqft: 43560, multiplier: 0.82 },
    { max_sqft: Infinity, multiplier: 0.75 }
  ],
  frequency: {
    weekly: { multiplier: 1.0, recurring_discount: 0.10 },
    biweekly: { multiplier: 1.15, recurring_discount: 0.05 },
    monthly: { multiplier: 1.35, recurring_discount: 0.0 },
    one_time: { multiplier: 1.6, recurring_discount: 0.0 }
  },
  surcharges: {
    access_difficulty: 0.10,
    overgrown: 0.25,
    corner_lot: 0.05,
    gated: 0.03,
    steep_slope: 0.08
  },
  tax_rate: 0.0                   // FL: lawn maintenance for residential is
                                  // generally not taxed; admin-configurable.
};

function money(cents) { return Math.round(cents); }

// ── Rule resolution ────────────────────────────────────────────────────────
// Most specific matching scope wins; ties broken by priority, then recency.
function scopeSpecificity(scope) {
  if (!scope) return 0;
  let n = 0;
  ['state', 'county', 'city', 'zip', 'property_type', 'frequency'].forEach(k => { if (scope[k]) n++; });
  if (scope.zip) n += 2;      // zip is the sharpest signal
  if (scope.city) n += 1;
  return n;
}

function scopeMatches(scope, ctx) {
  if (!scope) return true;
  const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  if (scope.state && !eq(scope.state, ctx.state)) return false;
  if (scope.county && !eq(scope.county, ctx.county)) return false;
  if (scope.city && !eq(scope.city, ctx.city)) return false;
  if (scope.zip && String(scope.zip) !== String(ctx.zip || '')) return false;
  if (scope.property_type && !eq(scope.property_type, ctx.property_type)) return false;
  if (scope.frequency && !eq(scope.frequency, ctx.frequency)) return false;
  return true;
}

function pickRule(rules, type, ctx) {
  const now = new Date();
  const candidates = rules
    .filter(r => r.rule_type === type && r.active !== false)
    .filter(r => !r.active_from || new Date(r.active_from) <= now)
    .filter(r => !r.active_to || new Date(r.active_to) >= now)
    .filter(r => scopeMatches(r.scope, ctx))
    .sort((a, b) => {
      const s = scopeSpecificity(b.scope) - scopeSpecificity(a.scope);
      if (s !== 0) return s;
      const p = (b.priority || 0) - (a.priority || 0);
      if (p !== 0) return p;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  return candidates[0] || null;
}

async function loadRules(tenant_id) {
  try {
    return await PricingRule.findAll({ where: { tenant_id, active: true }, raw: true });
  } catch (e) {
    return [];
  }
}

/**
 * Price ONE frequency. Returns a full line-itemized breakdown whose items sum
 * exactly to the total — verified in SIT.
 */
function priceOne({ sqft, frequency, rules, ctx, flags = {}, addons = [], promo = null }) {
  const lines = [];
  const fctx = { ...ctx, frequency };

  const rateRule = pickRule(rules, 'rate', fctx);
  const rate = rateRule ? Number(rateRule.params.rate_per_sqft) : FL_DEFAULTS.rate_per_sqft;
  const rateSource = rateRule ? (rateRule.name || 'regional rule') : 'Florida default';

  let cents = money(sqft * rate * 100);
  lines.push({
    kind: 'base', label: 'Lawn service',
    detail: `${sqft.toLocaleString()} sq ft at $${rate.toFixed(4)}/sq ft (${rateSource})`,
    amount_cents: cents, sort_order: 10
  });

  // Minimum charge.
  const minRule = pickRule(rules, 'minimum', fctx);
  const minimum = minRule ? Number(minRule.params.minimum_cents)
    : (Number(process.env.LAWNCOPILOT_MIN_CHARGE_USD || 40) * 100);
  let minimumApplied = false;
  if (cents < minimum) {
    lines.push({
      kind: 'minimum', label: 'Minimum service charge applied',
      detail: `This lawn measures below the $${(minimum / 100).toFixed(2)} minimum, so the minimum applies`,
      amount_cents: minimum - cents, sort_order: 20
    });
    cents = minimum;
    minimumApplied = true;
  }

  // Size tier.
  const tierRule = pickRule(rules, 'tier', fctx);
  const tiers = tierRule ? tierRule.params.tiers : FL_DEFAULTS.tiers;
  const tier = (tiers || []).find(t => sqft <= (t.max_sqft === null ? Infinity : t.max_sqft));
  if (tier && tier.multiplier && tier.multiplier !== 1) {
    const delta = money(cents * tier.multiplier) - cents;
    lines.push({
      kind: 'tier', label: delta < 0 ? 'Large-property discount' : 'Property-size adjustment',
      detail: `Size tier multiplier ${tier.multiplier}`,
      amount_cents: delta, sort_order: 30
    });
    cents += delta;
  }

  // Frequency.
  const freqRule = pickRule(rules, 'frequency', fctx);
  const freqCfg = freqRule ? freqRule.params : FL_DEFAULTS.frequency[frequency];
  const freqMult = (freqCfg && freqCfg.multiplier) || 1;
  if (freqMult !== 1) {
    const delta = money(cents * freqMult) - cents;
    lines.push({
      kind: 'frequency', label: `${labelFrequency(frequency)} pricing`,
      detail: `Frequency multiplier ${freqMult}`,
      amount_cents: delta, sort_order: 40
    });
    cents += delta;
  }

  // Surcharges.
  const surRule = pickRule(rules, 'surcharge', fctx);
  const surCfg = surRule ? surRule.params : FL_DEFAULTS.surcharges;
  let sort = 50;
  Object.keys(flags || {}).forEach(f => {
    if (!flags[f]) return;
    const pct = surCfg[f];
    if (!pct) return;
    const delta = money(cents * pct);
    lines.push({
      kind: 'surcharge', label: labelSurcharge(f),
      detail: `+${Math.round(pct * 100)}%`,
      amount_cents: delta, sort_order: sort++
    });
    cents += delta;
  });

  // Add-ons.
  (addons || []).forEach(a => {
    const amt = a.price_per_sqft ? money(sqft * a.price_per_sqft * 100) : money(a.price_cents || 0);
    if (!amt) return;
    lines.push({
      kind: 'addon', label: a.name || 'Additional service',
      detail: a.price_per_sqft ? `${sqft.toLocaleString()} sq ft at $${a.price_per_sqft}/sq ft` : 'Flat rate',
      amount_cents: amt, sort_order: 60
    });
    cents += amt;
  });

  // Recurring discount.
  const recurring = (freqCfg && freqCfg.recurring_discount) || 0;
  if (recurring > 0) {
    const delta = -money(cents * recurring);
    lines.push({
      kind: 'discount', label: 'Recurring service discount',
      detail: `-${Math.round(recurring * 100)}% for staying on schedule`,
      amount_cents: delta, sort_order: 70
    });
    cents += delta;
  }

  // Promo.
  if (promo && promo.percent) {
    const delta = -money(cents * promo.percent);
    lines.push({
      kind: 'discount', label: `Promotion: ${promo.code || 'discount'}`,
      detail: `-${Math.round(promo.percent * 100)}%`,
      amount_cents: delta, sort_order: 80
    });
    cents += delta;
  }

  const subtotal = cents;

  // Tax.
  const taxRule = pickRule(rules, 'tax', fctx);
  const taxRate = taxRule ? Number(taxRule.params.tax_rate) : FL_DEFAULTS.tax_rate;
  const tax = money(subtotal * taxRate);
  if (tax > 0) {
    lines.push({
      kind: 'tax', label: 'Tax',
      detail: `${(taxRate * 100).toFixed(2)}%`,
      amount_cents: tax, sort_order: 90
    });
  }

  const total = subtotal + tax;

  // Invariant: the line items must reconcile to the total, exactly.
  const sum = lines.reduce((a, l) => a + l.amount_cents, 0);
  if (sum !== total) {
    lines.push({
      kind: 'rounding', label: 'Rounding', detail: '',
      amount_cents: total - sum, sort_order: 95
    });
  }

  return {
    frequency,
    serviceable_sqft: sqft,
    rate_per_sqft: rate,
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: total,
    price_display: `$${(total / 100).toFixed(2)}`,
    per_visit: frequency !== 'one_time',
    // True when the lawn measured below the minimum, so the price is the floor,
    // not the area. Surfaces can flag "priced at our minimum" so two small
    // lawns priced the same don't look like a measurement error.
    minimum_applied: minimumApplied,
    line_items: lines.sort((a, b) => a.sort_order - b.sort_order)
  };
}

function labelFrequency(f) {
  return ({ weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly', one_time: 'One-time' })[f] || f;
}
function labelSurcharge(f) {
  return ({
    access_difficulty: 'Difficult access',
    overgrown: 'Overgrown lawn (first visit)',
    corner_lot: 'Corner lot',
    gated: 'Gated property',
    steep_slope: 'Slope'
  })[f] || f;
}

/**
 * Price EVERY frequency for a property. This is what the orb reads back and
 * what the quote page renders.
 */
async function priceProperty({ tenant_id, serviceable_sqft, city, county, state, zip, property_type, flags, addons, promo }) {
  const rules = await loadRules(tenant_id);
  const ctx = { state: state || 'FL', county, city, zip, property_type: property_type || 'residential' };
  const sqft = Math.max(0, Math.round(serviceable_sqft || 0));

  const options = {};
  FREQUENCIES.forEach(f => {
    options[f] = priceOne({ sqft, frequency: f, rules, ctx, flags, addons, promo });
  });

  return {
    serviceable_sqft: sqft,
    context: ctx,
    options,
    recommended: 'biweekly',
    // Convenience for the UI: was the recommended price set by the minimum
    // rather than the measured area?
    minimum_applied: !!(options.biweekly && options.biweekly.minimum_applied),
    rules_applied: rules.length,
    pricing_source: rules.length ? 'tenant rules' : 'Florida defaults'
  };
}

// ── Seeding ────────────────────────────────────────────────────────────────
async function seedDefaultRules(tenant_id, transaction) {
  const opt = transaction ? { transaction } : {};
  const existing = await PricingRule.count({ where: { tenant_id }, ...opt });
  if (existing > 0) return { seeded: false, count: existing };

  const rows = [
    { rule_type: 'rate', name: 'Florida base rate', scope: { state: 'FL' }, params: { rate_per_sqft: FL_DEFAULTS.rate_per_sqft }, priority: 0 },
    { rule_type: 'minimum', name: 'Florida minimum charge', scope: { state: 'FL' }, params: { minimum_cents: FL_DEFAULTS.minimum_cents }, priority: 0 },
    { rule_type: 'tier', name: 'Property-size tiers', scope: { state: 'FL' }, params: { tiers: FL_DEFAULTS.tiers.map(t => ({ ...t, max_sqft: t.max_sqft === Infinity ? null : t.max_sqft })) }, priority: 0 },
    { rule_type: 'surcharge', name: 'Standard surcharges', scope: { state: 'FL' }, params: FL_DEFAULTS.surcharges, priority: 0 },
    { rule_type: 'tax', name: 'Florida tax', scope: { state: 'FL' }, params: { tax_rate: FL_DEFAULTS.tax_rate }, priority: 0 }
  ];
  FREQUENCIES.forEach(f => {
    rows.push({
      rule_type: 'frequency', name: `${labelFrequency(f)} pricing`,
      scope: { state: 'FL', frequency: f }, params: FL_DEFAULTS.frequency[f], priority: 0
    });
  });

  await PricingRule.bulkCreate(rows.map(r => ({ ...r, tenant_id, active: true })), opt);
  return { seeded: true, count: rows.length };
}

async function seedDefaultPlans(tenant_id, transaction) {
  const opt = transaction ? { transaction } : {};
  const existing = await ServicePlan.count({ where: { tenant_id }, ...opt });
  if (existing === 0) {
    await ServicePlan.bulkCreate([
      { tenant_id, name: 'Weekly Lawn Care', frequency: 'weekly', sort_order: 1, description: 'Mow, edge, trim and blow every week through the growing season.', included_services: ['Mowing', 'Edging', 'String trimming', 'Blowing off hard surfaces'] },
      { tenant_id, name: 'Every Two Weeks', frequency: 'biweekly', sort_order: 2, description: 'The most popular plan in Florida. Same service, every other week.', included_services: ['Mowing', 'Edging', 'String trimming', 'Blowing off hard surfaces'] },
      { tenant_id, name: 'Monthly', frequency: 'monthly', sort_order: 3, description: 'For slower-growing or smaller lawns.', included_services: ['Mowing', 'Edging', 'String trimming', 'Blowing off hard surfaces'] },
      { tenant_id, name: 'One-Time Cleanup', frequency: 'one_time', sort_order: 4, description: 'A single visit. No commitment, no recurring charge.', included_services: ['Mowing', 'Edging', 'String trimming', 'Blowing off hard surfaces'] }
    ], opt);
  }
  const addonCount = await AddonService.count({ where: { tenant_id }, ...opt });
  if (addonCount === 0) {
    await AddonService.bulkCreate([
      { tenant_id, name: 'Hedge and shrub trimming', code: 'hedges', price_cents: 6500, description: 'Shape and clean up hedges and shrubs.' },
      { tenant_id, name: 'Weed control (beds)', code: 'weeds', price_cents: 4000, description: 'Hand-pull and treat weeds in landscape beds.' },
      { tenant_id, name: 'Leaf and debris cleanup', code: 'cleanup', price_cents: 5500, description: 'Clear leaves and yard debris.' },
      { tenant_id, name: 'Fertilization program', code: 'fert', price_cents: 0, coming_soon: true, description: 'Seasonal fertilization. Coming soon.' },
      { tenant_id, name: 'Pest control', code: 'pest', price_cents: 0, coming_soon: true, description: 'Lawn pest treatment. Coming soon.' },
      { tenant_id, name: 'Irrigation check', code: 'irrigation', price_cents: 0, coming_soon: true, description: 'Sprinkler inspection and adjustment. Coming soon.' }
    ], opt);
  }
  return true;
}

module.exports = {
  priceProperty,
  priceOne,
  seedDefaultRules,
  seedDefaultPlans,
  labelFrequency,
  FREQUENCIES,
  FL_DEFAULTS
};
