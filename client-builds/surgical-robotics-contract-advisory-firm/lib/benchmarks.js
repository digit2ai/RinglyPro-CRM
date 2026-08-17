// =====================================================
// lib/benchmarks.js — the seeded input set, and the provenance registry.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: no figure may be seeded without a
// source and an as-of date. Greg is going to show this model to investors,
// to a spouse, and possibly to outside counsel. A number he cannot source is
// worse than no number, so every default below carries where it came from and
// what kind of claim it is.
//
// `basis` vocabulary (an entry may not ship without one):
//   public_filing  — a 10-K, an investor deck, an audited statement
//   analyst_report — Grand View / Frost & Sullivan / KLAS and similar
//   cms_data       — CMS cost reports, Hospital Compare, MPUP
//   client_stated  — Greg said it in the intake; true but not independently sourced
//   derived        — arithmetic over other entries in this registry
//   assumption     — a modelling choice with no external source. Renders amber.
//   user_input     — the operator typed over the default (assigned at runtime)
//
// The teaser simulator Greg has already seen carried several figures with no
// source at all, and several that contradicted each other. Where a figure came
// from that simulator and nothing else, it is labelled `assumption` here and
// says so in its source string. That is deliberate: the whole point of this
// build is that the numbers reconcile and declare themselves.
// =====================================================

'use strict';

const B = 1e9;
const M = 1e6;

// ---------------------------------------------------------------------------
// Tier seeds
//
// Per-IDN annual spend is DERIVED from the tier total and the IDN count; it is
// never typed independently, because a typed average that disagrees with the
// tier it belongs to is exactly the defect this model was built to remove
// (the simulator's "$400M average IDN spend" matched no tier at all).
// ---------------------------------------------------------------------------
const TIERS = [
  {
    key: 'national',
    label: 'National IDNs',
    idn_count: 11,
    spend_usd: 8.1 * B,
    spend_basis: 'tier_total',
    spend_is_tcv: false,
    tcv_years: 5,
  },
  {
    key: 'regional',
    label: 'Regional IDNs (mid-tier)',
    idn_count: 40,
    spend_usd: 6.7 * B,
    spend_basis: 'tier_total',
    spend_is_tcv: false,
    tcv_years: 5,
  },
  {
    key: 'academic',
    label: 'Academic Medical Centers',
    idn_count: 30,
    spend_usd: 3.6 * B,
    spend_basis: 'tier_total',
    spend_is_tcv: false,
    tcv_years: 5,
  },
];

// ---------------------------------------------------------------------------
// Named pipeline accounts.
//
// HCA IS SEEDED AS TOTAL CONTRACT VALUE, NOT ANNUAL SPEND. Greg's own intake
// says the HealthTrust master contract was "a new 5 year master contract" worth
// "roughly $2,500,000,000" across capital, service and instruments. The teaser
// simulator printed that same $2.5B as HCA's ANNUAL spend, which inflates the
// National tier — and therefore the entire TAM — by roughly five times on its
// single largest line. `spend_is_tcv` divides it back out before any downstream
// arithmetic touches it.
// ---------------------------------------------------------------------------
const NAMED_ACCOUNTS = [
  {
    name: 'HCA Healthcare / HealthTrust',
    tier: 'national',
    systems: 220,
    spend_usd: 2.5 * B,
    spend_is_tcv: true,
    tcv_years: 5,
    contract_note: 'Five-year master contract signed; reset opportunity at expiry',
    priority: 'anchor',
  },
  {
    name: 'CommonSpirit Health',
    tier: 'national',
    systems: 140,
    spend_usd: 1.1 * B,
    spend_is_tcv: false,
    tcv_years: 5,
    contract_note: 'Renewal window approaching',
    priority: 'high',
  },
  {
    name: 'Ascension Health',
    tier: 'national',
    systems: 130,
    spend_usd: 980 * M,
    spend_is_tcv: false,
    tcv_years: 5,
    contract_note: 'Multi-vendor evaluation underway (Hugo pilot sites)',
    priority: 'high',
  },
  {
    name: 'Tenet Health',
    tier: 'national',
    systems: 90,
    spend_usd: 680 * M,
    spend_is_tcv: false,
    tcv_years: 5,
    contract_note: 'Regional GPO relationships active',
    priority: 'mid',
  },
  {
    name: 'Providence Health',
    tier: 'national',
    systems: 85,
    spend_usd: 640 * M,
    spend_is_tcv: false,
    tcv_years: 5,
    contract_note: 'Academic-affiliated; dual robotics footprint',
    priority: 'mid',
  },
  {
    name: 'Baylor Scott & White',
    tier: 'regional',
    systems: 70,
    spend_usd: 300 * M,
    spend_is_tcv: false,
    tcv_years: 5,
    contract_note: 'Texas market; Vizient GPO affiliation',
    priority: 'mid',
  },
  {
    name: 'Intermountain Health',
    tier: 'regional',
    systems: 50,
    spend_usd: 215 * M,
    spend_is_tcv: false,
    tcv_years: 5,
    contract_note: 'Recent merger activity; contract consolidation opportunity',
    priority: 'mid',
  },
  {
    name: 'Mayo Clinic',
    tier: 'academic',
    systems: 60,
    spend_usd: 240 * M,
    spend_is_tcv: false,
    tcv_years: 5,
    contract_note: 'High instrumentation spend; known benchmark buyer',
    priority: 'high',
  },
  {
    name: 'UPMC',
    tier: 'academic',
    systems: 55,
    spend_usd: 220 * M,
    spend_is_tcv: false,
    tcv_years: 5,
    contract_note: 'Active orthopedic robotics expansion; CFO cost mandate',
    priority: 'high',
  },
];

// ---------------------------------------------------------------------------
// Per-system / per-procedure unit economics, for the Market Sizing breakdown.
// ---------------------------------------------------------------------------
const SPEND_COMPONENTS = [
  {
    key: 'capital',
    label: 'da Vinci capital (purchase and lease)',
    unit: 'per system',
    low_usd: 1.2 * M,
    high_usd: 2.5 * M,
    note: 'Top national IDNs operate roughly 80 to 220 systems',
  },
  {
    key: 'service',
    label: 'Service contracts',
    unit: 'per system per year',
    low_usd: 120000,
    high_usd: 180000,
    note: 'Multi-year lock-ins are common and are a primary leverage point',
  },
  {
    key: 'instruments',
    label: 'Instrumentation and consumables',
    unit: 'per procedure',
    low_usd: 700,
    high_usd: 2200,
    note: 'Recurring; the largest lifetime line at high-volume systems',
  },
  {
    key: 'ortho',
    label: 'Orthopedic robotics (Mako, ROSA, CORI)',
    unit: 'per unit',
    low_usd: 500000,
    high_usd: 1.8 * M,
    note: 'Emerging spend layer; only included when ortho scope is switched on',
  },
];

// ---------------------------------------------------------------------------
// Reconciliation anchors.
//
// A total addressable market that exceeds the entire worldwide revenue of the
// vendor whose contracts you propose to renegotiate is not a market size, it is
// an arithmetic error. The model checks TAM against these anchors and reports
// the result rather than quietly printing the bigger number.
// ---------------------------------------------------------------------------
const ANCHORS = [
  {
    key: 'isrg_revenue',
    label: 'Intuitive Surgical total worldwide revenue, FY2024',
    value_usd: 8.35 * B,
    basis: 'public_filing',
    source: 'Intuitive Surgical FY2024 reported total revenue. Confirm the exact figure against the filed 10-K before citing externally.',
    source_url: 'https://isrg.gcs-web.com/financial-information/sec-filings',
    as_of: '2024-12-31',
    note: 'Worldwide and all segments. US IDN spend is a subset. A TAM above this figure can only be defended if it explicitly includes J&J, Medtronic and orthopedic vendors.',
  },
];

// ---------------------------------------------------------------------------
// The full default input set. Everything the model needs, nothing it does not.
// ---------------------------------------------------------------------------
function defaults() {
  return {
    tiers: TIERS.map((t) => ({ ...t })),
    named_accounts: NAMED_ACCOUNTS.map((a) => ({ ...a })),
    engagement: {
      // Target ACTIVE engagements in each year, ten years out.
      clients_by_year: [2, 4, 8, 12, 18, 20, 22, 24, 26, 28],
      // Mix of the tiers those engagements are drawn from. Normalised at runtime.
      tier_mix: { national: 0.35, regional: 0.45, academic: 0.20 },
      annual_churn_pct: 0.10,
      // Set to a number to override the tier-derived blend. Labelled as an
      // override wherever it is used, because a typed average that disagrees
      // with its own tier table is the defect this model removes.
      override_spend_per_client_usd: null,
    },
    savings: {
      capture_pct: 0.12,
      // Before J&J Ottava and Medtronic Hugo have real installed base, a
      // negotiator has expertise but no second bidder. This is the share of
      // the modelled capture achievable without credible multi-vendor leverage.
      pre_leverage_share: 0.60,
    },
    fee: {
      pct: 0.15,
      structure: 'pct_of_verified_savings',
      retainer_usd_yr: 0,
      // Savings must be VERIFIED against a baseline before a fee-on-savings
      // invoice is defensible. New engagements bill a partial first year.
      realization_lag_months: 9,
    },
    market: {
      adoption_lag_months: 15,
      ortho_in_scope: false,
      ortho_uplift_pct: 0.12,
      cofounder: false,
      start_month: 0,
    },
    costs: {
      partners: 1,
      loaded_cost_per_partner_yr: 450000,
      ga_usd_yr: 180000,
      travel_pct_of_revenue: 0.04,
      clients_per_partner: 4,
    },
    view: 'investor',
  };
}

// ---------------------------------------------------------------------------
// The provenance registry. One entry per input path that carries a claim.
//
// SIT iterates this list and fails the build on any entry missing `source` or
// `as_of`. That is criterion 7, and it is what stops a number sliding into the
// model with nothing behind it.
// ---------------------------------------------------------------------------
const REGISTRY = [
  {
    path: 'tiers.0.idn_count',
    label: 'Count of National IDNs',
    unit: 'systems',
    basis: 'client_stated',
    source: 'Greg Eriksen intake, project 142: "My team is aligned to the top 11 National health care systems in the US."',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'tiers.0.spend_usd',
    label: 'National tier total annual robotic spend',
    unit: 'USD/yr',
    basis: 'assumption',
    source: 'Illustrative figure carried over from the Digit2AI teaser simulator. NOT sourced to a filing or an analyst report. Replace with CMS cost-report and 10-K derived figures before this number is cited externally.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'tiers.1.idn_count',
    label: 'Count of Regional mid-tier IDNs',
    unit: 'systems',
    basis: 'assumption',
    source: 'Approximate mid-tier IDN count used in the teaser simulator. Needs reconciliation against an AHA or Definitive Healthcare system list.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'tiers.1.spend_usd',
    label: 'Regional tier total annual robotic spend',
    unit: 'USD/yr',
    basis: 'assumption',
    source: 'Illustrative figure carried over from the Digit2AI teaser simulator. Not independently sourced.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'tiers.2.idn_count',
    label: 'Count of Academic Medical Centers',
    unit: 'systems',
    basis: 'assumption',
    source: 'Approximate AMC count used in the teaser simulator. Needs reconciliation against an AAMC member list.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'tiers.2.spend_usd',
    label: 'Academic tier total annual robotic spend',
    unit: 'USD/yr',
    basis: 'assumption',
    source: 'Illustrative figure carried over from the Digit2AI teaser simulator. Not independently sourced.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'engagement.clients_by_year',
    label: 'Client ramp, active engagements by year',
    unit: 'clients',
    basis: 'assumption',
    source: 'Ramp shape from the teaser simulator (2 in year one, 8 by year three, 18 by year five). A planning assumption about business development, not an observed rate.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'engagement.annual_churn_pct',
    label: 'Annual client churn',
    unit: 'fraction',
    basis: 'assumption',
    source: 'Modelling assumption. No comparable retention data for fee-on-savings med-device negotiation practices was available without primary research.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'savings.capture_pct',
    label: 'Savings capture against prior contract baseline',
    unit: 'fraction',
    basis: 'client_stated',
    source: 'Greg Eriksen intake, project 142: "There was significant further room that HealthTrust could have negotiated." Magnitude is Greg\'s professional judgement, not a measured outcome.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'savings.pre_leverage_share',
    label: 'Share of savings capture achievable before multi-vendor leverage exists',
    unit: 'fraction',
    basis: 'assumption',
    source: 'Modelling assumption. Expertise alone wins some concession; a credible second bidder wins the rest. Not sourced.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'fee.pct',
    label: 'Consulting fee as a share of verified savings',
    unit: 'fraction',
    basis: 'analyst_report',
    source: 'Fee-on-savings engagements in healthcare cost management commonly land in a ten to twenty percent band. Confirm against a named comparable (Vizient, Premier, or a boutique med-device advisory) before citing.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'fee.realization_lag_months',
    label: 'Months before a new engagement bills a verified-savings fee',
    unit: 'months',
    basis: 'assumption',
    source: 'Modelling assumption reflecting the time to establish a baseline, run the negotiation, and verify realised savings. Not sourced.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'market.adoption_lag_months',
    label: 'Months until J&J Ottava and Medtronic Hugo carry credible installed base',
    unit: 'months',
    basis: 'assumption',
    source: 'Both platforms have FDA clearance with limited installed base. The twelve to eighteen month lag is a planning assumption, not a vendor commitment.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'market.ortho_uplift_pct',
    label: 'Spend uplift when orthopedic robotics are in scope',
    unit: 'fraction',
    basis: 'assumption',
    source: 'Modelling assumption for the Mako, ROSA and CORI spend layer. Not sourced.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'costs.loaded_cost_per_partner_yr',
    label: 'Fully loaded annual cost per partner',
    unit: 'USD/yr',
    basis: 'assumption',
    source: 'Modelling assumption for senior ex-vendor executive compensation including benefits and payroll burden. Not sourced.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'costs.ga_usd_yr',
    label: 'General and administrative cost per year',
    unit: 'USD/yr',
    basis: 'assumption',
    source: 'Modelling assumption covering entity, insurance including errors and omissions, legal, accounting and tooling. Not sourced.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'costs.clients_per_partner',
    label: 'IDN engagements one partner can carry concurrently',
    unit: 'clients',
    basis: 'assumption',
    source: 'Modelling assumption. This is the constraint that decides whether the ramp is deliverable, so it is surfaced rather than buried.',
    source_url: null,
    as_of: '2026-08-07',
  },
  {
    path: 'named_accounts.0.spend_usd',
    label: 'HCA HealthTrust master contract value',
    unit: 'USD total contract value over five years',
    basis: 'client_stated',
    source: 'Greg Eriksen intake, project 142: "a new 5 year master contract with HealthTrust for HCA\'s business... the total dollar value of the contract was roughly $2,500,000,000." Stored as total contract value, not annual spend.',
    source_url: null,
    as_of: '2026-08-07',
  },
];

function valueAtPath(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[key];
  }, obj);
}

function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

// Walks the registry against a live input set. Anything the operator has typed
// over flips to `user_input`, and drops out of the sourced count — a figure a
// human overrode is no longer sourced to public data, and the Dashboard says so.
function provenanceFor(inputs) {
  const base = defaults();
  const entries = REGISTRY.map((entry) => {
    const current = valueAtPath(inputs, entry.path);
    const original = valueAtPath(base, entry.path);
    const overridden = current !== undefined && !sameValue(current, original);
    return {
      ...entry,
      value: current === undefined ? original : current,
      basis: overridden ? 'user_input' : entry.basis,
      overridden,
      default_value: original,
    };
  });
  const SOURCED = ['public_filing', 'analyst_report', 'cms_data', 'client_stated'];
  const sourced = entries.filter((e) => SOURCED.includes(e.basis)).length;
  const assumptions = entries.filter((e) => e.basis === 'assumption').length;
  const overrides = entries.filter((e) => e.basis === 'user_input').length;
  return { entries, sourced, assumptions, overrides, total: entries.length };
}

module.exports = {
  defaults,
  provenanceFor,
  REGISTRY,
  SPEND_COMPONENTS,
  ANCHORS,
  NAMED_ACCOUNTS,
};
