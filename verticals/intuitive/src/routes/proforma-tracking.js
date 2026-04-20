'use strict';
const router = require('express').Router();

// POST /api/v1/tracking/:planId/actuals - Import actuals for a period
router.post('/:planId/actuals', async (req, res) => {
  try {
    const { IntuitivePlanActual, IntuitiveBusinessPlan, IntuitiveSurgeonCommitment } = req.models;
    const plan = await IntuitiveBusinessPlan.findByPk(req.params.planId);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });

    const { period_start, period_end, period_label, surgeon_actuals, imported_by, import_source, notes } = req.body;
    if (!period_start || !period_end) {
      return res.status(400).json({ error: 'period_start and period_end required' });
    }

    // Get projected surgeon volumes from commitments
    const commitments = await IntuitiveSurgeonCommitment.findAll({
      where: { business_plan_id: plan.id }
    });

    // Calculate period length in months for prorating annual projections
    const startDate = new Date(period_start);
    const endDate = new Date(period_end);
    const periodMonths = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24 * 30.44));

    // Build surgeon actuals with projected comparison
    const actuals = (surgeon_actuals || []).map(sa => {
      const commitment = commitments.find(c =>
        c.surgeon_name.toLowerCase() === (sa.surgeon_name || '').toLowerCase()
      );
      const projectedAnnual = commitment ? commitment.total_incremental_annual : 0;
      const projectedForPeriod = Math.round(projectedAnnual * (periodMonths / 12));
      const actualCases = sa.actual_cases || 0;
      const variance = actualCases - projectedForPeriod;
      const variancePct = projectedForPeriod > 0 ? Math.round((variance / projectedForPeriod) * 100) : 0;

      return {
        surgeon_name: sa.surgeon_name,
        procedure_type: sa.procedure_type || 'all',
        actual_cases: actualCases,
        projected_cases: projectedForPeriod,
        variance,
        variance_pct: variancePct
      };
    });

    const totalActual = actuals.reduce((s, a) => s + (a.actual_cases || 0), 0);
    const totalProjected = actuals.reduce((s, a) => s + (a.projected_cases || 0), 0);
    const totalVariance = totalActual - totalProjected;
    const variancePct = totalProjected > 0 ? Math.round((totalVariance / totalProjected) * 100) : 0;

    const actual = await IntuitivePlanActual.create({
      business_plan_id: plan.id,
      period_start, period_end,
      period_label: period_label || null,
      surgeon_actuals: actuals,
      total_actual_cases: totalActual,
      total_projected_cases: totalProjected,
      total_variance: totalVariance,
      variance_pct: variancePct,
      imported_by: imported_by || null,
      import_source: import_source || 'manual',
      notes: notes || null
    });

    // Update plan status to tracking if it's finalized
    if (plan.status === 'finalized') {
      await plan.update({ status: 'tracking' });
    }

    res.status(201).json({ success: true, data: actual });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/tracking/:planId/actuals - Get all actuals
router.get('/:planId/actuals', async (req, res) => {
  try {
    const { IntuitivePlanActual } = req.models;
    const actuals = await IntuitivePlanActual.findAll({
      where: { business_plan_id: req.params.planId },
      order: [['period_start', 'ASC']]
    });
    res.json({ success: true, data: actuals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/tracking/:planId/comparison - Full proforma vs actual comparison
router.get('/:planId/comparison', async (req, res) => {
  try {
    const { IntuitivePlanActual, IntuitiveBusinessPlan, IntuitiveSurgeonCommitment } = req.models;
    const plan = await IntuitiveBusinessPlan.findByPk(req.params.planId);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });

    const actuals = await IntuitivePlanActual.findAll({
      where: { business_plan_id: plan.id },
      order: [['period_start', 'ASC']]
    });

    const commitments = await IntuitiveSurgeonCommitment.findAll({
      where: { business_plan_id: plan.id }
    });

    // Cumulative tracking
    let cumulativeActual = 0;
    let cumulativeProjected = 0;
    const timeline = actuals.map(a => {
      cumulativeActual += a.total_actual_cases || 0;
      cumulativeProjected += a.total_projected_cases || 0;
      return {
        period_label: a.period_label || `${a.period_start} to ${a.period_end}`,
        period_start: a.period_start,
        period_end: a.period_end,
        actual_cases: a.total_actual_cases,
        projected_cases: a.total_projected_cases,
        variance: a.total_variance,
        variance_pct: a.variance_pct,
        cumulative_actual: cumulativeActual,
        cumulative_projected: cumulativeProjected,
        cumulative_variance_pct: cumulativeProjected > 0
          ? Math.round(((cumulativeActual - cumulativeProjected) / cumulativeProjected) * 100) : 0
      };
    });

    // Per-surgeon tracking across all periods
    const surgeonMap = {};
    for (const c of commitments) {
      surgeonMap[c.surgeon_name.toLowerCase()] = {
        surgeon_name: c.surgeon_name,
        projected_annual: c.total_incremental_annual,
        projected_revenue: parseFloat(c.total_revenue_impact) || 0,
        total_actual: 0,
        periods_tracked: 0
      };
    }

    for (const a of actuals) {
      for (const sa of (a.surgeon_actuals || [])) {
        const key = (sa.surgeon_name || '').toLowerCase();
        if (surgeonMap[key]) {
          surgeonMap[key].total_actual += sa.actual_cases || 0;
          surgeonMap[key].periods_tracked++;
        }
      }
    }

    const surgeonTracking = Object.values(surgeonMap).map(s => ({
      ...s,
      variance: s.total_actual - Math.round(s.projected_annual * (actuals.length > 0 ? 1 : 0)),
      on_track: actuals.length > 0 ? (s.total_actual / Math.max(1, s.projected_annual)) >= 0.8 : null
    }));

    // ROI tracking
    const projectedAnnualROI = parseFloat(plan.total_combined_roi) || 0;
    const actualRevenueEstimate = cumulativeActual * (projectedAnnualROI / Math.max(1, plan.total_incremental_cases_annual || 1));
    const roiTrackingPct = projectedAnnualROI > 0 ? Math.round((actualRevenueEstimate / projectedAnnualROI) * 100) : 0;

    res.json({
      success: true,
      data: {
        plan_name: plan.plan_name,
        plan_status: plan.status,
        system_type: plan.system_type,
        timeline,
        surgeon_tracking: surgeonTracking,
        summary: {
          total_periods: actuals.length,
          cumulative_actual_cases: cumulativeActual,
          cumulative_projected_cases: cumulativeProjected,
          overall_variance_pct: cumulativeProjected > 0
            ? Math.round(((cumulativeActual - cumulativeProjected) / cumulativeProjected) * 100) : 0,
          projected_annual_roi: projectedAnnualROI,
          estimated_actual_roi: Math.round(actualRevenueEstimate),
          roi_tracking_pct: roiTrackingPct
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/tracking/:planId/snapshot - Take a snapshot
router.post('/:planId/snapshot', async (req, res) => {
  try {
    const { IntuitivePlanSnapshot, IntuitiveBusinessPlan, IntuitivePlanActual,
            IntuitiveSurgeonCommitment, IntuitiveClinicalOutcome } = req.models;
    const plan = await IntuitiveBusinessPlan.findByPk(req.params.planId);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });

    const commitments = await IntuitiveSurgeonCommitment.findAll({ where: { business_plan_id: plan.id } });
    const clinicalOutcomes = await IntuitiveClinicalOutcome.findAll({ where: { business_plan_id: plan.id } });
    const actuals = await IntuitivePlanActual.findAll({ where: { business_plan_id: plan.id } });

    const cumulativeActual = actuals.reduce((s, a) => s + (a.total_actual_cases || 0), 0);
    const cumulativeProjected = actuals.reduce((s, a) => s + (a.total_projected_cases || 0), 0);

    const snapshot = await IntuitivePlanSnapshot.create({
      business_plan_id: plan.id,
      snapshot_date: req.body.snapshot_date || new Date().toISOString().split('T')[0],
      plan_data: {
        plan: plan.toJSON(),
        surgeon_commitments: commitments.map(c => c.toJSON()),
        clinical_outcomes: clinicalOutcomes.map(c => c.toJSON()),
        actuals_count: actuals.length
      },
      cumulative_actual_cases: cumulativeActual,
      cumulative_projected_cases: cumulativeProjected,
      cumulative_variance_pct: cumulativeProjected > 0
        ? Math.round(((cumulativeActual - cumulativeProjected) / cumulativeProjected) * 100) : null,
      roi_tracking_pct: null,
      notes: req.body.notes || null
    });

    res.status(201).json({ success: true, data: snapshot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/tracking/:planId/snapshots
router.get('/:planId/snapshots', async (req, res) => {
  try {
    const { IntuitivePlanSnapshot } = req.models;
    const snapshots = await IntuitivePlanSnapshot.findAll({
      where: { business_plan_id: req.params.planId },
      order: [['snapshot_date', 'ASC']]
    });
    res.json({ success: true, data: snapshots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/tracking/:planId/executive-summary - Generate exec summary
router.get('/:planId/executive-summary', async (req, res) => {
  try {
    const { IntuitiveBusinessPlan, IntuitiveSurgeonCommitment, IntuitiveClinicalOutcome,
            IntuitivePlanActual, IntuitiveProject } = req.models;
    const plan = await IntuitiveBusinessPlan.findByPk(req.params.planId);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });

    const project = await IntuitiveProject.findByPk(plan.project_id);
    const commitments = await IntuitiveSurgeonCommitment.findAll({ where: { business_plan_id: plan.id } });
    const clinicalOutcomes = await IntuitiveClinicalOutcome.findAll({ where: { business_plan_id: plan.id } });
    const actuals = await IntuitivePlanActual.findAll({
      where: { business_plan_id: plan.id },
      order: [['period_start', 'ASC']]
    });

    const cumulativeActual = actuals.reduce((s, a) => s + (a.total_actual_cases || 0), 0);
    const cumulativeProjected = actuals.reduce((s, a) => s + (a.total_projected_cases || 0), 0);
    const fmt = n => n != null ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--';

    const summary = {
      hospital_name: project ? project.hospital_name : '--',
      plan_name: plan.plan_name,
      system_type: plan.system_type,
      system_quantity: plan.system_quantity,
      prepared_by: plan.prepared_by,
      prepared_for: plan.prepared_for,
      status: plan.status,
      surgeon_count: commitments.length,
      committed_surgeons: commitments.filter(c => c.status === 'confirmed').length,
      total_incremental_cases: plan.total_incremental_cases_annual,
      total_incremental_revenue: `$${fmt(plan.total_incremental_revenue)}`,
      total_clinical_savings: `$${fmt(plan.total_clinical_outcome_savings)}`,
      total_combined_roi: `$${fmt(plan.total_combined_roi)}`,
      payback_months: plan.payback_months,
      tracking: actuals.length > 0 ? {
        periods_tracked: actuals.length,
        cumulative_actual_cases: cumulativeActual,
        cumulative_projected_cases: cumulativeProjected,
        variance_pct: cumulativeProjected > 0
          ? Math.round(((cumulativeActual - cumulativeProjected) / cumulativeProjected) * 100) : 0,
        status: cumulativeActual >= cumulativeProjected * 0.9 ? 'On Track' :
                cumulativeActual >= cumulativeProjected * 0.7 ? 'At Risk' : 'Below Target'
      } : null
    };

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
