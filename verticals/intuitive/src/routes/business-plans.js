'use strict';
const router = require('express').Router();

// POST /api/v1/business-plans - Create a business plan
router.post('/', async (req, res) => {
  try {
    const { IntuitiveBusinessPlan, IntuitiveProject } = req.models;
    const { project_id, plan_name, system_type, system_price, annual_service_cost, system_quantity,
            acquisition_model, prepared_by, prepared_for, presentation_date, notes } = req.body;

    if (!project_id || !plan_name || !system_type) {
      return res.status(400).json({ error: 'project_id, plan_name, and system_type are required' });
    }

    const project = await IntuitiveProject.findByPk(project_id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const plan = await IntuitiveBusinessPlan.create({
      project_id, plan_name, system_type,
      system_price: system_price || null,
      annual_service_cost: annual_service_cost || null,
      system_quantity: system_quantity || 1,
      acquisition_model: acquisition_model || 'purchase',
      prepared_by, prepared_for, presentation_date, notes
    });

    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    console.error('BusinessPlan create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/business-plans - List all plans (optionally filter by project_id)
router.get('/', async (req, res) => {
  try {
    const { IntuitiveBusinessPlan } = req.models;
    const where = {};
    if (req.query.project_id) where.project_id = parseInt(req.query.project_id);
    if (req.query.status) where.status = req.query.status;

    const plans = await IntuitiveBusinessPlan.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/business-plans/:id - Get a plan with all related data
router.get('/:id', async (req, res) => {
  try {
    const { IntuitiveBusinessPlan, IntuitiveSurgeonCommitment, IntuitiveClinicalOutcome,
            IntuitivePlanActual, IntuitivePlanSnapshot, IntuitiveSurvey } = req.models;

    const plan = await IntuitiveBusinessPlan.findByPk(req.params.id, {
      include: [
        { model: IntuitiveSurgeonCommitment, as: 'surgeonCommitments', order: [['created_at', 'ASC']] },
        { model: IntuitiveClinicalOutcome, as: 'clinicalOutcomes' },
        { model: IntuitivePlanActual, as: 'actuals', order: [['period_start', 'ASC']] },
        { model: IntuitivePlanSnapshot, as: 'snapshots', order: [['snapshot_date', 'ASC']] },
        { model: IntuitiveSurvey, as: 'surveys' }
      ]
    });

    if (!plan) return res.status(404).json({ error: 'Business plan not found' });
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/business-plans/:id - Update a plan
router.patch('/:id', async (req, res) => {
  try {
    const { IntuitiveBusinessPlan } = req.models;
    const plan = await IntuitiveBusinessPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });

    const allowedFields = ['plan_name', 'system_type', 'system_price', 'annual_service_cost',
      'system_quantity', 'acquisition_model', 'prepared_by', 'prepared_for', 'presentation_date',
      'notes', 'status'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.status === 'finalized') updates.finalized_at = new Date();

    await plan.update(updates);
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/business-plans/:planId/calculate - Recalculate all totals
router.post('/:planId/calculate', async (req, res) => {
  try {
    const { IntuitiveBusinessPlan, IntuitiveSurgeonCommitment, IntuitiveClinicalOutcome } = req.models;
    const plan = await IntuitiveBusinessPlan.findByPk(req.params.planId);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });

    // Sum surgeon commitments
    const commitments = await IntuitiveSurgeonCommitment.findAll({
      where: { business_plan_id: plan.id }
    });
    let totalCases = 0;
    let totalRevenue = 0;
    for (const c of commitments) {
      totalCases += c.total_incremental_annual || 0;
      totalRevenue += parseFloat(c.total_revenue_impact) || 0;
    }

    // Sum clinical outcome savings
    const clinicalOutcomes = await IntuitiveClinicalOutcome.findAll({
      where: { business_plan_id: plan.id }
    });
    let totalClinicalSavings = 0;
    for (const co of clinicalOutcomes) {
      totalClinicalSavings += parseFloat(co.total_clinical_savings_annual) || 0;
    }

    const totalCombinedROI = totalRevenue + totalClinicalSavings;

    // Calculate payback
    const systemCost = (parseFloat(plan.system_price) || 0) * (plan.system_quantity || 1);
    const annualServiceCost = parseFloat(plan.annual_service_cost) || 0;
    const annualCost = plan.acquisition_model === 'purchase' ? annualServiceCost : annualServiceCost;
    const annualNetBenefit = totalCombinedROI - annualCost;
    const paybackMonths = systemCost > 0 && annualNetBenefit > 0
      ? Math.ceil((systemCost / annualNetBenefit) * 12) : null;
    const fiveYearNet = (annualNetBenefit * 5) - (plan.acquisition_model === 'purchase' ? systemCost : 0);

    await plan.update({
      total_incremental_cases_annual: totalCases,
      total_incremental_revenue: totalRevenue,
      total_clinical_outcome_savings: totalClinicalSavings,
      total_combined_roi: totalCombinedROI,
      payback_months: paybackMonths,
      five_year_net_benefit: fiveYearNet
    });

    res.json({
      success: true,
      data: {
        total_incremental_cases_annual: totalCases,
        total_incremental_revenue: totalRevenue,
        total_clinical_outcome_savings: totalClinicalSavings,
        total_combined_roi: totalCombinedROI,
        payback_months: paybackMonths,
        five_year_net_benefit: fiveYearNet,
        surgeon_count: commitments.length
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/business-plans/:id
router.delete('/:id', async (req, res) => {
  try {
    const { IntuitiveBusinessPlan } = req.models;
    const plan = await IntuitiveBusinessPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });
    await plan.destroy();
    res.json({ success: true, message: 'Plan deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SURGEON COMMITMENTS (nested under business plan) ---

// POST /api/v1/business-plans/:planId/surgeons
router.post('/:planId/surgeons', async (req, res) => {
  try {
    const { IntuitiveSurgeonCommitment, IntuitiveBusinessPlan } = req.models;
    const plan = await IntuitiveBusinessPlan.findByPk(req.params.planId);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });

    const { surgeon_name, surgeon_email, surgeon_phone, surgeon_specialty,
            hospital_affiliation, procedures, source } = req.body;

    if (!surgeon_name) return res.status(400).json({ error: 'surgeon_name is required' });

    // Calculate totals from procedures
    const procs = procedures || [];
    let totalAnnual = 0;
    let totalRevenue = 0;
    for (const p of procs) {
      const annual = (p.incremental_cases_monthly || 0) * 12;
      p.incremental_cases_annual = annual;
      totalAnnual += annual;
      totalRevenue += annual * (p.reimbursement_rate || 0);
    }

    const commitment = await IntuitiveSurgeonCommitment.create({
      business_plan_id: plan.id,
      project_id: plan.project_id,
      surgeon_name, surgeon_email, surgeon_phone, surgeon_specialty,
      hospital_affiliation,
      procedures: procs,
      total_incremental_annual: totalAnnual,
      total_revenue_impact: totalRevenue,
      source: source || 'manual'
    });

    res.status(201).json({ success: true, data: commitment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/business-plans/:planId/surgeons
router.get('/:planId/surgeons', async (req, res) => {
  try {
    const { IntuitiveSurgeonCommitment } = req.models;
    const commitments = await IntuitiveSurgeonCommitment.findAll({
      where: { business_plan_id: req.params.planId },
      order: [['created_at', 'ASC']]
    });
    res.json({ success: true, data: commitments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/business-plans/:planId/surgeons/:id
router.patch('/:planId/surgeons/:id', async (req, res) => {
  try {
    const { IntuitiveSurgeonCommitment } = req.models;
    const commitment = await IntuitiveSurgeonCommitment.findOne({
      where: { id: req.params.id, business_plan_id: req.params.planId }
    });
    if (!commitment) return res.status(404).json({ error: 'Surgeon commitment not found' });

    const updates = {};
    const fields = ['surgeon_name', 'surgeon_email', 'surgeon_phone', 'surgeon_specialty',
                    'hospital_affiliation', 'procedures', 'source', 'status'];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    // Recalculate if procedures changed
    if (updates.procedures) {
      let totalAnnual = 0;
      let totalRevenue = 0;
      for (const p of updates.procedures) {
        const annual = (p.incremental_cases_monthly || 0) * 12;
        p.incremental_cases_annual = annual;
        totalAnnual += annual;
        totalRevenue += annual * (p.reimbursement_rate || 0);
      }
      updates.total_incremental_annual = totalAnnual;
      updates.total_revenue_impact = totalRevenue;
    }

    if (updates.status === 'confirmed') updates.confirmed_at = new Date();

    await commitment.update(updates);
    res.json({ success: true, data: commitment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/business-plans/:planId/surgeons/:id
router.delete('/:planId/surgeons/:id', async (req, res) => {
  try {
    const { IntuitiveSurgeonCommitment } = req.models;
    const commitment = await IntuitiveSurgeonCommitment.findOne({
      where: { id: req.params.id, business_plan_id: req.params.planId }
    });
    if (!commitment) return res.status(404).json({ error: 'Surgeon commitment not found' });
    await commitment.destroy();
    res.json({ success: true, message: 'Surgeon commitment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
