'use strict';

/**
 * Surgeon Commitments Enrichment Service (Step 7)
 *
 * Builds deck-aligned analytics on top of the 3-tab editor from Stream 1.
 *
 *   1. Master Surgeon Table     (Deck 1 Slide 11 — consolidated view)
 *   2. Per-Surgeon Bed Days     (Deck 3 Slide 9 — Dr. Gunther style breakdown)
 *   3. Pull-Forward Capacity    (Deck 3 Slide 10 — current vs target weekly)
 *   4. Aggregated Summary       (executive-level totals)
 */

const peerService = require('./peer-comparison-service');
const { procConv, procNetNew } = require('../utils/commitment-math');

// LOS deltas (open → robotic) per procedure family — same dataset as overlay service
const LOS_DELTA_BY_PROCEDURE = {
  'Radical Prostatectomy': 5.0,
  'Partial Nephrectomy': 5.0,
  'Cystectomy': 6.5,
  'Hysterectomy (Benign)': 2.0,
  'Hysterectomy (Malignant)': 1.0,
  'Myomectomy': 1.5,
  'Cholecystectomy': 10.0,
  'Inguinal Hernia': 5.5,
  'Ventral Hernia': 6.0,
  'Colon Resection': 8.0,
  'Rectal Resection': 7.5,
  'Colectomy': 8.0,
  'Lobectomy': 17.0,
  'Esophagectomy': 8.5,
  'Gastric Bypass': 3.0,
  'Sleeve Gastrectomy': 3.0,
  'CABG': 4.0,
  default: 5.0,
};

function losDeltaForProcedure(name) {
  if (!name) return LOS_DELTA_BY_PROCEDURE.default;
  if (LOS_DELTA_BY_PROCEDURE[name]) return LOS_DELTA_BY_PROCEDURE[name];
  const lc = String(name).toLowerCase();
  for (const [key, val] of Object.entries(LOS_DELTA_BY_PROCEDURE)) {
    if (key === 'default') continue;
    if (lc.includes(key.toLowerCase().split(/[\s(]/)[0])) return val;
  }
  return LOS_DELTA_BY_PROCEDURE.default;
}

// ─── 1. MASTER SURGEON TABLE (Deck 1 Slide 11) ────────────────────────

function buildMasterSurgeonTable(surgeons) {
  // Flatten all surgeons across all 3 categories into a single deck-formatted table.
  // Per 2026-05-26 review: split each surgeon's committed volume into CONVERTED
  // (existing OPEN × %) vs INCREMENTAL (net-new) so the table shows both cleanly.
  return surgeons.map(s => {
    const procs = Array.isArray(s.procedures) ? s.procedures : [];
    let converted = 0, incremental = 0;
    for (const p of procs) {
      // ADDITIVE: converted (OPEN × %) and net-new are independent components.
      converted += procConv(p);
      incremental += procNetNew(p);
    }
    return {
      id: s.id,
      surgeon_name: s.surgeon_name,
      specialty: s.surgeon_specialty || s.specialty || '—',
      trained: s.trained !== false,
      training_needs: s.training_needs || '',
      converted_cases_yr: converted,
      incremental_cases_yr: incremental,
      total_cases_yr: parseInt(s.total_incremental_annual || 0),
      revenue_impact: parseFloat(s.total_revenue_impact || 0),
      commitment_category: s.commitment_category || 'open_to_mis',
      facility: s.hospital_affiliation || '',
      free_text_intel: s.free_text_intel || '',
    };
  }).sort((a, b) => b.total_cases_yr - a.total_cases_yr);
}

// ─── 2. PER-SURGEON BED DAYS CALCULATOR (Deck 3 Slide 9) ──────────────

function buildPerSurgeonBedDays(surgeons, project) {
  const bedDayCost = peerService.bedDayCost(project?.state);

  return surgeons.map(s => {
    // Compute bed-days-saved from the procedure-level breakdown
    let totalBedDaysSaved = 0;
    const procedures = Array.isArray(s.procedures) ? s.procedures : [];
    const procDetail = [];

    for (const p of procedures) {
      // Bed-days saved apply ONLY to CONVERTED open cases (open→robotic LOS delta).
      // Net-new cases are brand-new volume with no prior LOS baseline — no bed-days.
      const convCases = procConv(p);
      if (!convCases) continue;
      const losDelta = losDeltaForProcedure(p.procedure_name);
      const bedDays = Math.round(convCases * losDelta);
      totalBedDaysSaved += bedDays;
      if (bedDays > 0) {
        procDetail.push({
          procedure: p.procedure_name,
          cases: convCases,
          los_delta_days: losDelta,
          bed_days_saved: bedDays,
        });
      }
    }

    return {
      surgeon_name: s.surgeon_name,
      specialty: s.surgeon_specialty,
      commitment_category: s.commitment_category,
      total_cases: parseInt(s.total_incremental_annual || 0),
      bed_days_saved: totalBedDaysSaved,
      dollar_value: totalBedDaysSaved * bedDayCost,
      procedure_breakdown: procDetail,
    };
  }).filter(s => s.bed_days_saved > 0).sort((a, b) => b.bed_days_saved - a.bed_days_saved);
}

// ─── 3. PULL-FORWARD CAPACITY (Deck 3 Slide 10) ───────────────────────

function buildPullForwardCapacity(surgeons) {
  const pullForward = surgeons.filter(s => s.commitment_category === 'pull_forward');

  return pullForward.map(s => {
    const current = parseInt(s.current_weekly_volume || 0);
    const target = parseInt(s.target_weekly_volume || 0);
    const deltaPerWeek = Math.max(0, target - current);
    const additionalAnnualCases = deltaPerWeek * 50; // ~50 working weeks/yr
    return {
      surgeon_name: s.surgeon_name,
      specialty: s.surgeon_specialty,
      current_weekly: current,
      target_weekly: target,
      delta_weekly: deltaPerWeek,
      additional_annual_cases: additionalAnnualCases,
      backlog_weeks: parseInt(s.backlog_weeks || 0),
      free_text_intel: s.free_text_intel,
      urgency_score: (s.backlog_weeks || 0) + deltaPerWeek * 5, // backlog + capacity gap
    };
  }).sort((a, b) => b.urgency_score - a.urgency_score);
}

// ─── 4. AGGREGATED COMMITMENT SUMMARY ─────────────────────────────────

function buildAggregatedSummary(surgeons, bedDaysData, pullForwardData, project) {
  const bedDayCost = peerService.bedDayCost(project?.state);

  const byCategory = {
    open_to_mis: { count: 0, cases: 0, revenue: 0 },
    pull_forward: { count: 0, cases: 0, revenue: 0 },
    training_pipeline: { count: 0, cases: 0, revenue: 0 },
  };

  for (const s of surgeons) {
    const cat = s.commitment_category || 'open_to_mis';
    const target = byCategory[cat] || byCategory.open_to_mis;
    target.count++;
    target.cases += parseInt(s.total_incremental_annual || 0);
    target.revenue += parseFloat(s.total_revenue_impact || 0);
  }

  const totalSurgeons = surgeons.length;
  const totalCases = surgeons.reduce((s, sg) => s + parseInt(sg.total_incremental_annual || 0), 0);
  const totalRevenue = surgeons.reduce((s, sg) => s + parseFloat(sg.total_revenue_impact || 0), 0);
  const totalBedDays = bedDaysData.reduce((s, b) => s + b.bed_days_saved, 0);
  const totalBedDayValue = totalBedDays * bedDayCost;
  const totalPullForwardCases = pullForwardData.reduce((s, p) => s + p.additional_annual_cases, 0);

  // Categorical breakdown for donut chart
  const composition = [
    { name: 'Open-to-MIS Conversion', value: byCategory.open_to_mis.count, cases: byCategory.open_to_mis.cases, color: '#dc2626' },
    { name: 'Splitter / Capacity', value: byCategory.pull_forward.count, cases: byCategory.pull_forward.cases, color: '#0891b2' },
    { name: 'Training Pipeline', value: byCategory.training_pipeline.count, cases: byCategory.training_pipeline.cases, color: '#7c3aed' },
  ].filter(c => c.value > 0);

  return {
    headline: `${totalSurgeons} surgeons · ${totalCases.toLocaleString()} cases/yr · ${totalBedDays.toLocaleString()} bed days saved · $${Math.round(totalRevenue / 1e6 * 10) / 10}M revenue + $${Math.round(totalBedDayValue / 1e6 * 10) / 10}M cost avoidance`,
    total_surgeons: totalSurgeons,
    total_incremental_cases: totalCases,
    total_revenue_impact: totalRevenue,
    total_bed_days_saved: totalBedDays,
    total_bed_day_value: totalBedDayValue,
    total_combined_impact: totalRevenue + totalBedDayValue,
    pull_forward_additional_cases: totalPullForwardCases,
    by_category: byCategory,
    composition,
    bed_day_cost_used: bedDayCost,
  };
}

// ─── COMPOSITE BUILDER ────────────────────────────────────────────────

async function buildSurgeonCommitmentsEnrichment({ projectId, models }) {
  const { IntuitiveProject, IntuitiveBusinessPlan, IntuitiveSurgeonCommitment } = models;
  if (!IntuitiveProject) throw new Error('IntuitiveProject model not available');

  const project = await IntuitiveProject.findByPk(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  // Pull latest business plan + surgeons
  let plan = null;
  let surgeons = [];
  try {
    plan = await IntuitiveBusinessPlan.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']], raw: true });
    if (plan) {
      surgeons = await IntuitiveSurgeonCommitment.findAll({
        where: { business_plan_id: plan.id },
        raw: true,
      });
    }
  } catch (e) { console.error('[surgeon-commitments] load error:', e.message); }

  const masterTable = buildMasterSurgeonTable(surgeons);
  const bedDaysData = buildPerSurgeonBedDays(surgeons, project);
  const pullForwardData = buildPullForwardCapacity(surgeons);
  const summary = buildAggregatedSummary(surgeons, bedDaysData, pullForwardData, project);

  return {
    project_id: projectId,
    plan_id: plan?.id || null,
    hospital_name: project.hospital_name,
    master_table: masterTable,
    per_surgeon_bed_days: bedDaysData,
    pull_forward_capacity: pullForwardData,
    summary,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildSurgeonCommitmentsEnrichment,
  buildMasterSurgeonTable,
  buildPerSurgeonBedDays,
  buildPullForwardCapacity,
  buildAggregatedSummary,
  LOS_DELTA_BY_PROCEDURE,
};
