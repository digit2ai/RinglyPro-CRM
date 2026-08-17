// =====================================================
// lib/model.js — THE ONLY PLACE ARITHMETIC LIVES.
//
// Every currency figure, percentage and count rendered on any of the five tabs
// comes out of `project()` below. Nothing is typed into the HTML. If the model
// changes, all five tabs change together, or the build is wrong.
//
// This exists because the teaser simulator Greg has already seen was
// hand-authored HTML that contradicted itself four different ways:
//   - Year-1 revenue on the dashboard disagreed with the scenario table by 3.4x
//   - Five-year cumulative disagreed with per-client value by roughly 2x
//   - The "$400M average IDN spend" matched no tier in its own tier table
//   - HCA's five-year contract value was printed as annual spend, inflating the
//     National tier and the whole TAM by about five times on its largest line
//
// A 16-year VP of National Key Accounts finds all four in about four minutes.
//
// WHAT THE PRIOR SPRINT BRIEF GOT WRONG, AND WHY THIS REPLACES IT
// ---------------------------------------------------------------
// The earlier acceptance criterion was `11 National IDNs x $2.5B x 15% x 15%`,
// asserting a two-person startup captures one hundred percent of every National
// IDN in the United States in its first year. That is not a conservative case
// or an aggressive one, it is a category error. And `year5 == 5 x year1`
// compounds it by assuming no ramp, no churn and no growth.
//
// Revenue here is a function of ACTIVE ENGAGEMENTS in each year, built from
// arrivals, retention, fee-realisation lag and multi-vendor adoption lag.
//
// Pure. No I/O, no database, no clock, no randomness. Same inputs, same output.
// =====================================================

'use strict';

const MODEL_VERSION = '1.0.0';
const YEARS = 10;

function num(v, fallback) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Rounding goes through toFixed rather than the Math.round(v * 10^n) / 10^n
// idiom, which reintroduces the float error it is meant to remove: dividing a
// clean integer by a power of ten produced 2.2036000000000002 in the
// reconciliation ratio and would have shipped that to the API and the CSV.
function roundTo(v, dp) {
  if (!Number.isFinite(v)) return v;
  return Number(v.toFixed(dp));
}

function round2(v) {
  return roundTo(v, 2);
}

// Fractions (shares, mixes, leverage factors) carry more places than money.
function roundFrac(v) {
  return roundTo(v, 6);
}

// ---------------------------------------------------------------------------
// Spend normalisation.
//
// A tier or a named account entered as TOTAL CONTRACT VALUE can never be
// multiplied as if it were annual spend. Every stored spend figure carries the
// flag, and this is the single gate it passes through. There is deliberately no
// ambiguous "spend" field anywhere in the model.
// ---------------------------------------------------------------------------
function annualiseSpend(spendUsd, isTcv, tcvYears) {
  const spend = num(spendUsd, 0);
  if (!isTcv) return spend;
  const years = Math.max(1, num(tcvYears, 5));
  return spend / years;
}

function normaliseTier(tier, market) {
  const idnCount = Math.max(1, Math.round(num(tier.idn_count, 1)));
  const raw = annualiseSpend(tier.spend_usd, !!tier.spend_is_tcv, tier.tcv_years);
  const tierTotalAnnual = tier.spend_basis === 'per_idn' ? raw * idnCount : raw;

  // Orthopedic robotics is an additional spend layer, not a reallocation of the
  // soft-tissue one, so it uplifts rather than replaces.
  const orthoUplift = market.ortho_in_scope ? num(market.ortho_uplift_pct, 0) : 0;
  const withOrtho = tierTotalAnnual * (1 + orthoUplift);

  return {
    key: tier.key,
    label: tier.label,
    idn_count: idnCount,
    annual_spend_total_usd: round2(withOrtho),
    annual_spend_per_idn_usd: round2(withOrtho / idnCount),
    spend_was_tcv: !!tier.spend_is_tcv,
    tcv_years: tier.spend_is_tcv ? num(tier.tcv_years, 5) : null,
    ortho_uplift_applied_pct: orthoUplift,
  };
}

// ---------------------------------------------------------------------------
// Blended spend per engaged client, DERIVED from the tier mix.
//
// Never typed. The simulator's "$400M average IDN spend" belonged to no tier in
// its own table; deriving it from the mix makes that class of error impossible.
// An explicit override is still allowed, because stress-testing a specific
// number is a legitimate thing to want — but it comes back labelled.
// ---------------------------------------------------------------------------
function blendedSpendPerClient(tiers, engagement) {
  const mixIn = engagement.tier_mix || {};
  const weights = tiers.map((t) => Math.max(0, num(mixIn[t.key], 0)));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // A mix that sums to zero is meaningless; fall back to equal weighting rather
  // than dividing by zero and emitting NaN across five tabs.
  const norm = totalWeight > 0
    ? weights.map((w) => w / totalWeight)
    : tiers.map(() => 1 / Math.max(1, tiers.length));

  const derived = tiers.reduce(
    (acc, t, i) => acc + norm[i] * t.annual_spend_per_idn_usd,
    0,
  );

  const override = engagement.override_spend_per_client_usd;
  const hasOverride = override !== null && override !== undefined && Number.isFinite(Number(override));

  return {
    value_usd: round2(hasOverride ? Number(override) : derived),
    derived_usd: round2(derived),
    is_override: hasOverride,
    mix: tiers.reduce((acc, t, i) => {
      acc[t.key] = roundFrac(norm[i]);
      return acc;
    }, {}),
  };
}

// ---------------------------------------------------------------------------
// Effective savings capture in a given year.
//
// The whole thesis rests on Ottava and Hugo creating a credible second bidder.
// Both have clearance and thin installed base today. Until that lands, a
// negotiator has expertise but no alternative to walk toward, so only
// `pre_leverage_share` of the modelled capture is achievable. The UI states
// this next to the Year-1 figure rather than letting it look like caution.
// ---------------------------------------------------------------------------
function leverageFactor(yearIndex, market, savings, startMonth) {
  const lag = Math.max(0, num(market.adoption_lag_months, 0));
  const preShare = clamp(num(savings.pre_leverage_share, 1), 0, 1);
  if (lag === 0) return 1;
  // Months elapsed at the midpoint of this year, from the practice start date.
  const monthsElapsed = yearIndex * 12 + 6 - startMonth;
  const ramp = clamp(monthsElapsed / lag, 0, 1);
  return preShare + (1 - preShare) * ramp;
}

// ---------------------------------------------------------------------------
// Active engagements per year.
//
// `clients_by_year` is the TARGET active headcount. Churn does not reduce the
// target, it increases how many new logos must be won to hit it — which is the
// real constraint on a one or two person firm, so `arrivals_needed` is reported
// rather than hidden inside a net figure.
// ---------------------------------------------------------------------------
function engagementSchedule(engagement) {
  const targets = Array.isArray(engagement.clients_by_year) ? engagement.clients_by_year : [];
  const churn = clamp(num(engagement.annual_churn_pct, 0), 0, 1);
  const rows = [];
  let priorActive = 0;

  for (let i = 0; i < YEARS; i += 1) {
    const target = Math.max(0, num(targets[i], targets[targets.length - 1] || 0));
    const retained = priorActive * (1 - churn);
    const arrivals = Math.max(0, target - retained);
    const active = retained + arrivals;
    rows.push({
      year: i + 1,
      target_clients: round2(target),
      retained_clients: round2(retained),
      arrivals_needed: round2(arrivals),
      active_clients: round2(active),
      churned_clients: round2(priorActive - retained),
    });
    priorActive = active;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Break-even, accrued monthly.
//
// Taking the first year whose cumulative net is non-negative answers "which
// year", which is not the question — and interpolating from the prior year's
// cumulative gives month zero whenever year one is already profitable, because
// the practice starts at zero by definition. Accruing each year's revenue and
// cost evenly across its twelve months gives the month the lines actually
// cross, including inside year one. Returns null when they never do.
// ---------------------------------------------------------------------------
function breakEven(perYear) {
  let cum = 0;
  for (let i = 0; i < perYear.length; i += 1) {
    const revPerMonth = perYear[i].revenue_usd / 12;
    const costPerMonth = perYear[i].cost_usd / 12;
    const netPerMonth = revPerMonth - costPerMonth;
    for (let m = 1; m <= 12; m += 1) {
      cum += netPerMonth;
      if (cum >= 0) return i * 12 + m;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The projection itself.
// ---------------------------------------------------------------------------
function project(rawInputs) {
  const defaults = require('./benchmarks').defaults();
  const inputs = mergeInputs(defaults, rawInputs || {});

  const market = inputs.market;
  const startMonth = clamp(Math.round(num(market.start_month, 0)), 0, 11);

  // --- Tiers, TAM ---------------------------------------------------------
  const tiers = inputs.tiers.map((t) => normaliseTier(t, market));
  const tamUsd = round2(tiers.reduce((a, t) => a + t.annual_spend_total_usd, 0));
  const perTier = tiers.map((t) => ({
    ...t,
    share_of_tam: tamUsd > 0 ? roundFrac(t.annual_spend_total_usd / tamUsd) : 0,
  }));

  // --- Per-client economics ----------------------------------------------
  const blended = blendedSpendPerClient(tiers, inputs.engagement);
  const capturePct = clamp(num(inputs.savings.capture_pct, 0), 0, 1);
  const feePct = clamp(num(inputs.fee.pct, 0), 0, 1);
  const retainer = Math.max(0, num(inputs.fee.retainer_usd_yr, 0));
  const includeRetainer = inputs.fee.structure === 'retainer_plus_success';

  // At full multi-vendor leverage. Per-year figures below discount this.
  const savingsPerClientYear = round2(blended.value_usd * capturePct);
  const feePerClientYear = round2(savingsPerClientYear * feePct + (includeRetainer ? retainer : 0));
  const clientValue5yr = round2(feePerClientYear * 5);

  // --- Realisation lag ----------------------------------------------------
  // A new engagement cannot invoice a fee on savings until those savings have
  // been verified against a baseline. New arrivals bill a partial first year.
  const lagMonths = clamp(num(inputs.fee.realization_lag_months, 0), 0, 24);
  const firstYearFactor = clamp((12 - lagMonths) / 12, 0, 1);

  // --- Capacity -----------------------------------------------------------
  const basePartners = Math.max(1, Math.round(num(inputs.costs.partners, 1)));
  const partners = market.cofounder ? basePartners + 1 : basePartners;
  const clientsPerPartner = Math.max(1, num(inputs.costs.clients_per_partner, 1));

  // --- Year by year -------------------------------------------------------
  const schedule = engagementSchedule(inputs.engagement);
  const perYear = [];
  let cumulativeRevenue = 0;
  let cumulativeNet = 0;
  let capacityExceeded = false;

  for (let i = 0; i < YEARS; i += 1) {
    const s = schedule[i];
    const leverage = leverageFactor(i, market, inputs.savings, startMonth);

    // Year one is short if the practice starts mid-calendar-year.
    const yearFraction = i === 0 ? (12 - startMonth) / 12 : 1;

    const effectiveFeePerClient = feePerClientYear * leverage;
    const revenue = (
      s.retained_clients * effectiveFeePerClient
      + s.arrivals_needed * effectiveFeePerClient * firstYearFactor
    ) * yearFraction;

    // The plan must staff itself. If the ramp needs more partners than the
    // input carries, cost the partners it actually needs — a model that serves
    // eighteen IDNs with two people for free is the flattering lie.
    const requiredPartners = Math.max(partners, Math.ceil(s.active_clients / clientsPerPartner));
    if (requiredPartners > partners) capacityExceeded = true;

    const people = requiredPartners * num(inputs.costs.loaded_cost_per_partner_yr, 0) * yearFraction;
    const ga = num(inputs.costs.ga_usd_yr, 0) * yearFraction;
    const travel = revenue * clamp(num(inputs.costs.travel_pct_of_revenue, 0), 0, 1);
    const cost = people + ga + travel;
    const net = revenue - cost;

    cumulativeRevenue += revenue;
    cumulativeNet += net;

    perYear.push({
      year: i + 1,
      active_clients: s.active_clients,
      arrivals_needed: s.arrivals_needed,
      retained_clients: s.retained_clients,
      churned_clients: s.churned_clients,
      leverage_factor: roundFrac(leverage),
      year_fraction: roundFrac(yearFraction),
      effective_fee_per_client_usd: round2(effectiveFeePerClient),
      revenue_usd: round2(revenue),
      cost_usd: round2(cost),
      net_usd: round2(net),
      required_partners: requiredPartners,
      cumulative_revenue_usd: round2(cumulativeRevenue),
      cumulative_net_usd: round2(cumulativeNet),
    });
  }

  const breakEvenMonth = breakEven(perYear);

  const sum = (arr, key, n) => round2(arr.slice(0, n).reduce((a, r) => a + r[key], 0));

  const cumulative = {
    y1: sum(perYear, 'revenue_usd', 1),
    y5: sum(perYear, 'revenue_usd', 5),
    y10: sum(perYear, 'revenue_usd', 10),
    net_y1: sum(perYear, 'net_usd', 1),
    net_y5: sum(perYear, 'net_usd', 5),
    net_y10: sum(perYear, 'net_usd', 10),
  };

  return {
    model_version: MODEL_VERSION,
    inputs,
    tam_usd: tamUsd,
    perTier,
    perYear,
    cumulative,
    unit_economics: {
      blended_spend_per_client_usd: blended.value_usd,
      blended_spend_derived_usd: blended.derived_usd,
      blended_spend_is_override: blended.is_override,
      tier_mix_normalised: blended.mix,
      savings_per_client_year_usd: savingsPerClientYear,
      fee_per_client_year_usd: feePerClientYear,
      client_value_5yr_usd: clientValue5yr,
      first_year_realization_factor: roundFrac(firstYearFactor),
    },
    capacity: {
      partners_planned: partners,
      clients_per_partner: clientsPerPartner,
      capacity_exceeded: capacityExceeded,
      peak_required_partners: perYear.reduce((m, r) => Math.max(m, r.required_partners), 0),
      cofounder_included: !!market.cofounder,
    },
    netContribution: {
      break_even_month: breakEvenMonth,
      net_y5_usd: cumulative.net_y5,
      net_y10_usd: cumulative.net_y10,
    },
    capacity_exceeded: capacityExceeded,
  };
}

// ---------------------------------------------------------------------------
// Named-account pipeline.
//
// Lives here rather than in the route because it is arithmetic, and arithmetic
// has exactly one home in this build. It is also where the HCA correction
// becomes visible: the account is stored as five-year total contract value and
// annualised through the same gate every other spend figure passes, so the
// Pipeline tab prints roughly five hundred million a year rather than the two
// and a half billion the teaser simulator showed.
// ---------------------------------------------------------------------------
function pipeline(accounts, market) {
  const orthoUplift = market && market.ortho_in_scope ? num(market.ortho_uplift_pct, 0) : 0;
  return (accounts || []).map((a) => {
    const annual = annualiseSpend(a.spend_usd, !!a.spend_is_tcv, a.tcv_years) * (1 + orthoUplift);
    return {
      name: a.name,
      tier: a.tier,
      systems: num(a.systems, null),
      annual_spend_usd: round2(annual),
      entered_usd: round2(num(a.spend_usd, 0)),
      spend_was_tcv: !!a.spend_is_tcv,
      tcv_years: a.spend_is_tcv ? num(a.tcv_years, 5) : null,
      tcv_note: a.spend_is_tcv
        ? `Entered as total contract value over ${num(a.tcv_years, 5)} years and annualised. It is not an annual figure.`
        : null,
      contract_note: a.contract_note || null,
      priority: a.priority || 'mid',
      ortho_uplift_applied_pct: orthoUplift,
    };
  });
}

// ---------------------------------------------------------------------------
// Reconciliation.
//
// A TAM larger than the entire worldwide revenue of the vendor whose contracts
// you propose to renegotiate is not a market size. The model says so out loud
// instead of printing the bigger number.
// ---------------------------------------------------------------------------
function reconcile(result, anchors) {
  return anchors.map((a) => {
    const exceeds = result.tam_usd > a.value_usd;
    return {
      key: a.key,
      label: a.label,
      tam_usd: result.tam_usd,
      anchor_usd: a.value_usd,
      anchor_label: a.label,
      anchor_source: a.source,
      anchor_source_url: a.source_url,
      anchor_as_of: a.as_of,
      basis: a.basis,
      status: exceeds ? 'exceeds' : 'ok',
      ratio: a.value_usd > 0 ? roundTo(result.tam_usd / a.value_usd, 3) : null,
      note: exceeds
        ? 'The modelled market exceeds this anchor. That is defensible only if the market is explicitly multi-vendor, covering J&J, Medtronic and orthopedic platforms in addition to Intuitive. State that scope wherever this figure appears, or reduce the tier totals.'
        : a.note,
    };
  });
}

// ---------------------------------------------------------------------------
// Sensitivity.
//
// One number is a guess. A ranked range is an argument. Each driver is moved
// across a plausible low and high while everything else is held, and the swing
// in five-year cumulative revenue is recorded. Sorted by impact, so the top of
// the list is what the business case is actually hostage to.
// ---------------------------------------------------------------------------
const DRIVERS = [
  { key: 'savings.capture_pct', label: 'Savings capture', low: 0.05, high: 0.18, format: 'pct' },
  { key: 'fee.pct', label: 'Fee on savings', low: 0.10, high: 0.20, format: 'pct' },
  { key: 'engagement.annual_churn_pct', label: 'Annual client churn', low: 0.02, high: 0.25, format: 'pct' },
  { key: 'fee.realization_lag_months', label: 'Fee realisation lag', low: 3, high: 18, format: 'months' },
  { key: 'market.adoption_lag_months', label: 'Ottava / Hugo adoption lag', low: 6, high: 30, format: 'months' },
  { key: 'savings.pre_leverage_share', label: 'Capture without multi-vendor leverage', low: 0.35, high: 0.85, format: 'pct' },
  { key: 'costs.clients_per_partner', label: 'Engagements one partner can carry', low: 2, high: 6, format: 'count' },
];

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  const clone = JSON.parse(JSON.stringify(obj));
  let cursor = clone;
  for (let i = 0; i < parts.length - 1; i += 1) cursor = cursor[parts[i]];
  cursor[parts[parts.length - 1]] = value;
  return clone;
}

function sensitivity(inputs) {
  const baseline = project(inputs).cumulative.y5;
  const rows = DRIVERS.map((d) => {
    const lowY5 = project(setPath(inputs, d.key, d.low)).cumulative.y5;
    const highY5 = project(setPath(inputs, d.key, d.high)).cumulative.y5;
    const lo = Math.min(lowY5, highY5);
    const hi = Math.max(lowY5, highY5);
    return {
      key: d.key,
      label: d.label,
      format: d.format,
      low_input: d.low,
      high_input: d.high,
      low_y5_usd: round2(lo),
      high_y5_usd: round2(hi),
      baseline_y5_usd: round2(baseline),
      swing_usd: round2(hi - lo),
      swing_pct_of_baseline: baseline > 0 ? roundFrac((hi - lo) / baseline) : null,
    };
  });
  rows.sort((a, b) => b.swing_usd - a.swing_usd);
  return rows;
}

// The two or three inputs the outcome is most hostage to, phrased as claims a
// reader can agree or disagree with rather than as parameters.
function whatHasToBeTrue(sens, result) {
  const top = sens.slice(0, 3);
  const claims = top.map((s) => {
    const pctOf = s.swing_pct_of_baseline === null ? null : Math.round(s.swing_pct_of_baseline * 100);
    return {
      driver: s.label,
      claim: claimFor(s),
      swing_usd: s.swing_usd,
      swing_pct_of_baseline: s.swing_pct_of_baseline,
      why_it_matters: pctOf === null
        ? 'Moves the five-year outcome materially.'
        : `Moving this input across its plausible range swings five-year revenue by about ${pctOf} percent of the base case.`,
    };
  });

  if (result.capacity.capacity_exceeded) {
    claims.push({
      driver: 'Delivery capacity',
      claim: `The ramp requires ${result.capacity.peak_required_partners} partners at peak, against ${result.capacity.partners_planned} planned. Either the hiring happens or the client ramp does not.`,
      swing_usd: null,
      swing_pct_of_baseline: null,
      why_it_matters: 'Revenue that cannot be delivered is not revenue. The cost side already prices the partners the ramp requires.',
    });
  }
  return claims;
}

function claimFor(s) {
  switch (s.key) {
    case 'savings.capture_pct':
      return 'Engagements actually deliver savings in the modelled band against a verifiable prior-contract baseline.';
    case 'fee.pct':
      return 'IDNs accept a fee-on-savings percentage in the modelled band, rather than negotiating toward a fixed fee.';
    case 'engagement.annual_churn_pct':
      return 'Clients renew after the first negotiation cycle rather than treating the engagement as one-and-done.';
    case 'fee.realization_lag_months':
      return 'Savings can be verified and invoiced within the modelled window, not a full cycle later.';
    case 'market.adoption_lag_months':
      return 'J&J Ottava and Medtronic Hugo reach enough installed base to be a credible alternative inside the modelled window.';
    case 'savings.pre_leverage_share':
      return 'Expertise alone wins a meaningful concession before a second bidder exists.';
    case 'costs.clients_per_partner':
      return 'One partner can genuinely carry the modelled number of concurrent IDN engagements.';
    default:
      return s.label;
  }
}

// Deep merge that lets a caller send a partial input set. Arrays replace
// wholesale rather than merging element-wise, because a shorter ramp array is
// a deliberate statement, not a patch over the default one.
function mergeInputs(base, override) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value.slice();
    } else if (value && typeof value === 'object' && base && typeof base[key] === 'object' && !Array.isArray(base[key]) && base[key] !== null) {
      out[key] = mergeInputs(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

module.exports = {
  project,
  sensitivity,
  whatHasToBeTrue,
  reconcile,
  pipeline,
  mergeInputs,
  annualiseSpend,
  MODEL_VERSION,
  YEARS,
  DRIVERS,
};
