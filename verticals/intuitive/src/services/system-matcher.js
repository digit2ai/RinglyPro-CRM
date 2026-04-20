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
  },
  dV5_Dual: {
    name: 'da Vinci 5 Dual Console',
    price_range: [2800000, 3400000],
    lease_annual: [500000, 650000],
    service_annual: 0,
    instrument_cost_per_case: 2200,
    min_or_sqft: 700,
    min_ceiling_ft: 10,
    capabilities: ['multi_quadrant', 'force_feedback', 'case_insights', 'cloud_analytics', 'advanced_imaging', 'dual_console', 'training_console'],
    specialties: ['urology', 'gynecology', 'general', 'thoracic', 'colorectal', 'cardiac', 'head_neck'],
    ideal_volume: 350,
    min_volume: 200,
    training_weeks: 4,
    setup_time_min: 15,
    description: 'Flagship dual-console system enabling proctoring, training, and collaborative surgery with full dV5 capabilities'
  },
  Xi_Dual: {
    name: 'da Vinci Xi Dual Console',
    price_range: [1800000, 2400000],
    lease_annual: [320000, 480000],
    service_annual: 200000,
    instrument_cost_per_case: 1800,
    min_or_sqft: 650,
    min_ceiling_ft: 10,
    capabilities: ['multi_quadrant', 'firefly', 'integrated_table_motion', 'dual_console', 'training_console'],
    specialties: ['urology', 'gynecology', 'general', 'thoracic', 'colorectal'],
    ideal_volume: 300,
    min_volume: 150,
    training_weeks: 3,
    setup_time_min: 20,
    description: 'Dual-console Xi system for surgeon training programs and collaborative procedures'
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

  // New expanded analytics
  results.procedure_pareto = computeProcedurePareto(project, results.volume_projection);
  results.monthly_seasonality = computeMonthlySeasonality(project, results.volume_projection);
  results.weekday_distribution = computeWeekdayDistribution(project, results.volume_projection);
  results.hourly_distribution = computeHourlyDistribution(project, results.utilization_forecast);
  results.design_day_analysis = computeDesignDayAnalysis(project, results.volume_projection);
  results.robot_compatibility_matrix = computeCompatibilityMatrix(project, results.volume_projection);
  results.financial_deep_dive = computeFinancialDeepDive(project, results.model_matching, results.volume_projection, results.roi_calculation);
  results.growth_extrapolation = computeGrowthExtrapolation(project, results.volume_projection, results.utilization_forecast);

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
// CFO-focused: shows total hospital volume, current approach mix, and da Vinci opportunity
function computeVolumeProjection(p) {
  const totalSurgical = p.annual_surgical_volume || 0;
  const currentRobotic = p.current_robotic_cases || 0;

  // Current approach breakdown (estimate if not provided)
  const currentRoboticPct = totalSurgical > 0 ? Math.round((currentRobotic / totalSurgical) * 100) : 0;
  const currentOpenPct = Math.max(0, Math.round((100 - currentRoboticPct) * 0.55)); // ~55% of non-robotic is open
  const currentLapPct = Math.max(0, 100 - currentRoboticPct - currentOpenPct);

  const currentOpen = Math.round(totalSurgical * currentOpenPct / 100);
  const currentLap = Math.round(totalSurgical * currentLapPct / 100);

  const convertibleLap = p.convertible_lap_cases || Math.round(totalSurgical * 0.3);

  // Specialty-weighted conversion rates -- what % of each specialty CAN go robotic
  const conversionRates = {
    urology: 0.85,
    gynecology: 0.45,
    general: 0.25,
    thoracic: 0.30,
    colorectal: 0.35,
    head_neck: 0.20,
    cardiac: 0.15
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
      const maxConvertible = Math.round(specVolume * conversionRates[spec]);
      // Current robotic in this specialty (proportional to overall robotic rate)
      const specCurrentRobotic = Math.round(specVolume * currentRoboticPct / 100);
      const specCurrentOpen = Math.round(specVolume * currentOpenPct / 100);
      const specCurrentLap = specVolume - specCurrentRobotic - specCurrentOpen;
      // Incremental opportunity = convertible minus what's already robotic
      const incrementalOpportunity = Math.max(0, maxConvertible - specCurrentRobotic);

      bySpecialty[spec] = {
        total_volume: specVolume,
        current_open: specCurrentOpen,
        current_lap: Math.max(0, specCurrentLap),
        current_robotic: specCurrentRobotic,
        max_convertible: maxConvertible,
        incremental_opportunity: incrementalOpportunity,
        conversion_rate: conversionRates[spec],
        pct
      };
      weightedConversion += conversionRates[spec] * (pct / 100);
      totalPct += pct;
    }
  }

  const totalIncrementalOpportunity = Object.values(bySpecialty).reduce((s, v) => s + v.incremental_opportunity, 0);

  // 5-year ramp-up from current state
  const year1Adoption = 0.4;
  const projections = [];
  for (let yr = 1; yr <= 5; yr++) {
    const adoptionRate = Math.min(1.0, year1Adoption + (yr - 1) * 0.15);
    const newRoboticCases = Math.round(totalIncrementalOpportunity * adoptionRate);
    const totalRobotic = currentRobotic + newRoboticCases;
    const remainingOpen = Math.max(0, currentOpen - Math.round(newRoboticCases * 0.6));
    const remainingLap = Math.max(0, totalSurgical - totalRobotic - remainingOpen);
    projections.push({
      year: yr,
      adoption_rate: Math.round(adoptionRate * 100),
      total_surgical: totalSurgical,
      current_robotic: currentRobotic,
      new_robotic_cases: newRoboticCases,
      total_robotic: totalRobotic,
      remaining_open: remainingOpen,
      remaining_lap: remainingLap,
      robotic_pct: totalSurgical > 0 ? Math.round((totalRobotic / totalSurgical) * 100) : 0,
      cases_per_week: Math.round(totalRobotic / 50 * 10) / 10
    });
  }

  return {
    // Hospital totals -- what the CFO sees first
    total_surgical: totalSurgical,
    current_approach_mix: {
      open: { cases: currentOpen, pct: currentOpenPct },
      laparoscopic: { cases: currentLap, pct: currentLapPct },
      robotic: { cases: currentRobotic, pct: currentRoboticPct }
    },
    // da Vinci opportunity
    total_incremental_opportunity: totalIncrementalOpportunity,
    convertible_laparoscopic: convertibleLap,
    weighted_conversion_rate: Math.round(weightedConversion * 100),
    // Per-specialty breakdown
    by_specialty: bySpecialty,
    // 5-year projection
    projections,
    // Design year = Year 3 total robotic (current + incremental)
    design_year_cases: projections[2]?.total_robotic || 0,
    design_year_new_cases: projections[2]?.new_robotic_cases || 0,
    // Current state
    current_robotic: currentRobotic
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
    risks.push({ category: 'Financial', severity: 'moderate', description: `${p.value_based_contract_pct}% value-based contracts. Per-case cost premium may impact margins under bundled payments.`, mitigation: 'Implement ImagingMind outcome tracking to demonstrate value-based ROI.' });
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

// ─── PROCEDURE PARETO (ABC ANALYSIS) ───
// CFO-focused: shows TOTAL hospital volume per procedure with open/lap/robotic breakdown
// and da Vinci conversion opportunity
function computeProcedurePareto(p, volumeProj) {
  const PROCEDURE_CATALOG = {
    urology: [
      { name: 'Radical Prostatectomy', weight: 0.35, robotic_eligible_pct: 95 },
      { name: 'Partial Nephrectomy', weight: 0.20, robotic_eligible_pct: 85 },
      { name: 'Radical Nephrectomy', weight: 0.12, robotic_eligible_pct: 80 },
      { name: 'Cystectomy', weight: 0.10, robotic_eligible_pct: 75 },
      { name: 'Pyeloplasty', weight: 0.08, robotic_eligible_pct: 90 },
      { name: 'Nephroureterectomy', weight: 0.06, robotic_eligible_pct: 70 },
      { name: 'Adrenalectomy', weight: 0.05, robotic_eligible_pct: 65 },
      { name: 'Ureteral Reimplant', weight: 0.04, robotic_eligible_pct: 60 }
    ],
    gynecology: [
      { name: 'Hysterectomy (Benign)', weight: 0.30, robotic_eligible_pct: 80 },
      { name: 'Hysterectomy (Oncologic)', weight: 0.15, robotic_eligible_pct: 70 },
      { name: 'Myomectomy', weight: 0.18, robotic_eligible_pct: 65 },
      { name: 'Sacrocolpopexy', weight: 0.12, robotic_eligible_pct: 85 },
      { name: 'Endometriosis Excision', weight: 0.10, robotic_eligible_pct: 50 },
      { name: 'Oophorectomy', weight: 0.08, robotic_eligible_pct: 40 },
      { name: 'Lymph Node Dissection (GYN)', weight: 0.07, robotic_eligible_pct: 60 }
    ],
    general: [
      { name: 'Inguinal Hernia Repair', weight: 0.25, robotic_eligible_pct: 45 },
      { name: 'Cholecystectomy', weight: 0.20, robotic_eligible_pct: 20 },
      { name: 'Ventral Hernia Repair', weight: 0.15, robotic_eligible_pct: 55 },
      { name: 'Nissen Fundoplication', weight: 0.12, robotic_eligible_pct: 60 },
      { name: 'Heller Myotomy', weight: 0.08, robotic_eligible_pct: 70 },
      { name: 'Gastric Bypass', weight: 0.10, robotic_eligible_pct: 30 },
      { name: 'Sleeve Gastrectomy', weight: 0.10, robotic_eligible_pct: 25 }
    ],
    thoracic: [
      { name: 'Lobectomy', weight: 0.35, robotic_eligible_pct: 65 },
      { name: 'Segmentectomy', weight: 0.20, robotic_eligible_pct: 60 },
      { name: 'Thymectomy', weight: 0.15, robotic_eligible_pct: 70 },
      { name: 'Mediastinal Mass Resection', weight: 0.15, robotic_eligible_pct: 50 },
      { name: 'Esophagectomy', weight: 0.15, robotic_eligible_pct: 35 }
    ],
    colorectal: [
      { name: 'Low Anterior Resection', weight: 0.30, robotic_eligible_pct: 70 },
      { name: 'Right Hemicolectomy', weight: 0.22, robotic_eligible_pct: 55 },
      { name: 'Left Hemicolectomy', weight: 0.15, robotic_eligible_pct: 55 },
      { name: 'Sigmoid Colectomy', weight: 0.13, robotic_eligible_pct: 50 },
      { name: 'Total Colectomy', weight: 0.08, robotic_eligible_pct: 30 },
      { name: 'Rectopexy', weight: 0.07, robotic_eligible_pct: 75 },
      { name: 'Abdominoperineal Resection', weight: 0.05, robotic_eligible_pct: 40 }
    ],
    head_neck: [
      { name: 'TORS - Oropharyngeal', weight: 0.40, robotic_eligible_pct: 90 },
      { name: 'TORS - Base of Tongue', weight: 0.25, robotic_eligible_pct: 90 },
      { name: 'TORS - Supraglottic Laryngectomy', weight: 0.15, robotic_eligible_pct: 80 },
      { name: 'Thyroidectomy', weight: 0.20, robotic_eligible_pct: 30 }
    ],
    cardiac: [
      { name: 'Mitral Valve Repair', weight: 0.35, robotic_eligible_pct: 40 },
      { name: 'CABG (Robotic Harvest)', weight: 0.25, robotic_eligible_pct: 35 },
      { name: 'Atrial Septal Defect Repair', weight: 0.20, robotic_eligible_pct: 45 },
      { name: 'Cardiac Tumor Resection', weight: 0.20, robotic_eligible_pct: 25 }
    ]
  };

  const procedures = [];
  const specialties = {
    urology: p.specialty_urology || 0,
    gynecology: p.specialty_gynecology || 0,
    general: p.specialty_general || 0,
    thoracic: p.specialty_thoracic || 0,
    colorectal: p.specialty_colorectal || 0,
    head_neck: p.specialty_head_neck || 0,
    cardiac: p.specialty_cardiac || 0
  };

  // Use TOTAL hospital surgical volume, not just projected robotic
  const totalSurgical = p.annual_surgical_volume || 500;
  const currentRoboticPct = totalSurgical > 0 ? ((p.current_robotic_cases || 0) / totalSurgical) * 100 : 0;

  for (const [spec, pct] of Object.entries(specialties)) {
    if (pct <= 0 || !PROCEDURE_CATALOG[spec]) continue;
    const specVolume = Math.round(totalSurgical * (pct / 100));
    for (const proc of PROCEDURE_CATALOG[spec]) {
      const totalCases = Math.round(specVolume * proc.weight);
      if (totalCases <= 0) continue;

      // Current approach breakdown for this procedure
      const currentRobotic = Math.round(totalCases * currentRoboticPct / 100);
      const currentOpen = Math.round((totalCases - currentRobotic) * 0.55);
      const currentLap = totalCases - currentRobotic - currentOpen;

      // da Vinci opportunity
      const maxRobotic = Math.round(totalCases * proc.robotic_eligible_pct / 100);
      const incrementalOpportunity = Math.max(0, maxRobotic - currentRobotic);

      procedures.push({
        procedure_name: proc.name,
        specialty: spec,
        // Total hospital volume for this procedure
        total_cases: totalCases,
        // Current approach mix
        current_open: currentOpen,
        current_lap: Math.max(0, currentLap),
        current_robotic: currentRobotic,
        // da Vinci opportunity
        robotic_eligible_pct: proc.robotic_eligible_pct,
        max_robotic_cases: maxRobotic,
        incremental_opportunity: incrementalOpportunity,
        // For backward compatibility
        cases: totalCases
      });
    }
  }

  // Sort by incremental opportunity (what the CFO cares about)
  procedures.sort((a, b) => b.incremental_opportunity - a.incremental_opportunity);
  const totalCases = procedures.reduce((s, p) => s + p.total_cases, 0);
  const totalOpportunity = procedures.reduce((s, p) => s + p.incremental_opportunity, 0);
  const totalCurrentRobotic = procedures.reduce((s, p) => s + p.current_robotic, 0);

  // ABC classification by incremental opportunity (not total volume)
  let cumulativeOpp = 0;
  const classified = [];
  procedures.forEach((proc, idx) => {
    cumulativeOpp += proc.incremental_opportunity;
    const cumPct = totalOpportunity > 0 ? (cumulativeOpp / totalOpportunity) * 100 : 0;
    const abc_class = cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C';
    classified.push({ ...proc, cumulative_opportunity_pct: cumPct, abc_class });
  });

  // Lorenz curve on opportunity
  let cumulativeVolume = 0;
  const lorenz_curve = classified.map((proc, idx) => {
    cumulativeVolume += proc.incremental_opportunity;
    return {
      cumulative_items_pct: Math.round(((idx + 1) / classified.length) * 1000) / 10,
      cumulative_volume_pct: totalOpportunity > 0 ? Math.round((cumulativeVolume / totalOpportunity) * 1000) / 10 : 0,
      procedure_name: proc.procedure_name,
      abc_class: proc.abc_class
    };
  });

  const n = classified.length;
  let areaUnderLorenz = 0;
  for (let i = 0; i < n; i++) {
    const x0 = i / n;
    const x1 = (i + 1) / n;
    const y0 = i === 0 ? 0 : lorenz_curve[i - 1].cumulative_volume_pct / 100;
    const y1 = lorenz_curve[i].cumulative_volume_pct / 100;
    areaUnderLorenz += (x1 - x0) * (y0 + y1) / 2;
  }
  const gini_coefficient = Math.round(Math.abs(2 * areaUnderLorenz - 1) * 1000) / 1000;

  const classA = classified.filter(c => c.abc_class === 'A');
  const classB = classified.filter(c => c.abc_class === 'B');
  const classC = classified.filter(c => c.abc_class === 'C');
  const classes = {
    A: { count: classA.length, pct: n > 0 ? Math.round((classA.length / n) * 1000) / 10 : 0, opportunity: classA.reduce((s, c) => s + c.incremental_opportunity, 0) },
    B: { count: classB.length, pct: n > 0 ? Math.round((classB.length / n) * 1000) / 10 : 0, opportunity: classB.reduce((s, c) => s + c.incremental_opportunity, 0) },
    C: { count: classC.length, pct: n > 0 ? Math.round((classC.length / n) * 1000) / 10 : 0, opportunity: classC.reduce((s, c) => s + c.incremental_opportunity, 0) }
  };

  return {
    procedures: classified,
    lorenz_curve,
    gini_coefficient,
    classes,
    total_procedures: n,
    // CFO summary
    total_hospital_cases: totalCases,
    total_current_robotic: totalCurrentRobotic,
    total_incremental_opportunity: totalOpportunity,
    current_robotic_pct: totalCases > 0 ? Math.round((totalCurrentRobotic / totalCases) * 100) : 0,
    projected_robotic_pct: totalCases > 0 ? Math.round(((totalCurrentRobotic + totalOpportunity) / totalCases) * 100) : 0,
    // backward compat
    total_cases: totalCases
  };
}

// ─── MONTHLY SEASONALITY ───
// CFO-focused: shows total surgical volume, current robotic, and projected robotic per month
function computeMonthlySeasonality(p, volumeProj) {
  const totalAnnual = p.annual_surgical_volume || 500;
  const currentRobotic = p.current_robotic_cases || 0;
  const projectedTotalRobotic = volumeProj.design_year_cases || 0;
  const incrementalRobotic = Math.max(0, projectedTotalRobotic - currentRobotic);

  const monthWeights = {
    Jan: 1.12, Feb: 1.08, Mar: 1.10, Apr: 1.02, May: 0.98,
    Jun: 0.92, Jul: 0.85, Aug: 0.88, Sep: 1.05, Oct: 1.08,
    Nov: 0.98, Dec: 0.74
  };
  const totalWeight = Object.values(monthWeights).reduce((s, w) => s + w, 0);

  const seed = (totalAnnual) + (p.bed_count || 200);
  const pseudoRandom = (i) => {
    const x = Math.sin(seed * 9301 + i * 49297) * 49297;
    return x - Math.floor(x);
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthly_data = months.map((month, i) => {
    const w = monthWeights[month] / totalWeight;
    const noise = 1 + (pseudoRandom(i) - 0.5) * 0.12;

    const total_cases = Math.max(1, Math.round(totalAnnual * w * noise));
    const current_robotic = Math.round(currentRobotic * w * noise);
    const projected_robotic = Math.round(projectedTotalRobotic * w * noise);
    const incremental = Math.max(0, projected_robotic - current_robotic);
    const open_lap = Math.max(0, total_cases - projected_robotic);

    return {
      month,
      total_cases,
      current_robotic,
      projected_robotic,
      incremental_davinci: incremental,
      remaining_open_lap: open_lap,
      // backward compat
      cases: total_cases,
      robotic_cases: projected_robotic,
      utilization_pct: Math.round(Math.min(100, (total_cases / (totalAnnual / 12)) * 100 * (0.7 + pseudoRandom(i + 100) * 0.25)))
    };
  });

  const casesArr = monthly_data.map(m => m.total_cases);
  const mean = casesArr.reduce((s, v) => s + v, 0) / casesArr.length;
  const variance = casesArr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / casesArr.length;
  const stdDev = Math.sqrt(variance);
  const coefficient_of_variation = Math.round((stdDev / mean) * 1000) / 10;
  const seasonality_class = coefficient_of_variation < 15 ? 'X' : coefficient_of_variation < 30 ? 'Y' : 'Z';
  const seasonality_label = seasonality_class === 'X' ? 'Stable' : seasonality_class === 'Y' ? 'Seasonal' : 'Erratic';

  return {
    monthly_data,
    coefficient_of_variation,
    seasonality_class,
    seasonality_label,
    annual_total: totalAnnual,
    annual_current_robotic: currentRobotic,
    annual_projected_robotic: projectedTotalRobotic,
    annual_incremental: incrementalRobotic,
    mean_monthly: Math.round(mean)
  };
}

// ─── WEEKDAY DISTRIBUTION ───
// CFO-focused: shows total, current robotic, and projected robotic per day
function computeWeekdayDistribution(p, volumeProj) {
  const totalAnnual = p.annual_surgical_volume || 500;
  const currentRobotic = p.current_robotic_cases || 0;
  const projectedTotalRobotic = volumeProj.design_year_cases || 0;
  const weeklyTotal = totalAnnual / 50;
  const weeklyCurrentRobotic = currentRobotic / 50;
  const weeklyProjectedRobotic = projectedTotalRobotic / 50;

  const dayWeights = { Mon: 0.21, Tue: 0.24, Wed: 0.23, Thu: 0.19, Fri: 0.11, Sat: 0.02, Sun: 0.00 };
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return {
    weekday_data: days.map(day => {
      const total = Math.round(weeklyTotal * dayWeights[day]);
      const currentRob = Math.round(weeklyCurrentRobotic * dayWeights[day]);
      const projectedRob = Math.round(weeklyProjectedRobotic * dayWeights[day]);
      const incremental = Math.max(0, projectedRob - currentRob);
      return {
        day,
        total_cases: total,
        current_robotic: currentRob,
        projected_robotic: projectedRob,
        incremental_davinci: incremental,
        remaining_open_lap: Math.max(0, total - projectedRob),
        // backward compat
        cases: total,
        robotic_cases: projectedRob,
        robotic_pct: total > 0 ? Math.round((projectedRob / total) * 100) : 0
      };
    }),
    peak_day: 'Tue',
    operating_days_per_week: 5.5,
    weekly_total: Math.round(weeklyTotal),
    weekly_current_robotic: Math.round(weeklyCurrentRobotic),
    weekly_projected_robotic: Math.round(weeklyProjectedRobotic)
  };
}

// ─── HOURLY DISTRIBUTION ───
function computeHourlyDistribution(p, utilForecast) {
  const casesPerDay = utilForecast.cases_per_day || 3;
  // Realistic hourly OR utilization pattern
  const hourWeights = {
    '06:00': 0.02, '07:00': 0.08, '08:00': 0.14, '09:00': 0.15,
    '10:00': 0.14, '11:00': 0.12, '12:00': 0.08, '13:00': 0.07,
    '14:00': 0.08, '15:00': 0.06, '16:00': 0.04, '17:00': 0.02,
    '18:00': 0.00, '19:00': 0.00
  };
  const totalWeight = Object.values(hourWeights).reduce((s, w) => s + w, 0);

  const hourly_data = Object.entries(hourWeights).map(([hour, weight]) => {
    const or_utilization_pct = Math.round((weight / 0.15) * 100); // 0.15 is max => 100%
    const cases = Math.round(casesPerDay * weight / totalWeight * 10) / 10;
    return { hour, cases, or_utilization_pct: Math.min(100, or_utilization_pct) };
  });

  const peakHour = hourly_data.reduce((max, h) => h.or_utilization_pct > max.or_utilization_pct ? h : max);
  return { hourly_data, peak_hour: peakHour.hour, peak_utilization: peakHour.or_utilization_pct, first_case_start: '07:00', last_case_end: '17:00' };
}

// ─── DESIGN DAY ANALYSIS ───
function computeDesignDayAnalysis(p, volumeProj) {
  const annualCases = volumeProj.design_year_cases || p.annual_surgical_volume || 500;
  const operatingDays = 250;
  const meanDaily = annualCases / operatingDays;

  // Assume daily volumes follow a roughly Poisson-like distribution
  // Generate percentiles using normal approximation
  const stdDev = Math.sqrt(meanDaily) * 1.2; // Slightly overdispersed

  const zScores = { P50: 0, P75: 0.674, P90: 1.282, P95: 1.645, P99: 2.326 };
  const percentiles = {};
  for (const [label, z] of Object.entries(zScores)) {
    percentiles[label] = Math.max(1, Math.round(meanDaily + z * stdDev));
  }

  return {
    mean_daily_cases: Math.round(meanDaily * 10) / 10,
    std_dev: Math.round(stdDev * 10) / 10,
    percentiles,
    design_day: percentiles.P75,
    design_day_label: 'P75',
    design_day_recommendation: `Plan system capacity for ${percentiles.P75} cases/day (P75). This covers 75% of operating days without overflow.`,
    max_day_estimate: percentiles.P99,
    operating_days_per_year: operatingDays
  };
}

// ─── ROBOT COMPATIBILITY MATRIX ───
function computeCompatibilityMatrix(p, volumeProj) {
  // Fit scores for each procedure category vs each system model
  const FIT_SCORES = {
    'Radical Prostatectomy':      { dV5: 98, Xi: 92, X: 75, SP: 85 },
    'Partial Nephrectomy':        { dV5: 96, Xi: 90, X: 72, SP: 60 },
    'Radical Nephrectomy':        { dV5: 94, Xi: 88, X: 70, SP: 55 },
    'Cystectomy':                 { dV5: 97, Xi: 90, X: 65, SP: 50 },
    'Pyeloplasty':                { dV5: 95, Xi: 88, X: 70, SP: 75 },
    'Hysterectomy (Benign)':      { dV5: 95, Xi: 92, X: 82, SP: 50 },
    'Hysterectomy (Oncologic)':   { dV5: 97, Xi: 88, X: 65, SP: 45 },
    'Myomectomy':                 { dV5: 94, Xi: 90, X: 78, SP: 45 },
    'Sacrocolpopexy':             { dV5: 96, Xi: 92, X: 75, SP: 40 },
    'Inguinal Hernia Repair':     { dV5: 90, Xi: 88, X: 85, SP: 45 },
    'Cholecystectomy':            { dV5: 85, Xi: 82, X: 80, SP: 70 },
    'Ventral Hernia Repair':      { dV5: 92, Xi: 88, X: 78, SP: 40 },
    'Lobectomy':                  { dV5: 96, Xi: 88, X: 55, SP: 35 },
    'Low Anterior Resection':     { dV5: 97, Xi: 92, X: 60, SP: 40 },
    'Right Hemicolectomy':        { dV5: 94, Xi: 90, X: 65, SP: 38 },
    'TORS - Oropharyngeal':       { dV5: 80, Xi: 55, X: 30, SP: 95 },
    'TORS - Base of Tongue':      { dV5: 78, Xi: 50, X: 25, SP: 96 },
    'Mitral Valve Repair':        { dV5: 95, Xi: 70, X: 30, SP: 35 },
    'CABG (Robotic Harvest)':     { dV5: 92, Xi: 68, X: 28, SP: 30 },
    // Generic fallback
    '_default':                   { dV5: 85, Xi: 78, X: 65, SP: 50 }
  };

  const procedures = volumeProj.by_specialty ? Object.entries(volumeProj.by_specialty) : [];
  const PROCEDURE_NAMES = {
    urology: ['Radical Prostatectomy', 'Partial Nephrectomy', 'Cystectomy', 'Pyeloplasty'],
    gynecology: ['Hysterectomy (Benign)', 'Myomectomy', 'Sacrocolpopexy'],
    general: ['Inguinal Hernia Repair', 'Cholecystectomy', 'Ventral Hernia Repair'],
    thoracic: ['Lobectomy'],
    colorectal: ['Low Anterior Resection', 'Right Hemicolectomy'],
    head_neck: ['TORS - Oropharyngeal', 'TORS - Base of Tongue'],
    cardiac: ['Mitral Valve Repair', 'CABG (Robotic Harvest)']
  };

  const matrix = [];
  for (const [spec, data] of procedures) {
    const procNames = PROCEDURE_NAMES[spec] || [];
    for (const procName of procNames) {
      const scores = FIT_SCORES[procName] || FIT_SCORES._default;
      const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
      matrix.push({
        procedure: procName,
        specialty: spec,
        dV5_fit: scores.dV5,
        Xi_fit: scores.Xi,
        X_fit: scores.X,
        SP_fit: scores.SP,
        recommended_model: best[0],
        best_fit_score: best[1]
      });
    }
  }

  // Overall best model by weighted average
  let modelTotals = { dV5: 0, Xi: 0, X: 0, SP: 0 };
  matrix.forEach(row => {
    modelTotals.dV5 += row.dV5_fit;
    modelTotals.Xi += row.Xi_fit;
    modelTotals.X += row.X_fit;
    modelTotals.SP += row.SP_fit;
  });
  const n = matrix.length || 1;
  const model_averages = { dV5: Math.round(modelTotals.dV5 / n), Xi: Math.round(modelTotals.Xi / n), X: Math.round(modelTotals.X / n), SP: Math.round(modelTotals.SP / n) };
  const overall_best = Object.entries(model_averages).sort((a, b) => b[1] - a[1])[0];

  return { compatibility_matrix: matrix, model_averages, overall_best_model: overall_best[0], overall_best_score: overall_best[1] };
}

// ─── FINANCIAL DEEP DIVE ───
function computeFinancialDeepDive(p, modelMatch, volumeProj, roiCalc) {
  const rec = modelMatch.primary_recommendation;
  const sys = SYSTEMS[rec.model];
  const designCases = volumeProj.design_year_cases;

  // Per-procedure economics
  const avgRoboticRevenue = 18000;
  const avgLapRevenue = 12000;
  const avgRoboticCost = 8500;
  const avgLapCost = 6000;
  const perProcEconomics = {
    robotic: { revenue: avgRoboticRevenue, cost: avgRoboticCost, margin: avgRoboticRevenue - avgRoboticCost },
    laparoscopic: { revenue: avgLapRevenue, cost: avgLapCost, margin: avgLapRevenue - avgLapCost },
    incremental_margin: (avgRoboticRevenue - avgRoboticCost) - (avgLapRevenue - avgLapCost)
  };

  // Total cost of ownership
  const avgPrice = (sys.price_range[0] + sys.price_range[1]) / 2;
  const systemsNeeded = Math.max(1, Math.ceil(designCases / (sys.ideal_volume * 1.2)));
  const fiveYearInstruments = designCases * sys.instrument_cost_per_case * 5;
  const fiveYearService = sys.service_annual * 5;
  const trainingCost = (p.surgeons_interested || 2) * 35000;
  const renovationCost = (p.robot_ready_ors === 0) ? 750000 : (p.or_sqft && p.or_sqft < 600 ? 200000 : 0);

  const total_cost_of_ownership = {
    system_acquisition: avgPrice * systemsNeeded,
    instruments_5yr: fiveYearInstruments,
    service_5yr: fiveYearService,
    training: trainingCost,
    renovation: renovationCost,
    total_5yr: avgPrice * systemsNeeded + fiveYearInstruments + fiveYearService + trainingCost + renovationCost
  };

  // Payer mix adjusted revenue (use actual hospital data)
  const payerMix = {
    medicare: { pct: p.payer_medicare_pct || 35, reimbursement_factor: 0.75 },
    medicaid: { pct: p.payer_medicaid_pct || 10, reimbursement_factor: 0.55 },
    commercial: { pct: p.payer_commercial_pct || 45, reimbursement_factor: 1.15 },
    self_pay: { pct: p.payer_self_pay_pct || 5, reimbursement_factor: 0.90 },
    other: { pct: Math.max(0, 100 - (p.payer_medicare_pct || 35) - (p.payer_medicaid_pct || 10) - (p.payer_commercial_pct || 45) - (p.payer_self_pay_pct || 5)), reimbursement_factor: 0.80 }
  };
  let weightedReimbursement = 0;
  for (const [, mix] of Object.entries(payerMix)) {
    weightedReimbursement += (mix.pct / 100) * mix.reimbursement_factor;
  }
  const payer_adjusted_revenue = Math.round(avgRoboticRevenue * weightedReimbursement * designCases);

  // Break-even monthly data
  const monthlyBenefit = roiCalc.annual_net_benefit / 12;
  const capitalCost = roiCalc.capital_cost;
  const breakeven_data = Array.from({ length: 60 }, (_, i) => {
    const month = i + 1;
    const cumCost = capitalCost + (roiCalc.annual_costs.total / 12) * month;
    const cumBenefit = (roiCalc.annual_benefits.total / 12) * month;
    return { month, cumulative_cost: Math.round(cumCost), cumulative_benefit: Math.round(cumBenefit), net: Math.round(cumBenefit - cumCost) };
  });

  const breakeven_month = breakeven_data.find(d => d.net >= 0)?.month || null;

  return {
    per_procedure_economics: perProcEconomics,
    total_cost_of_ownership,
    total_cost_of_ownership_5yr: total_cost_of_ownership.total_5yr,
    payer_mix: payerMix,
    payer_adjusted_annual_revenue: payer_adjusted_revenue,
    weighted_reimbursement_factor: Math.round(weightedReimbursement * 100) / 100,
    breakeven_data,
    breakeven_month,
    systems_in_calculation: systemsNeeded
  };
}

// ─── GROWTH EXTRAPOLATION ───
function computeGrowthExtrapolation(p, volumeProj, utilForecast) {
  const baselineCases = volumeProj.design_year_cases || 200;
  const scenarios = {
    conservative: { label: 'Conservative', growth_rate: 0.10, color: '#94a3b8' },
    baseline: { label: 'Baseline', growth_rate: 0.15, color: '#3b82f6' },
    aggressive: { label: 'Aggressive', growth_rate: 0.20, color: '#22c55e' }
  };

  const projections = {};
  const fleet_projections = {};
  const maxCasesPerSystem = utilForecast.max_cases_per_system_year || 500;

  for (const [key, scenario] of Object.entries(scenarios)) {
    const years = [];
    for (let yr = 1; yr <= 5; yr++) {
      const cases = Math.round(baselineCases * Math.pow(1 + scenario.growth_rate, yr));
      const systemsNeeded = Math.ceil(cases / (maxCasesPerSystem * 0.8));
      years.push({ year: yr, projected_cases: cases, systems_needed: systemsNeeded, revenue: cases * 18000 });
    }
    projections[key] = years;
    fleet_projections[key] = years.map(y => ({ year: y.year, systems: y.systems_needed }));
  }

  // Specialty growth rates (some specialties grow faster than others)
  const specialtyGrowth = {};
  const growthRates = {
    urology: 0.12, gynecology: 0.18, general: 0.20, thoracic: 0.15,
    colorectal: 0.22, head_neck: 0.10, cardiac: 0.08
  };
  for (const [spec, data] of Object.entries(volumeProj.by_specialty || {})) {
    if (data.convertible > 0) {
      specialtyGrowth[spec] = {
        current: data.convertible,
        year5: Math.round(data.convertible * Math.pow(1 + (growthRates[spec] || 0.15), 5)),
        cagr_pct: Math.round((growthRates[spec] || 0.15) * 100)
      };
    }
  }

  // Chart-friendly format: array of {year, conservative, baseline, aggressive}
  const chart_data = Array.from({ length: 5 }, (_, i) => ({
    year: `Year ${i + 1}`,
    conservative: projections.conservative[i].projected_cases,
    baseline: projections.baseline[i].projected_cases,
    aggressive: projections.aggressive[i].projected_cases
  }));

  return { scenarios, projections, fleet_projections, specialty_growth: specialtyGrowth, chart_data, base_year_cases: baselineCases };
}

module.exports = { runAll, SYSTEMS };
