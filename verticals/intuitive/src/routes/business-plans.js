'use strict';
const router = require('express').Router();
const autoSeed = require('../services/auto-seed-commitments');

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

// POST /api/v1/business-plans/:planId/auto-seed
// Auto-seed surgeon commitments from analysis cache + Care Compare + MPUP
// Idempotent: skips surgeons already on the plan (manual + survey wins over auto-seed)
router.post('/:planId/auto-seed', async (req, res) => {
  try {
    const result = await autoSeed.autoSeedForPlan(req.params.planId, { models: req.models });

    // After seeding, recalc plan totals so the UI immediately reflects the new commitments
    if (result.success && result.seeded > 0) {
      try {
        const { IntuitiveBusinessPlan, IntuitiveSurgeonCommitment, IntuitiveClinicalOutcome } = req.models;
        const plan = await IntuitiveBusinessPlan.findByPk(req.params.planId);
        if (plan) {
          const commitments = await IntuitiveSurgeonCommitment.findAll({ where: { business_plan_id: plan.id } });
          const clinicalOutcomes = await IntuitiveClinicalOutcome.findAll({ where: { business_plan_id: plan.id } });
          const totalCases = commitments.reduce((s, c) => s + (c.total_incremental_annual || 0), 0);
          const totalRevenue = commitments.reduce((s, c) => s + parseFloat(c.total_revenue_impact || 0), 0);
          const totalClinicalSavings = clinicalOutcomes.reduce((s, c) => s + parseFloat(c.total_clinical_savings_annual || 0), 0);
          const totalROI = totalRevenue + totalClinicalSavings;
          const systemCost = (parseFloat(plan.system_price) || 0) * (plan.system_quantity || 1);
          const annualNet = totalROI - (parseFloat(plan.annual_service_cost) || 0);
          const payback = systemCost > 0 && annualNet > 0 ? Math.ceil((systemCost / annualNet) * 12) : null;
          const fiveYearNet = (annualNet * 5) - (plan.acquisition_model === 'purchase' ? systemCost : 0);
          await plan.update({
            total_incremental_cases_annual: totalCases,
            total_incremental_revenue: totalRevenue,
            total_clinical_outcome_savings: totalClinicalSavings,
            total_combined_roi: totalROI,
            payback_months: payback,
            five_year_net_benefit: fiveYearNet,
          });
          result.plan_totals = {
            total_incremental_cases_annual: totalCases,
            total_incremental_revenue: totalRevenue,
            total_clinical_outcome_savings: totalClinicalSavings,
            total_combined_roi: totalROI,
            payback_months: payback,
            five_year_net_benefit: fiveYearNet,
          };
        }
      } catch (calcErr) {
        console.error('[auto-seed] post-seed recalc error:', calcErr.message);
      }
    }

    res.json({ success: result.success, data: result });
  } catch (err) {
    console.error('Auto-seed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/business-plans/generate-from-analysis
// One-shot: create plan + auto-seed commitments + calculate.
// Body: { project_id, plan_name?, prepared_by? }
router.post('/generate-from-analysis', async (req, res) => {
  try {
    const { IntuitiveBusinessPlan, IntuitiveProject, IntuitiveAnalysisResult, IntuitiveSystemRecommendation } = req.models;
    const { project_id, plan_name, prepared_by } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    const project = await IntuitiveProject.findByPk(project_id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Pull system pick from primary system_recommendation (or model_matching analysis result)
    let systemType = null;
    let systemPrice = null;
    let systemQuantity = 1;
    let annualServiceCost = null;
    let acquisitionModel = 'purchase';

    try {
      const primaryRec = await IntuitiveSystemRecommendation.findOne({
        where: { project_id, is_primary: true },
        order: [['fit_score', 'DESC']],
      });
      if (primaryRec) {
        systemType = primaryRec.system_model;
        systemPrice = primaryRec.estimated_price;
        systemQuantity = primaryRec.quantity || 1;
        annualServiceCost = primaryRec.estimated_annual_cost;
        acquisitionModel = primaryRec.acquisition_model || 'purchase';
      }
    } catch (e) { /* fall through */ }

    // Fallback to model_matching cached analysis
    if (!systemType) {
      try {
        const row = await IntuitiveAnalysisResult.findOne({ where: { project_id, analysis_type: 'model_matching' } });
        if (row) {
          const data = typeof row.result_data === 'string' ? JSON.parse(row.result_data) : row.result_data;
          systemType = data?.primary_recommendation || data?.recommended_model || 'Xi';
        }
      } catch (e) { /* default below */ }
    }

    if (!systemType) systemType = 'Xi';

    // Specialty/category default service costs if recommendation didn't provide
    const DEFAULTS = {
      dV5: { price: 2500000, service: 0 }, // service included for dV5
      Xi:  { price: 1800000, service: 175000 },
      X:   { price: 1000000, service: 125000 },
      SP:  { price: 1700000, service: 150000 },
    };
    if (!systemPrice && DEFAULTS[systemType]) systemPrice = DEFAULTS[systemType].price;
    if (annualServiceCost == null && DEFAULTS[systemType]) annualServiceCost = DEFAULTS[systemType].service;

    const plan = await IntuitiveBusinessPlan.create({
      project_id,
      plan_name: plan_name || `Auto-generated Plan ${new Date().toISOString().slice(0, 10)}`,
      system_type: systemType,
      system_price: systemPrice,
      system_quantity: systemQuantity,
      annual_service_cost: annualServiceCost,
      acquisition_model: acquisitionModel,
      prepared_by: prepared_by || null,
      status: 'draft',
      notes: 'Generated from analysis cache. Auto-seeded surgeon commitments — refine before sharing externally.',
    });

    // Now auto-seed surgeon commitments
    const seedResult = await autoSeed.autoSeedForPlan(plan.id, { models: req.models });

    // Recalc totals on the new plan
    try {
      const { IntuitiveSurgeonCommitment, IntuitiveClinicalOutcome } = req.models;
      const commitments = await IntuitiveSurgeonCommitment.findAll({ where: { business_plan_id: plan.id } });
      const clinicalOutcomes = await IntuitiveClinicalOutcome.findAll({ where: { business_plan_id: plan.id } });
      const totalCases = commitments.reduce((s, c) => s + (c.total_incremental_annual || 0), 0);
      const totalRevenue = commitments.reduce((s, c) => s + parseFloat(c.total_revenue_impact || 0), 0);
      const totalClinicalSavings = clinicalOutcomes.reduce((s, c) => s + parseFloat(c.total_clinical_savings_annual || 0), 0);
      const totalROI = totalRevenue + totalClinicalSavings;
      const systemCost = (parseFloat(plan.system_price) || 0) * (plan.system_quantity || 1);
      const annualNet = totalROI - (parseFloat(plan.annual_service_cost) || 0);
      const payback = systemCost > 0 && annualNet > 0 ? Math.ceil((systemCost / annualNet) * 12) : null;
      const fiveYearNet = (annualNet * 5) - (plan.acquisition_model === 'purchase' ? systemCost : 0);
      await plan.update({
        total_incremental_cases_annual: totalCases,
        total_incremental_revenue: totalRevenue,
        total_clinical_outcome_savings: totalClinicalSavings,
        total_combined_roi: totalROI,
        payback_months: payback,
        five_year_net_benefit: fiveYearNet,
      });
    } catch (e) { console.error('generate-from-analysis: recalc error:', e.message); }

    const refreshedPlan = await IntuitiveBusinessPlan.findByPk(plan.id);
    res.json({
      success: true,
      data: {
        plan: refreshedPlan,
        seed_result: seedResult,
        deep_link: `/intuitive/business-plan/${project_id}`,
      },
    });
  } catch (err) {
    console.error('generate-from-analysis error:', err);
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
            hospital_affiliation, procedures, source,
            commitment_category, trained, training_needs, proctoring_needed,
            current_weekly_volume, target_weekly_volume, backlog_weeks,
            free_text_intel } = req.body;

    if (!surgeon_name) return res.status(400).json({ error: 'surgeon_name is required' });

    // Calculate totals from procedures
    // Existing/Incremental split (Deck 3 Slide 12): procedures with patient_source='existing'
    // multiply incremental_cases by pct_converted_from_open (default 20% — NOT 100%).
    // Procedures with patient_source='incremental' use the volume directly (net-new cases).
    const procs = procedures || [];
    let totalAnnual = 0;
    let totalRevenue = 0;
    for (const p of procs) {
      // Default patient_source to 'existing' for back-compat
      if (!p.patient_source) p.patient_source = 'existing';
      // Realistic default conversion: 20% (Deck 3 said NEVER 100%)
      if (p.patient_source === 'existing' && p.pct_converted_from_open == null) {
        p.pct_converted_from_open = 15;
      }

      const monthly = parseFloat(p.incremental_cases_monthly || 0);
      let annual;
      if (p.patient_source === 'existing') {
        // Apply conversion percentage to OPEN volume only (never laparoscopic)
        // Default 15% per client meeting — open conversions are the only realistic source
        const pct = parseFloat(p.pct_converted_from_open || 15) / 100;
        annual = Math.round(monthly * 12 * pct);
      } else {
        // Incremental (net-new) — use volume directly
        annual = Math.round(monthly * 12);
      }
      p.incremental_cases_annual = annual;
      totalAnnual += annual;
      totalRevenue += annual * (parseFloat(p.reimbursement_rate) || 0);
    }

    const commitment = await IntuitiveSurgeonCommitment.create({
      business_plan_id: plan.id,
      project_id: plan.project_id,
      surgeon_name, surgeon_email, surgeon_phone, surgeon_specialty,
      hospital_affiliation,
      procedures: procs,
      total_incremental_annual: totalAnnual,
      total_revenue_impact: totalRevenue,
      commitment_category: commitment_category || 'open_to_mis',
      trained: trained !== undefined ? trained : true,
      training_needs: training_needs || null,
      proctoring_needed: proctoring_needed || false,
      current_weekly_volume: current_weekly_volume || null,
      target_weekly_volume: target_weekly_volume || null,
      backlog_weeks: backlog_weeks || null,
      free_text_intel: free_text_intel || null,
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
                    'hospital_affiliation', 'procedures', 'source', 'status',
                    'commitment_category', 'trained', 'training_needs', 'proctoring_needed',
                    'current_weekly_volume', 'target_weekly_volume', 'backlog_weeks',
                    'free_text_intel'];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    // Recalculate if procedures changed — Existing/Incremental split (Deck 3 Slide 12 pattern)
    if (updates.procedures) {
      let totalAnnual = 0;
      let totalRevenue = 0;
      for (const p of updates.procedures) {
        if (!p.patient_source) p.patient_source = 'existing';
        if (p.patient_source === 'existing' && p.pct_converted_from_open == null) {
          p.pct_converted_from_open = 20;
        }

        const monthly = parseFloat(p.incremental_cases_monthly || 0);
        let annual;
        if (p.patient_source === 'existing') {
          const pct = parseFloat(p.pct_converted_from_open || 20) / 100;
          annual = Math.round(monthly * 12 * pct);
        } else {
          annual = Math.round(monthly * 12);
        }
        p.incremental_cases_annual = annual;
        totalAnnual += annual;
        totalRevenue += annual * (parseFloat(p.reimbursement_rate) || 0);
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
