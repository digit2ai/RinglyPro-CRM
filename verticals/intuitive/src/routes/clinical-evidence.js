'use strict';
const router = require('express').Router();

let clinicalEvidence, dollarizationEngine, drgLib;
try { clinicalEvidence = require('../services/clinical-evidence'); } catch (e) { console.error('Clinical evidence load error:', e.message); }
try { dollarizationEngine = require('../services/clinical-dollarization'); } catch (e) { console.error('Dollarization engine load error:', e.message); }
try { drgLib = require('../services/drg-reimbursement'); } catch (e) { console.error('DRG lib load error:', e.message); }

// GET /api/v1/clinical-evidence/library - Browse the full evidence library
router.get('/library', (req, res) => {
  if (!clinicalEvidence) return res.status(500).json({ error: 'Clinical evidence library not loaded' });
  res.json({ success: true, data: clinicalEvidence.CLINICAL_EVIDENCE });
});

// GET /api/v1/clinical-evidence/specialties - List all specialties
router.get('/specialties', (req, res) => {
  if (!clinicalEvidence) return res.status(500).json({ error: 'Clinical evidence library not loaded' });
  res.json({ success: true, data: clinicalEvidence.getAllSpecialties() });
});

// GET /api/v1/clinical-evidence/:specialty - Get evidence for a specific specialty
router.get('/:specialty', (req, res) => {
  if (!clinicalEvidence) return res.status(500).json({ error: 'Clinical evidence library not loaded' });
  const evidence = clinicalEvidence.getEvidenceBySpecialty(req.params.specialty);
  if (!evidence) return res.status(404).json({ error: `Specialty '${req.params.specialty}' not found` });
  res.json({ success: true, data: evidence });
});

// GET /api/v1/clinical-evidence/citations/all - All citations
router.get('/citations/all', (req, res) => {
  if (!clinicalEvidence) return res.status(500).json({ error: 'Clinical evidence library not loaded' });
  res.json({ success: true, data: clinicalEvidence.getAllCitations() });
});

// POST /api/v1/clinical-evidence/dollarize - Run dollarization calculation
router.post('/dollarize', async (req, res) => {
  try {
    if (!dollarizationEngine) return res.status(500).json({ error: 'Dollarization engine not loaded' });

    const { hospital_case_data, options } = req.body;
    if (!hospital_case_data) return res.status(400).json({ error: 'hospital_case_data is required' });

    const results = dollarizationEngine.calculateDollarization(hospital_case_data, options || {});
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/clinical-evidence/dollarize/:specialty - Dollarize single specialty
router.post('/dollarize/:specialty', async (req, res) => {
  try {
    if (!dollarizationEngine) return res.status(500).json({ error: 'Dollarization engine not loaded' });

    const { case_data, options } = req.body;
    if (!case_data) return res.status(400).json({ error: 'case_data is required' });

    const results = dollarizationEngine.calculateSingleSpecialty(req.params.specialty, case_data, options || {});
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/clinical-evidence/conversion-impact - Quick conversion impact
router.post('/conversion-impact', (req, res) => {
  try {
    if (!dollarizationEngine) return res.status(500).json({ error: 'Dollarization engine not loaded' });

    const { specialty, cases_to_convert, from_approach, to_approach } = req.body;
    if (!specialty || !cases_to_convert) {
      return res.status(400).json({ error: 'specialty and cases_to_convert required' });
    }

    const results = dollarizationEngine.getConversionImpact(
      specialty, cases_to_convert, from_approach || 'open', to_approach || 'robotic'
    );
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Business Plan Clinical Outcomes ---

// POST /api/v1/business-plans/:planId/clinical-outcomes - Create/update clinical analysis
router.post('/business-plan/:planId/outcomes', async (req, res) => {
  try {
    const { IntuitiveClinicalOutcome, IntuitiveBusinessPlan } = req.models;
    if (!dollarizationEngine) return res.status(500).json({ error: 'Dollarization engine not loaded' });

    const plan = await IntuitiveBusinessPlan.findByPk(req.params.planId);
    if (!plan) return res.status(404).json({ error: 'Business plan not found' });

    const { hospital_case_data, cms_data, options } = req.body;
    if (!hospital_case_data) return res.status(400).json({ error: 'hospital_case_data required' });

    // Run dollarization
    const results = dollarizationEngine.calculateDollarization(hospital_case_data, options || {});

    // Upsert clinical outcome record
    const [outcome, created] = await IntuitiveClinicalOutcome.findOrCreate({
      where: { business_plan_id: plan.id },
      defaults: {
        project_id: plan.project_id,
        business_plan_id: plan.id,
        hospital_case_data,
        cms_data: cms_data || {},
        dollarization_results: results,
        total_clinical_savings_annual: results.total_clinical_savings_annual || 0,
        citations: results.all_citations || [],
        computed_at: new Date()
      }
    });

    if (!created) {
      await outcome.update({
        hospital_case_data,
        cms_data: cms_data || outcome.cms_data,
        dollarization_results: results,
        total_clinical_savings_annual: results.total_clinical_savings_annual || 0,
        citations: results.all_citations || [],
        computed_at: new Date()
      });
    }

    res.json({ success: true, data: outcome, dollarization: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET clinical outcomes for a plan
router.get('/business-plan/:planId/outcomes', async (req, res) => {
  try {
    const { IntuitiveClinicalOutcome } = req.models;
    const outcomes = await IntuitiveClinicalOutcome.findAll({
      where: { business_plan_id: req.params.planId }
    });
    res.json({ success: true, data: outcomes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
