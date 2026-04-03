'use strict';

/**
 * da Vinci System Matching Engine
 * Analyzes hospital profile and recommends optimal da Vinci configuration
 */

// da Vinci product catalog
const SYSTEMS = {
  dV5: {
    name: 'da Vinci 5',
    price_range: [2300000, 2800000],
    lease_annual: [400000, 550000],
    service_annual: 0, // Often included in early contracts
    instrument_cost_per_case: 2200,
    min_or_sqft: 650,
    min_ceiling_ft: 10,
    capabilities: ['multi_quadrant', 'force_feedback', 'case_insights', 'cloud_analytics', 'advanced_imaging'],
    specialties: ['urology', 'gynecology', 'general', 'thoracic', 'colorectal', 'cardiac', 'head_neck'],
    ideal_volume: 300,
    min_volume: 150,
    training_weeks: 4,
    setup_time_min: 15,
    description: 'Flagship system with 10,000x compute, force feedback, and real-time surgical insights'
  },
  Xi: {
    name: 'da Vinci Xi',
    price_range: [1500000, 2000000],
    lease_annual: [250000, 400000],
    service_annual: 175000,
    instrument_cost_per_case: 1800,
    min_or_sqft: 600,
    min_ceiling_ft: 10,
    capabilities: ['multi_quadrant', 'firefly', 'integrated_table_motion'],
    specialties: ['urology', 'gynecology', 'general', 'thoracic', 'colorectal'],
    ideal_volume: 250,
    min_volume: 100,
    training_weeks: 3,
    setup_time_min: 20,
    description: 'Proven workhorse multiport system with Firefly fluorescence imaging'
  },
  X: {
    name: 'da Vinci X',
    price_range: [800000, 1200000],
    lease_annual: [150000, 250000],
    service_annual: 125000,
    instrument_cost_per_case: 1800,
    min_or_sqft: 550,
    min_ceiling_ft: 9.5,
    capabilities: ['multi_quadrant', 'firefly'],
    specialties: ['urology', 'gynecology', 'general'],
    ideal_volume: 150,
    min_volume: 75,
    training_weeks: 3,
    setup_time_min: 25,
    description: 'Entry-level platform for hospitals beginning robotic programs'
  },
  SP: {
    name: 'da Vinci SP',
    price_range: [1500000, 1800000],
    lease_annual: [300000, 400000],
    service_annual: 150000,
    instrument_cost_per_case: 2000,
    min_or_sqft: 500,
    min_ceiling_ft: 9.5,
    capabilities: ['single_port', 'narrow_access', 'natural_orifice'],
    specialties: ['urology', 'head_neck'],
    ideal_volume: 100,
    min_volume: 50,
    training_weeks: 5,
    setup_time_min: 20,
    description: 'Single-port system for transoral and minimally invasive urologic procedures'
  }
};

/**
 * Run all analyses for a hospital project
 */
async function runAll(models, projectId) {
  const project = await models.IntuitiveProject.findByPk(projectId);
  if (!project) throw new Error('Project not found');

  await project.update({ status: 'analyzing', analysis_started_at: new Date() });

  const results = {};
  results.volume_projection = await computeVolumeProjection(project);
  results.model_matching = await computeModelMatching(project, results.volume_projection);
  results.utilization_forecast = await computeUtilizationForecast(project, results.volume_projection);
  results.surgeon_capacity = await computeSurgeonCapacity(project, results.volume_projection);
  results.infrastructure_assessment = await computeInfrastructure(project);
  results.roi_calculation = await computeROI(project, results.model_matching, results.volume_projection);
  results.competitive_analysis = await computeCompetitive(project);
  results.risk_assessment = await computeRiskAssessment(project, results);

  // Store each result
  for (const [type, data] of Object.entries(results)) {
    await storeResult(models, projectId, type, data);
  }

  // Generate system recommendations
  await generateRecommendations(models, projectId, project, results);

  await project.update({ status: 'completed', analysis_completed_at: new Date() });
  return results;
}

async function storeResult(models, projectId, analysisType, resultData) {
  await models.IntuitiveAnalysisResult.upsert({
    project_id: projectId,
    analysis_type: analysisType,
    result_data: resultData,
    computed_at: new Date()
  });
}

// ─── VOLUME PROJECTION ───
function computeVolumeProjection(p) {
  const totalSurgical = p.annual_surgical_volume || 0;
  const currentRobotic = p.current_robotic_cases || 0;
  const convertibleLap = p.convertible_lap_cases || Math.round(totalSurgical * 0.3);

  // Specialty-weighted conversion rates
  const conversionRates = {
    urology: 0.85,      // Prostatectomy is almost entirely robotic now
    gynecology: 0.45,    // Growing but contested
    general: 0.25,       // Hernia, cholecystectomy — moderate adoption
    thoracic: 0.30,      // Lobectomy, mediastinal
    colorectal: 0.35,    // Growing especially in rectal cancer
    head_neck: 0.20,     // Transoral — niche
    cardiac: 0.15        // Still early
  };

  const specialties = {
    urology: p.specialty_urology || 0,
    gynecology: p.specialty_gynecology || 0,
    general: p.specialty_general || 0,
    thoracic: p.specialty_thoracic || 0,
    colorectal: p.specialty_colorectal || 0,
    head_neck: p.specialty_head_neck || 0,
    cardiac: p.specialty_cardiac || 0
  };

  let weightedConversion = 0;
  let totalPct = 0;
  const bySpecialty = {};

  for (const [spec, pct] of Object.entries(specialties)) {
    if (pct > 0) {
      const specVolume = Math.round(totalSurgical * (pct / 100));
      const convertible = Math.round(specVolume * conversionRates[spec]);
      bySpecialty[spec] = { volume: specVolume, convertible, rate: conversionRates[spec], pct };
      weightedConversion += conversionRates[spec] * (pct / 100);
      totalPct += pct;
    }
  }

  // Ramp-up projections (year 1-5)
  const year1Adoption = 0.4;  // 40% of convertible in year 1
  const projections = [];
  for (let yr = 1; yr <= 5; yr++) {
    const adoptionRate = Math.min(1.0, year1Adoption + (yr - 1) * 0.15);
    const projectedRobotic = Math.round(convertibleLap * adoptionRate);
    projections.push({
      year: yr,
      adoption_rate: Math.round(adoptionRate * 100),
      projected_cases: projectedRobotic,
      cases_per_week: Math.round(projectedRobotic / 50 * 10) / 10
    });
  }

  return {
    total_surgical: totalSurgical,
    current_robotic: currentRobotic,
    convertible_laparoscopic: convertibleLap,
    weighted_conversion_rate: Math.round(weightedConversion * 100),
    by_specialty: bySpecialty,
    projections,
    design_year_cases: projections[2]?.projected_cases || 0 // Year 3 = steady state
  };
}

// ─── MODEL MATCHING ───
function computeModelMatching(p, volumeProj) {
  const designCases = volumeProj.design_year_cases;
  const scores = {};

  for (const [key, sys] of Object.entries(SYSTEMS)) {
    let score = 0;
    const reasons = [];
    const warnings = [];

    // Volume fit (0-30 points)
    if (designCases >= sys.ideal_volume) {
      score += 30;
      reasons.push(`Projected volume (${designCases} cases/yr) exceeds ideal threshold (${sys.ideal_volume})`);
    } else if (designCases >= sys.min_volume) {
      score += 15 + 15 * ((designCases - sys.min_volume) / (sys.ideal_volume - sys.min_volume));
      reasons.push(`Projected volume (${designCases}) meets minimum (${sys.min_volume}) for ${sys.name}`);
    } else {
      score += 5;
      warnings.push(`Projected volume (${designCases}) below minimum (${sys.min_volume}) for ${sys.name}`);
    }

    // Specialty coverage (0-25 points)
    const hospitalSpecs = Object.entries({
      urology: p.specialty_urology, gynecology: p.specialty_gynecology,
      general: p.specialty_general, thoracic: p.specialty_thoracic,
      colorectal: p.specialty_colorectal, head_neck: p.specialty_head_neck,
      cardiac: p.specialty_cardiac
    }).filter(([, pct]) => pct > 0).map(([s]) => s);

    const covered = hospitalSpecs.filter(s => sys.specialties.includes(s));
    const coverage = hospitalSpecs.length > 0 ? covered.length / hospitalSpecs.length : 0;
    score += coverage * 25;
    if (coverage < 1) {
      const uncovered = hospitalSpecs.filter(s => !sys.specialties.includes(s));
      warnings.push(`Does not support: ${uncovered.join(', ')}`);
    } else {
      reasons.push(`Covers all ${covered.length} target specialties`);
    }

    // Budget fit (0-20 points)
    const budgetMap = { '<1M': 800000, '1-2M': 1500000, '2-3M': 2500000, '3M+': 3500000 };
    const budgetVal = budgetMap[p.capital_budget] || 2000000;
    const avgPrice = (sys.price_range[0] + sys.price_range[1]) / 2;
    if (budgetVal >= avgPrice) {
      score += 20;
      reasons.push(`Within budget range`);
    } else if (p.acquisition_preference === 'lease' || p.acquisition_preference === 'usage_based') {
      score += 15;
      reasons.push(`Accessible via ${p.acquisition_preference} model`);
    } else {
      score += 5;
      warnings.push(`Average price ($${(avgPrice/1e6).toFixed(1)}M) may exceed budget`);
    }

    // Infrastructure fit (0-15 points)
    let infraScore = 15;
    if (p.or_sqft && p.or_sqft < sys.min_or_sqft) {
      infraScore -= 10;
      warnings.push(`OR space (${p.or_sqft} sqft) below minimum (${sys.min_or_sqft})`);
    }
    if (p.ceiling_height_ft && p.ceiling_height_ft < sys.min_ceiling_ft) {
      infraScore -= 5;
      warnings.push(`Ceiling height (${p.ceiling_height_ft}ft) below minimum (${sys.min_ceiling_ft}ft)`);
    }
    score += Math.max(0, infraScore);

    // Hospital type bonus (0-10 points)
    if (key === 'dV5' && (p.hospital_type === 'academic' || (p.bed_count && p.bed_count > 400))) {
      score += 10;
      reasons.push('Academic/large hospital — flagship system recommended');
    } else if (key === 'X' && (p.hospital_type === 'community' || p.hospital_type === 'rural')) {
      score += 10;
      reasons.push('Community/rural hospital — entry-level system ideal');
    } else if (key === 'Xi') {
      score += 7;
      reasons.push('Proven workhorse suitable for most hospital types');
    } else {
      score += 3;
    }

    scores[key] = {
      system: sys.name,
      model: key,
      score: Math.round(score),
      reasons,
      warnings,
      specs: {
        price_range: sys.price_range,
        lease_annual: sys.lease_annual,
        instrument_cost_per_case: sys.instrument_cost_per_case,
        capabilities: sys.capabilities,
        specialties: sys.specialties
      }
    };
  }

  // Rank by score
  const ranked = Object.values(scores).sort((a, b) => b.score - a.score);
  return {
    ranked,
    primary_recommendation: ranked[0],
    alternative: ranked[1],
    all_scores: scores
  };
}

// ─── UTILIZATION FORECAST ───
function computeUtilizationForecast(p, volumeProj) {
  const designCases = volumeProj.design_year_cases;
  const surgeons = (p.credentialed_robotic_surgeons || 0) + (p.surgeons_interested || 0);
  const operatingDays = 250; // ~50 weeks * 5 days
  const casesPerDay = designCases / operatingDays;
  const casesPerWeek = designCases / 50;

  // Average case duration by specialty (hours)
  const caseDurations = { urology: 2.5, gynecology: 1.5, general: 1.5, thoracic: 3.0, colorectal: 3.5, head_neck: 2.0, cardiac: 4.0 };
  let weightedDuration = 0;
  let totalWeight = 0;
  for (const [spec, pct] of Object.entries({ urology: p.specialty_urology, gynecology: p.specialty_gynecology, general: p.specialty_general, thoracic: p.specialty_thoracic, colorectal: p.specialty_colorectal, head_neck: p.specialty_head_neck, cardiac: p.specialty_cardiac })) {
    if (pct > 0) {
      weightedDuration += (caseDurations[spec] || 2) * (pct / 100);
      totalWeight += pct / 100;
    }
  }
  const avgCaseDuration = totalWeight > 0 ? weightedDuration / totalWeight : 2.0;
  const setupTurnover = 0.75; // hours per case for setup/turnover
  const totalHoursPerCase = avgCaseDuration + setupTurnover;

  const availableHoursPerDay = 10; // OR operating hours
  const maxCasesPerSystem = Math.floor(availableHoursPerDay / totalHoursPerCase);
  const maxCasesPerSystemYear = maxCasesPerSystem * operatingDays;

  const systemsNeeded = Math.ceil(designCases / (maxCasesPerSystemYear * 0.8)); // 80% target utilization
  const utilization = systemsNeeded > 0 ? Math.round((designCases / (systemsNeeded * maxCasesPerSystemYear)) * 100) : 0;

  return {
    design_cases: designCases,
    cases_per_day: Math.round(casesPerDay * 10) / 10,
    cases_per_week: Math.round(casesPerWeek * 10) / 10,
    avg_case_duration_hrs: Math.round(avgCaseDuration * 10) / 10,
    total_time_per_case_hrs: Math.round(totalHoursPerCase * 10) / 10,
    max_cases_per_system_day: maxCasesPerSystem,
    max_cases_per_system_year: maxCasesPerSystemYear,
    systems_needed: systemsNeeded,
    projected_utilization_pct: utilization,
    available_surgeons: surgeons,
    operating_days_year: operatingDays,
    utilization_risk: utilization < 60 ? 'high' : utilization < 75 ? 'moderate' : 'low'
  };
}

// ─── SURGEON CAPACITY ───
function computeSurgeonCapacity(p, volumeProj) {
  const credentialed = p.credentialed_robotic_surgeons || 0;
  const interested = p.surgeons_interested || 0;
  const total = credentialed + interested;
  const designCases = volumeProj.design_year_cases;

  const casesPerSurgeon = total > 0 ? Math.round(designCases / total) : 0;
  const idealCasesPerSurgeon = 150; // Sweet spot for proficiency maintenance

  return {
    credentialed_surgeons: credentialed,
    interested_surgeons: interested,
    total_potential: total,
    cases_per_surgeon: casesPerSurgeon,
    ideal_cases_per_surgeon: idealCasesPerSurgeon,
    capacity_status: casesPerSurgeon > 250 ? 'over_capacity' : casesPerSurgeon > idealCasesPerSurgeon ? 'good' : casesPerSurgeon > 50 ? 'under_capacity' : 'critical',
    training_months_needed: interested * 3, // ~3 months per new surgeon
    single_surgeon_risk: total <= 1,
    recommendation: total <= 1 ? 'Critical: single surgeon dependency. Recruit before system placement.' :
      casesPerSurgeon > 250 ? 'Need additional surgeons or systems to handle projected volume.' :
      casesPerSurgeon < 75 ? 'Consider phased rollout to build volume before expanding surgeon pool.' :
      'Surgeon capacity aligned with projected volume.'
  };
}

// ─── INFRASTRUCTURE ───
function computeInfrastructure(p) {
  const issues = [];
  const costs = [];
  let readinessScore = 100;

  if (p.robot_ready_ors === 0) {
    issues.push('No robot-ready ORs. Renovation required.');
    costs.push({ item: 'OR renovation', estimate_low: 500000, estimate_high: 1500000 });
    readinessScore -= 40;
  }
  if (p.or_sqft && p.or_sqft < 600) {
    issues.push(`OR space (${p.or_sqft} sqft) may be tight. Minimum 600 sqft recommended.`);
    readinessScore -= 15;
  }
  if (p.ceiling_height_ft && p.ceiling_height_ft < 10) {
    issues.push(`Ceiling height (${p.ceiling_height_ft}ft) may require modification for boom-mounted arms.`);
    costs.push({ item: 'Ceiling modification', estimate_low: 50000, estimate_high: 200000 });
    readinessScore -= 10;
  }
  if (!p.total_or_count || p.total_or_count < 4) {
    issues.push('Limited OR count. Dedicated robot OR may impact scheduling.');
    readinessScore -= 10;
  }

  const totalRenovation = costs.reduce((sum, c) => sum + (c.estimate_low + c.estimate_high) / 2, 0);

  return {
    readiness_score: Math.max(0, readinessScore),
    readiness_label: readinessScore >= 80 ? 'Ready' : readinessScore >= 50 ? 'Minor Work Needed' : 'Major Renovation Required',
    issues,
    estimated_renovation_costs: costs,
    total_renovation_estimate: totalRenovation,
    total_ors: p.total_or_count || 0,
    robot_ready_ors: p.robot_ready_ors || 0,
    or_sqft: p.or_sqft || 0,
    ceiling_height_ft: p.ceiling_height_ft || 0
  };
}

// ─── ROI CALCULATION ───
function computeROI(p, modelMatch, volumeProj) {
  const rec = modelMatch.primary_recommendation;
  const sys = SYSTEMS[rec.model];
  const designCases = volumeProj.design_year_cases;

  const avgSystemPrice = (sys.price_range[0] + sys.price_range[1]) / 2;
  const annualInstruments = designCases * sys.instrument_cost_per_case;
  const annualService = sys.service_annual;
  const annualLease = (sys.lease_annual[0] + sys.lease_annual[1]) / 2;

  // Revenue impact
  const newCases = designCases - (p.current_robotic_cases || 0);
  const avgRevenuePerCase = 15000; // Average surgical case revenue
  const incrementalRevenue = newCases * avgRevenuePerCase;

  // LOS savings
  const losSavingsDays = (p.avg_los_days || 3) * 0.15; // 15% reduction
  const losValuePerDay = 2500;
  const losSavings = designCases * losSavingsDays * losValuePerDay;

  // Complication reduction
  const compReduction = (p.complication_rate_pct || 5) * 0.2; // 20% reduction
  const compCostPerEvent = 25000;
  const compSavings = designCases * (compReduction / 100) * compCostPerEvent;

  // Market share / volume growth from "robotic surgery" marketing
  const marketingUplift = Math.round(designCases * 0.1); // 10% additional cases from marketing
  const marketingRevenue = marketingUplift * avgRevenuePerCase;

  const totalAnnualBenefit = incrementalRevenue + losSavings + compSavings + marketingRevenue;
  const totalAnnualCost = p.acquisition_preference === 'lease' ? annualLease + annualInstruments : annualInstruments + annualService;
  const capitalCost = p.acquisition_preference === 'lease' ? 0 : avgSystemPrice;

  const annualNetBenefit = totalAnnualBenefit - totalAnnualCost;
  const paybackMonths = capitalCost > 0 ? Math.ceil((capitalCost / annualNetBenefit) * 12) : 0;
  const fiveYearROI = capitalCost > 0 ? Math.round(((annualNetBenefit * 5 - capitalCost) / capitalCost) * 100) : Math.round((annualNetBenefit * 5 / (totalAnnualCost * 5)) * 100);

  return {
    recommended_system: rec.system,
    acquisition_model: p.acquisition_preference || 'purchase',
    capital_cost: capitalCost,
    annual_costs: {
      instruments: annualInstruments,
      service: annualService,
      lease: p.acquisition_preference === 'lease' ? annualLease : 0,
      total: totalAnnualCost
    },
    annual_benefits: {
      incremental_revenue: incrementalRevenue,
      los_savings: Math.round(losSavings),
      complication_savings: Math.round(compSavings),
      marketing_revenue: marketingRevenue,
      total: Math.round(totalAnnualBenefit)
    },
    annual_net_benefit: Math.round(annualNetBenefit),
    payback_months: paybackMonths,
    five_year_roi_pct: fiveYearROI,
    five_year_projections: Array.from({ length: 5 }, (_, i) => ({
      year: i + 1,
      cumulative_benefit: Math.round(totalAnnualBenefit * (i + 1)),
      cumulative_cost: Math.round(capitalCost + totalAnnualCost * (i + 1)),
      cumulative_net: Math.round(annualNetBenefit * (i + 1) - capitalCost)
    }))
  };
}

// ─── COMPETITIVE ANALYSIS ───
function computeCompetitive(p) {
  return {
    competitor_nearby: p.competitor_robot_nearby || false,
    competitor_details: p.competitor_details || 'None reported',
    market_pressure: p.competitor_robot_nearby ? 'high' : 'low',
    recommendation: p.competitor_robot_nearby
      ? 'Competitive urgency: nearby hospital has robotic capability. Delay risks surgical volume migration.'
      : 'No immediate competitive threat, but early adoption builds market position.',
    positioning: p.competitor_robot_nearby
      ? 'Match or exceed competitor capability. Recommend flagship system (dV5) for differentiation.'
      : 'Establish first-mover advantage in the region.'
  };
}

// ─── RISK ASSESSMENT ───
function computeRiskAssessment(p, results) {
  const risks = [];

  if (results.surgeon_capacity.single_surgeon_risk) {
    risks.push({ category: 'Workforce', severity: 'critical', description: 'Single surgeon dependency. If surgeon leaves, utilization collapses.', mitigation: 'Recruit and credential at least 2 additional surgeons before system placement.' });
  }
  if (results.utilization_forecast.utilization_risk === 'high') {
    risks.push({ category: 'Utilization', severity: 'high', description: `Projected utilization (${results.utilization_forecast.projected_utilization_pct}%) below breakeven threshold.`, mitigation: 'Consider usage-based acquisition model or phased rollout.' });
  }
  if (results.infrastructure_assessment.readiness_score < 50) {
    risks.push({ category: 'Infrastructure', severity: 'high', description: 'Major OR renovation required. Estimated cost: $' + (results.infrastructure_assessment.total_renovation_estimate / 1e6).toFixed(1) + 'M', mitigation: 'Factor renovation timeline (6-18 months) into go-live planning.' });
  }
  if (results.volume_projection.design_year_cases < 150) {
    risks.push({ category: 'Volume', severity: 'high', description: 'Projected case volume may not justify system economics.', mitigation: 'Build referral network and surgeon pipeline before committing to capital purchase.' });
  }
  if (p.value_based_contract_pct > 30) {
    risks.push({ category: 'Financial', severity: 'moderate', description: `${p.value_based_contract_pct}% value-based contracts. Per-case cost premium may impact margins under bundled payments.`, mitigation: 'Implement MSK Intelligence outcome tracking to demonstrate value-based ROI.' });
  }

  const overallRisk = risks.some(r => r.severity === 'critical') ? 'critical' :
    risks.filter(r => r.severity === 'high').length >= 2 ? 'high' :
    risks.some(r => r.severity === 'high') ? 'moderate' : 'low';

  return { risks, overall_risk: overallRisk, risk_count: risks.length };
}

// ─── GENERATE RECOMMENDATIONS ───
async function generateRecommendations(models, projectId, p, results) {
  await models.IntuitiveSystemRecommendation.destroy({ where: { project_id: projectId } });

  const primary = results.model_matching.primary_recommendation;
  const alt = results.model_matching.alternative;
  const sys = SYSTEMS[primary.model];
  const roi = results.roi_calculation;

  // Primary recommendation
  await models.IntuitiveSystemRecommendation.create({
    project_id: projectId,
    system_model: primary.model,
    quantity: results.utilization_forecast.systems_needed,
    fit_score: primary.score,
    is_primary: true,
    rationale: primary.reasons.join('. '),
    acquisition_model: p.acquisition_preference || 'purchase',
    estimated_price: (sys.price_range[0] + sys.price_range[1]) / 2,
    estimated_annual_cost: roi.annual_costs.total,
    projected_annual_cases: results.volume_projection.design_year_cases,
    projected_utilization_pct: results.utilization_forecast.projected_utilization_pct,
    breakeven_months: roi.payback_months,
    five_year_roi_pct: roi.five_year_roi_pct,
    specialties_served: Object.keys(results.volume_projection.by_specialty),
    risk_factors: results.risk_assessment.risks.map(r => r.description),
    details: { warnings: primary.warnings }
  });

  // Alternative recommendation
  if (alt) {
    const altSys = SYSTEMS[alt.model];
    await models.IntuitiveSystemRecommendation.create({
      project_id: projectId,
      system_model: alt.model,
      quantity: results.utilization_forecast.systems_needed,
      fit_score: alt.score,
      is_primary: false,
      rationale: alt.reasons.join('. '),
      acquisition_model: p.acquisition_preference || 'purchase',
      estimated_price: (altSys.price_range[0] + altSys.price_range[1]) / 2,
      specialties_served: Object.keys(results.volume_projection.by_specialty),
      details: { warnings: alt.warnings }
    });
  }
}

module.exports = { runAll, SYSTEMS };
