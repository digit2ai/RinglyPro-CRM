'use strict';

/**
 * Clinical Outcome Dollarization Engine for SurgicalMind AI
 *
 * Calculates dollar savings from converting open/laparoscopic surgical cases
 * to robotic (da Vinci) surgery based on published clinical evidence.
 *
 * Designed for presentation to hospital CFOs -- all math is auditable and
 * every savings figure traces back to a cited source.
 */

const { CLINICAL_EVIDENCE, getEvidenceBySpecialty } = require('./clinical-evidence');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the projected case mix after converting non-robotic cases to robotic.
 *
 * Default target: current robotic % + 50% of remaining non-robotic headroom.
 * Open cases are converted first (higher clinical delta), then lap cases.
 */
function _computeProjectedMix(caseData, options) {
  const { annual_cases, open_pct, lap_pct, robotic_pct } = caseData;

  // Validate input percentages (must sum to ~100)
  const totalPct = open_pct + lap_pct + robotic_pct;
  if (Math.abs(totalPct - 100) > 1) {
    throw new Error(
      `Case mix percentages must sum to 100 (got ${totalPct} for ${annual_cases} cases)`
    );
  }

  // Current absolute counts
  const currentOpen = Math.round(annual_cases * (open_pct / 100));
  const currentLap = Math.round(annual_cases * (lap_pct / 100));
  const currentRobotic = annual_cases - currentOpen - currentLap; // avoid rounding drift

  // Target robotic percentage
  const nonRoboticPct = 100 - robotic_pct;
  const targetRoboticPct = options.projected_robotic_pct != null
    ? options.projected_robotic_pct
    : robotic_pct + nonRoboticPct * 0.5;

  const projectedRobotic = Math.round(annual_cases * (targetRoboticPct / 100));
  const casesToConvert = Math.max(0, projectedRobotic - currentRobotic);

  // Convert open first, then lap
  let convertFromOpen = Math.min(casesToConvert, currentOpen);
  let convertFromLap = Math.min(casesToConvert - convertFromOpen, currentLap);

  const projectedOpen = currentOpen - convertFromOpen;
  const projectedLap = currentLap - convertFromLap;
  const projectedRoboticFinal = annual_cases - projectedOpen - projectedLap;

  return {
    current: { open: currentOpen, lap: currentLap, robotic: currentRobotic },
    projected: { open: projectedOpen, lap: projectedLap, robotic: projectedRoboticFinal },
    projected_mix: {
      open_pct: Math.round((projectedOpen / annual_cases) * 100 * 10) / 10,
      lap_pct: Math.round((projectedLap / annual_cases) * 100 * 10) / 10,
      robotic_pct: Math.round((projectedRoboticFinal / annual_cases) * 100 * 10) / 10
    },
    cases_converted_to_robotic: convertFromOpen + convertFromLap,
    converted_from_open: convertFromOpen,
    converted_from_lap: convertFromLap
  };
}

/**
 * Adapt evidence library format to the metrics array format expected by the engine.
 * Evidence library stores outcomes as: { outcome_key: { metric_name, open_rate_pct, laparoscopic_rate_pct, robotic_rate_pct, cost_per_event, unit, sources, cms_quality_measure } }
 * Engine expects metrics as array of: { key, name, open_rate, lap_rate, robotic_rate, cost_per_event, unit, sources, is_mortality }
 */
function _adaptEvidenceMetrics(evidence) {
  const outcomes = evidence.outcomes || evidence.metrics || {};
  // If already an array, return as-is
  if (Array.isArray(outcomes)) return outcomes;

  return Object.entries(outcomes).map(([key, data]) => ({
    key,
    name: data.metric_name || key,
    open_rate: (data.open_rate_pct != null ? data.open_rate_pct / 100 : data.open_rate) || 0,
    lap_rate: (data.laparoscopic_rate_pct != null ? data.laparoscopic_rate_pct / 100 : data.lap_rate) || 0,
    robotic_rate: (data.robotic_rate_pct != null ? data.robotic_rate_pct / 100 : data.robotic_rate) || 0,
    cost_per_event: data.cost_per_event || 0,
    unit: data.unit || 'percentage',
    sources: data.sources || [],
    is_mortality: key === 'mortality' || key === '30day_mortality' || (data.metric_name || '').toLowerCase().includes('mortality')
  }));
}

/**
 * Calculate savings for a single metric within a specialty.
 */
function _calculateMetricSavings(metric, mixData, customCosts) {
  const { current, projected } = mixData;
  const totalCases = current.open + current.lap + current.robotic;

  if (totalCases === 0) {
    return null;
  }

  const costOverride = customCosts && customCosts[metric.key];

  if (metric.unit === 'days') {
    // Length-of-stay type metric: savings = cases_converted * delta_days * cost_per_day
    const costPerDay = costOverride || metric.cost_per_event;

    // Current weighted average LOS
    const currentWeightedLOS =
      (current.open * metric.open_rate +
        current.lap * (metric.lap_rate || metric.open_rate) +
        current.robotic * metric.robotic_rate) / totalCases;

    // Projected weighted average LOS
    const projectedWeightedLOS =
      (projected.open * metric.open_rate +
        projected.lap * (metric.lap_rate || metric.open_rate) +
        projected.robotic * metric.robotic_rate) / totalCases;

    const daysAvoided = (currentWeightedLOS - projectedWeightedLOS) * totalCases;
    const savings = Math.round(daysAvoided * costPerDay);

    return {
      metric_name: metric.name,
      metric_key: metric.key,
      unit: metric.unit,
      current_weighted_avg: Math.round(currentWeightedLOS * 100) / 100,
      projected_weighted_avg: Math.round(projectedWeightedLOS * 100) / 100,
      total_days_avoided: Math.round(daysAvoided * 10) / 10,
      cost_per_day: costPerDay,
      savings: Math.max(0, savings),
      sources: metric.sources || []
    };
  }

  // Rate-based metric (e.g., infection rate, complication rate)
  // Current adverse events = sum of (cases_by_approach * rate_by_approach)
  const currentEvents =
    current.open * (metric.open_rate || 0) +
    current.lap * (metric.lap_rate || 0) +
    current.robotic * (metric.robotic_rate || 0);

  const projectedEvents =
    projected.open * (metric.open_rate || 0) +
    projected.lap * (metric.lap_rate || 0) +
    projected.robotic * (metric.robotic_rate || 0);

  const eventsAvoided = currentEvents - projectedEvents;
  const costPerEvent = costOverride || metric.cost_per_event;
  const savings = Math.round(eventsAvoided * costPerEvent);

  return {
    metric_name: metric.name,
    metric_key: metric.key,
    unit: metric.unit || 'events',
    current_events: Math.round(currentEvents * 100) / 100,
    projected_events: Math.round(projectedEvents * 100) / 100,
    events_avoided: Math.round(eventsAvoided * 100) / 100,
    cost_per_event: costPerEvent,
    savings: Math.max(0, savings),
    sources: metric.sources || []
  };
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Calculate clinical dollarization for a single specialty.
 *
 * @param {string} specialty - e.g. 'colorectal', 'urology'
 * @param {object} caseData - { annual_cases, open_pct, lap_pct, robotic_pct }
 * @param {object} [options] - { projected_robotic_pct, custom_costs, include_mortality }
 * @returns {object} Specialty dollarization breakdown
 */
function calculateSingleSpecialty(specialty, caseData, options = {}) {
  const evidence = getEvidenceBySpecialty(specialty);
  if (!evidence) {
    return {
      specialty,
      error: `No clinical evidence data available for specialty: ${specialty}`,
      total_specialty_savings: 0
    };
  }

  const mixData = _computeProjectedMix(caseData, options);
  const savingsByMetric = {};
  let totalSpecialtySavings = 0;
  const allSources = new Set();

  // Adapt evidence library format: outcomes object -> metrics array
  const metrics = _adaptEvidenceMetrics(evidence);

  for (const metric of metrics) {
    // Skip mortality unless explicitly included
    if (metric.is_mortality && !options.include_mortality) {
      continue;
    }

    const result = _calculateMetricSavings(metric, mixData, options.custom_costs);
    if (!result) continue;

    savingsByMetric[metric.key] = result;
    totalSpecialtySavings += result.savings;

    if (result.sources) {
      result.sources.forEach(s => allSources.add(JSON.stringify(s)));
    }
  }

  const sourcesCited = Array.from(allSources).map(s => JSON.parse(s));

  return {
    specialty,
    annual_cases: caseData.annual_cases,
    current_mix: {
      open_pct: caseData.open_pct,
      lap_pct: caseData.lap_pct,
      robotic_pct: caseData.robotic_pct
    },
    projected_mix: mixData.projected_mix,
    cases_converted_to_robotic: mixData.cases_converted_to_robotic,
    converted_from_open: mixData.converted_from_open,
    converted_from_lap: mixData.converted_from_lap,
    savings_by_metric: savingsByMetric,
    total_specialty_savings: Math.round(totalSpecialtySavings),
    sources_cited: sourcesCited
  };
}

/**
 * Calculate clinical dollarization across all specialties.
 *
 * @param {object} hospitalCaseData - Keyed by specialty name
 * @param {object} [options] - { projected_robotic_pct, custom_costs, include_mortality }
 * @returns {object} Full dollarization report
 */
function calculateDollarization(hospitalCaseData, options = {}) {
  const bySpecialty = {};
  let totalClinicalSavings = 0;
  const allCitations = new Set();

  for (const [specialty, caseData] of Object.entries(hospitalCaseData)) {
    const result = calculateSingleSpecialty(specialty, caseData, options);
    bySpecialty[specialty] = result;
    totalClinicalSavings += result.total_specialty_savings || 0;

    if (result.sources_cited) {
      result.sources_cited.forEach(s => allCitations.add(JSON.stringify(s)));
    }
  }

  const citations = Array.from(allCitations).map(s => JSON.parse(s));

  return {
    total_clinical_savings_annual: Math.round(totalClinicalSavings),
    by_specialty: bySpecialty,
    all_citations: citations,
    methodology:
      'Based on published clinical evidence comparing open, laparoscopic, and robotic ' +
      'surgical outcomes. Savings calculated as adverse events avoided multiplied by ' +
      'published cost per event. Length-of-stay savings calculated as reduced bed-days ' +
      'multiplied by cost per inpatient day. All rates sourced from peer-reviewed ' +
      'literature and national quality databases.'
  };
}

/**
 * Quick conversion impact calculator.
 *
 * "If we convert X colorectal cases from open to robotic, what do we save?"
 *
 * @param {string} specialty
 * @param {number} casesToConvert
 * @param {string} fromApproach - 'open' or 'lap'
 * @param {string} toApproach - 'robotic' (or 'lap')
 * @returns {object} Impact summary
 */
function getConversionImpact(specialty, casesToConvert, fromApproach, toApproach) {
  const evidence = getEvidenceBySpecialty(specialty);
  if (!evidence) {
    return {
      specialty,
      error: `No clinical evidence data available for specialty: ${specialty}`,
      total_savings: 0
    };
  }

  const fromKey = fromApproach + '_rate';
  const toKey = toApproach + '_rate';
  const impacts = [];
  let totalSavings = 0;

  const metrics = _adaptEvidenceMetrics(evidence);
  for (const metric of metrics) {
    const fromRate = metric[fromKey];
    const toRate = metric[toKey];

    if (fromRate == null || toRate == null) continue;

    if (metric.unit === 'days') {
      // LOS metric: delta days per case * cost per day * cases
      const deltaDays = fromRate - toRate;
      const savings = Math.round(deltaDays * metric.cost_per_event * casesToConvert);
      impacts.push({
        metric_name: metric.name,
        metric_key: metric.key,
        unit: metric.unit,
        from_avg_days: fromRate,
        to_avg_days: toRate,
        days_saved_per_case: Math.round(deltaDays * 100) / 100,
        total_days_saved: Math.round(deltaDays * casesToConvert * 10) / 10,
        savings: Math.max(0, savings),
        sources: metric.sources || []
      });
      totalSavings += Math.max(0, savings);
    } else {
      // Rate-based metric: delta rate * cases * cost per event
      const deltaRate = fromRate - toRate;
      const eventsAvoided = deltaRate * casesToConvert;
      const savings = Math.round(eventsAvoided * metric.cost_per_event);
      impacts.push({
        metric_name: metric.name,
        metric_key: metric.key,
        unit: metric.unit || 'events',
        from_rate: fromRate,
        to_rate: toRate,
        events_avoided: Math.round(eventsAvoided * 100) / 100,
        savings: Math.max(0, savings),
        sources: metric.sources || []
      });
      totalSavings += Math.max(0, savings);
    }
  }

  return {
    specialty,
    cases_converted: casesToConvert,
    from_approach: fromApproach,
    to_approach: toApproach,
    impacts,
    total_savings: Math.round(totalSavings)
  };
}

/**
 * Generate a text summary suitable for a business plan executive summary.
 *
 * @param {object} dollarizationResults - Output from calculateDollarization()
 * @returns {string} Executive summary text
 */
function generateSummaryReport(dollarizationResults) {
  const { total_clinical_savings_annual, by_specialty, all_citations } = dollarizationResults;
  const specialties = Object.entries(by_specialty).filter(
    ([, v]) => v.total_specialty_savings > 0
  );

  if (specialties.length === 0) {
    return (
      'Clinical Dollarization Analysis\n\n' +
      'No measurable clinical savings were identified based on the current case mix ' +
      'and projected robotic adoption targets. This may indicate that the hospital ' +
      'already has high robotic penetration or that no clinical evidence data is ' +
      'available for the specialties provided.'
    );
  }

  // Sort specialties by savings descending
  specialties.sort((a, b) => b[1].total_specialty_savings - a[1].total_specialty_savings);

  const totalFormatted = _formatCurrency(total_clinical_savings_annual);
  const totalCasesConverted = specialties.reduce(
    (sum, [, v]) => sum + (v.cases_converted_to_robotic || 0), 0
  );

  let report = '';
  report += 'CLINICAL OUTCOME DOLLARIZATION ANALYSIS\n';
  report += '========================================\n\n';

  report += 'EXECUTIVE SUMMARY\n';
  report += '-----------------\n';
  report += `Projected annual clinical savings from robotic surgical conversion: ${totalFormatted}\n`;
  report += `Total cases converted to robotic approach: ${totalCasesConverted.toLocaleString()}\n`;
  report += `Specialties analyzed: ${specialties.length}\n`;
  report += `Clinical evidence sources cited: ${all_citations.length}\n\n`;

  report += 'SAVINGS BY SPECIALTY\n';
  report += '--------------------\n';

  for (const [specName, specData] of specialties) {
    const displayName = specName.charAt(0).toUpperCase() + specName.slice(1).replace(/_/g, ' ');
    const savings = _formatCurrency(specData.total_specialty_savings);
    const converted = specData.cases_converted_to_robotic || 0;

    report += `\n${displayName}\n`;
    report += `  Annual cases: ${specData.annual_cases.toLocaleString()}\n`;
    report += `  Current mix: ${specData.current_mix.open_pct}% open / ${specData.current_mix.lap_pct}% laparoscopic / ${specData.current_mix.robotic_pct}% robotic\n`;
    report += `  Projected mix: ${specData.projected_mix.open_pct}% open / ${specData.projected_mix.lap_pct}% laparoscopic / ${specData.projected_mix.robotic_pct}% robotic\n`;
    report += `  Cases converted: ${converted.toLocaleString()}\n`;
    report += `  Projected savings: ${savings}\n`;

    // Top 3 saving metrics for this specialty
    const topMetrics = Object.values(specData.savings_by_metric || {})
      .filter(m => m.savings > 0)
      .sort((a, b) => b.savings - a.savings)
      .slice(0, 3);

    if (topMetrics.length > 0) {
      report += '  Key drivers:\n';
      for (const m of topMetrics) {
        if (m.unit === 'days') {
          report += `    - ${m.metric_name}: ${m.total_days_avoided} bed-days avoided (${_formatCurrency(m.savings)})\n`;
        } else {
          report += `    - ${m.metric_name}: ${m.events_avoided} events avoided (${_formatCurrency(m.savings)})\n`;
        }
      }
    }
  }

  report += '\n\nMETHODOLOGY\n';
  report += '-----------\n';
  report += dollarizationResults.methodology + '\n';

  report += '\n\nCITATIONS\n';
  report += '---------\n';
  for (let i = 0; i < all_citations.length; i++) {
    const cite = all_citations[i];
    const authors = cite.authors || cite.author || 'Unknown';
    const title = cite.title || 'Untitled';
    const journal = cite.journal || '';
    const year = cite.year || '';
    report += `[${i + 1}] ${authors}. ${title}. ${journal}${year ? ` (${year})` : ''}.\n`;
  }

  report += '\n\nDISCLAIMER\n';
  report += '----------\n';
  report += 'These projections are based on published clinical evidence and institutional ';
  report += 'case volume data. Actual outcomes will vary based on surgeon experience, ';
  report += 'patient population, and institutional factors. This analysis is intended ';
  report += 'to inform strategic planning and should not be considered a guarantee of ';
  report += 'financial results.\n';

  return report;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function _formatCurrency(amount) {
  if (amount >= 1000000) {
    return '$' + (amount / 1000000).toFixed(2) + 'M';
  }
  if (amount >= 1000) {
    return '$' + Math.round(amount).toLocaleString();
  }
  return '$' + Math.round(amount);
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  calculateDollarization,
  calculateSingleSpecialty,
  getConversionImpact,
  generateSummaryReport
};
