'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const https = require('https');

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

// In-memory job tracker
const proposalJobs = new Map();

// Directory for generated audio files
const AUDIO_DIR = path.join(__dirname, '../../proposal-audio');

/**
 * Generate TTS audio via ElevenLabs
 */
function generateTTS(text, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const body = JSON.stringify({
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.78, similarity_boost: 0.75, style: 0.08, use_speaker_boost: true, speed: 0.82 }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey, 'Accept': 'audio/mpeg' }
    }, (res) => {
      if (res.statusCode !== 200) {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => reject(new Error(`TTS failed (${res.statusCode}): ${data}`)));
        return;
      }
      const ws = fs.createWriteStream(outputPath);
      res.pipe(ws);
      ws.on('finish', () => resolve(outputPath));
      ws.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Convert a number to spoken words for natural TTS
 */
function numberToWords(n) {
  if (n == null || isNaN(n)) return 'not available';
  n = Math.round(Number(n));
  if (n === 0) return 'zero';

  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function chunk(num) {
    if (num === 0) return '';
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '');
    return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + chunk(num % 100) : '');
  }

  if (n < 0) return 'negative ' + numberToWords(-n);
  if (n >= 10000000) return Math.round(n / 1000000) + ' million';
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000);
    const rest = n % 1000000;
    return chunk(m) + ' million' + (rest > 0 ? ', ' + numberToWords(rest) : '');
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    const rest = n % 1000;
    return chunk(k) + ' thousand' + (rest > 0 ? ', ' + chunk(rest) : '');
  }
  return chunk(n);
}

function say(n) {
  if (n == null || isNaN(n)) return 'not available';
  return numberToWords(n);
}

function sayPct(n) {
  if (n == null || isNaN(n)) return 'not available';
  return Number(n).toFixed(1).replace('.0', '') + ' percent';
}

/**
 * Build narration scripts for 20 slides -- da Vinci System Assessment
 */
function buildNarrationScripts(analysis, hospitalName) {
  const a = analysis || {};
  const volProj = a.volume_projection || {};
  const modelMatch = a.model_matching || {};
  const utilForecast = a.utilization_forecast || {};
  const surgCap = a.surgeon_capacity || {};
  const infraAssess = a.infrastructure_assessment || {};
  const roiCalc = a.roi_calculation || {};
  const compAnalysis = a.competitive_analysis || {};
  const riskAssess = a.risk_assessment || {};
  const procedurePareto = a.procedure_pareto || {};
  const monthlySeason = a.monthly_seasonality || {};
  const weekdayDist = a.weekday_distribution || {};
  const hourlyDist = a.hourly_distribution || {};
  const designDay = a.design_day_analysis || {};
  const robotCompat = a.robot_compatibility_matrix || {};
  const financialDeep = a.financial_deep_dive || {};
  const growthExtrap = a.growth_extrapolation || {};

  // Extract key metrics
  const bedCount = a._project?.bed_count || 'not available';
  const hospitalType = a._project?.hospital_type || 'hospital';
  const annualVol = a._project?.annual_surgical_volume || 0;
  const currentSystem = a._project?.current_system || 'none';
  const currentCount = a._project?.current_system_count || 0;

  // Pareto
  const gini = procedurePareto.gini_coefficient || procedurePareto.gini || 0;
  const topProcs = procedurePareto.top_procedures || [];
  const abcClasses = procedurePareto.abc_classes || {};

  // Monthly
  const cov = monthlySeason.coefficient_of_variation || monthlySeason.cov || 0;
  const peakMonth = monthlySeason.peak_month || 'not identified';
  const months = monthlySeason.months || [];

  // Weekday
  const peakDay = weekdayDist.peak_day || 'not identified';
  const days = weekdayDist.days || [];

  // Hourly
  const peakHour = hourlyDist.peak_hour || 'not identified';
  const hours = hourlyDist.hours || [];

  // Robot compatibility
  const procedures = robotCompat.procedures || [];
  const bestModel = robotCompat.best_overall_model || 'not determined';

  // Design day
  const p50 = designDay.p50 || {};
  const p75 = designDay.p75 || {};
  const p90 = designDay.p90 || {};
  const p95 = designDay.p95 || {};

  // Volume projection
  const yearlyProjections = volProj.yearly_projections || volProj.projections || [];
  const y5 = yearlyProjections.find(p => p.year === 5) || yearlyProjections[yearlyProjections.length - 1] || {};
  const adoptionRate = volProj.adoption_rate || volProj.ramp_rate || 0;

  // Financial deep dive
  const tco = financialDeep.total_cost_of_ownership || financialDeep.tco || {};
  const breakeven = financialDeep.breakeven_months || financialDeep.breakeven || 0;
  const perProcCost = financialDeep.per_procedure_cost || financialDeep.cost_per_case || 0;

  // Growth extrapolation
  const scenariosRaw = growthExtrap.scenarios || {};
  const chartDataGrowth = growthExtrap.chart_data || [];
  const y5Growth = chartDataGrowth.find(d => d.year === 'Year 5') || chartDataGrowth[chartDataGrowth.length - 1] || {};
  const baseGrowthRate = scenariosRaw.baseline?.growth_rate || 0.15;
  const aggressiveRate = scenariosRaw.aggressive?.growth_rate || 0.20;
  const conservativeRate = scenariosRaw.conservative?.growth_rate || 0.10;

  // System recommendation (from model_matching)
  const primaryModel = modelMatch.primary_recommendation || modelMatch.recommended_model || 'not determined';
  const fitScore = modelMatch.fit_score || modelMatch.overall_fit || 0;
  const rationale = modelMatch.rationale || modelMatch.reasoning || '';
  const riskFactors = riskAssess.risk_factors || riskAssess.factors || [];

  // Approach mix data for narration
  const approachMix = (a.volume_projection || {}).current_approach_mix || {};
  const openPct = approachMix.open_pct || 40;
  const lapPct = approachMix.lap_pct || 35;
  const roboticPct = approachMix.robotic_pct || 25;
  const totalIncrOpp = (a.volume_projection || {}).total_incremental_opportunity || (a.procedure_pareto || {}).total_incremental_opportunity || 0;

  // Dollarization
  const clinDollar = a.clinical_dollarization || {};
  const totalClinicalSavings = clinDollar.total_annual_savings || clinDollar.total_savings || 0;

  // Infrastructure
  const readinessScore = infraAssess.readiness_score || 0;

  // Competitive
  const competitorNearby = compAnalysis.competitor_nearby || compAnalysis.competitors_nearby || false;
  const marketPressure = compAnalysis.market_pressure || 'moderate';

  return [
    // Slide 0: Title
    `Welcome to the da Vinci System Assessment... for ${hospitalName}. This presentation contains a comprehensive analysis of your hospital's surgical profile... robotic compatibility... and our recommended da Vinci system configuration. Let's walk through the key findings together.`,

    // Slide 1: Hospital Profile
    `Let's begin with the hospital profile. ${hospitalName} is a ${hospitalType} facility with ${say(bedCount)} beds. Your annual surgical volume is approximately ${say(annualVol)} procedures. ${currentSystem !== 'none' && currentSystem ? `You currently operate ${say(currentCount)} ${currentSystem} system${currentCount > 1 ? 's' : ''}.` : 'You do not currently have a robotic surgical system in place.'} ${surgCap.credentialed_surgeons ? `There are ${say(surgCap.credentialed_surgeons)} credentialed robotic surgeons on staff... with ${say(surgCap.interested_surgeons || 0)} additional surgeons expressing interest in robotic training.` : ''}`,

    // Slide 2: Current Surgical Approach Mix (NEW)
    `This is the C.F.O. slide... the three-layer view of your surgical volume. Of your ${say(annualVol)} annual procedures... approximately ${sayPct(openPct)} are performed open... ${sayPct(lapPct)} are laparoscopic... and ${sayPct(roboticPct)} are robotic. ${totalIncrOpp > 0 ? `We have identified ${say(totalIncrOpp)} incremental cases suitable for robotic conversion... representing the addressable opportunity for your da Vinci program.` : 'This breakdown frames the entire business case for robotic adoption.'} The gap between current robotic penetration and clinical best practice represents your growth opportunity.`,

    // Slide 3: Procedure Pareto (updated)
    `Now let's examine the procedure distribution with the three-layer breakdown. The Gini coefficient is ${gini}... indicating ${gini >= 0.6 ? 'high concentration -- a small number of procedures drive the majority of your surgical volume' : 'moderate distribution across procedure types'}. ${topProcs.length > 0 ? `Your highest-volume procedure is ${topProcs[0]?.name || topProcs[0]?.procedure || 'not identified'}... accounting for approximately ${sayPct(topProcs[0]?.pct || topProcs[0]?.percentage || 0)} of total cases.` : ''} For each procedure... we now show the current open... laparoscopic... and robotic breakdown... along with the incremental conversion opportunity. ${abcClasses.A ? `A-class procedures represent ${sayPct(abcClasses.A.pct_volume || abcClasses.A.volume_pct || 0)} of total volume... making them prime candidates for robotic conversion.` : ''}`,

    // Slide 4: DRG Revenue Per Procedure (NEW)
    `This slide maps each high-volume procedure to its D.R.G. reimbursement rate. We show Medicare... commercial... and blended rates for the top procedures... along with the incremental cases identified for robotic conversion and the resulting annual revenue impact. This revenue layer is critical for the financial business case... as it quantifies the top-line growth opportunity from expanding your robotic program. The blended rates represent a weighted average of your payer mix.`,

    // Slide 5: Monthly Seasonality
    `Moving to the monthly seasonality analysis. The coefficient of variation is ${cov}... ${cov >= 0.15 ? 'indicating notable seasonal patterns in your surgical volume' : 'suggesting relatively consistent volume throughout the year'}. ${peakMonth !== 'not identified' ? `The peak month is ${peakMonth}...` : ''} ${months.length > 0 ? `Understanding these patterns is critical for scheduling robotic O.R. time and planning instrument inventory levels.` : ''} Seasonal awareness ensures optimal utilization of your da Vinci system throughout the year.`,

    // Slide 6: Weekday Distribution
    `The weekday distribution reveals your scheduling patterns across the work week. ${peakDay !== 'not identified' ? `${peakDay} is your busiest surgical day.` : ''} ${days.length > 0 ? `Understanding peak days helps optimize robotic O.R. block scheduling... ensuring the system is available when demand is highest... while allowing for maintenance and setup during lower-volume periods.` : ''} This directly informs how many robotic O.R. blocks to schedule per week.`,

    // Slide 7: Hourly OR Utilization
    `The hourly O.R. utilization profile shows how surgical activity distributes across the day. ${peakHour !== 'not identified' ? `Peak utilization occurs at ${peakHour}.` : ''} This profile is essential for capacity planning... determining how many simultaneous robotic cases your facility can support... and identifying opportunities to extend robotic access into underutilized time windows. ${hours.length > 0 ? 'The data shows clear peak and off-peak patterns that will guide our system configuration recommendations.' : ''}`,

    // Slide 8: Robot Compatibility Matrix
    `Now for the robot compatibility matrix... which evaluates each procedure category against da Vinci system capabilities. ${procedures.length > 0 ? `We analyzed ${say(procedures.length)} procedure categories for robotic fit.` : ''} ${bestModel !== 'not determined' ? `The ${bestModel} shows the strongest overall compatibility across your procedure mix.` : ''} Each procedure is scored on a fit scale... considering factors like surgical complexity... instrument requirements... and clinical evidence for robotic advantage. This matrix drives our system model recommendation.`,

    // Slide 9: Design Day Analysis
    `The design day analysis establishes the capacity planning basis. ${p50.cases ? `On a typical day... at the fiftieth percentile... your facility handles ${say(p50.cases)} cases.` : ''} ${p75.cases ? `The seventy-fifth percentile... our recommended design day... reaches ${say(p75.cases)} cases.` : ''} ${p90.cases ? `At the ninetieth percentile... volume reaches ${say(p90.cases)} cases.` : ''} ${p95.cases ? `And the ninety-fifth percentile peaks at ${say(p95.cases)} cases.` : ''} Designing to the seventy-fifth percentile ensures the system handles peak demand the majority of the time... while remaining cost-effective.`,

    // Slide 10: Volume Projection (updated)
    `For the five-year volume projection... we modeled the robotic adoption ramp using the three-layer framework. ${adoptionRate ? `Starting with an adoption rate of ${sayPct(adoptionRate)}...` : ''} ${y5.total_cases || y5.robotic_cases ? `By year five... total robotic cases reach ${say(y5.total_robotic || y5.total_cases || y5.robotic_cases)} per year.` : ''} The projection now distinguishes between existing robotic volume and new robotic cases converted from open and laparoscopic approaches. The adoption curve follows established patterns from comparable ${hospitalType} facilities... adjusted for your specific surgeon pipeline and procedure mix.`,

    // Slide 11: Financial Deep Dive
    `The financial analysis provides a comprehensive view of the investment. ${(tco.total_5yr || tco.five_year) ? `The five-year total cost of ownership is approximately ${say(Math.round((tco.total_5yr || tco.five_year) / 1000000))} million dollars.` : ''} ${breakeven ? `The breakeven point is reached at month ${say(breakeven)}.` : ''} ${perProcCost ? `The per-procedure incremental cost is approximately ${say(Math.round(perProcCost))} dollars.` : ''} These economics include system acquisition... annual service contracts... instrument costs per procedure... and facility modifications. The R.O.I. model accounts for improved patient outcomes... shorter length of stay... and reduced complication rates.`,

    // Slide 12: Clinical Outcome Dollarization (NEW)
    `This is perhaps the most important slide in the presentation... the clinical outcome dollarization. Using peer-reviewed evidence from sixty-eight journal citations... we quantify the financial value of improved clinical outcomes with robotic surgery. ${totalClinicalSavings > 0 ? `The total annual clinical savings for ${hospitalName} are estimated at ${say(Math.round(totalClinicalSavings))} dollars.` : 'The dollarization engine calculates savings from reduced complications... shorter hospital stays... fewer readmissions... and lower infection rates.'} Each specialty is analyzed individually... comparing open surgery complication rates to robotic rates... and multiplying the difference by your case volume and cost-per-event. These are real dollars that flow directly to the bottom line.`,

    // Slide 13: Combined 3-Layer ROI (NEW)
    `Here is the punchline... the combined three-layer return on investment. Layer one is incremental volume revenue... the new cases converted to robotic surgery multiplied by average reimbursement. Layer two is clinical outcome savings... the dollars saved from better patient outcomes. Combined... these two layers represent the total annual benefit of the robotic program. We then compare this against the system investment and annual operating costs to calculate the payback period and five-year net benefit. This three-layer view gives your C-suite the complete financial picture in a single slide.`,

    // Slide 14: Growth Extrapolation
    `The growth extrapolation models three scenarios over the planning horizon. ${y5Growth.baseline ? `In the baseline case at ${sayPct(baseGrowthRate * 100)} annual growth... robotic volume reaches ${say(y5Growth.baseline)} cases by year five.` : ''} ${y5Growth.aggressive ? `The aggressive scenario at ${sayPct(aggressiveRate * 100)} growth projects ${say(y5Growth.aggressive)} cases...` : ''} ${y5Growth.conservative ? `while the conservative estimate at ${sayPct(conservativeRate * 100)} is ${say(y5Growth.conservative)} cases.` : ''} These scenarios help determine whether a single system is sufficient... or when fleet expansion becomes necessary.`,

    // Slide 15: Infrastructure Readiness (NEW)
    `The infrastructure readiness assessment evaluates two critical dimensions. First... O.R. infrastructure... ${readinessScore > 0 ? `with a readiness score of ${say(readinessScore)} out of one hundred.` : 'including total O.R. count... robot-ready suites... square footage... and ceiling height.'} ${infraAssess.issues && infraAssess.issues.length > 0 ? `We identified ${say(infraAssess.issues.length)} issues that need to be addressed before installation.` : ''} Second... surgeon capacity... evaluating credentialed and interested surgeons... training timelines... and single-surgeon dependency risk. Both dimensions must be addressed for a successful program launch.`,

    // Slide 16: Competitive Landscape (NEW)
    `The competitive landscape analysis examines robotic surgery adoption in your market area. ${competitorNearby ? `We identified nearby competitors with robotic programs... creating ${marketPressure} market pressure.` : 'Limited competition in your area presents a first-mover advantage.'} ${competitorNearby ? 'Understanding competitor positioning helps frame the urgency of program launch and differentiation strategy.' : 'Early adoption would position your facility as the regional robotic surgery center of excellence.'} This market context is essential for the strategic business case presented to your board.`,

    // Slide 17: System Recommendation
    `Based on the complete analysis... our primary recommendation is the da Vinci ${primaryModel} system. ${fitScore ? `The overall fit score is ${say(Math.round(fitScore))} out of one hundred.` : ''} ${rationale ? rationale : 'This model best aligns with your procedure mix, infrastructure, and growth trajectory.'} ${riskFactors.length > 0 ? `Key risk factors to consider include ${riskFactors.slice(0, 3).map(r => r.name || r.factor || r).join('... and ')}.` : ''} The recommended configuration maximizes clinical value while staying within your stated capital parameters.`,

    // Slide 18: Next Steps
    `Here are the recommended next steps. First... schedule a clinical workflow assessment with our surgical planning team. Second... conduct an on-site infrastructure survey to confirm O.R. readiness. Third... develop a surgeon training and credentialing timeline. Fourth... finalize the financial model with your preferred acquisition structure. And fifth... establish the implementation timeline targeting your go-live date.`,

    // Slide 19: Contact / Thank You (NEW)
    `Thank you for reviewing the da Vinci System Assessment for ${hospitalName}. This analysis was generated by the SurgicalMind A.I. platform... combining real hospital data with clinical evidence and financial modeling. We look forward to partnering on your robotic surgery program. Please reach out to our team at m stagg at digit two A.I. dot com to schedule the next steps. On behalf of the entire SurgicalMind team... thank you for your time today.`
  ];
}

/**
 * Build slide content for the HTML presentation
 */
function buildSlideHTML(analysis, hospitalName) {
  const a = analysis || {};
  const proj = a._project || {};
  const procedurePareto = a.procedure_pareto || {};
  const monthlySeason = a.monthly_seasonality || {};
  const weekdayDist = a.weekday_distribution || {};
  const hourlyDist = a.hourly_distribution || {};
  const designDay = a.design_day_analysis || {};
  const robotCompat = a.robot_compatibility_matrix || {};
  const volProj = a.volume_projection || {};
  const financialDeep = a.financial_deep_dive || {};
  const growthExtrap = a.growth_extrapolation || {};
  const modelMatch = a.model_matching || {};
  const riskAssess = a.risk_assessment || {};
  const surgCap = a.surgeon_capacity || {};
  const roiCalc = a.roi_calculation || {};
  const utilForecast = a.utilization_forecast || {};
  const infraAssess = a.infrastructure_assessment || {};
  const compAnalysis = a.competitive_analysis || {};

  // Try loading optional service libraries
  let drgLib, clinicalEvidence, dollarizationEngine;
  try { drgLib = require('../services/drg-reimbursement'); } catch(e) {}
  try { clinicalEvidence = require('../services/clinical-evidence'); } catch(e) {}
  try { dollarizationEngine = require('../services/clinical-dollarization'); } catch(e) {}

  // Compute dollarization on the fly if engine available
  let dollarizationResults = null;
  if (dollarizationEngine) {
    const hospitalCaseData = {};
    const specMap = { urology: proj.specialty_urology, gynecology: proj.specialty_gynecology, general_surgery: proj.specialty_general, thoracic: proj.specialty_thoracic, colorectal: proj.specialty_colorectal, ent_head_neck: proj.specialty_head_neck, cardiac: proj.specialty_cardiac };
    for (const [spec, pct] of Object.entries(specMap)) {
      if (pct > 0) {
        const cases = Math.round((proj.annual_surgical_volume || 0) * pct / 100);
        const currentRoboticPct = proj.annual_surgical_volume > 0 ? Math.round(((proj.current_robotic_cases || 0) / proj.annual_surgical_volume) * 100) : 5;
        hospitalCaseData[spec] = { annual_cases: cases, open_pct: Math.max(0, 100 - currentRoboticPct * 2 - 30), lap_pct: 30, robotic_pct: Math.min(100, currentRoboticPct * 2) };
        const total = hospitalCaseData[spec].open_pct + hospitalCaseData[spec].lap_pct + hospitalCaseData[spec].robotic_pct;
        if (total !== 100) hospitalCaseData[spec].open_pct += (100 - total);
      }
    }
    try { dollarizationResults = dollarizationEngine.calculateDollarization(hospitalCaseData); } catch(e) {}
  }
  // Also check if pre-computed dollarization is stored
  const clinDollar = dollarizationResults || a.clinical_dollarization || {};
  const drgRevenue = a.drg_revenue || {};

  const fmt = n => n != null ? Number(n).toLocaleString() : '--';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const metric = (label, value, color = '#0ea5e9') => `<div class="metric"><div class="metric-value" style="color:${color}">${esc(String(value))}</div><div class="metric-label">${esc(label)}</div></div>`;
  const chartBox = (id, h = 220) => `<div class="chart-box"><canvas id="${id}" height="${h}"></canvas></div>`;

  // Procedure Pareto
  const allProcs = procedurePareto.procedures || [];
  const totalCases = procedurePareto.total_cases || procedurePareto.total_hospital_cases || allProcs.reduce((s, p) => s + (p.cases || 0), 0) || 1;
  const topProcs = allProcs.slice(0, 10).map(p => ({
    name: p.procedure_name || p.name || p.procedure || '',
    cases: p.cases || p.count || 0,
    pct: totalCases > 0 ? Math.round((p.cases || 0) / totalCases * 1000) / 10 : 0,
    abc_class: p.abc_class || '',
    current_open: p.current_open || 0,
    current_lap: p.current_lap || 0,
    current_robotic: p.current_robotic || 0,
    incremental_opportunity: p.incremental_opportunity || 0
  }));
  const abcClasses = procedurePareto.classes || {};

  // Approach mix data -- extract from 3-layer volume projection
  const approachMix = volProj.current_approach_mix || {};
  const totalHospitalVol = proj.annual_surgical_volume || totalCases;
  const openCases = (approachMix.open && approachMix.open.cases) || Math.round(totalHospitalVol * 0.40);
  const lapCases = (approachMix.laparoscopic && approachMix.laparoscopic.cases) || Math.round(totalHospitalVol * 0.35);
  const roboticCases = (approachMix.robotic && approachMix.robotic.cases) || proj.current_robotic_cases || Math.round(totalHospitalVol * 0.15);
  const openPct = (approachMix.open && approachMix.open.pct) || (totalHospitalVol > 0 ? Math.round(openCases / totalHospitalVol * 100) : 40);
  const lapPct = (approachMix.laparoscopic && approachMix.laparoscopic.pct) || (totalHospitalVol > 0 ? Math.round(lapCases / totalHospitalVol * 100) : 35);
  const roboticPct = (approachMix.robotic && approachMix.robotic.pct) || (totalHospitalVol > 0 ? Math.round(roboticCases / totalHospitalVol * 100) : 15);
  const totalIncrementalOpp = volProj.total_incremental_opportunity || procedurePareto.total_incremental_opportunity || 0;

  // Monthly -- compute peak
  const months = monthlySeason.monthly_data || monthlySeason.months || [];
  const peakMonth = months.length > 0 ? months.reduce((max, m) => (m.cases || 0) > (max.cases || 0) ? m : max, months[0]) : {};

  // Weekday
  const days = weekdayDist.weekday_data || weekdayDist.days || [];
  const totalDaysAnalyzed = weekdayDist.operating_days_per_week ? Math.round(weekdayDist.operating_days_per_week * 50) : days.reduce((s, d) => s + (d.cases || 0), 0);

  // Hourly
  const hours = hourlyDist.hourly_data || hourlyDist.hours || [];

  // Compatibility
  const procedures = robotCompat.compatibility_matrix || robotCompat.procedures || [];
  const bestModel = robotCompat.overall_best_model || robotCompat.best_overall_model || 'not determined';

  // Design day
  const percentiles = designDay.percentiles || {};
  const p50 = typeof percentiles.P50 === 'number' ? percentiles.P50 : (designDay.p50 || 0);
  const p75 = typeof percentiles.P75 === 'number' ? percentiles.P75 : (designDay.design_day || 0);
  const p90 = typeof percentiles.P90 === 'number' ? percentiles.P90 : (designDay.p90 || 0);
  const p95 = typeof percentiles.P95 === 'number' ? percentiles.P95 : (designDay.p95 || 0);

  // Financial
  const perProcCost = financialDeep.per_procedure_economics?.robotic?.cost || financialDeep.per_procedure_cost || 0;
  const tco = financialDeep.total_cost_of_ownership || {};

  // Volume projection
  const yearlyProj = volProj.projections || [];

  // Growth
  const chartDataGrowth = growthExtrap.chart_data || [];

  // Model matching -- primary_recommendation is an OBJECT with .model, .score, .reasons
  const primaryRec = typeof modelMatch.primary_recommendation === 'object' ? modelMatch.primary_recommendation : {};
  const primaryModelName = primaryRec.system || primaryRec.model || (typeof modelMatch.primary_recommendation === 'string' ? modelMatch.primary_recommendation : '--');
  const fitScore = primaryRec.score || 0;
  const rationale = Array.isArray(primaryRec.reasons) ? primaryRec.reasons.join('. ') : (primaryRec.rationale || '');

  // Risks
  const riskFactors = riskAssess.risks || riskAssess.risk_factors || [];

  // Specialty mix
  const specialties = [];
  if (proj.specialty_urology) specialties.push({ name: 'Urology', pct: proj.specialty_urology });
  if (proj.specialty_gynecology) specialties.push({ name: 'Gynecology', pct: proj.specialty_gynecology });
  if (proj.specialty_general) specialties.push({ name: 'General', pct: proj.specialty_general });
  if (proj.specialty_thoracic) specialties.push({ name: 'Thoracic', pct: proj.specialty_thoracic });
  if (proj.specialty_colorectal) specialties.push({ name: 'Colorectal', pct: proj.specialty_colorectal });
  if (proj.specialty_head_neck) specialties.push({ name: 'Head & Neck', pct: proj.specialty_head_neck });
  if (proj.specialty_cardiac) specialties.push({ name: 'Cardiac', pct: proj.specialty_cardiac });

  // DRG data -- lookup each procedure's DRG code and reimbursement rates
  let drgProcedures = [];
  if (drgLib && allProcs.length > 0) {
    const allDRG = drgLib.getAllProcedures ? drgLib.getAllProcedures() : [];
    drgProcedures = allProcs.slice(0, 8).map(p => {
      const procName = (p.procedure_name || p.name || p.procedure || '').toLowerCase();
      // Try exact lookup first, then fuzzy match
      let lookup = null;
      if (drgLib.lookupByProcedure) {
        // Try with procedure_type slug
        const slug = procName.replace(/[^a-z0-9]/g, '_');
        lookup = drgLib.lookupByProcedure(slug);
      }
      if (!lookup && allDRG.length > 0) {
        // Fuzzy match by name
        lookup = allDRG.find(d => procName.includes(d.procedure_name.toLowerCase().split(' ')[0]) || d.procedure_name.toLowerCase().includes(procName.split(' ')[0]));
      }
      const incrCases = p.incremental_opportunity || Math.round((p.total_cases || p.cases || 0) * 0.3);
      const blended = lookup ? (lookup.avg_blended_rate || 0) : 12000;
      return {
        procedure: p.procedure_name || p.name || p.procedure || '',
        drg_code: lookup ? lookup.drg_code : '--',
        medicare_rate: lookup ? (lookup.avg_medicare_reimbursement || 0) : 0,
        commercial_rate: lookup ? (lookup.avg_commercial_reimbursement || 0) : 0,
        blended_rate: blended,
        incremental_cases: incrCases,
        annual_revenue_impact: blended * incrCases
      };
    });
  }

  // Dollarization specialty results -- extract from computed results
  const bySpecialty = clinDollar.by_specialty || {};
  const dollarSpecialties = Object.entries(bySpecialty).map(([spec, data]) => ({
    specialty: spec,
    savings: data.total_specialty_savings || 0,
    metrics: data.savings_by_metric ? Object.keys(data.savings_by_metric).length : 0,
    details: data.savings_by_metric || {}
  }));
  const totalClinicalSavings = clinDollar.total_clinical_savings_annual || clinDollar.total_annual_savings || dollarSpecialties.reduce((s, d) => s + d.savings, 0) || 0;
  const specialtiesAnalyzed = dollarSpecialties.length;
  const outcomeMetrics = dollarSpecialties.reduce((s, d) => s + d.metrics, 0);
  const journalCitations = (clinDollar.all_citations || []).length || 68;

  // Infrastructure
  const readinessScore = infraAssess.readiness_score || 0;
  const readinessLabel = infraAssess.readiness_label || (readinessScore >= 80 ? 'Ready' : readinessScore >= 50 ? 'Moderate' : 'Needs Work');
  const infraIssues = infraAssess.issues || infraAssess.gaps || [];
  const estRenovationCost = infraAssess.estimated_renovation_cost || infraAssess.renovation_cost || 0;

  // Competitive
  const competitorNearby = compAnalysis.competitor_nearby || proj.competitor_robot_nearby || false;
  const competitorDetailsStr = proj.competitor_details || compAnalysis.competitor_details || '';
  const marketPressure = compAnalysis.market_pressure || (competitorNearby ? 'high' : 'low');
  const compRecommendation = compAnalysis.recommendation || (competitorNearby ? 'Competitive urgency: nearby hospital has robotic capability. Delay risks surgical volume migration.' : 'First-mover advantage in the region. Early adoption builds market position.');
  const compPositioning = compAnalysis.positioning || (competitorNearby ? 'Match or exceed competitor capability. Recommend flagship system for differentiation.' : 'Establish regional robotic surgery center of excellence.');

  // Combined ROI calculations
  const avgDrgBlended = drgProcedures.length > 0 ? Math.round(drgProcedures.reduce((s, d) => s + d.blended_rate, 0) / drgProcedures.length) : 12000;
  const avgReimbursement = roiCalc.avg_reimbursement || avgDrgBlended;
  const incrementalRevenue = totalIncrementalOpp > 0 ? totalIncrementalOpp * avgReimbursement : (roiCalc.incremental_revenue || 0);
  const combinedAnnualBenefit = incrementalRevenue + totalClinicalSavings;
  const systemInvestment = roiCalc.capital_cost || tco.system_acquisition || tco.acquisition_cost || financialDeep.system_acquisition_cost || (primaryRec.specs ? ((primaryRec.specs.price_range[0] + primaryRec.specs.price_range[1]) / 2) : 0) || 0;
  const annualOperatingCost = roiCalc.annual_costs?.total || tco.annual_service || financialDeep.annual_operating_cost || 0;
  const combinedPayback = combinedAnnualBenefit > 0 ? Math.round(systemInvestment / (combinedAnnualBenefit / 12)) : 0;
  const fiveYearNetBenefit = (combinedAnnualBenefit * 5) - systemInvestment - (annualOperatingCost * 5);

  return [
    // Slide 0: Title
    { title: 'SurgicalMind AI -- System Assessment', html: `
      <div style="text-align:center;padding:40px 0">
        <div style="display:inline-flex;align-items:center;gap:16px;margin-bottom:30px">
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="RinglyPro" style="width:280px;height:auto;margin-bottom:16px">
        </div>
        <h1 style="font-size:min(42px,7vw);margin:0;color:#f8fafc">${esc(hospitalName)}</h1>
        <p style="color:#94a3b8;margin-top:12px;font-size:min(18px,4vw)">SurgicalMind AI &mdash; da Vinci System Assessment</p>
        <p style="color:#64748b;margin-top:8px">${esc(proj.hospital_type || '')} | ${fmt(proj.bed_count)} beds | ${esc(proj.state || '')} ${esc(proj.country || '')}</p>
        <p style="color:#64748b;margin-top:4px">Project: ${esc(proj.project_code || '')}</p>
        <div style="margin-top:30px;display:inline-flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:50%;background:#10b981;animation:pulse 2s infinite"></div><span style="color:#10b981;font-size:14px">Rachel Voice AI -- Auto-narrating</span></div>
      </div>` },

    // Slide 1: Hospital Profile
    { title: 'Hospital Profile', html: `
      <div class="metrics-grid">${metric('Bed Count', fmt(proj.bed_count))}${metric('Hospital Type', esc(proj.hospital_type || '--'))}${metric('Annual Surgical Volume', fmt(proj.annual_surgical_volume))}${metric('Current System', esc(proj.current_system || 'None'))}</div>
      <div class="metrics-grid">${metric('Current Robots', fmt(proj.current_system_count || 0), '#10b981')}${metric('Credentialed Surgeons', fmt(surgCap.credentialed_surgeons || proj.credentialed_robotic_surgeons || 0), '#10b981')}${metric('Interested Surgeons', fmt(surgCap.interested_surgeons || proj.surgeons_interested || 0), '#eab308')}${metric('Robot-Ready ORs', fmt(proj.robot_ready_ors || 0), '#0ea5e9')}</div>
      ${specialties.length > 0 ? chartBox('chartSpecialtyPie', 200) : ''}
      ${specialties.length > 0 ? `<table class="data-table"><tr><th>Specialty</th><th>% Mix</th></tr>${specialties.map(s => `<tr><td>${esc(s.name)}</td><td>${s.pct}%</td></tr>`).join('')}</table>` : ''}` },

    // Slide 2: Current Surgical Approach Mix (NEW)
    { title: 'Current Surgical Approach Mix', html: `
      <div class="info-box" style="border-color:#0ea5e9;background:rgba(14,165,233,0.08);margin-bottom:16px"><strong>CFO View:</strong> Three-layer breakdown of your ${fmt(totalHospitalVol)} annual surgical cases by approach type, revealing the incremental robotic conversion opportunity.</div>
      <div class="metrics-grid">${metric('Total Hospital Volume', fmt(totalHospitalVol))}${metric('Open Cases', fmt(openCases) + ' (' + openPct + '%)', '#ef4444')}${metric('Laparoscopic Cases', fmt(lapCases) + ' (' + lapPct + '%)', '#eab308')}${metric('Robotic Cases', fmt(roboticCases) + ' (' + roboticPct + '%)', '#10b981')}</div>
      ${chartBox('chartApproachMix', 220)}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px">
        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#ef4444">${openPct}%</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px">Open Surgery</div>
          <div style="color:#64748b;font-size:12px">${fmt(openCases)} cases/yr</div>
        </div>
        <div style="background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#eab308">${lapPct}%</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px">Laparoscopic</div>
          <div style="color:#64748b;font-size:12px">${fmt(lapCases)} cases/yr</div>
        </div>
        <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#10b981">${roboticPct}%</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px">Robotic</div>
          <div style="color:#64748b;font-size:12px">${fmt(roboticCases)} cases/yr</div>
        </div>
      </div>
      ${totalIncrementalOpp > 0 ? `<div class="info-box" style="border-color:#10b981;background:rgba(16,185,129,0.1);margin-top:16px"><strong>Incremental Opportunity:</strong> ${fmt(totalIncrementalOpp)} additional cases identified for robotic conversion -- representing the addressable volume for a new or expanded da Vinci program.</div>` : ''}` },

    // Slide 3: Procedure Volume Analysis (updated with 3-layer)
    { title: 'Procedure Volume Analysis', html: `
      <div class="metrics-grid">${metric('Total Hospital Cases', fmt(procedurePareto.total_hospital_cases || totalCases))}${metric('Current Robotic', fmt(procedurePareto.total_current_robotic || roboticCases) + ' (' + (procedurePareto.current_robotic_pct || roboticPct) + '%)', '#10b981')}${metric('Incremental Opportunity', fmt(procedurePareto.total_incremental_opportunity || totalIncrementalOpp), '#eab308')}${metric('Projected Robotic %', (procedurePareto.projected_robotic_pct || Math.min(100, roboticPct + 15)) + '%', '#8b5cf6')}</div>
      ${chartBox('chartProcedurePareto', 220)}
      ${topProcs.length > 0 ? `<table class="data-table"><tr><th>#</th><th>Procedure</th><th>Total</th><th>Open</th><th>Lap</th><th>Robotic</th><th>Incr. Opp.</th><th>Class</th></tr>${topProcs.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${fmt(p.cases)}</td><td>${fmt(p.current_open)}</td><td>${fmt(p.current_lap)}</td><td>${fmt(p.current_robotic)}</td><td style="color:#10b981;font-weight:600">${fmt(p.incremental_opportunity)}</td><td><strong style="color:${p.abc_class === 'A' ? '#10b981' : p.abc_class === 'B' ? '#eab308' : '#94a3b8'}">${esc(p.abc_class)}</strong></td></tr>`).join('')}</table>` : ''}` },

    // Slide 4: DRG Revenue Per Procedure (NEW)
    { title: 'DRG Revenue Per Procedure', html: (() => {
      const procs = drgProcedures.length > 0 ? drgProcedures.slice(0, 8) : allProcs.slice(0, 8).map(p => ({
        procedure: p.procedure_name || p.name || p.procedure || '',
        drg_code: p.drg_code || '--',
        medicare_rate: p.medicare_rate || 0,
        commercial_rate: p.commercial_rate || 0,
        blended_rate: p.blended_rate || avgReimbursement,
        incremental_cases: p.incremental_opportunity || Math.round((p.cases || 0) * 0.15),
        annual_revenue_impact: (p.blended_rate || avgReimbursement) * (p.incremental_opportunity || Math.round((p.cases || 0) * 0.15))
      }));
      const totalRevImpact = procs.reduce((s, p) => s + (p.annual_revenue_impact || 0), 0);
      const totalIncrCases = procs.reduce((s, p) => s + (p.incremental_cases || 0), 0);
      return `
      <div class="metrics-grid">${metric('Procedures Mapped', fmt(procs.length))}${metric('Avg Blended Rate', '$' + fmt(Math.round(avgReimbursement)))}${metric('Incremental Cases', fmt(totalIncrCases), '#eab308')}${metric('Total Revenue Impact', '$' + fmt(Math.round(totalRevImpact)), '#10b981')}</div>
      ${procs.length > 0 ? `<table class="data-table"><tr><th>Procedure</th><th>DRG</th><th>Medicare</th><th>Commercial</th><th>Blended</th><th>Incr. Cases</th><th>Annual Rev Impact</th></tr>${procs.map(p => `<tr><td>${esc(p.procedure || '')}</td><td>${esc(p.drg_code || '--')}</td><td>${p.medicare_rate ? '$' + fmt(Math.round(p.medicare_rate)) : '--'}</td><td>${p.commercial_rate ? '$' + fmt(Math.round(p.commercial_rate)) : '--'}</td><td style="font-weight:600">$${fmt(Math.round(p.blended_rate || 0))}</td><td>${fmt(p.incremental_cases || 0)}</td><td style="color:#10b981;font-weight:600">$${fmt(Math.round(p.annual_revenue_impact || 0))}</td></tr>`).join('')}</table>` : '<div class="info-box">DRG reimbursement data not available for this facility.</div>'}
      <div class="info-box"><strong>Note:</strong> Blended rates represent weighted average of Medicare and commercial payer mix. Actual rates vary by payer contract and geography.</div>`;
    })() },

    // Slide 5: Monthly Seasonality
    { title: 'Monthly Surgical Volume', html: `
      <div class="metrics-grid">${metric('CoV', (monthlySeason.coefficient_of_variation || '--') + '%')}${metric('Peak Month', esc(peakMonth.month || '--'), '#10b981')}${metric('Peak Cases', fmt(peakMonth.cases || 0))}${metric('Seasonal Class', monthlySeason.seasonality_label || monthlySeason.seasonality_class || '--', '#eab308')}</div>
      ${months.length > 0 ? chartBox('chartMonthlySeason', 220) : '<div class="info-box">No monthly data available.</div>'}` },

    // Slide 6: Weekday Distribution
    { title: 'Weekday Surgical Distribution', html: `
      <div class="metrics-grid">${metric('Peak Day', esc(weekdayDist.peak_day || '--'), '#10b981')}${metric('Operating Days/Week', weekdayDist.operating_days_per_week || '--')}${metric('Avg Cases/Day', fmt(Math.round(days.reduce((s, d) => s + (d.cases || 0), 0) / Math.max(days.filter(d => d.cases > 0).length, 1))))}</div>
      ${days.length > 0 ? chartBox('chartWeekday', 220) : '<div class="info-box">No weekday distribution data available.</div>'}` },

    // Slide 7: Hourly OR Utilization
    { title: 'Hourly OR Utilization', html: `
      <div class="metrics-grid">${metric('Peak Hour', esc(hourlyDist.peak_hour || '--'))}${metric('OR Count', fmt(proj.total_or_count || 0))}${metric('Robot-Ready ORs', fmt(proj.robot_ready_ors || 0), '#10b981')}</div>
      ${hours.length > 0 ? chartBox('chartHourly', 220) : '<div class="info-box">No hourly utilization data available.</div>'}
      <div class="info-box">Peak hours highlighted -- automation must sustain highest throughput during these windows.</div>` },

    // Slide 8: Robot Compatibility Matrix
    { title: 'Robot Compatibility Matrix', html: `
      <div class="metrics-grid">${metric('Procedures Analyzed', fmt(procedures.length))}${metric('Best Model', esc(bestModel || '--'), '#10b981')}</div>
      ${procedures.length > 0 ? chartBox('chartCompatibility', 250) : ''}
      ${procedures.length > 0 ? `<table class="data-table"><tr><th>Procedure</th><th>dV5</th><th>Xi</th><th>X</th><th>SP</th><th>Best Fit</th></tr>${procedures.slice(0, 10).map(p => `<tr><td>${esc(p.procedure || p.name || '')}</td><td>${p.dV5_fit || p.dv5_score || '--'}</td><td>${p.Xi_fit || p.xi_score || '--'}</td><td>${p.X_fit || p.x_score || '--'}</td><td>${p.SP_fit || p.sp_score || '--'}</td><td><strong style="color:#10b981">${esc(p.recommended_model || p.best_model || '')}</strong></td></tr>`).join('')}</table>` : '<div class="info-box">No compatibility matrix data available.</div>'}` },

    // Slide 9: Design Day Analysis
    { title: 'Design Day Analysis', html: `
      <div class="metrics-grid">${metric('P50 (Typical)', fmt(typeof p50 === 'number' ? p50 : p50.cases || 0) + ' cases')}${metric('P75 (Design)', fmt(typeof p75 === 'number' ? p75 : p75.cases || 0) + ' cases', '#10b981')}${metric('P90', fmt(typeof p90 === 'number' ? p90 : p90.cases || 0) + ' cases', '#eab308')}${metric('P95 (Peak)', fmt(typeof p95 === 'number' ? p95 : p95.cases || 0) + ' cases', '#ef4444')}</div>
      <div class="info-box" style="border-color:#10b981;background:rgba(16,185,129,0.1)"><strong>Design Day Recommendation:</strong> ${esc(designDay.design_day_recommendation || 'Plan system capacity for the P75 design day.')}</div>
      ${chartBox('chartDesignDay', 200)}` },

    // Slide 10: 5-Year Volume Projection (updated with 3-layer data)
    { title: '5-Year Volume Projection', html: `
      ${yearlyProj.length > 0 ? `<div class="metrics-grid">${metric('Y1 Robotic', fmt(yearlyProj[0]?.total_robotic || yearlyProj[0]?.projected_cases || 0))}${yearlyProj.length >= 3 ? metric('Y3 Robotic', fmt(yearlyProj[2]?.total_robotic || yearlyProj[2]?.projected_cases || 0), '#eab308') : ''}${yearlyProj.length >= 5 ? metric('Y5 Robotic', fmt(yearlyProj[4]?.total_robotic || yearlyProj[4]?.projected_cases || 0), '#10b981') : ''}${metric('New Robotic Y1', fmt(yearlyProj[0]?.new_robotic_cases || 0) + ' cases', '#8b5cf6')}</div>` : ''}
      ${yearlyProj.length > 0 ? `<div class="metrics-grid">${metric('Y1 Adoption', (yearlyProj[0]?.robotic_pct || yearlyProj[0]?.adoption_rate || '--') + '%')}${yearlyProj.length >= 5 ? metric('Y5 Adoption', (yearlyProj[4]?.robotic_pct || yearlyProj[4]?.adoption_rate || '--') + '%', '#10b981') : ''}</div>` : ''}
      ${yearlyProj.length > 0 ? chartBox('chartVolumeRamp', 220) : '<div class="info-box">No volume projection data available.</div>'}` },

    // Slide 11: Financial Deep Dive
    { title: 'Financial Deep Dive', html: `
      <div class="metrics-grid">${metric('5-Year TCO', (tco.total_5yr || tco.five_year || financialDeep.total_cost_of_ownership_5yr) ? '$' + fmt(Math.round((tco.total_5yr || tco.five_year || financialDeep.total_cost_of_ownership_5yr) / 1000000)) + 'M' : '--')}${metric('Breakeven', (financialDeep.breakeven_month || financialDeep.breakeven_months || '--') + ' months', '#10b981')}${metric('Cost/Procedure', perProcCost ? '$' + fmt(Math.round(perProcCost)) : '--', '#eab308')}${metric('5-Year ROI', (roiCalc.five_year_roi_pct || financialDeep.five_year_roi_pct || '--') + '%', '#10b981')}</div>
      ${(financialDeep.breakeven_months || financialDeep.breakeven) ? chartBox('chartBreakeven', 200) : ''}
      <div class="info-box"><strong>Investment Summary:</strong> Includes system acquisition, annual service, instruments per procedure, and facility modifications. ROI accounts for improved outcomes, shorter LOS, and reduced complications.</div>` },

    // Slide 12: Clinical Outcome Dollarization (NEW)
    { title: 'Clinical Outcome Dollarization', html: (() => {
      const hasData = dollarSpecialties.length > 0 || totalClinicalSavings > 0;
      return `
      <div class="info-box" style="border-color:#8b5cf6;background:rgba(139,92,246,0.08);margin-bottom:16px"><strong>Evidence-Based Savings:</strong> Quantified clinical outcome improvements from robotic surgery, derived from peer-reviewed literature and applied to your hospital's case volume.</div>
      <div class="metrics-grid">${metric('Total Clinical Savings', totalClinicalSavings > 0 ? '$' + fmt(Math.round(totalClinicalSavings)) : '--', '#10b981')}${metric('Specialties Analyzed', fmt(specialtiesAnalyzed), '#0ea5e9')}${metric('Outcome Metrics', fmt(outcomeMetrics), '#eab308')}${metric('Journal Citations', fmt(journalCitations), '#8b5cf6')}</div>
      ${hasData ? chartBox('chartDollarization', 240) : ''}
      ${dollarSpecialties.length > 0 ? `<table class="data-table"><tr><th>Specialty</th><th>Metric</th><th>Open Rate</th><th>Robotic Rate</th><th>Events Avoided</th><th>Annual Savings</th></tr>${dollarSpecialties.slice(0, 10).map(s => `<tr><td>${esc(s.specialty || s.name || '')}</td><td>${esc(s.metric || s.outcome_metric || '')}</td><td>${s.open_rate != null ? s.open_rate + '%' : '--'}</td><td>${s.robotic_rate != null ? s.robotic_rate + '%' : '--'}</td><td>${fmt(s.events_avoided || s.adverse_events_avoided || 0)}</td><td style="color:#10b981;font-weight:600">$${fmt(Math.round(s.savings || s.annual_savings || 0))}</td></tr>`).join('')}</table>` : '<div class="info-box">Dollarization engine will populate detailed per-specialty savings when clinical evidence library is available. Contact your SurgicalMind representative for the full clinical dollarization report.</div>'}`;
    })() },

    // Slide 13: Combined 3-Layer ROI (NEW)
    { title: 'Combined 3-Layer ROI', html: `
      <div class="info-box" style="border-color:#10b981;background:rgba(16,185,129,0.08);margin-bottom:16px"><strong>The Punchline:</strong> Three stacked value layers demonstrate the complete financial case for robotic surgery investment.</div>
      <div style="display:grid;gap:12px;margin-bottom:20px">
        <div style="background:linear-gradient(135deg,rgba(14,165,233,0.15),rgba(14,165,233,0.05));border:1px solid rgba(14,165,233,0.3);border-radius:12px;padding:20px;display:flex;justify-content:space-between;align-items:center">
          <div><div style="color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:1px">Layer 1: Incremental Volume Revenue</div><div style="color:#64748b;font-size:12px;margin-top:4px">${fmt(totalIncrementalOpp)} incremental cases x $${fmt(Math.round(avgReimbursement))} avg reimbursement</div></div>
          <div style="font-size:28px;font-weight:800;color:#0ea5e9">${incrementalRevenue > 0 ? '$' + fmt(Math.round(incrementalRevenue)) : '--'}</div>
        </div>
        <div style="background:linear-gradient(135deg,rgba(139,92,246,0.15),rgba(139,92,246,0.05));border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:20px;display:flex;justify-content:space-between;align-items:center">
          <div><div style="color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:1px">Layer 2: Clinical Outcome Savings</div><div style="color:#64748b;font-size:12px;margin-top:4px">Reduced complications, shorter LOS, fewer readmissions</div></div>
          <div style="font-size:28px;font-weight:800;color:#8b5cf6">${totalClinicalSavings > 0 ? '$' + fmt(Math.round(totalClinicalSavings)) : '--'}</div>
        </div>
        <div style="background:linear-gradient(135deg,rgba(16,185,129,0.2),rgba(16,185,129,0.05));border:2px solid rgba(16,185,129,0.5);border-radius:12px;padding:20px;display:flex;justify-content:space-between;align-items:center">
          <div><div style="color:#10b981;font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:700">Combined Annual Benefit</div><div style="color:#64748b;font-size:12px;margin-top:4px">Layer 1 + Layer 2</div></div>
          <div style="font-size:32px;font-weight:800;color:#10b981">${combinedAnnualBenefit > 0 ? '$' + fmt(Math.round(combinedAnnualBenefit)) : '--'}</div>
        </div>
      </div>
      <div class="metrics-grid">${metric('System Investment', systemInvestment > 0 ? '$' + fmt(Math.round(systemInvestment)) : '--', '#ef4444')}${metric('Annual Operating Cost', annualOperatingCost > 0 ? '$' + fmt(Math.round(annualOperatingCost)) : '--', '#eab308')}${metric('Payback Period', combinedPayback > 0 ? combinedPayback + ' months' : '--', '#0ea5e9')}${metric('5-Year Net Benefit', fiveYearNetBenefit > 0 ? '$' + fmt(Math.round(fiveYearNetBenefit)) : '--', '#10b981')}</div>` },

    // Slide 14: Growth Extrapolation
    { title: 'Growth Extrapolation', html: (() => {
      const y5Data = chartDataGrowth.find(d => d.year === 'Year 5') || chartDataGrowth[chartDataGrowth.length - 1] || {};
      return `
      <div class="metrics-grid">${metric('Baseline Y5', fmt(y5Data.baseline || 0) + ' cases')}${metric('Aggressive Y5', fmt(y5Data.aggressive || 0) + ' cases', '#10b981')}${metric('Conservative Y5', fmt(y5Data.conservative || 0) + ' cases', '#eab308')}${metric('Growth Rates', '10% / 15% / 20%')}</div>
      ${chartDataGrowth.length > 0 ? chartBox('chartGrowth', 220) : '<div class="info-box">No growth scenarios available.</div>'}
      <div class="info-box">Three scenarios model fleet expansion needs -- helping determine timing for additional system acquisition.</div>`;
    })() },

    // Slide 15: Infrastructure Readiness (NEW)
    { title: 'Infrastructure Readiness', html: (() => {
      const scoreColor = readinessScore >= 80 ? '#10b981' : readinessScore >= 50 ? '#eab308' : '#ef4444';
      const credSurgeons = surgCap.credentialed_surgeons || proj.credentialed_robotic_surgeons || 0;
      const intSurgeons = surgCap.interested_surgeons || proj.surgeons_interested || 0;
      const capStatus = surgCap.capacity_status || (credSurgeons >= 3 ? 'Adequate' : 'Limited');
      const trainingMonths = surgCap.training_months_needed || surgCap.training_months || 0;
      const singleRisk = surgCap.single_surgeon_risk || (credSurgeons <= 1);
      return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div>
          <h3 style="color:#f8fafc;margin:0 0 12px 0;font-size:16px">OR Infrastructure</h3>
          <div class="metrics-grid">${metric('Readiness Score', readinessScore + '/100', scoreColor)}${metric('Status', esc(readinessLabel), scoreColor)}</div>
          <div class="metrics-grid">${metric('Total ORs', fmt(infraAssess.total_ors || proj.total_or_count || 0))}${metric('Robot-Ready ORs', fmt(infraAssess.robot_ready_ors || proj.robot_ready_ors || 0), '#0ea5e9')}</div>
          ${infraAssess.or_sqft ? `<div class="metrics-grid">${metric('OR Sq Ft', fmt(infraAssess.or_sqft))}${metric('Ceiling Height', (infraAssess.ceiling_height || '--') + ' ft')}</div>` : ''}
          ${estRenovationCost > 0 ? `<div class="info-box" style="border-color:#eab308;background:rgba(234,179,8,0.1)"><strong>Est. Renovation Cost:</strong> $${fmt(Math.round(estRenovationCost))}</div>` : ''}
        </div>
        <div>
          <h3 style="color:#f8fafc;margin:0 0 12px 0;font-size:16px">Surgeon Capacity</h3>
          <div class="metrics-grid">${metric('Credentialed', fmt(credSurgeons), '#10b981')}${metric('Interested', fmt(intSurgeons), '#eab308')}</div>
          <div class="metrics-grid">${metric('Capacity Status', esc(capStatus), capStatus === 'Adequate' ? '#10b981' : '#eab308')}${metric('Training Needed', trainingMonths > 0 ? trainingMonths + ' months' : 'None', '#0ea5e9')}</div>
          ${singleRisk ? '<div class="info-box" style="border-color:#ef4444;background:rgba(239,68,68,0.1)"><strong>Warning:</strong> Single-surgeon dependency risk detected. Program sustainability requires at least 2-3 credentialed surgeons.</div>' : ''}
        </div>
      </div>
      ${infraIssues.length > 0 ? `<div class="info-box" style="border-color:#eab308;background:rgba(234,179,8,0.1)"><strong>Issues to Address:</strong><ul style="margin:8px 0 0 20px">${infraIssues.slice(0, 5).map(issue => `<li>${esc(typeof issue === 'string' ? issue : (issue.description || issue.issue || ''))}</li>`).join('')}</ul></div>` : ''}`;
    })() },

    // Slide 16: Competitive Landscape (NEW)
    { title: 'Competitive Landscape', html: (() => {
      const pressureColor = marketPressure === 'high' ? '#ef4444' : marketPressure === 'moderate' ? '#eab308' : '#10b981';
      const compDetails = Array.isArray(competitorDetails) ? competitorDetails : [];
      return `
      <div class="metrics-grid">${metric('Competitors Nearby', competitorNearby ? 'Yes' : 'No', competitorNearby ? '#ef4444' : '#10b981')}${metric('Market Pressure', esc(marketPressure.charAt(0).toUpperCase() + marketPressure.slice(1)), pressureColor)}${metric('Competitor Count', fmt(compDetails.length))}${metric('Positioning', esc(compPositioning || 'First Mover'), '#0ea5e9')}</div>
      ${compDetails.length > 0 ? `<table class="data-table"><tr><th>Facility</th><th>System</th><th>Distance</th><th>Cases/Year</th><th>Specialties</th></tr>${compDetails.slice(0, 6).map(c => `<tr><td>${esc(c.name || c.facility || '')}</td><td>${esc(c.system || c.robot_model || '--')}</td><td>${c.distance ? c.distance + ' mi' : '--'}</td><td>${fmt(c.annual_cases || c.cases || 0)}</td><td>${esc(c.specialties || c.primary_specialty || '--')}</td></tr>`).join('')}</table>` : '<div class="info-box">No competitor data available for this market area.</div>'}
      ${compRecommendation ? `<div class="info-box" style="border-color:#0ea5e9;background:rgba(14,165,233,0.1)"><strong>Strategic Recommendation:</strong> ${esc(compRecommendation)}</div>` : ''}
      <div class="info-box"><strong>Market Context:</strong> ${competitorNearby ? 'Competitor presence increases urgency for program launch to capture market share and recruit surgeons.' : 'Limited competition presents a first-mover advantage -- early adoption positions your facility as the regional robotic surgery center of excellence.'}</div>`;
    })() },

    // Slide 17: System Recommendation
    { title: 'System Recommendation', html: `
      <div style="text-align:center;padding:20px 0">
        <div style="display:inline-block;padding:24px 40px;border-radius:16px;background:linear-gradient(135deg,#0c4a6e,#0ea5e9);box-shadow:0 8px 32px rgba(14,165,233,0.3)">
          <div style="font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px">Primary Recommendation</div>
          <div style="font-size:36px;font-weight:800;color:#fff;margin:8px 0">da Vinci ${esc(primaryModelName === 'dV5' ? '5' : primaryModelName)}</div>
          <div style="font-size:20px;color:#7dd3fc">Fit Score: ${Math.round(fitScore)}/100</div>
        </div>
      </div>
      ${rationale ? `<div class="info-box" style="border-color:#0ea5e9;background:rgba(14,165,233,0.1)"><strong>Rationale:</strong> ${esc(rationale)}</div>` : ''}
      ${riskFactors.length > 0 ? `<div class="info-box" style="border-color:#eab308;background:rgba(234,179,8,0.1)"><strong>Risk Factors:</strong><ul style="margin:8px 0 0 20px">${riskFactors.slice(0, 5).map(r => `<li>${esc(r.name || r.factor || r)}: ${esc(r.description || r.detail || r.mitigation || '')}</li>`).join('')}</ul></div>` : ''}` },

    // Slide 18: Next Steps
    { title: 'Next Steps', html: `
      <div class="steps">
        ${['Clinical Workflow Assessment with surgical planning team', 'On-Site Infrastructure Survey to confirm OR readiness', 'Surgeon Training & Credentialing timeline development', 'Financial Model finalization with preferred acquisition structure', 'Implementation Timeline targeting your go-live date'].map((s, i) => `<div class="step"><div class="step-num">${i + 1}</div><div>${esc(s)}</div></div>`).join('')}
      </div>
      <div class="info-box" style="border-color:#8b5cf6;background:rgba(139,92,246,0.1)"><strong>Ready to proceed?</strong> Your dedicated SurgicalMind team is standing by to guide every phase of implementation.</div>` },

    // Slide 19: Contact / Thank You (NEW)
    { title: 'Contact & Thank You', html: `
      <div style="text-align:center;padding:40px 0">
        <div style="display:inline-flex;align-items:center;gap:16px;margin-bottom:24px">
          <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69e6c537c56ad279084e2bb6.png" alt="SurgicalMind AI" style="width:180px;height:auto;margin-bottom:16px">
        </div>
        <h2 style="font-size:28px;margin:0;color:#f8fafc">Thank You, ${esc(hospitalName)}</h2>
        <p style="color:#94a3b8;margin-top:8px;font-size:16px">SurgicalMind AI -- Intelligent Robotic Surgery Planning</p>
        <div style="margin-top:32px;display:inline-block;padding:20px 40px;border-radius:12px;background:rgba(14,165,233,0.1);border:1px solid rgba(14,165,233,0.3)">
          <div style="color:#0ea5e9;font-size:18px;font-weight:700;margin-bottom:8px">Get in Touch</div>
          <div style="color:#f8fafc;font-size:16px">mstagg@digit2ai.com</div>
          <div style="color:#94a3b8;font-size:14px;margin-top:4px">Digit2AI -- SurgicalMind Division</div>
        </div>
        <div style="margin-top:24px;color:#64748b;font-size:13px">
          <p>This assessment was generated by SurgicalMind AI analytical engine.</p>
          <p>All projections are based on provided data and established clinical benchmarks.</p>
          <p style="color:#475569;margin-top:12px">Powered by SurgicalMind AI | Digit2AI</p>
        </div>
      </div>` }
  ];
}

/**
 * Build chart data for client-side Chart.js rendering
 */
function buildChartData(analysis) {
  const a = analysis || {};
  const proj = a._project || {};
  const procedurePareto = a.procedure_pareto || {};
  const monthlySeason = a.monthly_seasonality || {};
  const weekdayDist = a.weekday_distribution || {};
  const hourlyDist = a.hourly_distribution || {};
  const designDay = a.design_day_analysis || {};
  const robotCompat = a.robot_compatibility_matrix || {};
  const volProj = a.volume_projection || {};
  const financialDeep = a.financial_deep_dive || {};
  const growthExtrap = a.growth_extrapolation || {};

  const topProcs = procedurePareto.top_procedures || procedurePareto.procedures || [];
  const months = monthlySeason.months || monthlySeason.monthly_data || [];
  const days = weekdayDist.days || weekdayDist.weekday_data || [];
  const hours = hourlyDist.hours || hourlyDist.hourly_data || [];
  const procedures = robotCompat.procedures || robotCompat.compatibility_matrix || [];
  const yearlyProj = volProj.yearly_projections || volProj.projections || [];
  const chartDataGrowth = growthExtrap.chart_data || [];
  const percRaw = designDay.percentiles || {};

  // Specialty pie
  const specialties = [];
  if (proj.specialty_urology) specialties.push({ label: 'Urology', value: proj.specialty_urology });
  if (proj.specialty_gynecology) specialties.push({ label: 'Gynecology', value: proj.specialty_gynecology });
  if (proj.specialty_general) specialties.push({ label: 'General', value: proj.specialty_general });
  if (proj.specialty_thoracic) specialties.push({ label: 'Thoracic', value: proj.specialty_thoracic });
  if (proj.specialty_colorectal) specialties.push({ label: 'Colorectal', value: proj.specialty_colorectal });
  if (proj.specialty_head_neck) specialties.push({ label: 'Head & Neck', value: proj.specialty_head_neck });
  if (proj.specialty_cardiac) specialties.push({ label: 'Cardiac', value: proj.specialty_cardiac });

  const totalCasesCD = procedurePareto.total_cases || (procedurePareto.procedures || []).reduce((s, p) => s + (p.cases || 0), 0) || 1;

  // Approach mix data -- extract from the 3-layer volume projection
  const approachMix = volProj.current_approach_mix || {};
  const totalHospitalVol = proj.annual_surgical_volume || totalCasesCD;
  const openCases = (approachMix.open && approachMix.open.cases) || Math.round(totalHospitalVol * ((approachMix.open && approachMix.open.pct) || 40) / 100);
  const lapCases = (approachMix.laparoscopic && approachMix.laparoscopic.cases) || Math.round(totalHospitalVol * ((approachMix.laparoscopic && approachMix.laparoscopic.pct) || 35) / 100);
  const roboticCases = (approachMix.robotic && approachMix.robotic.cases) || proj.current_robotic_cases || Math.round(totalHospitalVol * ((approachMix.robotic && approachMix.robotic.pct) || 15) / 100);

  // Dollarization data -- compute on the fly if not stored
  let dollarSpecialties = [];
  try {
    const dollarizationEngine = require('../services/clinical-dollarization');
    const hospitalCaseData = {};
    const specMapCD = { urology: proj.specialty_urology, gynecology: proj.specialty_gynecology, general_surgery: proj.specialty_general, thoracic: proj.specialty_thoracic, colorectal: proj.specialty_colorectal, ent_head_neck: proj.specialty_head_neck, cardiac: proj.specialty_cardiac };
    const currentRoboticPctCD = (proj.annual_surgical_volume > 0) ? Math.round(((proj.current_robotic_cases || 0) / proj.annual_surgical_volume) * 100) : 5;
    for (const [spec, pct] of Object.entries(specMapCD)) {
      if (pct > 0) {
        const cases = Math.round((proj.annual_surgical_volume || 0) * pct / 100);
        hospitalCaseData[spec] = { annual_cases: cases, open_pct: Math.max(0, 100 - currentRoboticPctCD * 2 - 30), lap_pct: 30, robotic_pct: Math.min(100, currentRoboticPctCD * 2) };
        const total = hospitalCaseData[spec].open_pct + hospitalCaseData[spec].lap_pct + hospitalCaseData[spec].robotic_pct;
        if (total !== 100) hospitalCaseData[spec].open_pct += (100 - total);
      }
    }
    const dollarResults = dollarizationEngine.calculateDollarization(hospitalCaseData);
    if (dollarResults && dollarResults.by_specialty) {
      dollarSpecialties = Object.entries(dollarResults.by_specialty).map(([spec, data]) => ({
        specialty: spec,
        savings: data.total_specialty_savings || 0
      }));
    }
  } catch (e) { /* dollarization not available */ }

  return {
    specialtyPie: specialties.filter(s => s.value > 0),
    approachMix: [
      { label: 'Open', value: openCases, color: '#ef4444' },
      { label: 'Laparoscopic', value: lapCases, color: '#eab308' },
      { label: 'Robotic', value: roboticCases, color: '#10b981' }
    ],
    procedurePareto: (procedurePareto.procedures || []).slice(0, 10).map(p => ({
      label: (p.procedure_name || p.name || '').substring(0, 30),
      value: p.cases || 0,
      pct: Math.round((p.cases || 0) / totalCasesCD * 1000) / 10
    })),
    monthlySeason: months.map(m => ({
      label: m.month || m.label || '',
      value: m.total_cases || m.cases || 0,
      robotic: m.projected_robotic || m.current_robotic || m.robotic_cases || 0
    })),
    weekday: days.map(d => ({
      label: d.day || d.label || '',
      value: d.total_cases || d.cases || 0,
      robotic: d.projected_robotic || d.current_robotic || d.robotic_cases || 0
    })),
    hourly: hours.map(h => ({
      label: String(h.hour || h.label || ''),
      value: h.or_utilization_pct || h.cases || 0
    })),
    compatibility: procedures.slice(0, 10).map(p => ({
      label: (p.procedure || p.name || '').substring(0, 25),
      dV5: p.dV5_fit || p.dv5_score || 0,
      Xi: p.Xi_fit || p.xi_score || 0,
      X: p.X_fit || p.x_score || 0,
      SP: p.SP_fit || p.sp_score || 0
    })),
    designDay: [
      { label: 'P50', value: percRaw.P50 || designDay.p50 || 0 },
      { label: 'P75', value: percRaw.P75 || designDay.design_day || 0 },
      { label: 'P90', value: percRaw.P90 || designDay.p90 || 0 },
      { label: 'P95', value: percRaw.P95 || designDay.p95 || 0 }
    ],
    volumeRamp: yearlyProj.map(p => ({
      label: 'Y' + (p.year || ''),
      value: p.total_robotic || p.projected_cases || p.total_cases || p.robotic_cases || 0,
      newRobotic: p.new_robotic_cases || 0
    })),
    breakeven: (financialDeep.breakeven_data || financialDeep.monthly_cashflow || []).slice(0, 60).filter((_, i) => i % 3 === 0).map(m => ({
      label: 'M' + (m.month || ''),
      cost: Math.round((m.cumulative_cost || 0) / 1000000 * 10) / 10,
      benefit: Math.round((m.cumulative_benefit || 0) / 1000000 * 10) / 10
    })),
    dollarization: dollarSpecialties.map(s => ({
      label: (s.specialty || s.name || '').substring(0, 20),
      value: Math.round(s.savings || s.annual_savings || 0)
    })),
    growth: chartDataGrowth.map(d => ({
      label: d.year || '',
      baseline: d.baseline || 0,
      aggressive: d.aggressive || 0,
      conservative: d.conservative || 0
    }))
  };
}

/**
 * POST /:projectId/generate
 */
router.post('/:projectId/generate', async (req, res) => {
  const { projectId } = req.params;
  const existing = proposalJobs.get(projectId);
  if (existing && existing.status === 'generating') {
    return res.json({ success: true, data: { status: 'generating', step: existing.step, detail: existing.detail } });
  }

  const job = { status: 'generating', step: 'init', detail: 'Starting...', startedAt: new Date() };
  proposalJobs.set(projectId, job);
  res.json({ success: true, data: { status: 'generating', message: 'Generating proposal. Poll /status for progress.' } });

  try {
    const models = req.models;
    const seq = models.sequelize;
    const report = (step, detail) => { job.step = step; job.detail = detail; console.log(`[Intuitive Proposal] ${step}: ${detail}`); };

    // Load project + analysis
    report('data', 'Loading project data...');
    const [projRows] = await seq.query('SELECT * FROM intuitive_projects WHERE id = :projectId', { replacements: { projectId } });
    const project = projRows[0];
    if (!project) throw new Error('Project not found');

    const [analysisRows] = await seq.query('SELECT analysis_type, result_data FROM intuitive_analysis_results WHERE project_id = :projectId', { replacements: { projectId } });
    const analysis = { _project: project };
    for (const row of analysisRows) {
      analysis[row.analysis_type] = typeof row.result_data === 'string' ? JSON.parse(row.result_data) : row.result_data;
    }

    const hospitalName = project.hospital_name || 'Your Hospital';

    // Generate TTS audio
    const audioDir = path.join(AUDIO_DIR, String(projectId));
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

    const scripts = buildNarrationScripts(analysis, hospitalName);
    report('tts', `Generating voice narration (0/${scripts.length})...`);

    for (let i = 0; i < scripts.length; i++) {
      const audioPath = path.join(audioDir, `slide_${i}.mp3`);
      if (!fs.existsSync(audioPath)) {
        report('tts', `Generating voice for slide ${i + 1}/${scripts.length}...`);
        await generateTTS(scripts[i], audioPath);
      } else {
        report('tts', `Slide ${i + 1}/${scripts.length} audio cached`);
      }
    }

    // Build slide data
    report('html', 'Building presentation...');
    const slides = buildSlideHTML(analysis, hospitalName);

    job.status = 'completed';
    job.step = 'done';
    job.detail = 'Proposal ready';
    job.result = { slides, hospitalName, projectId, audioSlideCount: scripts.length };
    job.completedAt = new Date();
    report('done', `Proposal ready for project ${projectId}`);
  } catch (error) {
    console.error(`[Intuitive Proposal] Error:`, error);
    job.status = 'error';
    job.step = 'error';
    job.detail = error.message;
  }
});

/**
 * GET /:projectId/status
 */
router.get('/:projectId/status', (req, res) => {
  const job = proposalJobs.get(req.params.projectId);
  if (!job) return res.json({ success: true, data: { status: 'none' } });
  const resp = { status: job.status, step: job.step, detail: job.detail };
  if (job.status === 'completed') resp.proposalUrl = `/intuitive/proposal/${req.params.projectId}`;
  res.json({ success: true, data: resp });
});

/**
 * GET /:projectId/audio/:index
 */
router.get('/:projectId/audio/:index', (req, res) => {
  const filePath = path.join(AUDIO_DIR, req.params.projectId, `slide_${req.params.index}.mp3`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Audio not found' });
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(filePath).pipe(res);
});

module.exports = { router, proposalJobs, buildSlideHTML, buildNarrationScripts, generateTTS, AUDIO_DIR, buildChartData };
