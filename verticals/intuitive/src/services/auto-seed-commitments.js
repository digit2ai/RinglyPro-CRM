'use strict';

/**
 * Auto-Seed Surgeon Commitments — fills draft IntuitiveSurgeonCommitment rows
 * for a business plan using the cached analysis + Care Compare + MPUP data.
 *
 * Solves the surgeon-survey bottleneck: instead of waiting for surgeons to
 * respond to a survey, generate defensible draft commitments the rep can
 * review in minutes. Survey responses later overwrite the matching rows
 * (see survey-distribution.js → importSurveyResponses).
 *
 * Heuristic (defensible, replace with rep edits or survey data when available):
 *   - High-volume robotic (>50 Medicare robotic cases/yr): 60% upside conversion
 *   - Medium-volume (>20 cases/yr): 40% conversion
 *   - Low / no data: 20% conversion, base 12 cases/yr starter
 *
 * Per-case reimbursement comes from analysis financial_deep_dive when available,
 * otherwise falls back to specialty-default DRG rates.
 */

const surgeonTargetingService = require('./surgeon-targeting-service');

// Specialty → top procedures + default reimbursement (Medicare averages, rough)
const SPECIALTY_PROCEDURES = {
  urology: [
    { name: 'Radical Prostatectomy', drg: '707', share: 0.50, rate: 14500 },
    { name: 'Partial Nephrectomy',    drg: '653', share: 0.30, rate: 19800 },
    { name: 'Cystectomy',             drg: '654', share: 0.20, rate: 31200 },
  ],
  gynecology: [
    { name: 'Hysterectomy',           drg: '743', share: 0.65, rate: 13200 },
    { name: 'Myomectomy',             drg: '744', share: 0.25, rate: 10500 },
    { name: 'Endometriosis Resection',drg: '744', share: 0.10, rate: 11200 },
  ],
  general: [
    { name: 'Cholecystectomy',        drg: '418', share: 0.40, rate: 9800 },
    { name: 'Inguinal Hernia',        drg: '352', share: 0.30, rate: 8200 },
    { name: 'Colectomy',              drg: '329', share: 0.30, rate: 22400 },
  ],
  thoracic: [
    { name: 'Lobectomy',              drg: '163', share: 0.60, rate: 26000 },
    { name: 'Thymectomy',             drg: '163', share: 0.25, rate: 24500 },
    { name: 'Esophagectomy',          drg: '326', share: 0.15, rate: 41200 },
  ],
  colorectal: [
    { name: 'Colectomy',              drg: '329', share: 0.55, rate: 22400 },
    { name: 'Rectal Resection',       drg: '331', share: 0.30, rate: 25600 },
    { name: 'Diverticulitis Resection',drg: '329', share: 0.15, rate: 20800 },
  ],
  head_neck: [
    { name: 'Transoral Robotic Surgery (TORS)', drg: '146', share: 0.60, rate: 18400 },
    { name: 'Thyroidectomy',          drg: '627', share: 0.25, rate: 9600 },
    { name: 'Parotidectomy',          drg: '128', share: 0.15, rate: 11800 },
  ],
};

const DEFAULT_PROCS = SPECIALTY_PROCEDURES.general;

// Classify a surgeon's robotic conversion potential from their MPUP volume
function classifySurgeon(roboticCasesLastYr) {
  const v = Number(roboticCasesLastYr) || 0;
  if (v > 50) return { tier: 'high', conversion_pct: 0.60, base_incremental: Math.round(v * 0.6) };
  if (v > 20) return { tier: 'medium', conversion_pct: 0.40, base_incremental: Math.round(v * 0.4) };
  if (v > 0)  return { tier: 'low', conversion_pct: 0.20, base_incremental: Math.max(6, Math.round(v * 0.2)) };
  // No MPUP data — assume convertible lap surgeon with a starter estimate
  return { tier: 'unknown', conversion_pct: 0.20, base_incremental: 12 };
}

// Pick the procedure ladder for a surgeon's specialty key
function proceduresForSpecialty(specialty) {
  const key = String(specialty || '').toLowerCase();
  for (const k of Object.keys(SPECIALTY_PROCEDURES)) {
    if (key.includes(k)) return SPECIALTY_PROCEDURES[k];
  }
  // Heuristics for free-text Care Compare specialty strings
  if (/urolog/.test(key)) return SPECIALTY_PROCEDURES.urology;
  if (/gyn|obstet/.test(key)) return SPECIALTY_PROCEDURES.gynecology;
  if (/colon|rectal/.test(key)) return SPECIALTY_PROCEDURES.colorectal;
  if (/thoracic|cardio/.test(key)) return SPECIALTY_PROCEDURES.thoracic;
  if (/otolaryngol|head|neck|ent/.test(key)) return SPECIALTY_PROCEDURES.head_neck;
  return DEFAULT_PROCS;
}

// Build the procedures[] array for one surgeon row given their incremental case bucket.
// Each procedure row carries patient_source (existing | incremental) and a realistic
// pct_converted_from_open. Default to 'existing' with 20% conversion — NEVER 100%
// (the broken math from the Vanderbilt deck that the meeting flagged).
function buildProcedureBreakdown(specialty, totalIncrementalAnnual, financialOverrides = {}) {
  const ladder = proceduresForSpecialty(specialty);
  const procs = [];
  for (const p of ladder) {
    const annual = Math.round(totalIncrementalAnnual * p.share);
    const monthly = Math.round(annual / 12);
    if (annual < 1) continue;
    const rate = financialOverrides.per_procedure_revenue || p.rate;
    procs.push({
      procedure_type: p.name,
      procedure_name: p.name,
      drg_code: p.drg,
      // CFO-grade incremental split (Deck 3 Slide 12 pattern)
      patient_source: 'existing',
      pct_converted_from_open: 20, // realistic default; rep can revise during review
      incremental_cases_monthly: monthly,
      incremental_cases_annual: annual,
      current_monthly_volume: 0, // rep fills in when refining
      competitive_leakage_cases: 0,
      reimbursement_rate: rate,
      notes: 'Auto-seeded. Existing patient source @ 20% conversion default. Refine with surgeon commitment data.',
    });
  }
  return procs;
}

// Determine commitment_category from MPUP robotic volume + training data
//   - trained + high robotic volume     → open_to_mis
//   - trained + low robotic volume      → pull_forward (proficient, blocked by access)
//   - untrained                         → training_pipeline
function inferCommitmentCategory(roboticCasesLastYr, hasTraining) {
  const v = Number(roboticCasesLastYr) || 0;
  if (!hasTraining) return 'training_pipeline';
  if (v > 50) return 'open_to_mis';
  if (v > 20) return 'pull_forward';
  return 'open_to_mis'; // default
}

// ---------------------------------------------------------------------------
// Resolve the surgeon roster for a project. Priority:
//   1. Hospital General Info + Facility Affiliations (NEW: real surgeon→hospital, 2.2M rows)
//   2. Project intake's confirmed_surgeons (Hospital Intake AI Research output)
//   3. Legacy Care Compare DAC (group practice approximation — mostly empty in prod)
//   4. State-wide NPPES territory fallback (broadest, least targeted)
// ---------------------------------------------------------------------------
async function resolveSurgeonRoster(project, models) {
  const targetingService = require('./surgeon-targeting-service');

  // 1. NEW PRIMARY: Hospital master + Facility Affiliations
  if (models?.IntuitiveHospital && models?.IntuitiveSurgeonHospitalAffiliation && project.hospital_name) {
    try {
      const hospitalRow = await targetingService.resolveHospitalByName(models, project.hospital_name);
      if (hospitalRow && hospitalRow.ccn) {
        const links = await models.IntuitiveSurgeonHospitalAffiliation.findAll({
          where: { facility_ccn: hospitalRow.ccn, facility_type: 'Hospital' },
          attributes: ['npi', 'surgeon_first_name', 'surgeon_last_name'],
          raw: true,
          limit: 50, // keep auto-seed bounded — top-50 NPIs at the hospital
        });
        if (links.length > 0) {
          const npis = links.map(l => l.npi);
          const mpup = require('./data-sources/cms-physician-volume');
          const volRes = await mpup.fetchFor(npis, { models });
          const byNpi = {};
          for (const v of ((volRes.data && volRes.data.surgeon_volumes) || [])) byNpi[v.npi] = v;
          // Rank by MPUP robotic volume so we seed the top surgeons first, cap at 15
          const enriched = links.map(l => ({
            npi: l.npi,
            full_name: `${(l.surgeon_first_name || '').trim()} ${(l.surgeon_last_name || '').trim()}`.trim() || `NPI ${l.npi}`,
            specialty: null, // inferred from procedures during seeding
            hospital_name: hospitalRow.facility_name,
            robotic_cases_last_yr: (byNpi[l.npi] || {}).total_robotic_cases_last_yr || 0,
          }));
          enriched.sort((a, b) => b.robotic_cases_last_yr - a.robotic_cases_last_yr);
          return { source: 'facility_affiliations', surgeons: enriched.slice(0, 15) };
        }
      }
    } catch (e) {
      console.error('[auto-seed] facility-affiliations lookup error:', e.message);
    }
  }

  // 2. Project-curated list (Hospital Intake AI Research output)
  const extended = project.extended_data || {};
  if (Array.isArray(extended.confirmed_surgeons) && extended.confirmed_surgeons.length > 0) {
    return {
      source: 'project_intake',
      surgeons: extended.confirmed_surgeons.map(s => ({
        npi: s.npi || null,
        full_name: s.full_name || s.name,
        specialty: s.specialty || s.specialty_label,
        hospital_name: project.hospital_name,
        robotic_cases_last_yr: s.robotic_cases_last_yr || 0,
      })),
    };
  }

  // 3. Legacy Care Compare DAC (group practice — mostly empty in prod, kept for compatibility)
  if (models?.IntuitiveProviderAffiliation && project.hospital_name) {
    try {
      const { Op } = require('sequelize');
      const aff = await models.IntuitiveProviderAffiliation.findAll({
        where: { hospital_name: { [Op.iLike]: `%${project.hospital_name}%` } },
        raw: true, limit: 25,
      });
      if (aff.length > 0) {
        const npis = aff.map(a => a.npi);
        const mpup = require('./data-sources/cms-physician-volume');
        const volRes = await mpup.fetchFor(npis, { models });
        const byNpi = {};
        for (const v of ((volRes.data && volRes.data.surgeon_volumes) || [])) byNpi[v.npi] = v;
        return {
          source: 'care_compare_legacy',
          surgeons: aff.map(a => ({
            npi: a.npi,
            full_name: a.full_name,
            specialty: a.primary_specialty,
            hospital_name: a.hospital_name,
            robotic_cases_last_yr: (byNpi[a.npi] || {}).total_robotic_cases_last_yr || 0,
          })),
        };
      }
    } catch (e) {
      console.error('[auto-seed] Care Compare lookup error:', e.message);
    }
  }

  // 4. State-level territory fallback
  if (project.state) {
    try {
      const territory = await targetingService.searchByTerritory(
        { state: project.state, specialty: 'all', limit: 15 },
        { models }
      );
      return {
        source: 'territory_fallback',
        surgeons: (territory.targets || []).map(t => ({
          npi: t.npi,
          full_name: t.full_name,
          specialty: t.specialty,
          hospital_name: t.hospital_name || project.hospital_name,
          robotic_cases_last_yr: t.robotic_cases_last_yr || 0,
        })),
      };
    } catch (e) {
      console.error('[auto-seed] territory fallback error:', e.message);
    }
  }

  return { source: 'none', surgeons: [] };
}

// ---------------------------------------------------------------------------
// Read financial overrides from analysis cache (per_procedure_revenue, etc.)
// ---------------------------------------------------------------------------
async function readFinancialOverrides(projectId, models) {
  if (!models?.IntuitiveAnalysisResult) return {};
  try {
    const row = await models.IntuitiveAnalysisResult.findOne({
      where: { project_id: projectId, analysis_type: 'financial_deep_dive' },
      raw: true,
    });
    if (!row) return {};
    const data = typeof row.result_data === 'string' ? JSON.parse(row.result_data) : row.result_data;
    return {
      per_procedure_revenue: Number(data?.per_procedure_revenue || data?.revenue_per_case) || null,
      blended_drg_rate: Number(data?.blended_drg_rate) || null,
    };
  } catch (e) {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main entry — auto-seed commitments for a business plan
// ---------------------------------------------------------------------------
async function autoSeedForPlan(planId, ctx) {
  const t0 = Date.now();
  const models = ctx.models;
  if (!models) throw new Error('models required');

  const plan = await models.IntuitiveBusinessPlan.findByPk(planId);
  if (!plan) throw new Error(`Business plan ${planId} not found`);

  const project = await models.IntuitiveProject.findByPk(plan.project_id);
  if (!project) throw new Error(`Project ${plan.project_id} not found`);

  // Skip surgeons already on the plan (manual + survey wins over auto-seed)
  const existing = await models.IntuitiveSurgeonCommitment.findAll({
    where: { business_plan_id: planId },
    attributes: ['surgeon_name', 'surgeon_email', 'source'],
    raw: true,
  });
  const existingNames = new Set(existing.map(e => (e.surgeon_name || '').toLowerCase().trim()));
  const existingEmails = new Set(existing.filter(e => e.surgeon_email).map(e => e.surgeon_email.toLowerCase()));

  const [{ surgeons, source: roster_source }, financial] = await Promise.all([
    resolveSurgeonRoster(project, models),
    readFinancialOverrides(project.id, models),
  ]);

  if (surgeons.length === 0) {
    return {
      success: false,
      seeded: 0,
      skipped: 0,
      roster_source,
      message: 'No surgeons found via Care Compare, project intake, or territory search. Run Hospital Intake first OR ingest Care Compare data.',
      elapsed_ms: Date.now() - t0,
    };
  }

  const created = [];
  let skipped = 0;
  for (const s of surgeons) {
    const nameKey = (s.full_name || '').toLowerCase().trim();
    if (!nameKey) { skipped++; continue; }
    if (existingNames.has(nameKey)) { skipped++; continue; }

    const cls = classifySurgeon(s.robotic_cases_last_yr);
    const incrementalAnnual = cls.base_incremental;
    if (incrementalAnnual < 1) { skipped++; continue; }

    const procedures = buildProcedureBreakdown(s.specialty, incrementalAnnual, financial);
    const totalAnnual = procedures.reduce((sum, p) => sum + (p.incremental_cases_annual || 0), 0);
    const totalRevenue = procedures.reduce((sum, p) => sum + ((p.incremental_cases_annual || 0) * (p.reimbursement_rate || 0)), 0);

    // Categorize for the 3-tab CFO view: high-volume trained → open_to_mis,
    // medium-volume trained → pull_forward, no-data → training_pipeline
    const hasTraining = cls.tier !== 'unknown'; // unknown = no MPUP data = likely untrained
    const commitmentCategory = inferCommitmentCategory(s.robotic_cases_last_yr, hasTraining);
    const trainingNeeds = !hasTraining ? 'TR200 — initial credentialing' : null;

    try {
      const row = await models.IntuitiveSurgeonCommitment.create({
        business_plan_id: planId,
        project_id: project.id,
        surgeon_name: s.full_name,
        surgeon_email: null,
        surgeon_phone: null,
        surgeon_specialty: s.specialty || null,
        hospital_affiliation: s.hospital_name || project.hospital_name,
        procedures,
        total_incremental_annual: totalAnnual,
        total_revenue_impact: totalRevenue,
        commitment_category: commitmentCategory,
        trained: hasTraining,
        training_needs: trainingNeeds,
        proctoring_needed: !hasTraining,
        source: 'auto_seed',
        status: 'draft',
      });
      created.push({
        id: row.id,
        surgeon_name: s.full_name,
        specialty: s.specialty,
        tier: cls.tier,
        incremental_cases_annual: totalAnnual,
        revenue_impact: totalRevenue,
      });
    } catch (e) {
      console.error('[auto-seed] create error for', s.full_name, ':', e.message);
      skipped++;
    }
  }

  return {
    success: true,
    seeded: created.length,
    skipped,
    roster_source,
    financial_overrides: financial,
    commitments: created,
    totals: {
      total_incremental_cases_annual: created.reduce((s, c) => s + c.incremental_cases_annual, 0),
      total_revenue_impact: created.reduce((s, c) => s + c.revenue_impact, 0),
    },
    elapsed_ms: Date.now() - t0,
    next_steps: [
      'Review the auto-seeded commitments and adjust conversion % per surgeon.',
      'Send a Surgeon Survey to replace auto-seeded rows with first-party commitments.',
      'POST /api/v1/business-plans/' + planId + '/calculate to update plan totals.',
    ],
  };
}

module.exports = {
  autoSeedForPlan,
  classifySurgeon,
  proceduresForSpecialty,
  buildProcedureBreakdown,
  SPECIALTY_PROCEDURES,
};
