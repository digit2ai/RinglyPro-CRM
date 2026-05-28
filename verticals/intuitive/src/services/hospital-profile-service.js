'use strict';

/**
 * Hospital Profile Enrichment Service
 *
 * Produces the 4 additions called out in the deck gap-analysis:
 *   1. Strategic Impact Summary  (Deck p3 — 7 bold metrics)
 *   2. Capital Snapshot          (Deck p2 — current systems + planned placement)
 *   3. AMP Peer Benchmark        (Deck p34 — vs Mayo/Duke/Emory/MUSC/Hopkins)
 *   4. Research Profile          (Deck p20-23 — PubMed affiliation publication count)
 */

const cache = require('./data-sources/_cache');

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const NCBI_API_KEY = process.env.NCBI_API_KEY || '';

// ─── 1. STRATEGIC IMPACT SUMMARY (Deck p3 format) ────────────────────

function buildStrategicImpactSummary(project, analysis = {}, surgeons = [], clinicalOutcomes = []) {
  const util = analysis.utilization_forecast || {};
  const vol = analysis.volume_projection || {};
  const surgCap = analysis.surgeon_capacity || {};
  const matched = analysis.model_matching || {};

  // Incremental cases from surgeon commitments
  const incrementalCases = surgeons.reduce((s, sg) => s + (sg.total_incremental_annual || 0), 0);
  const incrementalRevenue = surgeons.reduce((s, sg) => s + parseFloat(sg.total_revenue_impact || 0), 0);

  // Clinical impact: bed-days saved from clinical outcomes
  const clinicalSavings = clinicalOutcomes.reduce((s, c) => s + parseFloat(c.total_clinical_savings_annual || 0), 0);

  // LOS Days Saved (Conversion) — use the canonical Clinical Overlay (Step 6) procedure-
  // specific calc at the conservative 15% conversion, so this card matches the $17.5M
  // 5-yr cost-avoidance figure flowing through the rest of the deck. Fall back to a
  // simple estimate only if the overlay can't be loaded (e.g., bad project data).
  let losDaysSaved;
  try {
    const overlay = require('./clinical-overlay-service');
    const bdt = overlay.buildBedDaysSavingsTable(project, 15);
    losDaysSaved = bdt?.total_bed_days_saved || Math.round(incrementalCases * 0.60 * 2.5);
  } catch (e) {
    losDaysSaved = Math.round(incrementalCases * 0.60 * 2.5);
  }

  // Additional access (capacity expansion) — pull-forward bucket
  const pullForwardCases = surgeons
    .filter(s => s.commitment_category === 'pull_forward')
    .reduce((s, sg) => s + (sg.total_incremental_annual || 0), 0);
  const incrementalAccessLOS = Math.round(pullForwardCases * 2.5);

  // OR efficiency: 14% time savings per case (DV5 vs Xi published benchmark) applies to
  // EVERY robotic case the new system runs — the hospital's existing robotic volume
  // plus the committed incremental. Per-case avg minutes calibrated to realistic major
  // robotic case mix (prostatectomy, partial nephrectomy, hysterectomy, colectomy, etc.)
  // which run 150-240 min — ~180 min weighted average. The old 60-min/incremental-only
  // formula gave ~2.5K min/yr (under-counts by ~30x).
  const baselineRoboticCases = parseInt(project?.current_robotic_cases || project?.robotic_cases_last_yr || 0);
  const orMinPerCase = 180;
  const efficiencyPct = 0.14;
  const orTimeSavedMin = Math.round((baselineRoboticCases + incrementalCases) * orMinPerCase * efficiencyPct);

  // Instrumentation savings: $1,622,000 was UNC's number for 4 system swaps
  // Scale proportionally: $400K per system swap target estimate
  const systemsRecommended = parseInt(util.systems_needed || matched.primary_recommendation?.quantity || 0);
  const instrumentationSavings = systemsRecommended * 400000;

  // Research engagements (DV5 potential): for academic hospitals, 1 per dV5 placement
  const isAcademic = /academic|teaching|university/i.test(project.hospital_type || '') ||
                     /university|medical center/i.test(project.hospital_name || '');
  const researchEngagements = isAcademic ? systemsRecommended : 0;

  // Resident learning curve: 33% reduction (UNC deck reference, published Intuitive benchmark)
  const learningCurveReduction = isAcademic ? 33 : null;

  const orHours = Math.round(orTimeSavedMin / 60);
  const orDays = Math.round(orHours / 8);
  const losDaysRounded = Math.round(losDaysSaved);
  const metrics = [
    {
      label: 'OR Efficiency Time Savings',
      // Short label so it fits inside the chart bar without clipping; the long form
      // (with minutes + formula) is in `detail`. raw_value still drives the bar length.
      value: orTimeSavedMin > 0 ? `~${orHours.toLocaleString()} hr (~${orDays} OR-days/yr)` : '—',
      raw_value: orTimeSavedMin,
      detail: `DV5 vs Xi 14% per-case efficiency × (${baselineRoboticCases.toLocaleString()} existing robotic + ${incrementalCases.toLocaleString()} incremental committed) cases × ~${orMinPerCase} min/case avg = ${orTimeSavedMin.toLocaleString()} min/yr`,
    },
    {
      label: 'LOS Days Saved (Conversion)',
      value: losDaysRounded > 0 ? `${losDaysRounded.toLocaleString()} bed days` : '—',
      raw_value: losDaysRounded,
      detail: 'Canonical Clinical Overlay (Step 6) figure — 15% of open soft-tissue cases × procedure-specific (open LOS − dV LOS); matches the 5-yr cost-avoidance.',
    },
  ];

  return {
    headline: `${project.hospital_name} Xi to dV5 Annual Clinical, Operational and Financial Impact`,
    metrics,
    methodology: 'Computed from analysis cache + surgeon commitments + clinical outcomes. Benchmarks (14% OR efficiency, 33% learning curve) sourced from Intuitive published DV5 vs Xi data.',
  };
}

// ─── 2. CAPITAL SNAPSHOT (Deck p2 format) ─────────────────────────────

function buildCapitalSnapshot(project, analysis = {}) {
  const util = analysis.utilization_forecast || {};
  const matched = analysis.model_matching || {};

  const currentSystems = parseInt(project.current_system_count || 0);
  const currentModel = project.current_system || 'None';
  const systemsNeeded = parseInt(util.systems_needed || matched.primary_recommendation?.quantity || 0);
  const recommendedModel = matched.primary_recommendation?.system || matched.recommended_model || 'dV5';

  // Phase 1 / Phase 2 split (mirrors two-phase recommendation in executive-brief)
  const phase1 = Math.ceil(systemsNeeded * 0.7);
  const phase2 = Math.max(0, systemsNeeded - phase1);
  const totalAfterPlan = currentSystems + systemsNeeded;

  return {
    headline: `${project.hospital_name} Capital = ${totalAfterPlan} systems after recommended placement`,
    current: {
      systems: currentSystems,
      model: currentModel,
    },
    planned_phase_1: {
      year: new Date().getFullYear() + 1,
      systems: phase1,
      model: recommendedModel,
      note: `${recommendedModel} placement at primary OR rooms`,
    },
    planned_phase_2: phase2 > 0 ? {
      year: new Date().getFullYear() + 2,
      systems: phase2,
      model: recommendedModel,
      note: phase2 > 0
        ? `Slide existing ${currentModel} to satellite + backfill main with ${recommendedModel}`
        : 'Lifecycle refresh',
    } : null,
    total_after_plan: totalAfterPlan,
  };
}

// ─── 3. AMP PEER BENCHMARK (Deck p34 format) ──────────────────────────

// Static peer reference (Intuitive AMP Honor Roll, public data from deck p34)
const AMP_PEER_BENCHMARK = [
  { name: 'Mayo Clinic', systems: 54, teaching_consoles: 41, type: 'academic', state: 'MN' },
  { name: 'Emory Healthcare', systems: 25, teaching_consoles: 17, type: 'academic', state: 'GA' },
  { name: 'MUSC Health', systems: 24, teaching_consoles: 15, type: 'academic', state: 'SC' },
  { name: 'Johns Hopkins', systems: 20, teaching_consoles: 15, type: 'academic', state: 'MD' },
  { name: 'Duke Health', systems: 17, teaching_consoles: 16, type: 'academic', state: 'NC' },
  { name: 'UNC Health', systems: 14, teaching_consoles: 4, type: 'academic', state: 'NC' },
];

function buildPeerBenchmark(project, analysis = {}) {
  const currentSystems = parseInt(project.current_system_count || 0);
  // Estimate teaching consoles: dual-console placements ≈ 30% of fleet at academic centers
  const isAcademic = /academic|teaching|university/i.test(project.hospital_type || '') ||
                     /university|medical center/i.test(project.hospital_name || '');
  const teachingConsoles = isAcademic ? Math.round(currentSystems * 0.3) : 0;

  // Peer average
  const peerAvgSystems = Math.round(AMP_PEER_BENCHMARK.reduce((s, p) => s + p.systems, 0) / AMP_PEER_BENCHMARK.length);
  const peerAvgConsoles = Math.round(AMP_PEER_BENCHMARK.reduce((s, p) => s + p.teaching_consoles, 0) / AMP_PEER_BENCHMARK.length);

  // Rank current hospital
  const allRanked = [
    ...AMP_PEER_BENCHMARK,
    { name: project.hospital_name + ' (you)', systems: currentSystems, teaching_consoles: teachingConsoles, type: project.hospital_type, state: project.state, is_target: true },
  ].sort((a, b) => b.systems - a.systems);

  const targetRank = allRanked.findIndex(p => p.is_target) + 1;
  const gapToPeerAvg = peerAvgSystems - currentSystems;
  const gapToTopPeer = AMP_PEER_BENCHMARK[0].systems - currentSystems;

  return {
    headline: gapToPeerAvg > 0
      ? `You have ${currentSystems} systems vs peer avg ${peerAvgSystems} — ${gapToPeerAvg} system gap`
      : `You have ${currentSystems} systems, at or above peer avg ${peerAvgSystems}`,
    current_systems: currentSystems,
    current_teaching_consoles: teachingConsoles,
    peer_avg_systems: peerAvgSystems,
    peer_avg_teaching_consoles: peerAvgConsoles,
    gap_to_peer_avg: gapToPeerAvg,
    gap_to_top_peer: gapToTopPeer,
    rank: targetRank,
    total_ranked: allRanked.length,
    peers_ranked: allRanked.slice(0, 8),
    is_academic: isAcademic,
  };
}

// ─── 4. RESEARCH PROFILE (Deck p20-23 format, condensed) ──────────────

// Fetch publications by year for the last 5 years (for the trend line chart)
async function fetchPublicationsByYear(hospitalName, opts = {}) {
  if (!hospitalName) return [];
  const cleanName = hospitalName.replace(/[",]/g, '').trim();
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - 4; y <= currentYear; y++) years.push(y);

  const cacheKey = `hospital_research_by_year|${cleanName}|${currentYear}`;
  const cached = await cache.get(opts.models, 'pubmed', cacheKey);
  if (cached) return cached;

  const results = [];
  for (const year of years) {
    const term = `("${cleanName}"[Affiliation]) AND ("${year}/01/01"[PDAT] : "${year}/12/31"[PDAT])`;
    const params = new URLSearchParams({ db: 'pubmed', term, retmode: 'json', retmax: '0' });
    if (NCBI_API_KEY) params.set('api_key', NCBI_API_KEY);
    try {
      const r = await cache.fetchWithRetry(`${EUTILS}/esearch.fcgi?${params.toString()}`, {}, 6000, 1);
      if (r.ok) {
        const j = await r.json();
        results.push({ year, count: Number((j.esearchresult || {}).count) || 0 });
      } else {
        results.push({ year, count: 0 });
      }
    } catch (e) {
      results.push({ year, count: 0 });
    }
    // Small delay to respect NCBI rate limit (3 req/sec without key)
    if (!NCBI_API_KEY) await new Promise(r => setTimeout(r, 350));
  }

  await cache.set(opts.models, 'pubmed', cacheKey, results, 7 * 24 * 60 * 60 * 1000);
  return results;
}

async function fetchHospitalResearchProfile(hospitalName, opts = {}) {
  if (!hospitalName) return { total_publications: 0, skipped: true };

  // Build affiliation query: search papers by institution name in [Affiliation] field
  // Also filter to robotic surgery / da Vinci terms to focus on what matters
  const cleanName = hospitalName.replace(/[",]/g, '').trim();
  const term = `("${cleanName}"[Affiliation]) AND (robotic surgery[tiab] OR "da Vinci"[tiab] OR robotic[tiab])`;
  const cacheKey = `hospital_research|${cleanName}`;

  const cached = await cache.get(opts.models, 'pubmed', cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    db: 'pubmed',
    term,
    retmode: 'json',
    retmax: '10',
    sort: 'date',
  });
  if (NCBI_API_KEY) params.set('api_key', NCBI_API_KEY);

  try {
    const r = await cache.fetchWithRetry(
      `${EUTILS}/esearch.fcgi?${params.toString()}`,
      { headers: { 'Accept': 'application/json' } },
      10000, 1
    );
    if (!r.ok) throw new Error(`PubMed HTTP ${r.status}`);
    const json = await r.json();
    const totalCount = Number((json.esearchresult || {}).count) || 0;
    const recentPmids = (json.esearchresult || {}).idlist || [];

    // Get total all-time (no robotic filter) for context
    const allParams = new URLSearchParams({
      db: 'pubmed',
      term: `"${cleanName}"[Affiliation]`,
      retmode: 'json',
      retmax: '0',
    });
    if (NCBI_API_KEY) allParams.set('api_key', NCBI_API_KEY);
    let allTimeCount = 0;
    try {
      const r2 = await cache.fetchWithRetry(`${EUTILS}/esearch.fcgi?${allParams.toString()}`, {}, 8000, 1);
      if (r2.ok) {
        const j2 = await r2.json();
        allTimeCount = Number((j2.esearchresult || {}).count) || 0;
      }
    } catch (e) {}

    // Get last 12 months count
    const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const dateRange = `${oneYearAgo.getFullYear()}/${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}`;
    const recentParams = new URLSearchParams({
      db: 'pubmed',
      term: `("${cleanName}"[Affiliation]) AND ("${dateRange}"[PDAT] : "3000"[PDAT])`,
      retmode: 'json',
      retmax: '0',
    });
    if (NCBI_API_KEY) recentParams.set('api_key', NCBI_API_KEY);
    let last12moCount = 0;
    try {
      const r3 = await cache.fetchWithRetry(`${EUTILS}/esearch.fcgi?${recentParams.toString()}`, {}, 8000, 1);
      if (r3.ok) {
        const j3 = await r3.json();
        last12moCount = Number((j3.esearchresult || {}).count) || 0;
      }
    } catch (e) {}

    const result = {
      hospital_name: hospitalName,
      robotic_publications: totalCount,
      total_all_publications: allTimeCount,
      last_12_months: last12moCount,
      recent_pmids: recentPmids,
      source_url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`,
      methodology: `PubMed search: "${cleanName}"[Affiliation] AND (robotic OR "da Vinci") — returns peer-reviewed publications authored by institution-affiliated researchers.`,
    };
    await cache.set(opts.models, 'pubmed', cacheKey, result, 7 * 24 * 60 * 60 * 1000);
    return result;
  } catch (e) {
    console.error('[hospital-profile-service] PubMed error:', e.message);
    return {
      hospital_name: hospitalName,
      robotic_publications: 0,
      total_all_publications: 0,
      last_12_months: 0,
      recent_pmids: [],
      error: e.message,
    };
  }
}

// ─── COMPOSITE BUILDER ────────────────────────────────────────────────

async function buildHospitalProfileEnrichment({ projectId, models }) {
  const { IntuitiveProject, IntuitiveAnalysisResult, IntuitiveBusinessPlan, IntuitiveSurgeonCommitment, IntuitiveClinicalOutcome } = models;
  if (!IntuitiveProject) throw new Error('IntuitiveProject model not available');

  const project = await IntuitiveProject.findByPk(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  // Pull cached analysis
  let analysis = {};
  try {
    const rows = await IntuitiveAnalysisResult.findAll({ where: { project_id: projectId } });
    for (const r of rows) {
      const data = typeof r.result_data === 'string' ? JSON.parse(r.result_data) : r.result_data;
      analysis[r.analysis_type] = data;
    }
  } catch (e) {}

  // Pull current plan + commitments
  let surgeons = [];
  let clinicalOutcomes = [];
  try {
    const plan = await IntuitiveBusinessPlan.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']] });
    if (plan) {
      surgeons = await IntuitiveSurgeonCommitment.findAll({ where: { business_plan_id: plan.id } });
      try {
        clinicalOutcomes = await IntuitiveClinicalOutcome.findAll({ where: { business_plan_id: plan.id } });
      } catch (e) {}
    }
  } catch (e) {}

  // Build enrichment blocks
  const strategicImpact = buildStrategicImpactSummary(project, analysis, surgeons, clinicalOutcomes);
  const capitalSnapshot = buildCapitalSnapshot(project, analysis);
  // AMP Peer Benchmark removed per 2026-05-26 review (not defendable in the deck —
  // 12 vs peer-avg 26 / Mayo MN 54 comparison was AMP-positioning, comes out).

  // Research is async (PubMed call) — kick off in parallel
  let researchProfile = { total_publications: 0, skipped: true };
  try {
    researchProfile = await fetchHospitalResearchProfile(project.hospital_name, { models });
    // Also fetch by-year breakdown for trend chart
    researchProfile.by_year = await fetchPublicationsByYear(project.hospital_name, { models });
  } catch (e) {
    console.error('[hospital-profile] research fetch failed:', e.message);
  }

  return {
    project_id: projectId,
    hospital_name: project.hospital_name,
    strategic_impact: strategicImpact,
    capital_snapshot: capitalSnapshot,
    research_profile: researchProfile,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildHospitalProfileEnrichment,
  buildStrategicImpactSummary,
  buildCapitalSnapshot,
  buildPeerBenchmark,
  fetchHospitalResearchProfile,
  fetchPublicationsByYear,
  AMP_PEER_BENCHMARK,
};
