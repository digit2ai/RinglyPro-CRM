'use strict';
const router = require('express').Router();
const crypto = require('crypto');
const systemMatcher = require('../services/system-matcher');

function generateProjectCode() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INTV-${year}-${rand}`;
}

// 5 realistic hospital profiles covering different scenarios
const DEMO_HOSPITALS = [
  {
    hospital_name: 'Orlando Regional Medical Center',
    contact_name: 'Dr. Sarah Chen',
    contact_email: 'schen@ormc.org',
    contact_title: 'Chief of Surgery',
    hospital_type: 'academic',
    bed_count: 808,
    state: 'FL',
    country: 'United States',
    annual_surgical_volume: 12000,
    current_robotic_cases: 450,
    current_system: 'Xi',
    current_system_count: 2,
    current_system_age_years: 5.5,
    specialty_urology: 20,
    specialty_gynecology: 18,
    specialty_general: 30,
    specialty_thoracic: 12,
    specialty_colorectal: 10,
    specialty_head_neck: 5,
    specialty_cardiac: 5,
    credentialed_robotic_surgeons: 8,
    surgeons_interested: 6,
    convertible_lap_cases: 3200,
    total_or_count: 32,
    robot_ready_ors: 4,
    or_sqft: 750,
    ceiling_height_ft: 11,
    capital_budget: '3M+',
    acquisition_preference: 'purchase',
    avg_los_days: 2.8,
    complication_rate_pct: 3.8,
    readmission_rate_pct: 4.2,
    payer_medicare_pct: 35,
    payer_commercial_pct: 48,
    payer_medicaid_pct: 12,
    payer_self_pay_pct: 5,
    value_based_contract_pct: 22,
    competitor_robot_nearby: true,
    competitor_details: 'AdventHealth has 3 da Vinci Xi systems and 1 dV5',
    primary_goal: 'volume_growth',
    notes: 'Large academic center looking to upgrade Xi fleet to dV5. Active residency training program. Expanding thoracic and cardiac robotic programs.'
  },
  {
    hospital_name: 'Lakewood Community Hospital',
    contact_name: 'Tom Henderson',
    contact_email: 'thenderson@lakewoodch.org',
    contact_title: 'VP of Operations',
    hospital_type: 'community',
    bed_count: 180,
    state: 'OH',
    country: 'United States',
    annual_surgical_volume: 2800,
    current_robotic_cases: 0,
    current_system: 'none',
    current_system_count: 0,
    current_system_age_years: null,
    specialty_urology: 30,
    specialty_gynecology: 25,
    specialty_general: 35,
    specialty_thoracic: 5,
    specialty_colorectal: 5,
    specialty_head_neck: 0,
    specialty_cardiac: 0,
    credentialed_robotic_surgeons: 0,
    surgeons_interested: 3,
    convertible_lap_cases: null,
    total_or_count: 6,
    robot_ready_ors: 0,
    or_sqft: 580,
    ceiling_height_ft: 9.5,
    capital_budget: '1-2M',
    acquisition_preference: 'lease',
    avg_los_days: 3.5,
    complication_rate_pct: 5.8,
    readmission_rate_pct: 6.1,
    payer_medicare_pct: 45,
    payer_commercial_pct: 35,
    payer_medicaid_pct: 15,
    payer_self_pay_pct: 5,
    value_based_contract_pct: 8,
    competitor_robot_nearby: true,
    competitor_details: 'Cleveland Clinic Lakewood has a Mako and Xi',
    primary_goal: 'competitive',
    notes: 'Greenfield site. Losing surgical volume to Cleveland Clinic. Board approved robotic exploration. Budget-constrained but motivated.'
  },
  {
    hospital_name: 'Texas Spine & Joint Institute',
    contact_name: 'Dr. Robert Alvarez',
    contact_email: 'ralvarez@txsji.com',
    contact_title: 'Medical Director',
    hospital_type: 'specialty',
    bed_count: 48,
    state: 'TX',
    country: 'United States',
    annual_surgical_volume: 3200,
    current_robotic_cases: 0,
    current_system: 'none',
    current_system_count: 0,
    current_system_age_years: null,
    specialty_urology: 5,
    specialty_gynecology: 0,
    specialty_general: 10,
    specialty_thoracic: 5,
    specialty_colorectal: 10,
    specialty_head_neck: 15,
    specialty_cardiac: 0,
    credentialed_robotic_surgeons: 1,
    surgeons_interested: 2,
    convertible_lap_cases: 400,
    total_or_count: 8,
    robot_ready_ors: 2,
    or_sqft: 620,
    ceiling_height_ft: 10,
    capital_budget: '2-3M',
    acquisition_preference: 'usage_based',
    avg_los_days: 1.8,
    complication_rate_pct: 2.5,
    readmission_rate_pct: 2.1,
    payer_medicare_pct: 30,
    payer_commercial_pct: 55,
    payer_medicaid_pct: 5,
    payer_self_pay_pct: 10,
    value_based_contract_pct: 35,
    competitor_robot_nearby: false,
    competitor_details: '',
    primary_goal: 'quality',
    notes: 'Specialty ASC-style institute. High volume, fast turnover. Interested in SP for transoral and minimally invasive approaches. Strong value-based contract exposure.'
  },
  {
    hospital_name: 'Memorial Hermann - The Woodlands',
    contact_name: 'Dr. Patricia Nguyen',
    contact_email: 'pnguyen@memorialhermann.org',
    contact_title: 'Chair, Department of Surgery',
    hospital_type: 'community',
    bed_count: 393,
    state: 'TX',
    country: 'United States',
    annual_surgical_volume: 6500,
    current_robotic_cases: 280,
    current_system: 'Xi',
    current_system_count: 1,
    current_system_age_years: 3,
    specialty_urology: 22,
    specialty_gynecology: 22,
    specialty_general: 28,
    specialty_thoracic: 8,
    specialty_colorectal: 12,
    specialty_head_neck: 4,
    specialty_cardiac: 4,
    credentialed_robotic_surgeons: 5,
    surgeons_interested: 4,
    convertible_lap_cases: 1800,
    total_or_count: 16,
    robot_ready_ors: 2,
    or_sqft: 700,
    ceiling_height_ft: 10.5,
    capital_budget: '2-3M',
    acquisition_preference: 'purchase',
    avg_los_days: 2.6,
    complication_rate_pct: 4.1,
    readmission_rate_pct: 3.8,
    payer_medicare_pct: 32,
    payer_commercial_pct: 52,
    payer_medicaid_pct: 10,
    payer_self_pay_pct: 6,
    value_based_contract_pct: 18,
    competitor_robot_nearby: true,
    competitor_details: 'HCA Houston Healthcare has 2 dV5 systems across nearby facilities',
    primary_goal: 'volume_growth',
    notes: 'Growing suburban hospital. Current Xi at capacity (280 cases/yr on 1 system). Need second system and considering dV5 upgrade. Expansion opportunity.'
  },
  {
    hospital_name: 'Mountain View VA Medical Center',
    contact_name: 'Dr. James Park',
    contact_email: 'james.park@va.gov',
    contact_title: 'Chief of Urology',
    hospital_type: 'VA',
    bed_count: 240,
    state: 'CA',
    country: 'United States',
    annual_surgical_volume: 3800,
    current_robotic_cases: 120,
    current_system: 'Si',
    current_system_count: 1,
    current_system_age_years: 9,
    specialty_urology: 40,
    specialty_gynecology: 5,
    specialty_general: 35,
    specialty_thoracic: 10,
    specialty_colorectal: 10,
    specialty_head_neck: 0,
    specialty_cardiac: 0,
    credentialed_robotic_surgeons: 3,
    surgeons_interested: 2,
    convertible_lap_cases: 950,
    total_or_count: 10,
    robot_ready_ors: 1,
    or_sqft: 640,
    ceiling_height_ft: 10,
    capital_budget: '2-3M',
    acquisition_preference: 'purchase',
    avg_los_days: 3.1,
    complication_rate_pct: 4.6,
    readmission_rate_pct: 5.3,
    payer_medicare_pct: 0,
    payer_commercial_pct: 0,
    payer_medicaid_pct: 0,
    payer_self_pay_pct: 0,
    value_based_contract_pct: 100,
    competitor_robot_nearby: false,
    competitor_details: '',
    primary_goal: 'quality',
    notes: 'VA hospital with aging da Vinci Si (9 years old). Urology-heavy caseload. Federal procurement process. 100% value-based care. Needs trade-up urgently -- Si approaching end of service life.'
  }
];

// Generate all 5 demo hospitals with analysis
router.post('/generate', async (req, res) => {
  try {
    const { IntuitiveProject } = req.models;
    const created = [];

    for (const demo of DEMO_HOSPITALS) {
      const project = await IntuitiveProject.create({
        ...demo,
        project_code: generateProjectCode(),
        status: 'intake'
      });

      // Run analysis
      try {
        await systemMatcher.runAll(req.models, project.id);
      } catch (analysisErr) {
        console.error(`Analysis error for ${demo.hospital_name}:`, analysisErr.message);
      }

      created.push({
        id: project.id,
        project_code: project.project_code,
        hospital_name: project.hospital_name,
        hospital_type: project.hospital_type,
        state: project.state,
        status: project.status
      });
    }

    res.json({
      status: 'completed',
      message: `Created ${created.length} demo hospital assessments with full analysis`,
      projects: created
    });
  } catch (err) {
    console.error('Demo generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate a single demo for quick testing
router.post('/generate-single', async (req, res) => {
  try {
    const { IntuitiveProject } = req.models;
    const idx = Math.floor(Math.random() * DEMO_HOSPITALS.length);
    const demo = DEMO_HOSPITALS[idx];

    const project = await IntuitiveProject.create({
      ...demo,
      project_code: generateProjectCode(),
      status: 'intake'
    });

    const results = await systemMatcher.runAll(req.models, project.id);

    const match = results.model_matching?.primary_recommendation;
    res.json({
      status: 'completed',
      project: {
        id: project.id,
        project_code: project.project_code,
        hospital_name: project.hospital_name
      },
      summary: {
        recommended_system: match?.system,
        fit_score: match?.score,
        projected_cases: results.volume_projection?.design_year_cases,
        systems_needed: results.utilization_forecast?.systems_needed,
        five_year_roi: results.roi_calculation?.five_year_roi_pct + '%',
        risk_level: results.risk_assessment?.overall_risk
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
