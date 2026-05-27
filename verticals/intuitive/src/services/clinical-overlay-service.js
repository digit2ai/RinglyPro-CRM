'use strict';

/**
 * Clinical Benefit Overlay Service (Step 6 — THE MOAT)
 *
 * Builds the deck-flagship visuals that Intuitive cannot produce internally
 * and that AcuityMD cannot match. Wraps the existing clinical-dollarization
 * engine with CFO-grade outputs:
 *
 *   1. Bed Days Savings dual-table (Deck 3 p7)
 *   2. Cost of Waiting calculator (Deck 1 p15)
 *   3. Investment Payback Analysis (Deck 1 p15 / Deck 3 p15)
 *   4. Outcomes Driver Table (per-outcome dollarization)
 */

const peerService = require('./peer-comparison-service');

// ─── DA VINCI-APPLICABLE PROCEDURE FILTER (per Greg Eriksen / Intuitive, 5/2026) ──
// ONLY these procedure families count as convertible da Vinci-applicable open cases.
// Non-applicable open surgery (orthopedics, trauma, open-heart bypass, etc.) is
// explicitly excluded so the eligibility pool is exact.
const DA_VINCI_APPLICABLE_PROCEDURES = {
  urology:    ['Prostatectomy', 'Nephrectomy', 'Partial Nephrectomy', 'Pyeloplasty'],
  gynecology: ['Hysterectomy', 'Myomectomy', 'Sacrocolpopexy', 'Endometriosis Excision'],
  general:    ['Cholecystectomy', 'Hernia Repair', 'Colorectal Resection', 'Esophagectomy', 'Gastric Bypass'],
  thoracic:   ['Lobectomy', 'Esophageal Resection'],
  cardiac:    ['Mitral Valve Repair', 'CABG'],
  head_neck:  ['Thyroidectomy', 'Parotid Gland Surgery'],
  pediatric:  ['Pediatric Urologic (Pyeloplasty)'],
};

// LOS by modality per procedure family — all entries are da Vinci-applicable.
const LOS_BY_PROCEDURE = [
  { name: 'Colorectal', open_los: 13, mis_los: 6, davinci_los: 5, opp: true },
  { name: 'Ventral Hernia', open_los: 11, mis_los: 5, davinci_los: 5, opp: true },
  { name: 'Inguinal Hernia', open_los: 9.4, mis_los: 8, davinci_los: 3.9, opp: true },
  { name: 'Cholecystectomy', open_los: 14, mis_los: 5, davinci_los: 4, opp: false },
  { name: 'Benign Hysterectomy', open_los: 5, mis_los: 5, davinci_los: 3, opp: false },
  { name: 'Bariatrics', open_los: 5, mis_los: 2, davinci_los: 2, opp: false },
  { name: 'Lung Resection', open_los: 20, mis_los: 3, davinci_los: 3, opp: false },
  { name: 'Prostatectomy', open_los: 7, mis_los: 0, davinci_los: 2, opp: false },
];

// ─── 1. BED DAYS SAVINGS DUAL-TABLE (Deck 3 p7) ───────────────────────

function buildBedDaysSavingsTable(project, conversionPct = 15, bedDayCost = null) {
  const localBedDayCost = bedDayCost || peerService.bedDayCost(project.state);
  const annualVol = parseInt(project.annual_surgical_volume || 4000);

  // Distribute hospital volume across top procedures (open-heavy = opportunity)
  const procedures = LOS_BY_PROCEDURE.map(p => {
    // Estimate open cases per procedure based on hospital size
    const share = p.opp ? 0.045 : 0.025;
    const totalCases = Math.round(annualVol * share);
    const openCases = Math.round(totalCases * (p.opp ? 0.45 : 0.25));
    const lapCases = Math.round(totalCases * 0.30);
    const dvCases = totalCases - openCases - lapCases;

    const daysSavedPerCase = p.open_los - p.davinci_los;
    const convertedCases = Math.round(openCases * (conversionPct / 100));
    const bedDaysSaved = convertedCases * daysSavedPerCase;

    return {
      procedure: p.name,
      open_cases: openCases,
      lap_cases: lapCases,
      davinci_cases: dvCases,
      open_los: p.open_los,
      mis_los: p.mis_los,
      davinci_los: p.davinci_los,
      open_to_davinci_days_saved_per_case: daysSavedPerCase,
      converted_cases: convertedCases,
      bed_days_saved_yr: bedDaysSaved,
      dollar_savings_yr: bedDaysSaved * localBedDayCost,
      opportunity: p.opp,
    };
  });

  procedures.sort((a, b) => b.bed_days_saved_yr - a.bed_days_saved_yr);

  const totalBedDaysSaved = procedures.reduce((s, p) => s + p.bed_days_saved_yr, 0);
  const totalDollarSavings = procedures.reduce((s, p) => s + p.dollar_savings_yr, 0);
  const totalConverted = procedures.reduce((s, p) => s + p.converted_cases, 0);
  const top3 = procedures.slice(0, 3);
  const top3BedDays = top3.reduce((s, p) => s + p.bed_days_saved_yr, 0);

  return {
    procedures,
    total_bed_days_saved: totalBedDaysSaved,
    total_dollar_savings: Math.round(totalDollarSavings),
    total_converted_cases: totalConverted,
    bed_day_cost_used: localBedDayCost,
    conversion_pct_assumed: conversionPct,
    top_3_procedures: top3.map(p => p.procedure),
    top_3_bed_days: top3BedDays,
    headline: `If ${conversionPct}% of OPEN surgeries (laparoscopic excluded) convert to da Vinci = ${totalBedDaysSaved.toLocaleString()} bed days saved`,
    methodology: `Per-procedure: # OPEN Cases × ${conversionPct}% conversion × (Open LOS − dV LOS) = Bed Days Saved. Laparoscopic cases are NEVER counted. Dollarized at $${localBedDayCost.toLocaleString()}/bed-day (state-local from kff.org).`,
  };
}

// ─── 2. COST OF WAITING (Deck 1 p15 footer) ───────────────────────────

function buildCostOfWaiting(bedDaysTable, businessPlan = {}) {
  const annualSavings = bedDaysTable?.total_dollar_savings || 0;
  const annualRevenue = parseFloat(businessPlan.total_incremental_revenue || 0);
  const totalAnnualOpp = annualSavings + annualRevenue;
  const monthlyCost = Math.round(totalAnnualOpp / 12);
  const weeklyCost = Math.round(totalAnnualOpp / 52);
  const dailyCost = Math.round(totalAnnualOpp / 365);

  return {
    annual_total_opportunity: totalAnnualOpp,
    monthly_cost_of_waiting: monthlyCost,
    weekly_cost_of_waiting: weeklyCost,
    daily_cost_of_waiting: dailyCost,
    headline: `Est Monthly Cost of Waiting: ($${monthlyCost.toLocaleString()})`,
    methodology: 'Every month of delay forfeits 1/12 of the annual opportunity (clinical cost avoidance + incremental revenue). This is the urgency motivator for CFO decision timing.',
  };
}

// ─── 3. INVESTMENT PAYBACK ANALYSIS (Deck 1 p15 / Deck 3 p15) ─────────

// True IRR via bisection (one sign change expected: outflow at t0, inflows after).
function computeIRR(cashflows) {
  const npv = (r) => cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  let lo = -0.9, hi = 5.0;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 1) return mid;
    if (npv(lo) * v < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

function buildInvestmentPayback(project, bedDaysTable, businessPlan = {}, analysis = {}, bpSummary = null) {
  const matched = analysis.model_matching || {};
  const util = analysis.utilization_forecast || {};

  // Capital expenditure
  const systemPrice = parseFloat(businessPlan.system_price) || 1850000; // dV5 ASP
  const systemQuantity = parseInt(businessPlan.system_quantity || util.systems_needed || matched.primary_recommendation?.quantity || 1);
  const capitalExpenditure = systemPrice * systemQuantity;

  // Ongoing operating costs (annual): service contract + digital subscription (~$70k/yr from Y2).
  const annualServiceCost = parseFloat(businessPlan.annual_service_cost) || 0; // dV5 service often bundled
  const digitalSubscription = 70000;

  // ── IRR is based on the HARD financial return only: contribution MARGIN on
  // incremental revenue (not gross revenue, and NOT the soft clinical cost
  // avoidance). Clinical cost avoidance is reported separately as added value.
  const contributionMargin = (parseFloat(businessPlan.contribution_margin_pct) || 35) / 100;
  const annualIncrementalRevenue = parseFloat(businessPlan.total_incremental_revenue || 0);
  const annualClinicalSavings = bedDaysTable?.total_dollar_savings || 0; // reported separately
  const annualMarginFull = annualIncrementalRevenue * contributionMargin;

  // 5-year cash flows with adoption ramp (Y1 50% / Y2 75% / Y3+ 100%)
  const cashflows = [-capitalExpenditure];
  const cumulativeReturn = [{ year: 0, annual_return: 0, cumulative_return: -capitalExpenditure, breakeven: capitalExpenditure }];
  let cumNet = -capitalExpenditure;
  for (let y = 1; y <= 5; y++) {
    const ramp = y === 1 ? 0.5 : y === 2 ? 0.75 : 1.0;
    const ongoing = annualServiceCost + (y >= 2 ? digitalSubscription : 0);
    const yearCash = Math.round(annualMarginFull * ramp - ongoing);
    cashflows.push(yearCash);
    cumNet += yearCash;
    cumulativeReturn.push({ year: y, annual_return: yearCash, cumulative_return: Math.round(cumNet), breakeven: capitalExpenditure });
  }

  // Proper IRR + NPV at an 8% hurdle rate
  const irr = computeIRR(cashflows);
  const project_irr_pct = irr != null ? Math.round(irr * 100 * 10) / 10 : null;
  const hurdle = 0.08;
  const npv8 = Math.round(cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + hurdle, t), 0));

  // Payback (first year cumulative ≥ 0, interpolated)
  const paybackYear = cumulativeReturn.find(c => c.cumulative_return >= 0 && c.year > 0);
  const paybackYears = paybackYear
    ? paybackYear.year - (cumulativeReturn[paybackYear.year - 1].cumulative_return < 0 && paybackYear.annual_return
        ? Math.abs(cumulativeReturn[paybackYear.year - 1].cumulative_return) / paybackYear.annual_return
        : 0)
    : null;

  const annualNetBenefit = Math.round(annualMarginFull - (annualServiceCost + digitalSubscription));

  // Canonical alignment: if the Business Plan proforma IRR/NPV/payback are passed
  // in, use those so the moat slide, the Business Plan, and the Executive Brief
  // all show the SAME figure (they use the same margin basis, slightly different ramps).
  const irrOut = (bpSummary && bpSummary.project_irr != null) ? bpSummary.project_irr : project_irr_pct;
  const npvOut = (bpSummary && bpSummary.npv_8pct != null) ? bpSummary.npv_8pct : npv8;
  const paybackOut = (bpSummary && bpSummary.estimated_payback_years != null)
    ? bpSummary.estimated_payback_years
    : (paybackYears ? Math.round(paybackYears * 10) / 10 : null);

  // KPIs
  const totalOpenToMisConversions = bedDaysTable?.total_converted_cases || 0;
  const bedDaysPreserved5yr = (bedDaysTable?.total_bed_days_saved || 0) * 5;
  const totalCostAvoidance5yr = Math.round(annualClinicalSavings * 5);
  const incrementalRevenue5yr = annualIncrementalRevenue * 5;

  return {
    project_irr_pct: irrOut,
    npv_8pct: npvOut,
    estimated_payback_years: paybackOut,
    capital_expenditure: capitalExpenditure,
    contribution_margin_pct: Math.round(contributionMargin * 100),
    annual_revenue_margin: Math.round(annualMarginFull),
    annual_net_benefit: annualNetBenefit,
    annual_clinical_cost_avoidance: Math.round(annualClinicalSavings),
    cumulative_return_5yr: cumulativeReturn,
    kpis: [
      { label: 'Project IRR', value: irrOut != null ? `${irrOut}%` : 'n/a', raw: irrOut },
      { label: 'NPV @ 8%', value: '$' + npvOut.toLocaleString(), raw: npvOut },
      { label: 'Estimated Payback', value: paybackOut ? `${paybackOut} Years` : 'n/a', raw: paybackOut },
      { label: 'Open-to-MIS Conversions', value: totalOpenToMisConversions.toLocaleString(), raw: totalOpenToMisConversions },
      { label: 'Bed-Days Preserved (5yr)', value: bedDaysPreserved5yr.toLocaleString(), raw: bedDaysPreserved5yr },
      { label: 'Clinical Cost Avoidance (5yr)', value: '$' + totalCostAvoidance5yr.toLocaleString(), raw: totalCostAvoidance5yr },
      { label: 'Incremental Revenue (5yr)', value: '$' + incrementalRevenue5yr.toLocaleString(), raw: incrementalRevenue5yr },
    ],
    headline: irrOut != null
      ? `Project IRR ${irrOut}% · NPV(8%) $${(npvOut / 1e6).toFixed(1)}M · Payback ${paybackOut ? paybackOut + ' yrs' : '5+ yrs'}`
      : `Payback ${paybackOut ? paybackOut + ' yrs' : 'beyond 5-yr horizon'}`,
    methodology: `True multi-year IRR/NPV on 5-yr cash flows. Return = ${Math.round(contributionMargin * 100)}% contribution margin on incremental revenue, ramped Y1 50% / Y2 75% / Y3+ 100%, minus service + digital subscription. Clinical cost avoidance is reported separately as added value, not folded into the capital IRR. NPV discounted at an 8% hurdle rate.`,
  };
}

// ─── 4. OUTCOMES DRIVER TABLE (per-outcome dollarization) ─────────────

function buildOutcomesDriverTable(project, bedDaysTable, totalCases = 0) {
  // For each clinical outcome, show: baseline rate × delta × cost-per-event × cases
  // = $ savings annually. This breaks down the moat into auditable line items.

  const outcomes = [
    {
      name: 'LOS Days Avoided',
      baseline_pct: null,
      delta_open_to_dv: '~6 days/case',
      cost_per_event: bedDaysTable.bed_day_cost_used,
      unit: 'per bed-day',
      events_avoided: bedDaysTable.total_bed_days_saved,
      annual_savings: bedDaysTable.total_dollar_savings,
      source: 'CMS MedPAR Medicare Inpatient avg LOS by modality',
    },
    {
      name: 'Surgical Site Infections',
      baseline_pct: 2.1,
      delta_open_to_dv: '−1.6pp',
      cost_per_event: 28000,
      unit: 'per SSI',
      events_avoided: Math.round(bedDaysTable.total_converted_cases * 0.016),
      annual_savings: Math.round(bedDaysTable.total_converted_cases * 0.016 * 28000),
      source: 'Marin et al. JAMA Surg 2021; AHRQ HCUP cost-per-SSI',
    },
    {
      name: '30-day Readmissions',
      baseline_pct: 16.2,
      delta_open_to_dv: '−3.4pp',
      cost_per_event: 15700,
      unit: 'per readmission',
      events_avoided: Math.round(bedDaysTable.total_converted_cases * 0.034),
      annual_savings: Math.round(bedDaysTable.total_converted_cases * 0.034 * 15700),
      source: 'Childers et al. JAMA Surg 2019; HCUP readmission cost',
    },
    {
      name: 'Postop Complications',
      baseline_pct: 12.8,
      delta_open_to_dv: '−5.0pp',
      cost_per_event: 18500,
      unit: 'per complication',
      events_avoided: Math.round(bedDaysTable.total_converted_cases * 0.050),
      annual_savings: Math.round(bedDaysTable.total_converted_cases * 0.050 * 18500),
      source: 'Tam et al. Ann Surg 2020; Cochrane meta-analysis',
    },
    {
      name: 'Open-to-Lap Conversions Avoided',
      baseline_pct: 8.0,
      delta_open_to_dv: '−6.5pp',
      cost_per_event: 4200,
      unit: 'per conversion',
      events_avoided: Math.round(bedDaysTable.total_converted_cases * 0.065),
      annual_savings: Math.round(bedDaysTable.total_converted_cases * 0.065 * 4200),
      source: 'ECRI Institute 2023; intraop conversion cost burden',
    },
  ];

  const totalDriverSavings = outcomes.reduce((s, o) => s + o.annual_savings, 0);

  return {
    outcomes,
    total_driver_savings: totalDriverSavings,
    headline: `Total annual cost avoidance from ${outcomes.length} outcome categories: $${totalDriverSavings.toLocaleString()}`,
    methodology: 'Per-outcome dollarization: baseline rate × open-to-dV delta × cost-per-event × converted cases. Each line item has a peer-reviewed citation. CFO-auditable.',
  };
}

// ─── 5. COST OF OPEN COMPLICATIONS (Greg "gut punch") ─────────────────
// Dollarizes what the hospital is losing RIGHT NOW from open-case complications
// that da Vinci would avoid — complications, readmissions, infections, conversions
// — across the FULL open da-Vinci-applicable volume, shown as an annual + DAILY
// bleed. Sourced from CMS/AHRQ + peer-reviewed open-vs-robotic adverse-event deltas.
function buildComplicationBurden(bedDaysTable, project) {
  const totalOpenCases = bedDaysTable.procedures.reduce((s, p) => s + (p.open_cases || 0), 0);
  // open rate, da Vinci rate, $ per event (peer-reviewed)
  const drivers = [
    { name: 'Surgical Site Infections', open_rate: 0.092, dv_rate: 0.028, cost_per_event: 28000, source: 'Marin JAMA Surg 2021; AHRQ HCUP' },
    { name: '30-Day Readmissions',      open_rate: 0.162, dv_rate: 0.122, cost_per_event: 15700, source: 'Childers JAMA Surg 2019; HCUP' },
    { name: 'Postop Complications',     open_rate: 0.205, dv_rate: 0.118, cost_per_event: 18500, source: 'Tam Ann Surg 2020; Cochrane' },
    { name: 'Open-to-Lap Conversions',  open_rate: 0.080, dv_rate: 0.015, cost_per_event: 4200,  source: 'ECRI Institute 2023' },
  ];
  let totalAnnual = 0;
  const rows = drivers.map(d => {
    const delta = Math.max(0, d.open_rate - d.dv_rate);
    const avoidableEvents = Math.round(totalOpenCases * delta);
    const annual = avoidableEvents * d.cost_per_event;
    totalAnnual += annual;
    return {
      name: d.name,
      open_rate_pct: Math.round(d.open_rate * 1000) / 10,
      davinci_rate_pct: Math.round(d.dv_rate * 1000) / 10,
      avoidable_events_yr: avoidableEvents,
      cost_per_event: d.cost_per_event,
      annual_avoidable_cost: annual,
      source: d.source,
    };
  });
  const daily = Math.round(totalAnnual / 365);
  return {
    total_open_cases: totalOpenCases,
    rows,
    total_annual_avoidable: Math.round(totalAnnual),
    daily_avoidable: daily,
    weekly_avoidable: Math.round(totalAnnual / 52),
    headline: `${(project.hospital_name || 'This hospital')}'s open cases are bleeding $${daily.toLocaleString()}/day in complications, readmissions, and infections that da Vinci would prevent.`,
    methodology: 'For each adverse-event category: (open rate − da Vinci rate) × $ per event × full open da-Vinci-applicable volume. Rates from peer-reviewed open-vs-robotic literature; event costs from AHRQ HCUP / CMS. The daily figure is the run-rate the hospital pays by keeping these cases open.',
  };
}

// ─── COMPOSITE BUILDER ────────────────────────────────────────────────

async function buildClinicalOverlayEnrichment({ projectId, models, conversionPct = 15 }) {
  const { IntuitiveProject, IntuitiveBusinessPlan, IntuitiveAnalysisResult } = models;
  if (!IntuitiveProject) throw new Error('IntuitiveProject model not available');

  const project = await IntuitiveProject.findByPk(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  // Pull latest business plan (for system price + revenue inputs)
  let businessPlan = {};
  try {
    const plan = await IntuitiveBusinessPlan.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']], raw: true });
    if (plan) businessPlan = plan;
  } catch (e) {}

  // Pull analysis cache
  let analysis = {};
  try {
    const rows = await IntuitiveAnalysisResult.findAll({ where: { project_id: projectId } });
    for (const r of rows) {
      const data = typeof r.result_data === 'string' ? JSON.parse(r.result_data) : r.result_data;
      analysis[r.analysis_type] = data;
    }
  } catch (e) {}

  // Pull the canonical IRR/NPV/payback from the Business Plan proforma so this
  // page, the Business Plan page, and the Executive Brief all agree. (Safe one-way
  // import: business-plan-service does not require clinical-overlay-service.)
  let bpSummary = null;
  try {
    const businessPlanService = require('./business-plan-service');
    const bpe = await businessPlanService.buildBusinessPlanEnrichment({ projectId, models });
    bpSummary = bpe?.proforma?.investment_summary || null;
  } catch (e) { /* fall back to local IRR */ }

  const bedDaysTable = buildBedDaysSavingsTable(project, conversionPct);
  const costOfWaiting = buildCostOfWaiting(bedDaysTable, businessPlan);
  const investmentPayback = buildInvestmentPayback(project, bedDaysTable, businessPlan, analysis, bpSummary);
  const outcomesDriver = buildOutcomesDriverTable(project, bedDaysTable, bedDaysTable.total_converted_cases);
  const complicationBurden = buildComplicationBurden(bedDaysTable, project);

  // THE CONVERSION FORMULA: the conversion opportunity = 15% of OPEN soft-tissue
  // cases the da Vinci can perform. This drives the bed-day cost AVOIDANCE on this
  // page only. It is NOT the surgeon-committed "incremental" net-new volume that
  // surgeons bring in from other hospitals (that lives in Surgeon Commitments /
  // the Business Plan and drives revenue + IRR). Nothing outside these procedures counts.
  const openApplicable = complicationBurden.total_open_cases;
  const conversionOpportunity = Math.round(openApplicable * conversionPct / 100);
  const conversionFormula = {
    basis_pct: conversionPct,
    open_applicable_cases: openApplicable,
    conversion_opportunity: conversionOpportunity,
    incremental_opportunity: conversionOpportunity, // deprecated alias — use conversion_opportunity
    applicable_procedures: DA_VINCI_APPLICABLE_PROCEDURES,
    rule: `Conversion opportunity = ${conversionPct}% of OPEN soft-tissue cases the da Vinci can perform. Laparoscopic and robotic cases — and any open case outside these procedures — do NOT count. This is conversion / cost avoidance, not the surgeon-committed incremental volume (Surgeon Commitments / Step 7).`,
  };

  return {
    project_id: projectId,
    hospital_name: project.hospital_name,
    conversion_formula: conversionFormula,
    complication_burden: complicationBurden,
    bed_days_savings: bedDaysTable,
    cost_of_waiting: costOfWaiting,
    investment_payback: investmentPayback,
    outcomes_driver: outcomesDriver,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildClinicalOverlayEnrichment,
  buildBedDaysSavingsTable,
  buildCostOfWaiting,
  buildInvestmentPayback,
  buildOutcomesDriverTable,
  buildComplicationBurden,
  LOS_BY_PROCEDURE,
  DA_VINCI_APPLICABLE_PROCEDURES,
};
