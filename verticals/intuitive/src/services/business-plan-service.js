'use strict';

/**
 * Business Plan Enrichment Service (Step 8)
 *
 * Builds the CFO-grade proforma + capital placement visuals that ship with
 * the final Business Plan deliverable.
 *
 *   1. System Financials & Assumptions (Deck 1 Slide 14)
 *   2. 5-Year Proforma (Deck 3 Slide 13)
 *   3. Two-Phase Capital Placement Plan (Deck 3 Slide 14)
 *   4. OR-Level Room Recommendations (Deck 1 Slide 16)
 *
 * Chart datasets:
 *   - Annual P&L breakdown
 *   - Cumulative cash flow vs capex
 *   - NPV by acquisition model (Purchase/Lease/AMP/FMV)
 *   - OR placement map data
 */

const peerService = require('./peer-comparison-service');
const surgeonCommitmentsService = require('./surgeon-commitments-service');

// System cost catalog (industry-standard list pricing)
const SYSTEM_PRICES = {
  dV5: { price: 2500000, service: 0, console_price: 575000 },        // service included
  dV5_Dual: { price: 3100000, service: 0, console_price: 575000 },
  Xi: { price: 1900000, service: 175000, console_price: 450000 },
  Xi_Dual: { price: 2500000, service: 175000, console_price: 450000 },
  X: { price: 1300000, service: 125000, console_price: 450000 },
  SP: { price: 1700000, service: 150000, console_price: 575000 },
};

// ─── 1. SYSTEM FINANCIALS & ASSUMPTIONS (Deck 1 Slide 14) ─────────────

function buildSystemAssumptions(project, plan, analysis = {}) {
  const systemType = plan?.system_type || 'dV5';
  const systemCatalog = SYSTEM_PRICES[systemType] || SYSTEM_PRICES.dV5;
  const systemPrice = parseFloat(plan?.system_price) || systemCatalog.price;
  const systemQuantity = parseInt(plan?.system_quantity || 1);
  const annualServiceCost = parseFloat(plan?.annual_service_cost) || systemCatalog.service;
  const acquisitionModel = plan?.acquisition_model || 'purchase';
  const durationYrs = 5;
  const sumOfPayments = acquisitionModel === 'purchase'
    ? systemPrice * systemQuantity
    : (systemPrice / durationYrs) * durationYrs * systemQuantity;

  // Payer mix from HCRIS (project record)
  const medicarePct = parseInt(project?.medicare_pct || 50);
  const commercialPct = parseInt(project?.commercial_pct || 35);
  const commercialPremiumToMedicare = 25; // standard industry assumption
  const bedDayCost = peerService.bedDayCost(project?.state);

  return {
    hospital_id: project?.cms_facility_id || project?.id,
    hospital_name: project?.hospital_name,
    acquisition_model: acquisitionModel,
    duration_yrs: durationYrs,
    system_name: systemType,
    system_quantity: systemQuantity,
    system_price_per_unit: systemPrice,
    sum_of_payments: Math.round(sumOfPayments),
    annual_service_cost: annualServiceCost,
    commercial_payer_mix_pct: commercialPct,
    medicare_payer_mix_pct: medicarePct,
    commercial_premium_to_medicare_pct: commercialPremiumToMedicare,
    cost_of_one_bed_day: bedDayCost,
    or_variable_cost_per_minute: 58,
    or_fixed_cost_per_case: 0,
    methodology: 'System pricing from Intuitive published catalog (dV5 \$2.5M Single / \$3.1M Dual / \$575K Standalone Console). Payer mix from HCRIS. Bed-day cost from state-local kff.org non-profit average. OR variable cost from industry standard.',
  };
}

// ─── 2. 5-YEAR PROFORMA (Deck 3 Slide 13) ─────────────────────────────

// True IRR via bisection (one sign change: capex out at t0, inflows after).
function _irr(cashflows) {
  const npv = (r) => cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  let lo = -0.9, hi = 5.0;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, v = npv(mid);
    if (Math.abs(v) < 1) return mid;
    if (npv(lo) * v < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

function buildFiveYearProforma(plan, analysis = {}, surgeons = [], project = null) {
  const systemQuantity = parseInt(plan?.system_quantity || 1);
  const systemPrice = parseFloat(plan?.system_price) || 1850000;
  const annualServiceCost = parseFloat(plan?.annual_service_cost) || 0;
  const acquisitionModel = plan?.acquisition_model || 'purchase';

  // Split revenue between conversion (existing/open) and net-new (incremental commitments).
  // Conversion revenue ramps slowly (training/credentialing); explicit surgeon commitments
  // ramp faster but still respect trained vs untrained status.
  let revenueFromConversion = 0;   // patient_source='existing' (15% of OPEN model)
  let revenueFromNetNewTrained = 0;   // patient_source='incremental' AND trained=true
  let revenueFromNetNewUntrained = 0; // patient_source='incremental' AND trained=false
  for (const s of (surgeons || [])) {
    const procs = Array.isArray(s.procedures) ? s.procedures : [];
    const trained = s.trained !== false; // default true unless explicitly false
    for (const p of procs) {
      const monthly = parseFloat(p.incremental_cases_monthly || 0);
      const rate = parseFloat(p.reimbursement_rate || 0);
      if (p.patient_source === 'incremental') {
        const rev = monthly * 12 * rate;
        if (trained) revenueFromNetNewTrained += rev;
        else revenueFromNetNewUntrained += rev;
      } else {
        const pct = parseFloat(p.pct_converted_from_open || 15) / 100;
        revenueFromConversion += monthly * 12 * pct * rate;
      }
    }
  }
  // Fallback: if surgeons array is empty, use the plan's stored total under the conversion ramp
  const totalSurgeonRevenue = revenueFromConversion + revenueFromNetNewTrained + revenueFromNetNewUntrained;
  const totalIncrementalRevenue = totalSurgeonRevenue > 0
    ? totalSurgeonRevenue
    : parseFloat(plan?.total_incremental_revenue || 0);
  if (totalSurgeonRevenue === 0) revenueFromConversion = totalIncrementalRevenue;

  // Clinical cost avoidance (Clinical Outcome Savings). Per 2026-05-26 review:
  // this is a SEPARATE number from incremental revenue — it is the bed-day $ saved by
  // CONVERTING existing OPEN soft-tissue cases to robotic (hospital-wide 15% assumption),
  // NOT the surgeons' net-new incremental volume. It must populate even when the committed
  // surgeons carry only incremental (net-new) cases (which is why Step 8 showed $0 before:
  // per-surgeon bed-days only counts converted cases). Canonical source = the Clinical
  // Benefit Overlay's hospital-wide conversion model, so Step 8 now matches Step 6.
  let totalClinicalSavings = parseFloat(plan?.total_clinical_outcome_savings || 0);
  let conversionBedDaysSaved = 0;
  if (project) {
    try {
      const overlay = require('./clinical-overlay-service');
      const bdt = overlay.buildBedDaysSavingsTable(project, 15);
      conversionBedDaysSaved = bdt.total_bed_days_saved || 0;
      if (!totalClinicalSavings) totalClinicalSavings = bdt.total_dollar_savings || 0;
    } catch (e) { /* fall through to surgeon-derived below */ }
  }
  if (!totalClinicalSavings && surgeons.length) {
    try {
      const bedDays = surgeonCommitmentsService.buildPerSurgeonBedDays(surgeons, project);
      totalClinicalSavings = bedDays.reduce((s, r) => s + (r.dollar_value || 0), 0);
    } catch (e) { /* leave at 0 if computation fails */ }
  }
  const totalAnnualReturn = totalIncrementalRevenue + totalClinicalSavings;

  // Capital expenditure
  const capitalExpenditure = acquisitionModel === 'purchase'
    ? systemPrice * systemQuantity
    : 0;
  const annualLeaseOrAmpExpense = acquisitionModel === 'purchase'
    ? 0
    : (systemPrice * systemQuantity) / 5;

  // 5-year proforma with category-aware adoption ramp
  // Conversion (training-gated):  Y1 50% · Y2 75% · Y3+ 100%
  // Net-new trained (commitment): Y1 80% · Y2 100% · Y3+ 100%  (small Y1 ramp for OR scheduling lag)
  // Net-new untrained:            Y1 25% · Y2 75% · Y3+ 100%  (TR200 training year)
  // Clinical cost avoidance follows conversion ramp (it's tied to OPEN-to-dV conversions)
  const yearlyData = [];
  let cumulativeNet = -capitalExpenditure;
  yearlyData.push({
    year: 'Year 0',
    capital_expense: capitalExpenditure,
    operating_expense: 0,
    revenue: 0,
    cost_avoidance: 0,
    net_return: -capitalExpenditure,
    cumulative_net: cumulativeNet,
  });

  const conversionRamp = { 1: 0.5, 2: 0.75, 3: 1.0, 4: 1.0, 5: 1.0 };
  const trainedRamp    = { 1: 0.8, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.0 };
  const untrainedRamp  = { 1: 0.25, 2: 0.75, 3: 1.0, 4: 1.0, 5: 1.0 };

  // Contribution margin on incremental revenue (hard cash for the IRR; gross
  // revenue + cost avoidance are still shown in the P&L as total value created).
  const contributionMargin = (parseFloat(plan?.contribution_margin_pct) || 35) / 100;
  const digitalSubscription = 70000;
  const marginCashflows = [-capitalExpenditure]; // Y0 capex out (0 for lease/AMP)

  for (let y = 1; y <= 5; y++) {
    const yearRevenue =
      revenueFromConversion * conversionRamp[y] +
      revenueFromNetNewTrained * trainedRamp[y] +
      revenueFromNetNewUntrained * untrainedRamp[y];
    const yearCostAvoidance = totalClinicalSavings * conversionRamp[y];
    const yearReturn = yearRevenue + yearCostAvoidance;
    const yearExpense = annualServiceCost + annualLeaseOrAmpExpense + (y >= 2 ? digitalSubscription : 0);
    const yearNet = yearReturn - yearExpense;
    cumulativeNet += yearNet;
    // Cash flow for IRR = contribution margin on revenue − operating expense
    marginCashflows.push(Math.round(yearRevenue * contributionMargin - yearExpense));
    yearlyData.push({
      year: `Year ${y}`,
      capital_expense: 0,
      operating_expense: Math.round(yearExpense),
      revenue: Math.round(yearRevenue),
      cost_avoidance: Math.round(yearCostAvoidance),
      net_return: Math.round(yearNet),
      cumulative_net: Math.round(cumulativeNet),
    });
  }

  // Totals
  const totalExpense = yearlyData.reduce((s, y) => s + y.capital_expense + y.operating_expense, 0);
  const totalReturn = yearlyData.reduce((s, y) => s + y.revenue + y.cost_avoidance, 0);
  const totalNet = totalReturn - totalExpense;

  // Proper multi-year IRR + NPV(8%) on the margin cash flows (matches the
  // Clinical Benefit Overlay). Payback from cumulative margin cash flows.
  const irr = _irr(marginCashflows);
  const projectIRR = irr != null ? Math.round(irr * 100 * 10) / 10 : null;
  const npv8 = Math.round(marginCashflows.reduce((s, cf, t) => s + cf / Math.pow(1.08, t), 0));
  let mCum = 0, paybackYears = null;
  for (let t = 0; t < marginCashflows.length; t++) {
    mCum += marginCashflows[t];
    if (mCum >= 0 && t > 0 && paybackYears === null) {
      paybackYears = t - (marginCashflows[t] ? (mCum / marginCashflows[t]) : 0);
    }
  }

  // Investment Summary KPIs (mirrors Deck 3 Slide 13)
  const totalConvertedCases = surgeons.reduce((s, sg) => s + parseInt(sg.total_incremental_annual || 0), 0);
  const investmentSummary = {
    project_irr: projectIRR,
    npv_8pct: npv8,
    contribution_margin_pct: Math.round(contributionMargin * 100),
    estimated_payback_years: paybackYears ? Math.round(paybackYears * 10) / 10 : null,
    incremental_admissions_5yr: Math.round(totalIncrementalRevenue * 5 / 18500), // weighted per-case revenue
    open_to_mis_conversions_5yr: totalConvertedCases * 5,
    bed_days_preserved_5yr: Math.round((conversionBedDaysSaved || surgeons.reduce((s, sg) => s + parseInt(sg.total_incremental_annual || 0) * 2.5, 0)) * 5),
    total_cost_avoidance_5yr: totalClinicalSavings * 5,
    incremental_revenue_5yr: totalIncrementalRevenue * 5,
  };

  return {
    yearly: yearlyData,
    totals: {
      expense: Math.round(totalExpense),
      return: Math.round(totalReturn),
      net_return: Math.round(totalNet),
    },
    investment_summary: investmentSummary,
    headline: projectIRR != null
      ? `Project IRR ${projectIRR}% · NPV(8%) \$${Math.round(npv8 / 1e6 * 10) / 10}M · Payback ${paybackYears ? Math.round(paybackYears * 10) / 10 + ' yrs' : '5+ yrs'}`
      : `NPV(8%) \$${Math.round(npv8 / 1e6 * 10) / 10}M · Payback ${paybackYears ? Math.round(paybackYears * 10) / 10 + ' yrs' : '5+ yrs'}`,
    methodology: 'Category-aware ramp: conversion revenue (existing/OPEN-only @ 15%) Y1 50%/Y2 75%/Y3+ 100%; net-new commitments from TRAINED surgeons Y1 80%/Y2+ 100%; net-new from UNTRAINED Y1 25%/Y2 75%/Y3+ 100%. Clinical cost avoidance follows the conversion ramp. Capital expensed Y0 for purchase, amortized over 5 yrs for lease/AMP.',
  };
}

// ─── 3. TWO-PHASE CAPITAL PLACEMENT PLAN (Deck 3 Slide 14) ────────────

function buildTwoPhasePlacement(project, plan, analysis = {}, surgeons = []) {
  const systemModel = plan?.system_type || analysis?.model_matching?.primary_recommendation?.system || 'dV5';
  const totalSystems = parseInt(plan?.system_quantity || analysis?.utilization_forecast?.systems_needed || 4);
  const phase1Systems = Math.ceil(totalSystems * 0.7);
  const phase2Systems = totalSystems - phase1Systems;

  // Aggregate by specialty
  const specialtyVolumes = {};
  for (const s of surgeons) {
    const spec = (s.surgeon_specialty || 'general').split(/[\/,\s]/)[0].toLowerCase();
    if (!specialtyVolumes[spec]) {
      specialtyVolumes[spec] = { surgeons: 0, cases: 0, trained: 0, untrained: 0 };
    }
    specialtyVolumes[spec].surgeons++;
    specialtyVolumes[spec].cases += parseInt(s.total_incremental_annual || 0);
    if (s.trained === false) specialtyVolumes[spec].untrained++;
    else specialtyVolumes[spec].trained++;
  }
  const rankedSpecialties = Object.entries(specialtyVolumes)
    .sort((a, b) => b[1].cases - a[1].cases)
    .map(([k, v]) => ({ specialty: k.charAt(0).toUpperCase() + k.slice(1), ...v }));

  const totalTrainings = surgeons.filter(s => s.trained === false).length;
  const totalBedDays = Math.round(surgeons.reduce((s, sg) => s + parseInt(sg.total_incremental_annual || 0), 0) * 2.5);

  return {
    primary_system: systemModel,
    total_systems: totalSystems,
    phase_1: {
      title: `Phase 1: Place ${phase1Systems} ${systemModel}${phase1Systems > 1 ? 's' : ''} at ${project?.hospital_name || 'main facility'}`,
      systems: phase1Systems,
      specialties_covered: rankedSpecialties.slice(0, phase1Systems).map(r => r.specialty),
      new_trainings_required: totalTrainings,
      bed_days_saved: totalBedDays,
      details: rankedSpecialties.slice(0, phase1Systems).map(r => ({
        specialty: r.specialty,
        annual_cases: r.cases,
        surgeons_committed: r.surgeons,
        room_designation: 'TBD — assign based on current OR allocation',
      })),
    },
    phase_2: phase2Systems > 0 ? {
      title: `Phase 2: Add ${phase2Systems} ${systemModel}${phase2Systems > 1 ? 's' : ''} + migrate existing Xi to satellite`,
      systems: phase2Systems,
      details: [
        `Slide ${Math.min(2, phase2Systems)} existing Xi systems from main facility to satellite ASC and community campus`,
        `Backfill main with additional ${systemModel} for advanced cases + teaching console`,
        rankedSpecialties.length > phase1Systems
          ? `${rankedSpecialties[phase1Systems]?.specialty || 'Secondary specialty'} captures additional capacity`
          : null,
        'Geographic access expansion captures incremental market share',
      ].filter(Boolean),
    } : null,
    ranked_specialties: rankedSpecialties,
  };
}

// ─── 4. OR-LEVEL ROOM RECOMMENDATIONS (Deck 1 Slide 16) ───────────────

function buildOrRoomRecommendations(project, plan, analysis = {}, surgeons = []) {
  const systemModel = plan?.system_type || 'dV5';
  const totalSystems = parseInt(plan?.system_quantity || 4);

  // Aggregate by specialty
  const specialtyVolumes = {};
  for (const s of surgeons) {
    const spec = (s.surgeon_specialty || 'general').split(/[\/,\s]/)[0].toLowerCase();
    if (!specialtyVolumes[spec]) specialtyVolumes[spec] = { surgeons: 0, cases: 0 };
    specialtyVolumes[spec].surgeons++;
    specialtyVolumes[spec].cases += parseInt(s.total_incremental_annual || 0);
  }
  const ranked = Object.entries(specialtyVolumes)
    .sort((a, b) => b[1].cases - a[1].cases)
    .slice(0, totalSystems);

  // Assign OR rooms — typical OR numbering 1-30
  const baseRoom = 17;
  const roomAssignments = ranked.map((entry, i) => {
    const [spec, vol] = entry;
    const orRoom = baseRoom + (i * 3);
    return {
      or_room: `OR ${orRoom}${i === 0 && ranked.length > 1 ? '/' + (orRoom + 1) : ''}`,
      specialty: spec.charAt(0).toUpperCase() + spec.slice(1),
      system_type: systemModel,
      annual_cases: vol.cases,
      surgeons_assigned: vol.surgeons,
      rationale: `${spec.charAt(0).toUpperCase() + spec.slice(1)}: ${vol.cases} committed cases/yr across ${vol.surgeons} surgeons. ${i === 0 ? 'Highest-volume placement.' : i === ranked.length - 1 ? 'Final placement.' : 'Secondary placement.'}`,
    };
  });

  // Other rooms that could accommodate dV5 (Deck 1 Slide 16 "Other rooms" section)
  const otherRoomsCount = Math.max(0, Math.min(3, 8 - totalSystems));
  const otherRooms = [];
  for (let i = 0; i < otherRoomsCount; i++) {
    otherRooms.push(`OR ${3 + i * 7}`);
  }

  return {
    primary_assignments: roomAssignments,
    other_rooms_compatible: otherRooms,
    footnote: 'Based on current surgical specialty room priority. Allocations subject to revision based on actual OR availability and capital placement timing.',
  };
}

// ─── ACQUISITION MODEL NPV COMPARISON (Deck 1 Slide 36) ───────────────

function buildAcquisitionNpvComparison(plan) {
  const systemQuantity = parseInt(plan?.system_quantity || 3);
  const systemPrice = parseFloat(plan?.system_price) || 2500000;
  const annualServiceCost = 225000;
  const hurdleRate = 0.08;
  const yearsHorizon = 7;

  // AMP per-procedure pricing
  const ampPerProcedure = 2566;
  const ampTargetProcs = 1950;
  const ampCapProcs = 2145;
  const ampRemediationRamp = [180, 225, 270, 270, 270, 270, 270];

  // Lease quarterly payment
  const leaseQtrPayment = 159581;
  const leaseAnnualPayment = leaseQtrPayment * 4;

  function npv(cashflows, rate) {
    let sum = 0;
    cashflows.forEach((cf, t) => {
      sum += cf / Math.pow(1 + rate, t);
    });
    return Math.round(sum);
  }

  // Build cashflows for each acquisition model
  // Purchase: -capex Y0, +revenue - service every year
  const purchaseCF = [-systemPrice * systemQuantity];
  for (let y = 1; y <= yearsHorizon; y++) {
    purchaseCF.push(2000000 - annualServiceCost); // assume $2M annual benefit
  }
  const npvPurchase = npv(purchaseCF, hurdleRate);

  // Lease: -lease payment each year, +revenue
  const leaseCF = [0];
  for (let y = 1; y <= yearsHorizon; y++) {
    leaseCF.push(2000000 - leaseAnnualPayment * systemQuantity);
  }
  const npvLease = npv(leaseCF, hurdleRate);

  // AMP @ Target: per-procedure cost × procs, no capex
  const ampTargetCF = [0];
  for (let y = 1; y <= yearsHorizon; y++) {
    ampTargetCF.push(2000000 - (ampPerProcedure * ampTargetProcs * systemQuantity));
  }
  const npvAmpTarget = npv(ampTargetCF, hurdleRate);

  // AMP @ 90% Remediation
  const npvAmp90 = npvAmpTarget - 1100000;

  // AMP @ CAP (max procs)
  const ampCapCF = [0];
  for (let y = 1; y <= yearsHorizon; y++) {
    ampCapCF.push(2000000 - (ampPerProcedure * ampCapProcs * systemQuantity));
  }
  const npvAmpCap = npv(ampCapCF, hurdleRate);

  const models = [
    { name: 'AMP @ Target', npv: npvAmpTarget, vs_lease: npvAmpTarget - npvLease, vs_buy: npvAmpTarget - npvPurchase },
    { name: 'AMP @ 90% Remediation', npv: npvAmp90, vs_lease: npvAmp90 - npvLease, vs_buy: npvAmp90 - npvPurchase },
    { name: 'AMP @ CAP', npv: npvAmpCap, vs_lease: npvAmpCap - npvLease, vs_buy: npvAmpCap - npvPurchase },
    { name: '60M FMV Lease (7yr)', npv: npvLease, vs_lease: 0, vs_buy: npvLease - npvPurchase },
    { name: 'Purchase (7yr)', npv: npvPurchase, vs_lease: npvPurchase - npvLease, vs_buy: 0 },
  ];

  return {
    models,
    hurdle_rate_pct: hurdleRate * 100,
    horizon_years: yearsHorizon,
    methodology: 'NPV comparison of Purchase vs Lease vs AMP (Accelerated MIS Program) acquisition models. AMP per-procedure pricing from Intuitive AMP catalog. Lease pricing 5-yr FMV. Hurdle rate 8%. Excludes digital subscription billed at \$70k/yr starting Y2.',
  };
}

// ─── COMPOSITE BUILDER ────────────────────────────────────────────────

async function buildBusinessPlanEnrichment({ projectId, models }) {
  const { IntuitiveProject, IntuitiveBusinessPlan, IntuitiveSurgeonCommitment, IntuitiveAnalysisResult } = models;
  if (!IntuitiveProject) throw new Error('IntuitiveProject model not available');

  const project = await IntuitiveProject.findByPk(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  let plan = null;
  let surgeons = [];
  let analysis = {};
  try {
    plan = await IntuitiveBusinessPlan.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']], raw: true });
    if (plan) {
      surgeons = await IntuitiveSurgeonCommitment.findAll({ where: { business_plan_id: plan.id }, raw: true });
    }
    const rows = await IntuitiveAnalysisResult.findAll({ where: { project_id: projectId } });
    for (const r of rows) {
      const data = typeof r.result_data === 'string' ? JSON.parse(r.result_data) : r.result_data;
      analysis[r.analysis_type] = data;
    }
  } catch (e) { console.error('[business-plan] load error:', e.message); }

  const systemAssumptions = buildSystemAssumptions(project, plan, analysis);
  const proforma = buildFiveYearProforma(plan, analysis, surgeons, project);
  const twoPhasePlacement = buildTwoPhasePlacement(project, plan, analysis, surgeons);
  // OR-Level Room Recommendations + Acquisition Model NPV Comparison removed per
  // 2026-05-26 review (OR rec irrelevant; Acquisition/NPV comparison is AMP-related).

  return {
    project_id: projectId,
    plan_id: plan?.id || null,
    hospital_name: project.hospital_name,
    system_assumptions: systemAssumptions,
    proforma,
    two_phase_placement: twoPhasePlacement,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildBusinessPlanEnrichment,
  buildSystemAssumptions,
  buildFiveYearProforma,
  buildTwoPhasePlacement,
  buildOrRoomRecommendations,
  buildAcquisitionNpvComparison,
  SYSTEM_PRICES,
};
