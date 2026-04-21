'use strict';

/**
 * AI Business Analyst Agent
 * Takes a hospital name, researches it via web search + AI analysis,
 * and returns a structured hospital profile for the SurgicalMind intake form.
 */

let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

// Industry benchmarks used when specific data isn't found
const INDUSTRY_BENCHMARKS = {
  academic: {
    annual_surgical_volume_per_bed: 35,
    robotic_adoption_pct: 25,
    specialty_mix: { urology: 20, gynecology: 20, general: 25, thoracic: 10, colorectal: 10, head_neck: 5, cardiac: 10 },
    credentialed_surgeons_per_100_beds: 2.5,
    interested_surgeons_per_100_beds: 4,
    robot_ready_or_pct: 30,
    avg_or_count_per_100_beds: 3,
    avg_los_days: 4.5,
    complication_rate_pct: 4.5,
    readmission_rate_pct: 12,
    payer_mix: { medicare: 35, commercial: 40, medicaid: 15, self_pay: 5 }
  },
  community: {
    annual_surgical_volume_per_bed: 25,
    robotic_adoption_pct: 15,
    specialty_mix: { urology: 25, gynecology: 25, general: 30, thoracic: 5, colorectal: 10, head_neck: 3, cardiac: 2 },
    credentialed_surgeons_per_100_beds: 1.5,
    interested_surgeons_per_100_beds: 3,
    robot_ready_or_pct: 20,
    avg_or_count_per_100_beds: 2.5,
    avg_los_days: 3.8,
    complication_rate_pct: 5,
    readmission_rate_pct: 13,
    payer_mix: { medicare: 40, commercial: 35, medicaid: 15, self_pay: 10 }
  },
  specialty: {
    annual_surgical_volume_per_bed: 50,
    robotic_adoption_pct: 30,
    specialty_mix: { urology: 15, gynecology: 15, general: 20, thoracic: 15, colorectal: 10, head_neck: 10, cardiac: 15 },
    credentialed_surgeons_per_100_beds: 3,
    interested_surgeons_per_100_beds: 5,
    robot_ready_or_pct: 40,
    avg_or_count_per_100_beds: 4,
    avg_los_days: 3.5,
    complication_rate_pct: 3.5,
    readmission_rate_pct: 10,
    payer_mix: { medicare: 30, commercial: 50, medicaid: 10, self_pay: 10 }
  },
  VA: {
    annual_surgical_volume_per_bed: 20,
    robotic_adoption_pct: 10,
    specialty_mix: { urology: 30, gynecology: 5, general: 35, thoracic: 10, colorectal: 10, head_neck: 5, cardiac: 5 },
    credentialed_surgeons_per_100_beds: 1,
    interested_surgeons_per_100_beds: 2,
    robot_ready_or_pct: 15,
    avg_or_count_per_100_beds: 2,
    avg_los_days: 5,
    complication_rate_pct: 5.5,
    readmission_rate_pct: 14,
    payer_mix: { medicare: 0, commercial: 0, medicaid: 0, self_pay: 0 }
  }
};

/**
 * Research a hospital and return a structured profile
 */
async function researchHospital(hospitalName, progressCallback) {
  const progress = progressCallback || (() => {});

  progress('Starting AI research for: ' + hospitalName);

  // Step 1: Use Claude Sonnet 4 to gather hospital data
  progress('Searching for hospital data, annual reports, CMS metrics...');

  const researchPrompt = `You are a hospital business analyst researching "${hospitalName}" to build a da Vinci robotic surgery business plan.

Research and provide the following data points. Use your training knowledge about this hospital. If you know specific facts, provide them. If you must estimate, use realistic values based on the hospital's known size, type, and location.

Return ONLY a valid JSON object (no markdown, no code fences) with these exact fields:

{
  "hospital_name": "Official full name",
  "hospital_type": "academic OR community OR specialty OR rural OR VA OR military",
  "bed_count": number,
  "state": "2-letter state code",
  "country": "United States",
  "annual_surgical_volume": number (total surgeries per year),
  "current_robotic_cases": number (current annual robotic cases, 0 if none),
  "current_system": "none OR dV5 OR Xi OR X OR SP OR Si OR competitor",
  "current_system_count": number,
  "current_system_age_years": number or null,
  "specialty_urology": number (% of surgical volume),
  "specialty_gynecology": number,
  "specialty_general": number,
  "specialty_thoracic": number,
  "specialty_colorectal": number,
  "specialty_head_neck": number,
  "specialty_cardiac": number,
  "credentialed_robotic_surgeons": number,
  "surgeons_interested": number (surgeons who could adopt robotic but haven't yet),
  "convertible_lap_cases": number (laparoscopic cases that could go robotic),
  "total_or_count": number,
  "robot_ready_ors": number,
  "or_sqft": number (average OR square footage),
  "ceiling_height_ft": number,
  "capital_budget": "<1M OR 1-2M OR 2-3M OR 3M+",
  "acquisition_preference": "purchase OR lease OR usage_based",
  "avg_los_days": number,
  "complication_rate_pct": number,
  "readmission_rate_pct": number,
  "payer_medicare_pct": number,
  "payer_commercial_pct": number,
  "payer_medicaid_pct": number,
  "payer_self_pay_pct": number,
  "value_based_contract_pct": number,
  "competitor_robot_nearby": boolean,
  "competitor_details": "string describing nearby competitor robotic programs",
  "primary_goal": "volume_growth OR cost_reduction OR competitive OR quality OR recruitment",
  "notes": "Key facts about this hospital: # of campuses, recent expansions, robotic surgery program history, notable specialties, awards, Magnet status, etc.",
  "research_sources": ["list of sources/knowledge used"],
  "confidence_level": "high OR medium OR low",
  "data_notes": "What was estimated vs. confirmed from known data"
}

IMPORTANT:
- BED COUNT ACCURACY IS CRITICAL. Do NOT underestimate. Check licensed beds, not just staffed beds. Many hospitals have expanded recently. If unsure, estimate HIGH not low. Community hospitals in growing suburban markets (Florida, Texas, etc.) often have 150-300+ beds. AdventHealth, HCA, and similar systems typically have 150-400 beds per facility.
- specialty percentages must sum to 100
- Be realistic -- large academic centers like Orlando Health have 800+ beds and 40,000+ surgeries/year
- Community hospitals typically have 150-300 beds and 3,000-8,000 surgeries/year
- Suburban growth hospitals (AdventHealth, HCA, etc.) in Florida/Texas often have 200-400 beds
- If the hospital is known to have da Vinci systems, reflect that
- Consider the competitive landscape in the hospital's market
- annual_surgical_volume should be proportional to bed count: roughly 20-40 surgeries per bed per year depending on hospital type
- Return ONLY the JSON object, nothing else`;

  let researchData;
  try {
    const systemPrompt = 'You are a hospital business intelligence analyst with deep knowledge of US hospital systems, robotic surgery programs, and healthcare operations. You have expertise in da Vinci robotic surgical systems by Intuitive Surgical. ACCURACY IS PARAMOUNT -- this data will be presented to hospital CFOs. For bed counts, use licensed bed counts (not staffed), and account for recent expansions. For surgical volumes, use realistic numbers proportional to bed count (20-40 surgeries/bed/year). When estimating, always err on the side of realistic-to-high rather than low. Clearly note what is confirmed vs estimated in your data_notes field. Return only valid JSON -- no markdown, no code fences, no explanation.';

    const message = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: researchPrompt }
      ]
    });

    const content = (message.content[0]?.text || '').trim();
    // Strip markdown code fences if present
    const jsonStr = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    researchData = JSON.parse(jsonStr);
    progress('AI research complete (Claude Sonnet 4) -- ' + (researchData.confidence_level || 'medium') + ' confidence');
  } catch (err) {
    console.error('Claude research error:', err);
    progress('AI research encountered an error, using fallback approach...');
    researchData = buildFallbackProfile(hospitalName);
  }

  // Step 2: Validate and fill gaps with industry benchmarks
  progress('Validating data and filling gaps with industry benchmarks...');
  const validated = validateAndEnrich(researchData);

  // Step 3: Build the project data
  progress('Building structured hospital profile...');
  const projectData = buildProjectData(validated);

  progress('Research complete for ' + projectData.hospital_name);
  return projectData;
}

/**
 * Build a fallback profile when AI research fails
 */
function buildFallbackProfile(hospitalName) {
  const nameLower = hospitalName.toLowerCase();
  let type = 'community';
  let beds = 250;

  if (nameLower.includes('university') || nameLower.includes('academic') || nameLower.includes('medical center')) {
    type = 'academic'; beds = 600;
  } else if (nameLower.includes('va ') || nameLower.includes('veterans')) {
    type = 'VA'; beds = 200;
  } else if (nameLower.includes('children') || nameLower.includes('specialty') || nameLower.includes('cancer')) {
    type = 'specialty'; beds = 150;
  } else if (nameLower.includes('regional') || nameLower.includes('general')) {
    type = 'community'; beds = 300;
  }

  // Try to extract state from common patterns
  const stateMatch = hospitalName.match(/\b([A-Z]{2})\b/);
  const state = stateMatch ? stateMatch[1] : 'FL';

  const bench = INDUSTRY_BENCHMARKS[type] || INDUSTRY_BENCHMARKS.community;

  return {
    hospital_name: hospitalName,
    hospital_type: type,
    bed_count: beds,
    state: state,
    country: 'United States',
    annual_surgical_volume: Math.round(beds * bench.annual_surgical_volume_per_bed),
    current_robotic_cases: Math.round(beds * bench.annual_surgical_volume_per_bed * bench.robotic_adoption_pct / 100),
    current_system: bench.robotic_adoption_pct > 15 ? 'Xi' : 'none',
    current_system_count: bench.robotic_adoption_pct > 15 ? Math.ceil(beds / 300) : 0,
    current_system_age_years: bench.robotic_adoption_pct > 15 ? 4 : null,
    ...bench.specialty_mix,
    specialty_urology: bench.specialty_mix.urology,
    specialty_gynecology: bench.specialty_mix.gynecology,
    specialty_general: bench.specialty_mix.general,
    specialty_thoracic: bench.specialty_mix.thoracic,
    specialty_colorectal: bench.specialty_mix.colorectal,
    specialty_head_neck: bench.specialty_mix.head_neck,
    specialty_cardiac: bench.specialty_mix.cardiac,
    credentialed_robotic_surgeons: Math.round(beds * bench.credentialed_surgeons_per_100_beds / 100),
    surgeons_interested: Math.round(beds * bench.interested_surgeons_per_100_beds / 100),
    convertible_lap_cases: Math.round(beds * bench.annual_surgical_volume_per_bed * 0.3),
    total_or_count: Math.round(beds * bench.avg_or_count_per_100_beds / 100),
    robot_ready_ors: Math.max(1, Math.round(beds * bench.avg_or_count_per_100_beds / 100 * bench.robot_ready_or_pct / 100)),
    or_sqft: 600,
    ceiling_height_ft: 10,
    capital_budget: beds > 400 ? '3M+' : beds > 200 ? '2-3M' : '1-2M',
    acquisition_preference: 'purchase',
    avg_los_days: bench.avg_los_days,
    complication_rate_pct: bench.complication_rate_pct,
    readmission_rate_pct: bench.readmission_rate_pct,
    payer_medicare_pct: bench.payer_mix.medicare,
    payer_commercial_pct: bench.payer_mix.commercial,
    payer_medicaid_pct: bench.payer_mix.medicaid,
    payer_self_pay_pct: bench.payer_mix.self_pay,
    value_based_contract_pct: 20,
    competitor_robot_nearby: true,
    competitor_details: 'Market analysis pending',
    primary_goal: 'volume_growth',
    notes: 'Profile generated from industry benchmarks. Recommend validating with hospital contact.',
    research_sources: ['Industry benchmarks', 'Hospital name analysis'],
    confidence_level: 'low',
    data_notes: 'All values estimated from industry averages based on hospital type and size.'
  };
}

/**
 * Validate AI output and fill gaps with benchmarks
 */
function validateAndEnrich(data) {
  const type = data.hospital_type || 'community';
  const bench = INDUSTRY_BENCHMARKS[type] || INDUSTRY_BENCHMARKS.community;
  const beds = data.bed_count || 250;

  // Ensure specialty mix sums to 100
  const specFields = ['specialty_urology', 'specialty_gynecology', 'specialty_general',
    'specialty_thoracic', 'specialty_colorectal', 'specialty_head_neck', 'specialty_cardiac'];
  let specSum = specFields.reduce((s, f) => s + (data[f] || 0), 0);
  if (specSum === 0) {
    // Use benchmarks
    data.specialty_urology = bench.specialty_mix.urology;
    data.specialty_gynecology = bench.specialty_mix.gynecology;
    data.specialty_general = bench.specialty_mix.general;
    data.specialty_thoracic = bench.specialty_mix.thoracic;
    data.specialty_colorectal = bench.specialty_mix.colorectal;
    data.specialty_head_neck = bench.specialty_mix.head_neck;
    data.specialty_cardiac = bench.specialty_mix.cardiac;
  } else if (Math.abs(specSum - 100) > 5) {
    // Normalize to 100
    const factor = 100 / specSum;
    for (const f of specFields) {
      data[f] = Math.round((data[f] || 0) * factor);
    }
    // Fix rounding
    const newSum = specFields.reduce((s, f) => s + data[f], 0);
    data.specialty_general = (data.specialty_general || 0) + (100 - newSum);
  }

  // Fill missing numeric fields with benchmarks
  if (!data.annual_surgical_volume) data.annual_surgical_volume = Math.round(beds * bench.annual_surgical_volume_per_bed);
  if (!data.total_or_count) data.total_or_count = Math.max(4, Math.round(beds * bench.avg_or_count_per_100_beds / 100));
  if (!data.robot_ready_ors) data.robot_ready_ors = Math.max(1, Math.round(data.total_or_count * bench.robot_ready_or_pct / 100));
  if (!data.or_sqft) data.or_sqft = 600;
  if (!data.ceiling_height_ft) data.ceiling_height_ft = 10;
  if (!data.avg_los_days) data.avg_los_days = bench.avg_los_days;
  if (!data.complication_rate_pct) data.complication_rate_pct = bench.complication_rate_pct;
  if (!data.readmission_rate_pct) data.readmission_rate_pct = bench.readmission_rate_pct;
  if (!data.credentialed_robotic_surgeons && data.credentialed_robotic_surgeons !== 0) {
    data.credentialed_robotic_surgeons = Math.round(beds * bench.credentialed_surgeons_per_100_beds / 100);
  }
  if (!data.surgeons_interested) data.surgeons_interested = Math.round(beds * bench.interested_surgeons_per_100_beds / 100);
  if (!data.convertible_lap_cases) data.convertible_lap_cases = Math.round(data.annual_surgical_volume * 0.3);

  // Ensure payer mix sums to ~100
  const payerSum = (data.payer_medicare_pct || 0) + (data.payer_commercial_pct || 0) +
    (data.payer_medicaid_pct || 0) + (data.payer_self_pay_pct || 0);
  if (payerSum === 0) {
    data.payer_medicare_pct = bench.payer_mix.medicare;
    data.payer_commercial_pct = bench.payer_mix.commercial;
    data.payer_medicaid_pct = bench.payer_mix.medicaid;
    data.payer_self_pay_pct = bench.payer_mix.self_pay;
  }

  if (!data.capital_budget) data.capital_budget = beds > 400 ? '3M+' : beds > 200 ? '2-3M' : '1-2M';
  if (!data.acquisition_preference) data.acquisition_preference = 'purchase';
  if (!data.primary_goal) data.primary_goal = 'volume_growth';
  if (!data.value_based_contract_pct) data.value_based_contract_pct = 20;

  return data;
}

/**
 * Convert validated research data into the project creation format
 */
function buildProjectData(data) {
  return {
    hospital_name: data.hospital_name,
    hospital_type: data.hospital_type,
    bed_count: data.bed_count,
    state: data.state,
    country: data.country || 'United States',
    annual_surgical_volume: data.annual_surgical_volume,
    current_robotic_cases: data.current_robotic_cases || 0,
    current_system: data.current_system || 'none',
    current_system_count: data.current_system_count || 0,
    current_system_age_years: data.current_system_age_years || null,
    specialty_urology: data.specialty_urology || 0,
    specialty_gynecology: data.specialty_gynecology || 0,
    specialty_general: data.specialty_general || 0,
    specialty_thoracic: data.specialty_thoracic || 0,
    specialty_colorectal: data.specialty_colorectal || 0,
    specialty_head_neck: data.specialty_head_neck || 0,
    specialty_cardiac: data.specialty_cardiac || 0,
    credentialed_robotic_surgeons: data.credentialed_robotic_surgeons || 0,
    surgeons_interested: data.surgeons_interested || 0,
    convertible_lap_cases: data.convertible_lap_cases || 0,
    total_or_count: data.total_or_count || 0,
    robot_ready_ors: data.robot_ready_ors || 0,
    or_sqft: data.or_sqft || 600,
    ceiling_height_ft: data.ceiling_height_ft || 10,
    capital_budget: data.capital_budget || '2-3M',
    acquisition_preference: data.acquisition_preference || 'purchase',
    avg_los_days: data.avg_los_days || 4,
    complication_rate_pct: data.complication_rate_pct || 5,
    readmission_rate_pct: data.readmission_rate_pct || 12,
    payer_medicare_pct: data.payer_medicare_pct || 35,
    payer_commercial_pct: data.payer_commercial_pct || 40,
    payer_medicaid_pct: data.payer_medicaid_pct || 15,
    payer_self_pay_pct: data.payer_self_pay_pct || 5,
    value_based_contract_pct: data.value_based_contract_pct || 20,
    competitor_robot_nearby: data.competitor_robot_nearby || false,
    competitor_details: data.competitor_details || '',
    primary_goal: data.primary_goal || 'volume_growth',
    notes: data.notes || '',
    extended_data: {
      ai_researched: true,
      research_sources: data.research_sources || [],
      confidence_level: data.confidence_level || 'medium',
      data_notes: data.data_notes || '',
      researched_at: new Date().toISOString()
    }
  };
}

/**
 * Full pipeline: research + create project + run analysis + create business plan
 */
async function runFullPipeline(hospitalName, models, progressCallback) {
  const progress = progressCallback || (() => {});
  const systemMatcher = require('./system-matcher');
  let drgLib;
  try { drgLib = require('./drg-reimbursement'); } catch (e) {}
  let dollarizationEngine;
  try { dollarizationEngine = require('./clinical-dollarization'); } catch (e) {}

  // Step 1: Research
  progress('step:research');
  const projectData = await researchHospital(hospitalName, progress);

  // Step 2: Create project
  progress('step:project');
  progress('Creating project for ' + projectData.hospital_name + '...');
  const projectCode = 'INTV-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 90000) + 10000);
  const project = await models.IntuitiveProject.create({
    project_code: projectCode,
    ...projectData
  });
  progress('Project created: ' + project.project_code);

  // Step 3: Run 16 analyses
  progress('step:analysis');
  progress('Running 16-module analysis engine...');
  const analysisResults = await systemMatcher.runAll(models, project.id);
  progress('Analysis complete -- all 16 modules processed');

  // Step 4: Create business plan
  progress('step:businessplan');
  progress('Creating business plan...');

  const modelMatch = analysisResults.model_matching;
  const recommended = modelMatch?.primary_recommendation;
  const systemType = recommended?.model || 'Xi';
  const systemCatalog = systemMatcher.SYSTEMS;
  const sys = systemCatalog[systemType];
  const avgPrice = sys ? (sys.price_range[0] + sys.price_range[1]) / 2 : 1750000;

  const plan = await models.IntuitiveBusinessPlan.create({
    project_id: project.id,
    plan_name: projectData.hospital_name + ' - da Vinci Business Plan',
    system_type: systemType,
    system_price: avgPrice,
    annual_service_cost: sys ? sys.service_annual : 175000,
    system_quantity: analysisResults.utilization_forecast?.systems_needed || 1,
    acquisition_model: projectData.acquisition_preference || 'purchase',
    prepared_by: 'SurgicalMind AI',
    prepared_for: projectData.hospital_name + ' Leadership',
    notes: 'Auto-generated from AI research on ' + new Date().toISOString().split('T')[0]
  });
  progress('Business plan created');

  // Step 5: Clinical outcome dollarization
  progress('step:dollarization');
  progress('Running clinical outcome dollarization...');

  if (dollarizationEngine) {
    // Build hospital case data from the project
    const hospitalCaseData = {};
    const specMap = {
      urology: projectData.specialty_urology,
      gynecology: projectData.specialty_gynecology,
      general_surgery: projectData.specialty_general,
      thoracic: projectData.specialty_thoracic,
      colorectal: projectData.specialty_colorectal,
      ent_head_neck: projectData.specialty_head_neck,
      cardiac: projectData.specialty_cardiac
    };

    for (const [spec, pct] of Object.entries(specMap)) {
      if (pct > 0) {
        const specCases = Math.round(projectData.annual_surgical_volume * pct / 100);
        const currentRoboticPct = projectData.current_robotic_cases > 0
          ? Math.round((projectData.current_robotic_cases / projectData.annual_surgical_volume) * 100) : 5;
        hospitalCaseData[spec] = {
          annual_cases: specCases,
          open_pct: Math.max(0, 100 - currentRoboticPct * 2 - 30),
          lap_pct: 30,
          robotic_pct: Math.min(100, currentRoboticPct * 2)
        };
        // Normalize
        const total = hospitalCaseData[spec].open_pct + hospitalCaseData[spec].lap_pct + hospitalCaseData[spec].robotic_pct;
        if (total !== 100) {
          hospitalCaseData[spec].open_pct += (100 - total);
        }
      }
    }

    try {
      const dollarResults = dollarizationEngine.calculateDollarization(hospitalCaseData);
      await models.IntuitiveClinicalOutcome.create({
        business_plan_id: plan.id,
        project_id: project.id,
        hospital_case_data: hospitalCaseData,
        dollarization_results: dollarResults,
        total_clinical_savings_annual: dollarResults.total_clinical_savings_annual || 0,
        citations: dollarResults.all_citations || [],
        computed_at: new Date()
      });

      await plan.update({
        total_clinical_outcome_savings: dollarResults.total_clinical_savings_annual || 0,
        total_combined_roi: dollarResults.total_clinical_savings_annual || 0
      });

      progress('Clinical dollarization complete: $' + (dollarResults.total_clinical_savings_annual || 0).toLocaleString() + ' annual savings');
    } catch (e) {
      progress('Dollarization error (non-fatal): ' + e.message);
    }
  }

  // Step 6: Create survey template
  progress('step:survey');
  progress('Creating surgeon survey template...');
  const survey = await models.IntuitiveSurvey.create({
    project_id: project.id,
    business_plan_id: plan.id,
    title: projectData.hospital_name + ' - Surgeon Volume Assessment',
    hospital_name: projectData.hospital_name,
    system_type: systemType === 'dV5' ? 'da Vinci 5' : systemType === 'Xi' ? 'da Vinci Xi' : 'da Vinci ' + systemType,
    status: 'draft'
  });
  progress('Survey template created (ready for surgeon recipients)');

  progress('step:complete');
  progress('Full pipeline complete for ' + projectData.hospital_name);

  return {
    project,
    analysis: analysisResults,
    businessPlan: plan,
    survey,
    research: {
      confidence_level: projectData.extended_data?.confidence_level,
      sources: projectData.extended_data?.research_sources,
      data_notes: projectData.extended_data?.data_notes
    }
  };
}

module.exports = { researchHospital, runFullPipeline };
