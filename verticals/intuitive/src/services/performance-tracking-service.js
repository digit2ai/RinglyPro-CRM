'use strict';

/**
 * Performance Tracking Enrichment Service (Step 9 — final step)
 *
 * Post-go-live tracking: compare what was promised in the Business Plan
 * to what's actually happening once systems are deployed.
 *
 *   1. Plan vs Actual Variance Table (per-KPI)
 *   2. Quarterly Utilization Tracking (per-system)
 *   3. Surgeon Performance Tracking (per-surgeon actuals vs commitments)
 *   4. Alert / Variance Watch List (ranked by intervention urgency)
 */

// Variance thresholds for alert flagging
const VARIANCE_GREEN_PCT = 5;    // within ±5% of plan = green
const VARIANCE_YELLOW_PCT = 15;  // within ±15% = yellow
// > 15% off plan = red

function classifyVariance(plan, actual) {
  if (!plan || plan === 0) return 'no_plan';
  const pct = ((actual - plan) / plan) * 100;
  const absPct = Math.abs(pct);
  if (absPct <= VARIANCE_GREEN_PCT) return 'green';
  if (absPct <= VARIANCE_YELLOW_PCT) return 'yellow';
  return pct < 0 ? 'red_under' : 'red_over';
}

// ─── 1. PLAN VS ACTUAL VARIANCE TABLE ─────────────────────────────────

function buildPlanVsActualVariance(plan, actuals = []) {
  const monthsElapsed = actuals.length;
  const annualProRata = monthsElapsed / 12;

  // Aggregate actuals
  const actualCases = actuals.reduce((s, a) => s + parseInt(a.actual_cases || 0), 0);
  const actualRevenue = actuals.reduce((s, a) => s + parseFloat(a.actual_revenue || 0), 0);
  const actualClinical = actuals.reduce((s, a) => s + parseFloat(a.actual_clinical_savings || 0), 0);

  // Pro-rated plan values (what should have been achieved in this many months)
  const planCases = (plan?.total_incremental_cases_annual || 0) * annualProRata;
  const planRevenue = parseFloat(plan?.total_incremental_revenue || 0) * annualProRata;
  const planClinical = parseFloat(plan?.total_clinical_outcome_savings || 0) * annualProRata;

  const metrics = [
    {
      metric: 'Incremental Cases',
      plan: Math.round(planCases),
      actual: actualCases,
      variance: actualCases - Math.round(planCases),
      variance_pct: planCases > 0 ? Math.round(((actualCases - planCases) / planCases) * 1000) / 10 : 0,
      status: classifyVariance(planCases, actualCases),
      unit: 'cases',
    },
    {
      metric: 'Incremental Revenue',
      plan: Math.round(planRevenue),
      actual: Math.round(actualRevenue),
      variance: Math.round(actualRevenue - planRevenue),
      variance_pct: planRevenue > 0 ? Math.round(((actualRevenue - planRevenue) / planRevenue) * 1000) / 10 : 0,
      status: classifyVariance(planRevenue, actualRevenue),
      unit: '$',
    },
    {
      metric: 'Clinical Cost Avoidance',
      plan: Math.round(planClinical),
      actual: Math.round(actualClinical),
      variance: Math.round(actualClinical - planClinical),
      variance_pct: planClinical > 0 ? Math.round(((actualClinical - planClinical) / planClinical) * 1000) / 10 : 0,
      status: classifyVariance(planClinical, actualClinical),
      unit: '$',
    },
  ];

  const onTrack = metrics.filter(m => m.status === 'green').length;
  const atRisk = metrics.filter(m => m.status === 'yellow').length;
  const offTrack = metrics.filter(m => m.status === 'red_under' || m.status === 'red_over').length;

  return {
    months_elapsed: monthsElapsed,
    has_actuals: monthsElapsed > 0,
    metrics,
    on_track_count: onTrack,
    at_risk_count: atRisk,
    off_track_count: offTrack,
    headline: monthsElapsed > 0
      ? `${monthsElapsed} months of actuals tracked · ${onTrack} on-track · ${atRisk} at-risk · ${offTrack} off-track`
      : 'No actuals ingested yet — baseline mode',
  };
}

// ─── 2. QUARTERLY UTILIZATION TRACKING ────────────────────────────────

function buildQuarterlyUtilization(plan, actuals = [], project) {
  // Build per-quarter view: planned cases vs actual cases per system
  const systems = parseInt(project?.current_system_count || plan?.system_quantity || 4);
  const annualPlanCases = parseInt(plan?.total_incremental_cases_annual || 1000);

  // Group actuals by quarter
  const byQuarter = {};
  for (const a of actuals) {
    const date = new Date(a.period_start || a.period || Date.now());
    const yr = date.getFullYear();
    const q = `Q${Math.floor(date.getMonth() / 3) + 1}`;
    const key = `${q} ${yr}`;
    if (!byQuarter[key]) byQuarter[key] = { quarter: key, actual_cases: 0, plan_cases: Math.round(annualPlanCases / 4) };
    byQuarter[key].actual_cases += parseInt(a.actual_cases || 0);
  }

  const quarters = Object.values(byQuarter).sort((a, b) => a.quarter.localeCompare(b.quarter));

  // If no actuals: synthesize "what tracking would look like" placeholder showing plan trajectory
  if (quarters.length === 0) {
    const currentYear = new Date().getFullYear();
    for (let q = 1; q <= 4; q++) {
      quarters.push({
        quarter: `Q${q} ${currentYear}`,
        plan_cases: Math.round(annualPlanCases / 4),
        actual_cases: 0,
      });
    }
  }

  // Per-system utilization
  const perSystem = [];
  const academicAvgPerQtr = 77;
  for (let i = 0; i < systems; i++) {
    const planPerSystemQtr = Math.round((annualPlanCases / 4) / systems);
    const lastQuarter = quarters[quarters.length - 1] || {};
    const actualPerSystem = Math.round((lastQuarter.actual_cases || 0) / systems);
    perSystem.push({
      system_id: `SK${(1800 + i * 100).toString().padStart(4, '0')}`,
      plan_per_qtr: planPerSystemQtr,
      actual_per_qtr: actualPerSystem,
      academic_avg: academicAvgPerQtr,
      utilization_pct: actualPerSystem > 0 ? Math.round((actualPerSystem / academicAvgPerQtr) * 100) : null,
    });
  }

  return {
    quarters,
    per_system: perSystem,
    academic_avg_per_qtr: academicAvgPerQtr,
    headline: actuals.length > 0
      ? `Tracking across ${quarters.length} quarters, ${systems} systems · Academic avg ${academicAvgPerQtr} cases/qtr`
      : `Baseline trajectory shown · ${quarters.length} quarters projected at ${Math.round(annualPlanCases / 4)} cases/qtr`,
  };
}

// ─── 3. SURGEON PERFORMANCE TRACKING ──────────────────────────────────

function buildSurgeonPerformance(surgeons, actuals = []) {
  // Aggregate per-surgeon actuals if surgeon-level data exists
  const actualsBySurgeonName = {};
  for (const a of actuals) {
    const name = (a.surgeon_name || '').toLowerCase().trim();
    if (!name) continue;
    if (!actualsBySurgeonName[name]) actualsBySurgeonName[name] = 0;
    actualsBySurgeonName[name] += parseInt(a.actual_cases || 0);
  }

  const monthsElapsed = actuals.length > 0 ? Math.max(1, new Set(actuals.map(a => (a.period_start || '').slice(0, 7))).size) : 0;
  const annualProRata = monthsElapsed / 12;

  const rows = surgeons.map(s => {
    const name = (s.surgeon_name || '').toLowerCase().trim();
    const committedAnnual = parseInt(s.total_incremental_annual || 0);
    const planToDate = Math.round(committedAnnual * annualProRata);
    const actualToDate = actualsBySurgeonName[name] || 0;
    const variance = actualToDate - planToDate;
    const variancePct = planToDate > 0 ? Math.round((variance / planToDate) * 1000) / 10 : 0;
    return {
      surgeon_name: s.surgeon_name,
      specialty: s.surgeon_specialty,
      commitment_category: s.commitment_category,
      committed_annual: committedAnnual,
      plan_to_date: planToDate,
      actual_to_date: actualToDate,
      variance,
      variance_pct: variancePct,
      status: monthsElapsed > 0 ? classifyVariance(planToDate, actualToDate) : 'baseline',
    };
  }).sort((a, b) => b.committed_annual - a.committed_annual);

  const onTrack = rows.filter(r => r.status === 'green').length;
  const atRisk = rows.filter(r => r.status === 'yellow').length;
  const offTrack = rows.filter(r => r.status === 'red_under' || r.status === 'red_over').length;

  return {
    surgeons: rows,
    months_elapsed: monthsElapsed,
    on_track: onTrack,
    at_risk: atRisk,
    off_track: offTrack,
    headline: monthsElapsed > 0
      ? `${rows.length} surgeons tracked · ${onTrack} on-track · ${atRisk} at-risk · ${offTrack} off-track at month ${monthsElapsed}`
      : `${rows.length} surgeons committed · No actuals yet`,
  };
}

// ─── 4. ALERT / VARIANCE WATCH LIST ───────────────────────────────────

function buildVarianceWatchList(planVsActual, surgeonPerformance) {
  const alerts = [];

  // KPI-level alerts
  for (const m of planVsActual.metrics) {
    if (m.status === 'red_under') {
      alerts.push({
        type: 'kpi_under',
        severity: 'critical',
        target: m.metric,
        variance_pct: m.variance_pct,
        recommendation: `${m.metric} is ${Math.abs(m.variance_pct)}% below plan. Investigate root cause: surgeon adoption rate, OR scheduling, or referral pipeline.`,
      });
    } else if (m.status === 'yellow') {
      alerts.push({
        type: 'kpi_at_risk',
        severity: 'warning',
        target: m.metric,
        variance_pct: m.variance_pct,
        recommendation: `${m.metric} variance ${m.variance_pct}% — monitor next cycle, review if variance widens.`,
      });
    }
  }

  // Surgeon-level alerts
  for (const s of surgeonPerformance.surgeons) {
    if (s.status === 'red_under' && s.committed_annual >= 30) {
      alerts.push({
        type: 'surgeon_under',
        severity: 'critical',
        target: s.surgeon_name,
        specialty: s.specialty,
        variance_pct: s.variance_pct,
        committed: s.committed_annual,
        actual: s.actual_to_date,
        recommendation: `${s.surgeon_name} ${Math.abs(s.variance_pct)}% below commitment. Schedule check-in to address barriers (scheduling, training, infrastructure).`,
      });
    } else if (s.status === 'yellow' && s.committed_annual >= 30) {
      alerts.push({
        type: 'surgeon_at_risk',
        severity: 'warning',
        target: s.surgeon_name,
        specialty: s.specialty,
        variance_pct: s.variance_pct,
        recommendation: `${s.surgeon_name} drifting from commitment — proactive outreach recommended.`,
      });
    }
  }

  // Sort by severity (critical first)
  alerts.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1;
    if (b.severity === 'critical' && a.severity !== 'critical') return 1;
    return Math.abs(b.variance_pct || 0) - Math.abs(a.variance_pct || 0);
  });

  return {
    alerts,
    critical_count: alerts.filter(a => a.severity === 'critical').length,
    warning_count: alerts.filter(a => a.severity === 'warning').length,
    headline: alerts.length > 0
      ? `${alerts.length} alerts · ${alerts.filter(a => a.severity === 'critical').length} critical · ${alerts.filter(a => a.severity === 'warning').length} warnings`
      : 'No alerts — all metrics on track',
  };
}

// ─── COMPOSITE BUILDER ────────────────────────────────────────────────

async function buildPerformanceTrackingEnrichment({ projectId, models }) {
  const { IntuitiveProject, IntuitiveBusinessPlan, IntuitiveSurgeonCommitment, IntuitivePlanActual } = models;
  if (!IntuitiveProject) throw new Error('IntuitiveProject model not available');

  const project = await IntuitiveProject.findByPk(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  let plan = null;
  let surgeons = [];
  let actuals = [];

  try {
    plan = await IntuitiveBusinessPlan.findOne({
      where: { project_id: projectId },
      order: [['created_at', 'DESC']],
      raw: true,
    });
    if (plan) {
      surgeons = await IntuitiveSurgeonCommitment.findAll({
        where: { business_plan_id: plan.id },
        raw: true,
      });
      if (IntuitivePlanActual) {
        try {
          actuals = await IntuitivePlanActual.findAll({
            where: { business_plan_id: plan.id },
            order: [['period_start', 'ASC']],
            raw: true,
          });
        } catch (e) { /* no actuals table or no rows */ }
      }
    }
  } catch (e) { console.error('[performance-tracking] load error:', e.message); }

  const planVsActual = buildPlanVsActualVariance(plan, actuals);
  const utilization = buildQuarterlyUtilization(plan, actuals, project);
  const surgeonPerformance = buildSurgeonPerformance(surgeons, actuals);
  const watchList = buildVarianceWatchList(planVsActual, surgeonPerformance);

  return {
    project_id: projectId,
    plan_id: plan?.id || null,
    hospital_name: project.hospital_name,
    plan_vs_actual: planVsActual,
    utilization,
    surgeon_performance: surgeonPerformance,
    watch_list: watchList,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildPerformanceTrackingEnrichment,
  buildPlanVsActualVariance,
  buildQuarterlyUtilization,
  buildSurgeonPerformance,
  buildVarianceWatchList,
  classifyVariance,
};
