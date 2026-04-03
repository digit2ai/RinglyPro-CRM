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
 * Build narration scripts for 13 slides — da Vinci System Assessment
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
  const scenarios = growthExtrap.scenarios || [];
  const baseScenario = scenarios.find(s => s.name === 'base' || s.label === 'Base') || scenarios[0] || {};
  const optimistic = scenarios.find(s => s.name === 'optimistic' || s.label === 'Optimistic') || {};
  const conservative = scenarios.find(s => s.name === 'conservative' || s.label === 'Conservative') || {};

  // System recommendation (from model_matching)
  const primaryModel = modelMatch.primary_recommendation || modelMatch.recommended_model || 'not determined';
  const fitScore = modelMatch.fit_score || modelMatch.overall_fit || 0;
  const rationale = modelMatch.rationale || modelMatch.reasoning || '';
  const riskFactors = riskAssess.risk_factors || riskAssess.factors || [];

  return [
    // Slide 0: Title
    `Welcome to the da Vinci System Assessment... for ${hospitalName}. This presentation contains a comprehensive analysis of your hospital's surgical profile... robotic compatibility... and our recommended da Vinci system configuration. Let's walk through the key findings together.`,

    // Slide 1: Hospital Profile
    `Let's begin with the hospital profile. ${hospitalName} is a ${hospitalType} facility with ${say(bedCount)} beds. Your annual surgical volume is approximately ${say(annualVol)} procedures. ${currentSystem !== 'none' && currentSystem ? `You currently operate ${say(currentCount)} ${currentSystem} system${currentCount > 1 ? 's' : ''}.` : 'You do not currently have a robotic surgical system in place.'} ${surgCap.credentialed_surgeons ? `There are ${say(surgCap.credentialed_surgeons)} credentialed robotic surgeons on staff... with ${say(surgCap.interested_surgeons || 0)} additional surgeons expressing interest in robotic training.` : ''}`,

    // Slide 2: Procedure Pareto
    `Now let's examine the procedure distribution. The Gini coefficient is ${gini}... indicating ${gini >= 0.6 ? 'high concentration — a small number of procedures drive the majority of your surgical volume' : 'moderate distribution across procedure types'}. ${topProcs.length > 0 ? `Your highest-volume procedure is ${topProcs[0]?.name || topProcs[0]?.procedure || 'not identified'}... accounting for approximately ${sayPct(topProcs[0]?.pct || topProcs[0]?.percentage || 0)} of total cases.` : ''} ${abcClasses.A ? `A-class procedures... your highest-volume categories... represent ${sayPct(abcClasses.A.pct_volume || abcClasses.A.volume_pct || 0)} of total surgical volume... making them prime candidates for robotic conversion.` : ''}`,

    // Slide 3: Monthly Seasonality
    `Moving to the monthly seasonality analysis. The coefficient of variation is ${cov}... ${cov >= 0.15 ? 'indicating notable seasonal patterns in your surgical volume' : 'suggesting relatively consistent volume throughout the year'}. ${peakMonth !== 'not identified' ? `The peak month is ${peakMonth}...` : ''} ${months.length > 0 ? `Understanding these patterns is critical for scheduling robotic O.R. time and planning instrument inventory levels.` : ''} Seasonal awareness ensures optimal utilization of your da Vinci system throughout the year.`,

    // Slide 4: Weekday Distribution
    `The weekday distribution reveals your scheduling patterns across the work week. ${peakDay !== 'not identified' ? `${peakDay} is your busiest surgical day.` : ''} ${days.length > 0 ? `Understanding peak days helps optimize robotic O.R. block scheduling... ensuring the system is available when demand is highest... while allowing for maintenance and setup during lower-volume periods.` : ''} This directly informs how many robotic O.R. blocks to schedule per week.`,

    // Slide 5: Hourly OR Utilization
    `The hourly O.R. utilization profile shows how surgical activity distributes across the day. ${peakHour !== 'not identified' ? `Peak utilization occurs at ${peakHour}.` : ''} This profile is essential for capacity planning... determining how many simultaneous robotic cases your facility can support... and identifying opportunities to extend robotic access into underutilized time windows. ${hours.length > 0 ? 'The data shows clear peak and off-peak patterns that will guide our system configuration recommendations.' : ''}`,

    // Slide 6: Robot Compatibility Matrix
    `Now for the robot compatibility matrix... which evaluates each procedure category against da Vinci system capabilities. ${procedures.length > 0 ? `We analyzed ${say(procedures.length)} procedure categories for robotic fit.` : ''} ${bestModel !== 'not determined' ? `The ${bestModel} shows the strongest overall compatibility across your procedure mix.` : ''} Each procedure is scored on a fit scale... considering factors like surgical complexity... instrument requirements... and clinical evidence for robotic advantage. This matrix drives our system model recommendation.`,

    // Slide 7: Design Day Analysis
    `The design day analysis establishes the capacity planning basis. ${p50.cases ? `On a typical day... at the fiftieth percentile... your facility handles ${say(p50.cases)} cases.` : ''} ${p75.cases ? `The seventy-fifth percentile... our recommended design day... reaches ${say(p75.cases)} cases.` : ''} ${p90.cases ? `At the ninetieth percentile... volume reaches ${say(p90.cases)} cases.` : ''} ${p95.cases ? `And the ninety-fifth percentile peaks at ${say(p95.cases)} cases.` : ''} Designing to the seventy-fifth percentile ensures the system handles peak demand the majority of the time... while remaining cost-effective.`,

    // Slide 8: Volume Projection
    `For the five-year volume projection... we modeled the robotic adoption ramp. ${adoptionRate ? `Starting with an adoption rate of ${sayPct(adoptionRate)}...` : ''} ${y5.total_cases || y5.robotic_cases ? `By year five... projected robotic cases reach ${say(y5.total_cases || y5.robotic_cases)} per year.` : ''} ${y5.specialties ? `Growth is driven by expansion across ${y5.specialties.length || 'multiple'} specialty areas.` : ''} The adoption curve follows established patterns from comparable ${hospitalType} facilities... adjusted for your specific surgeon pipeline and procedure mix.`,

    // Slide 9: Financial Deep Dive
    `The financial analysis provides a comprehensive view of the investment. ${tco.five_year ? `The five-year total cost of ownership is approximately ${say(Math.round(tco.five_year / 1000))} thousand dollars.` : ''} ${breakeven ? `The breakeven point is reached at month ${say(breakeven)}.` : ''} ${perProcCost ? `The per-procedure incremental cost is approximately ${say(Math.round(perProcCost))} dollars.` : ''} These economics include system acquisition... annual service contracts... instrument costs per procedure... and facility modifications. The R.O.I. model accounts for improved patient outcomes... shorter length of stay... and reduced complication rates.`,

    // Slide 10: Growth Extrapolation
    `The growth extrapolation models three scenarios over the planning horizon. ${baseScenario.year5_cases || baseScenario.cases_y5 ? `In the base case... robotic volume reaches ${say(baseScenario.year5_cases || baseScenario.cases_y5)} cases by year five.` : ''} ${optimistic.year5_cases || optimistic.cases_y5 ? `The optimistic scenario projects ${say(optimistic.year5_cases || optimistic.cases_y5)} cases...` : ''} ${conservative.year5_cases || conservative.cases_y5 ? `while the conservative estimate is ${say(conservative.year5_cases || conservative.cases_y5)} cases.` : ''} These scenarios help determine whether a single system is sufficient... or when fleet expansion becomes necessary.`,

    // Slide 11: System Recommendation
    `Based on the complete analysis... our primary recommendation is the da Vinci ${primaryModel} system. ${fitScore ? `The overall fit score is ${say(Math.round(fitScore))} out of one hundred.` : ''} ${rationale ? rationale : 'This model best aligns with your procedure mix, infrastructure, and growth trajectory.'} ${riskFactors.length > 0 ? `Key risk factors to consider include ${riskFactors.slice(0, 3).map(r => r.name || r.factor || r).join('... and ')}.` : ''} The recommended configuration maximizes clinical value while staying within your stated capital parameters.`,

    // Slide 12: Next Steps
    `To conclude... here are the recommended next steps. First... schedule a clinical workflow assessment with our surgical planning team. Second... conduct an on-site infrastructure survey to confirm O.R. readiness. Third... develop a surgeon training and credentialing timeline. Fourth... finalize the financial model with your preferred acquisition structure. And fifth... establish the implementation timeline targeting your go-live date. Thank you for exploring the da Vinci System Assessment for ${hospitalName}. We look forward to partnering on your robotic surgery program.`
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

  const fmt = n => n != null ? Number(n).toLocaleString() : '--';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const metric = (label, value, color = '#0ea5e9') => `<div class="metric"><div class="metric-value" style="color:${color}">${esc(String(value))}</div><div class="metric-label">${esc(label)}</div></div>`;
  const chartBox = (id, h = 220) => `<div class="chart-box"><canvas id="${id}" height="${h}"></canvas></div>`;

  const topProcs = procedurePareto.top_procedures || procedurePareto.procedures || [];
  const abcClasses = procedurePareto.abc_classes || procedurePareto.classes || {};
  const months = monthlySeason.months || monthlySeason.monthly_data || [];
  const days = weekdayDist.days || weekdayDist.weekday_data || [];
  const hours = hourlyDist.hours || hourlyDist.hourly_data || [];
  const procedures = robotCompat.procedures || robotCompat.compatibility_matrix || [];
  const bestModel = robotCompat.best_overall_model || robotCompat.overall_best_model || 'not determined';
  const percentiles = designDay.percentiles || {};
  const p50 = designDay.p50 || percentiles.P50 || 0;
  const p75 = designDay.p75 || percentiles.P75 || designDay.design_day || 0;
  const p90 = designDay.p90 || percentiles.P90 || 0;
  const p95 = designDay.p95 || percentiles.P95 || 0;
  const perProcCost = financialDeep.per_procedure_cost || financialDeep.cost_per_case || (financialDeep.per_procedure_economics?.robotic?.cost) || 0;
  const yearlyProj = volProj.yearly_projections || volProj.projections || [];
  const tco = financialDeep.total_cost_of_ownership || financialDeep.tco || {};
  const scenariosObj = growthExtrap.scenarios || {};
  const scenarios = Array.isArray(scenariosObj) ? scenariosObj : Object.entries(scenariosObj).map(([k, v]) => ({ key: k, ...v }));
  const baseScenario = scenariosObj.baseline || {};
  const optimistic = scenariosObj.aggressive || {};
  const conservative = scenariosObj.conservative || {};
  const chartDataGrowth = growthExtrap.chart_data || [];
  const primaryModel = modelMatch.primary_recommendation || modelMatch.recommended_model || '--';
  const primaryRec = typeof primaryModel === 'object' ? primaryModel : {};
  const fitScore = primaryRec.score || modelMatch.fit_score || modelMatch.overall_fit || 0;
  const rationale = primaryRec.reasons?.join('. ') || modelMatch.rationale || modelMatch.reasoning || '';
  const riskFactors = riskAssess.risks || riskAssess.risk_factors || riskAssess.factors || [];

  // Specialty mix
  const specialties = [];
  if (proj.specialty_urology) specialties.push({ name: 'Urology', pct: proj.specialty_urology });
  if (proj.specialty_gynecology) specialties.push({ name: 'Gynecology', pct: proj.specialty_gynecology });
  if (proj.specialty_general) specialties.push({ name: 'General', pct: proj.specialty_general });
  if (proj.specialty_thoracic) specialties.push({ name: 'Thoracic', pct: proj.specialty_thoracic });
  if (proj.specialty_colorectal) specialties.push({ name: 'Colorectal', pct: proj.specialty_colorectal });
  if (proj.specialty_head_neck) specialties.push({ name: 'Head & Neck', pct: proj.specialty_head_neck });
  if (proj.specialty_cardiac) specialties.push({ name: 'Cardiac', pct: proj.specialty_cardiac });

  return [
    // Slide 0: Title
    { title: 'da Vinci System Assessment', html: `
      <div style="text-align:center;padding:40px 0">
        <div style="display:inline-flex;align-items:center;gap:16px;margin-bottom:30px">
          <div style="width:80px;height:80px;border-radius:16px;background:linear-gradient(135deg,#0c4a6e,#0ea5e9);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 32px rgba(14,165,233,0.3)">
            <span style="color:#fff;font-size:24px;font-weight:700">dV</span>
          </div>
        </div>
        <h1 style="font-size:min(42px,7vw);margin:0;color:#f8fafc">${esc(hospitalName)}</h1>
        <p style="color:#94a3b8;margin-top:12px;font-size:min(18px,4vw)">da Vinci Robotic Surgery System Assessment</p>
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

    // Slide 2: Procedure Pareto
    { title: 'Procedure Volume Analysis', html: `
      <div class="metrics-grid">${metric('Gini Coefficient', procedurePareto.gini_coefficient || procedurePareto.gini || '--')}${metric('Total Procedures', fmt(procedurePareto.total_procedures || procedurePareto.total || 0))}${metric('Procedure Types', fmt(topProcs.length))}${metric('ABC Separation', (procedurePareto.gini_coefficient || 0) >= 0.6 ? 'Strong' : 'Moderate')}</div>
      ${chartBox('chartProcedurePareto', 220)}
      ${topProcs.length > 0 ? `<table class="data-table"><tr><th>#</th><th>Procedure</th><th>Cases</th><th>%</th><th>Class</th></tr>${topProcs.slice(0, 10).map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name || p.procedure || '')}</td><td>${fmt(p.cases || p.count || 0)}</td><td>${p.pct || p.percentage || 0}%</td><td><strong>${esc(p.abc_class || p.class || '')}</strong></td></tr>`).join('')}</table>` : ''}` },

    // Slide 3: Monthly Seasonality
    { title: 'Monthly Surgical Volume', html: `
      <div class="metrics-grid">${metric('CoV', monthlySeason.coefficient_of_variation || monthlySeason.cov || '--')}${metric('Peak Month', esc(monthlySeason.peak_month || '--'))}${metric('Seasonal Pattern', (monthlySeason.coefficient_of_variation || 0) >= 0.15 ? 'Notable' : 'Consistent', '#eab308')}</div>
      ${months.length > 0 ? chartBox('chartMonthlySeason', 220) : '<div class="info-box">No monthly data available.</div>'}` },

    // Slide 4: Weekday Distribution
    { title: 'Weekday Surgical Distribution', html: `
      <div class="metrics-grid">${metric('Peak Day', esc(weekdayDist.peak_day || '--'))}${metric('Total Days Analyzed', fmt(weekdayDist.total_days || 0))}</div>
      ${days.length > 0 ? chartBox('chartWeekday', 220) : '<div class="info-box">No weekday distribution data available.</div>'}` },

    // Slide 5: Hourly OR Utilization
    { title: 'Hourly OR Utilization', html: `
      <div class="metrics-grid">${metric('Peak Hour', esc(hourlyDist.peak_hour || '--'))}${metric('OR Count', fmt(proj.total_or_count || 0))}${metric('Robot-Ready ORs', fmt(proj.robot_ready_ors || 0), '#10b981')}</div>
      ${hours.length > 0 ? chartBox('chartHourly', 220) : '<div class="info-box">No hourly utilization data available.</div>'}
      <div class="info-box">Peak hours highlighted -- automation must sustain highest throughput during these windows.</div>` },

    // Slide 6: Robot Compatibility Matrix
    { title: 'Robot Compatibility Matrix', html: `
      <div class="metrics-grid">${metric('Procedures Analyzed', fmt(procedures.length))}${metric('Best Model', esc(bestModel || '--'), '#10b981')}</div>
      ${procedures.length > 0 ? chartBox('chartCompatibility', 250) : ''}
      ${procedures.length > 0 ? `<table class="data-table"><tr><th>Procedure</th><th>dV5</th><th>Xi</th><th>X</th><th>SP</th><th>Best Fit</th></tr>${procedures.slice(0, 10).map(p => `<tr><td>${esc(p.procedure || p.name || '')}</td><td>${p.dV5_fit || p.dv5_score || '--'}</td><td>${p.Xi_fit || p.xi_score || '--'}</td><td>${p.X_fit || p.x_score || '--'}</td><td>${p.SP_fit || p.sp_score || '--'}</td><td><strong style="color:#10b981">${esc(p.recommended_model || p.best_model || '')}</strong></td></tr>`).join('')}</table>` : '<div class="info-box">No compatibility matrix data available.</div>'}` },

    // Slide 7: Design Day Analysis
    { title: 'Design Day Analysis', html: `
      <div class="metrics-grid">${metric('P50 (Typical)', fmt(typeof p50 === 'number' ? p50 : p50.cases || 0) + ' cases')}${metric('P75 (Design)', fmt(typeof p75 === 'number' ? p75 : p75.cases || 0) + ' cases', '#10b981')}${metric('P90', fmt(typeof p90 === 'number' ? p90 : p90.cases || 0) + ' cases', '#eab308')}${metric('P95 (Peak)', fmt(typeof p95 === 'number' ? p95 : p95.cases || 0) + ' cases', '#ef4444')}</div>
      <div class="info-box" style="border-color:#10b981;background:rgba(16,185,129,0.1)"><strong>Design Day Recommendation:</strong> ${esc(designDay.design_day_recommendation || 'Plan system capacity for the P75 design day.')}</div>
      ${chartBox('chartDesignDay', 200)}` },

    // Slide 8: Volume Projection
    { title: '5-Year Volume Projection', html: `
      ${yearlyProj.length > 0 ? `<div class="metrics-grid">${metric('Y1 Cases', fmt(yearlyProj[0]?.total_cases || yearlyProj[0]?.robotic_cases || 0))}${yearlyProj.length >= 3 ? metric('Y3 Cases', fmt(yearlyProj[2]?.total_cases || yearlyProj[2]?.robotic_cases || 0), '#eab308') : ''}${yearlyProj.length >= 5 ? metric('Y5 Cases', fmt(yearlyProj[4]?.total_cases || yearlyProj[4]?.robotic_cases || 0), '#10b981') : ''}${metric('Adoption Rate', (volProj.adoption_rate || volProj.ramp_rate || '--') + '%')}</div>` : ''}
      ${yearlyProj.length > 0 ? chartBox('chartVolumeRamp', 220) : '<div class="info-box">No volume projection data available.</div>'}` },

    // Slide 9: Financial Deep Dive
    { title: 'Financial Deep Dive', html: `
      <div class="metrics-grid">${metric('5-Year TCO', (tco.total_5yr || tco.five_year || financialDeep.total_cost_of_ownership_5yr) ? '$' + fmt(Math.round((tco.total_5yr || tco.five_year || financialDeep.total_cost_of_ownership_5yr) / 1000000)) + 'M' : '--')}${metric('Breakeven', (financialDeep.breakeven_month || financialDeep.breakeven_months || '--') + ' months', '#10b981')}${metric('Cost/Procedure', perProcCost ? '$' + fmt(Math.round(perProcCost)) : '--', '#eab308')}${metric('5-Year ROI', (roiCalc.five_year_roi_pct || financialDeep.five_year_roi_pct || '--') + '%', '#10b981')}</div>
      ${(financialDeep.breakeven_months || financialDeep.breakeven) ? chartBox('chartBreakeven', 200) : ''}
      <div class="info-box"><strong>Investment Summary:</strong> Includes system acquisition, annual service, instruments per procedure, and facility modifications. ROI accounts for improved outcomes, shorter LOS, and reduced complications.</div>` },

    // Slide 10: Growth Extrapolation
    { title: 'Growth Extrapolation', html: (() => {
      const y5Data = chartDataGrowth.find(d => d.year === 'Year 5') || chartDataGrowth[chartDataGrowth.length - 1] || {};
      return `
      <div class="metrics-grid">${metric('Baseline Y5', fmt(y5Data.baseline || 0) + ' cases')}${metric('Aggressive Y5', fmt(y5Data.aggressive || 0) + ' cases', '#10b981')}${metric('Conservative Y5', fmt(y5Data.conservative || 0) + ' cases', '#eab308')}${metric('Growth Rates', '10% / 15% / 20%')}</div>
      ${chartDataGrowth.length > 0 ? chartBox('chartGrowth', 220) : '<div class="info-box">No growth scenarios available.</div>'}
      <div class="info-box">Three scenarios model fleet expansion needs -- helping determine timing for additional system acquisition.</div>`;
    })() },

    // Slide 11: System Recommendation
    { title: 'System Recommendation', html: `
      <div style="text-align:center;padding:20px 0">
        <div style="display:inline-block;padding:24px 40px;border-radius:16px;background:linear-gradient(135deg,#0c4a6e,#0ea5e9);box-shadow:0 8px 32px rgba(14,165,233,0.3)">
          <div style="font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px">Primary Recommendation</div>
          <div style="font-size:36px;font-weight:800;color:#fff;margin:8px 0">da Vinci ${esc(String(primaryModel))}</div>
          <div style="font-size:20px;color:#7dd3fc">Fit Score: ${Math.round(fitScore)}/100</div>
        </div>
      </div>
      ${rationale ? `<div class="info-box" style="border-color:#0ea5e9;background:rgba(14,165,233,0.1)"><strong>Rationale:</strong> ${esc(rationale)}</div>` : ''}
      ${riskFactors.length > 0 ? `<div class="info-box" style="border-color:#eab308;background:rgba(234,179,8,0.1)"><strong>Risk Factors:</strong><ul style="margin:8px 0 0 20px">${riskFactors.slice(0, 5).map(r => `<li>${esc(r.name || r.factor || r)}: ${esc(r.description || r.detail || r.mitigation || '')}</li>`).join('')}</ul></div>` : ''}` },

    // Slide 12: Next Steps
    { title: 'Next Steps', html: `
      <div class="steps">
        ${['Clinical Workflow Assessment with surgical planning team', 'On-Site Infrastructure Survey to confirm OR readiness', 'Surgeon Training & Credentialing timeline development', 'Financial Model finalization with preferred acquisition structure', 'Implementation Timeline targeting your go-live date'].map((s, i) => `<div class="step"><div class="step-num">${i + 1}</div><div>${esc(s)}</div></div>`).join('')}
      </div>
      <div class="info-box" style="border-color:#8b5cf6;background:rgba(139,92,246,0.1)"><strong>Thank you</strong> for exploring the da Vinci System Assessment for ${esc(hospitalName)}. We look forward to partnering on your robotic surgery program.</div>` }
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

  const topProcs = procedurePareto.top_procedures || [];
  const months = monthlySeason.months || [];
  const days = weekdayDist.days || [];
  const hours = hourlyDist.hours || [];
  const procedures = robotCompat.procedures || [];
  const yearlyProj = volProj.yearly_projections || volProj.projections || [];
  const scenarios = growthExtrap.scenarios || [];

  // Specialty pie
  const specialties = [];
  if (proj.specialty_urology) specialties.push({ label: 'Urology', value: proj.specialty_urology });
  if (proj.specialty_gynecology) specialties.push({ label: 'Gynecology', value: proj.specialty_gynecology });
  if (proj.specialty_general) specialties.push({ label: 'General', value: proj.specialty_general });
  if (proj.specialty_thoracic) specialties.push({ label: 'Thoracic', value: proj.specialty_thoracic });
  if (proj.specialty_colorectal) specialties.push({ label: 'Colorectal', value: proj.specialty_colorectal });
  if (proj.specialty_head_neck) specialties.push({ label: 'Head & Neck', value: proj.specialty_head_neck });
  if (proj.specialty_cardiac) specialties.push({ label: 'Cardiac', value: proj.specialty_cardiac });

  return {
    specialtyPie: specialties.filter(s => s.value > 0),
    procedurePareto: topProcs.slice(0, 10).map(p => ({
      label: (p.name || p.procedure || '').substring(0, 30),
      value: p.cases || p.count || 0,
      pct: p.pct || p.percentage || 0
    })),
    monthlySeason: months.map(m => ({
      label: m.month || m.label || '',
      value: m.cases || m.volume || m.count || 0
    })),
    weekday: days.map(d => ({
      label: d.day || d.label || '',
      value: d.cases || d.volume || d.count || 0
    })),
    hourly: hours.map(h => ({
      label: String(h.hour || h.label || ''),
      value: h.cases || h.volume || h.count || 0
    })),
    compatibility: procedures.slice(0, 10).map(p => ({
      label: (p.name || p.procedure || '').substring(0, 25),
      dV5: p.dv5_score || p.dV5 || 0,
      Xi: p.xi_score || p.Xi || 0,
      X: p.x_score || p.X || 0,
      SP: p.sp_score || p.SP || 0
    })),
    designDay: [
      { label: 'P50', value: (designDay.p50 || {}).cases || 0 },
      { label: 'P75', value: (designDay.p75 || {}).cases || 0 },
      { label: 'P90', value: (designDay.p90 || {}).cases || 0 },
      { label: 'P95', value: (designDay.p95 || {}).cases || 0 }
    ],
    volumeRamp: yearlyProj.map(p => ({
      label: 'Y' + (p.year || ''),
      value: p.total_cases || p.robotic_cases || 0
    })),
    breakeven: (financialDeep.monthly_cashflow || financialDeep.cashflow || []).map((m, i) => ({
      label: 'M' + (m.month || i + 1),
      value: m.cumulative || m.net || 0
    })),
    growth: scenarios.map(s => ({
      label: s.name || s.label || '',
      y1: s.year1_cases || s.cases_y1 || 0,
      y3: s.year3_cases || s.cases_y3 || 0,
      y5: s.year5_cases || s.cases_y5 || 0
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
