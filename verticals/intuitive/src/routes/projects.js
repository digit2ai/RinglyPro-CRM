'use strict';
const router = require('express').Router();
const crypto = require('crypto');

function generateProjectCode() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INTV-${year}-${rand}`;
}

// Create hospital assessment project
router.post('/', async (req, res) => {
  try {
    const { IntuitiveProject } = req.models;
    const data = req.body;

    const project = await IntuitiveProject.create({
      project_code: generateProjectCode(),
      hospital_name: data.hospital_name,
      contact_name: data.contact_name,
      contact_email: data.contact_email,
      contact_title: data.contact_title,
      hospital_type: data.hospital_type,
      bed_count: data.bed_count,
      state: data.state,
      country: data.country || 'United States',

      annual_surgical_volume: data.annual_surgical_volume,
      current_robotic_cases: data.current_robotic_cases || 0,
      current_system: data.current_system || 'none',
      current_system_count: data.current_system_count || 0,
      current_system_age_years: data.current_system_age_years,

      specialty_urology: data.specialty_urology || 0,
      specialty_gynecology: data.specialty_gynecology || 0,
      specialty_general: data.specialty_general || 0,
      specialty_thoracic: data.specialty_thoracic || 0,
      specialty_colorectal: data.specialty_colorectal || 0,
      specialty_head_neck: data.specialty_head_neck || 0,
      specialty_cardiac: data.specialty_cardiac || 0,

      credentialed_robotic_surgeons: data.credentialed_robotic_surgeons || 0,
      surgeons_interested: data.surgeons_interested || 0,
      convertible_lap_cases: data.convertible_lap_cases,

      total_or_count: data.total_or_count,
      robot_ready_ors: data.robot_ready_ors,
      or_sqft: data.or_sqft,
      ceiling_height_ft: data.ceiling_height_ft,

      capital_budget: data.capital_budget,
      acquisition_preference: data.acquisition_preference,
      avg_los_days: data.avg_los_days,
      complication_rate_pct: data.complication_rate_pct,
      readmission_rate_pct: data.readmission_rate_pct,

      payer_medicare_pct: data.payer_medicare_pct || 0,
      payer_commercial_pct: data.payer_commercial_pct || 0,
      payer_medicaid_pct: data.payer_medicaid_pct || 0,
      payer_self_pay_pct: data.payer_self_pay_pct || 0,
      value_based_contract_pct: data.value_based_contract_pct || 0,

      competitor_robot_nearby: data.competitor_robot_nearby || false,
      competitor_details: data.competitor_details,

      target_go_live: data.target_go_live,
      primary_goal: data.primary_goal,
      notes: data.notes,

      status: 'intake'
    });

    res.status(201).json({ project });
  } catch (err) {
    console.error('Project create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List all projects
router.get('/', async (req, res) => {
  try {
    const { IntuitiveProject } = req.models;
    const projects = await IntuitiveProject.findAll({
      order: [['created_at', 'DESC']],
      limit: 50
    });
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single project with results
router.get('/:id', async (req, res) => {
  try {
    const { IntuitiveProject, IntuitiveAnalysisResult, IntuitiveSystemRecommendation } = req.models;
    const project = await IntuitiveProject.findByPk(req.params.id, {
      include: [
        { model: IntuitiveAnalysisResult, as: 'results' },
        { model: IntuitiveSystemRecommendation, as: 'recommendations' }
      ]
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update project
router.patch('/:id', async (req, res) => {
  try {
    const { IntuitiveProject } = req.models;
    const project = await IntuitiveProject.findByPk(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    await project.update(req.body);
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
