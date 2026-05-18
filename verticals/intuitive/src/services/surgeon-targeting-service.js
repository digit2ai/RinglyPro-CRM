'use strict';

/**
 * Surgeon Targeting Service — pure functions used by both the HTTP route
 * (routes/surgeon-targeting.js) and the chat tool layer (routes/chat.js).
 *
 * Keep this file free of Express. It accepts `models` directly so it can be
 * called from anywhere with a database handle.
 */

const npiRegistry = require('./data-sources/npi-registry');
const mpup = require('./data-sources/cms-physician-volume');
const openPayments = require('./data-sources/cms-open-payments');
const pubmed = require('./data-sources/pubmed');
const clinicalTrials = require('./data-sources/clinical-trials');
const identityResolution = require('./identity-resolution');

const SPECIALTY_FILTERS = {
  urology:    'Urology',
  gynecology: 'Obstetrics',
  general:    'Surgery',
  thoracic:   'Thoracic',
  colorectal: 'Colon',
  head_neck:  'Otolaryngology',
  all:        null,
};

function targetScore({ robotic_cases, intuitive_dollars_2yr, last_payment_date }) {
  const vol = Number(robotic_cases) || 0;
  const dollars = Number(intuitive_dollars_2yr) || 0;
  const lpd = last_payment_date ? new Date(last_payment_date) : null;
  const daysSince = lpd ? (Date.now() - lpd.getTime()) / (1000 * 60 * 60 * 24) : Infinity;
  const volPts = Math.min(50, Math.round((vol / 200) * 50));
  const dollarPts = Math.min(35, Math.round((dollars / 25000) * 35));
  const recencyPts = daysSince < 180 ? 15 : daysSince < 365 ? 10 : daysSince < 730 ? 5 : 0;
  return Math.min(100, volPts + dollarPts + recencyPts);
}

function kolScore({ publications_5yr, active_trials, intuitive_trials }) {
  const pubs = Number(publications_5yr) || 0;
  const trials = Number(active_trials) || 0;
  const intvTrials = Number(intuitive_trials) || 0;
  const pubPts = Math.min(50, Math.round((pubs / 25) * 50));
  const trialPts = Math.min(35, trials * 18);
  const intvPts = intvTrials > 0 ? 15 : 0;
  return Math.min(100, pubPts + trialPts + intvPts);
}

function tier(score) {
  if (score >= 75) return { label: 'A — Convert Now', color: '#10b981' };
  if (score >= 50) return { label: 'B — Develop', color: '#0ea5e9' };
  if (score >= 25) return { label: 'C — Nurture', color: '#eab308' };
  return { label: 'D — Cold', color: '#64748b' };
}

function kolBadge(score) {
  if (score >= 70) return { label: 'Key Opinion Leader', color: '#a855f7' };
  if (score >= 40) return { label: 'Research-Active', color: '#8b5cf6' };
  if (score >= 15) return { label: 'Publishing', color: '#6366f1' };
  return null;
}

async function fetchAffiliationsByNpi(models, npis) {
  if (!models || !models.IntuitiveProviderAffiliation || !npis.length) return {};
  try {
    const rows = await models.IntuitiveProviderAffiliation.findAll({ where: { npi: npis }, raw: true });
    const byNpi = {};
    for (const r of rows) byNpi[r.npi] = r;
    return byNpi;
  } catch (e) {
    return {};
  }
}

// ---------------------------------------------------------------------------
// searchByTerritory — main territory query
// ---------------------------------------------------------------------------
async function searchByTerritory({ state, zips, specialty = 'all', limit = 100, enrich = false, enrich_top = 25 }, ctx) {
  const t0 = Date.now();
  if (!state || typeof state !== 'string' || state.length !== 2) {
    throw new Error('state (2-letter code) is required');
  }
  const zipList = Array.isArray(zips) ? zips.filter(z => /^\d{5}$/.test(String(z))) : [];
  const specKey = SPECIALTY_FILTERS[specialty] !== undefined ? specialty : 'all';
  const models = ctx.models;

  // 1) NPI roster
  const rosterSeen = new Set();
  const roster = [];
  const queryZips = zipList.length ? zipList : [null];
  for (const zip of queryZips.slice(0, 12)) {
    const r = await npiRegistry.fetchFor('Territory Query', state.toUpperCase(), {
      zip: zip || undefined,
      models,
    });
    const surgeons = (r.data && r.data.surgeons) || [];
    for (const s of surgeons) {
      if (rosterSeen.has(s.npi)) continue;
      if (specKey !== 'all' && s.specialty_key !== specKey) continue;
      rosterSeen.add(s.npi);
      roster.push(s);
    }
  }

  if (roster.length === 0) {
    return {
      targets: [], total: 0, elapsed_ms: Date.now() - t0,
      territory: { state: state.toUpperCase(), zips: zipList, specialty: specKey },
      message: 'No surgeons found in NPPES for this territory + specialty.',
    };
  }

  const npis = roster.map(s => s.npi);
  const [mpupResult, opResult, affiliations] = await Promise.all([
    mpup.fetchFor(npis, { models }),
    openPayments.fetchFor(npis, { models }),
    fetchAffiliationsByNpi(models, npis),
  ]);

  const volumeByNpi = {};
  for (const v of ((mpupResult.data && mpupResult.data.surgeon_volumes) || [])) volumeByNpi[v.npi] = v;
  const paymentsByNpi = {};
  for (const p of ((opResult.data && opResult.data.surgeon_payments) || [])) paymentsByNpi[p.npi] = p;

  const targets = roster.map(s => {
    const vol = volumeByNpi[s.npi] || {};
    const pay = paymentsByNpi[s.npi] || {};
    const aff = affiliations[s.npi] || {};
    const score = targetScore({
      robotic_cases: vol.total_robotic_cases_last_yr || 0,
      intuitive_dollars_2yr: pay.total_payments_2yr || 0,
      last_payment_date: pay.last_payment_date,
    });
    const t = tier(score);
    return {
      npi: s.npi,
      full_name: s.full_name,
      credential: s.credential,
      specialty: s.specialty_label,
      specialty_key: s.specialty_key,
      practice_address: s.practice_address,
      hospital_name: aff.hospital_name || null,
      hospital_ccn: aff.hospital_ccn || null,
      all_hospital_affiliations: aff.all_hospital_affiliations || [],
      group_legal_name: aff.group_legal_name || null,
      medical_school: aff.medical_school || null,
      graduation_year: aff.graduation_year || null,
      affiliation_confirmed: !!aff.npi,
      robotic_cases_last_yr: vol.total_robotic_cases_last_yr || 0,
      procedure_breakdown: vol.procedure_breakdown || {},
      volume_year: vol.fiscal_year || null,
      intuitive_dollars_2yr: pay.total_payments_2yr || 0,
      last_intuitive_payment: pay.last_payment_date || null,
      payment_categories: pay.payment_categories || [],
      champion_score: pay.champion_score || 0,
      target_score: score,
      tier: t.label,
      tier_color: t.color,
    };
  });

  targets.sort((a, b) => b.target_score - a.target_score);

  let enrichmentTime = 0;
  let ambiguousNames = 0;
  if (enrich) {
    const eStart = Date.now();
    const topN = targets.slice(0, Math.min(Number(enrich_top) || 25, 50));
    try {
      const [pubMap, trialMap] = await Promise.all([
        pubmed.fetchBulk(topN.map(t => ({ npi: t.npi, full_name: t.full_name })), { models }),
        clinicalTrials.fetchBulk(topN.map(t => ({ npi: t.npi, full_name: t.full_name })), { models }),
      ]);
      for (const t of topN) {
        const p = pubMap[t.npi] || { count: 0 };
        const c = trialMap[t.npi] || { active_count: 0 };
        const idGate = identityResolution.gateExternalCount({
          full_name: t.full_name,
          specialty_key: t.specialty_key,
          license_state: (t.practice_address || '').match(/, ([A-Z]{2}) \d/)?.[1] || null,
        }, null);
        if (!idGate.trust) ambiguousNames++;
        t.identity_confidence = idGate.confidence;
        t.identity_ambiguous = !idGate.trust;
        const dampen = t.identity_ambiguous ? Math.max(0.1, idGate.confidence) : 1;
        t.publications_5yr = Math.round((p.count || 0) * dampen);
        t.publications_5yr_raw = p.count || 0;
        t.recent_pmids = (p.recent_pmids || []).slice(0, 3);
        t.pubmed_url = p.source_url || null;
        t.active_trials = Math.round((c.active_count || 0) * dampen);
        t.active_trials_raw = c.active_count || 0;
        t.industry_trials = c.industry_sponsored || 0;
        t.intuitive_trials = c.intuitive_sponsored || 0;
        t.trial_titles = (c.trials || []).slice(0, 3).map(tr => tr.title);
        t.clinicaltrials_url = c.source_url || null;
        const ks = kolScore({ publications_5yr: t.publications_5yr, active_trials: t.active_trials, intuitive_trials: t.intuitive_trials });
        t.kol_score = ks;
        const kb = kolBadge(ks);
        t.kol_badge = kb ? kb.label : null;
        t.kol_badge_color = kb ? kb.color : null;
        t.composite_score = Math.round(t.target_score * 0.7 + t.kol_score * 0.3);
      }
      for (const t of targets.slice(topN.length)) {
        t.publications_5yr = null;
        t.active_trials = null;
        t.kol_score = null;
        t.kol_badge = null;
        t.composite_score = t.target_score;
      }
    } catch (e) {
      console.error('[surgeon-targeting-service] enrichment error:', e.message);
    }
    enrichmentTime = Date.now() - eStart;
  }

  const sources = [
    { name: 'NPI Registry (NPPES)', url: 'https://npiregistry.cms.hhs.gov' },
    { name: 'CMS MPUP', url: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners' },
    { name: 'CMS Open Payments', url: 'https://openpaymentsdata.cms.gov' },
    { name: 'CMS Care Compare', url: 'https://data.cms.gov/provider-data/dataset/mj5m-pzi6' },
  ];
  if (enrich) {
    sources.push({ name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov' });
    sources.push({ name: 'ClinicalTrials.gov', url: 'https://clinicaltrials.gov' });
  }

  const affiliationCoverage = targets.length > 0
    ? Math.round(100 * targets.filter(t => t.affiliation_confirmed).length / targets.length)
    : 0;

  return {
    targets: targets.slice(0, Math.min(Number(limit) || 100, 500)),
    total: targets.length,
    territory: { state: state.toUpperCase(), zips: zipList, specialty: specKey },
    elapsed_ms: Date.now() - t0,
    enrichment_ms: enrichmentTime || undefined,
    enriched_count: enrich ? Math.min(Number(enrich_top) || 25, targets.length) : 0,
    data_sources: sources,
    summary: {
      tier_a: targets.filter(t => t.target_score >= 75).length,
      tier_b: targets.filter(t => t.target_score >= 50 && t.target_score < 75).length,
      tier_c: targets.filter(t => t.target_score >= 25 && t.target_score < 50).length,
      tier_d: targets.filter(t => t.target_score < 25).length,
      total_intuitive_dollars_2yr: targets.reduce((s, t) => s + (t.intuitive_dollars_2yr || 0), 0),
      total_robotic_cases: targets.reduce((s, t) => s + (t.robotic_cases_last_yr || 0), 0),
      kol_count: enrich ? targets.filter(t => (t.kol_score || 0) >= 40).length : 0,
      total_publications_5yr: enrich ? targets.reduce((s, t) => s + (t.publications_5yr || 0), 0) : 0,
      total_active_trials: enrich ? targets.reduce((s, t) => s + (t.active_trials || 0), 0) : 0,
      ambiguous_names: ambiguousNames,
      affiliation_coverage_pct: affiliationCoverage,
      unique_hospitals: new Set(targets.filter(t => t.hospital_name).map(t => t.hospital_name)).size,
    },
  };
}

// ---------------------------------------------------------------------------
// searchByHospital — every surgeon at a given hospital, ranked
// ---------------------------------------------------------------------------
async function searchByHospital({ hospital_ccn, hospital_name, specialty = 'all' }, ctx) {
  const t0 = Date.now();
  const models = ctx.models;
  if (!hospital_ccn && !hospital_name) {
    throw new Error('hospital_ccn or hospital_name required');
  }
  if (!models || !models.IntuitiveProviderAffiliation) {
    throw new Error('Care Compare data not ingested yet. Run scripts/ingest-care-compare.js');
  }

  const { Op } = require('sequelize');
  const where = hospital_ccn
    ? { hospital_ccn: String(hospital_ccn) }
    : { hospital_name: { [Op.iLike]: `%${hospital_name}%` } };

  const affRows = await models.IntuitiveProviderAffiliation.findAll({ where, raw: true });
  if (affRows.length === 0) {
    return { targets: [], total: 0, elapsed_ms: Date.now() - t0, message: 'No surgeons found at this hospital.' };
  }

  const npis = affRows.map(a => a.npi);
  const [mpupResult, opResult] = await Promise.all([
    mpup.fetchFor(npis, { models }),
    openPayments.fetchFor(npis, { models }),
  ]);
  const volByNpi = {};
  for (const v of ((mpupResult.data && mpupResult.data.surgeon_volumes) || [])) volByNpi[v.npi] = v;
  const payByNpi = {};
  for (const p of ((opResult.data && opResult.data.surgeon_payments) || [])) payByNpi[p.npi] = p;

  const specFilter = (specialty || 'all').toLowerCase();
  const filtered = specFilter === 'all'
    ? affRows
    : affRows.filter(a => (a.primary_specialty || '').toLowerCase().includes(specFilter));

  const targets = filtered.map(a => {
    const vol = volByNpi[a.npi] || {};
    const pay = payByNpi[a.npi] || {};
    const score = targetScore({
      robotic_cases: vol.total_robotic_cases_last_yr || 0,
      intuitive_dollars_2yr: pay.total_payments_2yr || 0,
      last_payment_date: pay.last_payment_date,
    });
    const t = tier(score);
    return {
      npi: a.npi,
      full_name: a.full_name,
      credential: a.credential,
      specialty: a.primary_specialty,
      hospital_name: a.hospital_name,
      hospital_ccn: a.hospital_ccn,
      group_legal_name: a.group_legal_name,
      medical_school: a.medical_school,
      graduation_year: a.graduation_year,
      robotic_cases_last_yr: vol.total_robotic_cases_last_yr || 0,
      volume_year: vol.fiscal_year || null,
      intuitive_dollars_2yr: pay.total_payments_2yr || 0,
      last_intuitive_payment: pay.last_payment_date || null,
      champion_score: pay.champion_score || 0,
      target_score: score,
      tier: t.label,
      tier_color: t.color,
    };
  });

  targets.sort((a, b) => b.target_score - a.target_score);

  return {
    targets,
    total: targets.length,
    hospital: { ccn: affRows[0].hospital_ccn, name: affRows[0].hospital_name, state: affRows[0].hospital_state },
    elapsed_ms: Date.now() - t0,
    data_sources: [
      { name: 'CMS Care Compare', url: 'https://data.cms.gov/provider-data/dataset/mj5m-pzi6' },
      { name: 'CMS MPUP', url: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners' },
      { name: 'CMS Open Payments', url: 'https://openpaymentsdata.cms.gov' },
    ],
    summary: {
      tier_a: targets.filter(t => t.target_score >= 75).length,
      tier_b: targets.filter(t => t.target_score >= 50 && t.target_score < 75).length,
      total_robotic_cases: targets.reduce((s, t) => s + (t.robotic_cases_last_yr || 0), 0),
      total_intuitive_dollars_2yr: targets.reduce((s, t) => s + (t.intuitive_dollars_2yr || 0), 0),
    },
  };
}

// ---------------------------------------------------------------------------
// generateBriefing — multi-source pre-meeting intel sheet for a hospital
// The demo-killer feature. Chains: hospital lookup → surgeons → KOL enrich
//   → financials → talking points.
// ---------------------------------------------------------------------------
async function generateBriefing({ hospital_name, hospital_ccn, state }, ctx) {
  const t0 = Date.now();
  const models = ctx.models;
  if (!hospital_name && !hospital_ccn) {
    throw new Error('hospital_name or hospital_ccn required');
  }

  const { Op } = require('sequelize');

  // 1) Resolve the hospital. Prefer Care Compare; fall back to existing project record.
  let hospital = null;
  let project = null;

  if (models?.IntuitiveProviderAffiliation) {
    const where = hospital_ccn
      ? { hospital_ccn: String(hospital_ccn) }
      : { hospital_name: { [Op.iLike]: `%${hospital_name}%` } };
    const sample = await models.IntuitiveProviderAffiliation.findOne({ where, raw: true });
    if (sample) {
      hospital = {
        ccn: sample.hospital_ccn,
        name: sample.hospital_name,
        state: sample.hospital_state,
        source: 'CMS Care Compare',
      };
    }
  }

  if (models?.IntuitiveProject) {
    const projWhere = hospital_name
      ? { hospital_name: { [Op.iLike]: `%${hospital_name}%` } }
      : null;
    if (projWhere) {
      project = await models.IntuitiveProject.findOne({ where: projWhere, raw: true });
      if (project && !hospital) {
        hospital = {
          ccn: null,
          name: project.hospital_name,
          state: project.state,
          source: 'SurgicalMind project',
        };
      }
    }
  }

  if (!hospital) {
    return {
      error: 'Hospital not found in Care Compare or project pipeline.',
      hint: 'Try the full legal name (e.g. "Baptist Hospital of Miami" not just "Baptist"), or specify a state.',
    };
  }

  // 2) All surgeons at the hospital, ranked
  let surgeons = [];
  let surgeonSummary = null;
  try {
    if (hospital.ccn) {
      const byHosp = await searchByHospital({ hospital_ccn: hospital.ccn }, { models });
      surgeons = byHosp.targets || [];
      surgeonSummary = byHosp.summary;
    } else if (hospital.state) {
      // Fall back to state-level territory search if no CCN
      const byTerr = await searchByTerritory({ state: hospital.state, limit: 50 }, { models });
      surgeons = byTerr.targets || [];
      surgeonSummary = byTerr.summary;
    }
  } catch (e) {
    console.error('[briefing] surgeon lookup error:', e.message);
  }

  // 3) Top 5 surgeons get KOL enrichment
  const top5 = surgeons.slice(0, 5);
  const enrichedTop5 = [];
  if (top5.length > 0) {
    const pubmed = require('./data-sources/pubmed');
    const clinicalTrials = require('./data-sources/clinical-trials');
    const identityRes = require('./identity-resolution');

    try {
      const [pubMap, trialMap] = await Promise.all([
        pubmed.fetchBulk(top5.map(s => ({ npi: s.npi, full_name: s.full_name })), { models }),
        clinicalTrials.fetchBulk(top5.map(s => ({ npi: s.npi, full_name: s.full_name })), { models }),
      ]);
      for (const s of top5) {
        const pub = pubMap[s.npi] || { count: 0 };
        const trials = trialMap[s.npi] || { active_count: 0 };
        const idGate = identityRes.gateExternalCount({
          full_name: s.full_name,
          specialty_key: s.specialty_key,
          license_state: hospital.state,
        });
        const dampen = idGate.confidence;
        const pubsAdj = Math.round((pub.count || 0) * dampen);
        const trialsAdj = Math.round((trials.active_count || 0) * dampen);
        const ks = kolScore({
          publications_5yr: pubsAdj,
          active_trials: trialsAdj,
          intuitive_trials: trials.intuitive_sponsored || 0,
        });
        const kb = kolBadge(ks);
        enrichedTop5.push({
          ...s,
          publications_5yr: pubsAdj,
          active_trials: trialsAdj,
          intuitive_trials: trials.intuitive_sponsored || 0,
          kol_score: ks,
          kol_badge: kb ? kb.label : null,
          identity_confidence: idGate.confidence,
          recent_pmid_links: (pub.recent_pmids || []).slice(0, 2).map(p => `https://pubmed.ncbi.nlm.nih.gov/${p}/`),
        });
      }
    } catch (e) {
      console.error('[briefing] KOL enrichment error:', e.message);
    }
  }

  // 4) Aggregate Intuitive relationship strength across this hospital's surgeons
  const totalIntuitive = surgeons.reduce((s, x) => s + (x.intuitive_dollars_2yr || 0), 0);
  const totalRoboticCases = surgeons.reduce((s, x) => s + (x.robotic_cases_last_yr || 0), 0);
  const championCount = surgeons.filter(s => s.target_score >= 75).length;
  const developCount = surgeons.filter(s => s.target_score >= 50 && s.target_score < 75).length;
  const surgeonsWithRecentPay = surgeons.filter(s => {
    if (!s.last_intuitive_payment) return false;
    return (Date.now() - new Date(s.last_intuitive_payment).getTime()) < 365 * 86400000;
  }).length;

  // 5) Build talking points the LLM can lean on
  const talkingPoints = [];
  if (totalIntuitive > 50000) {
    talkingPoints.push(`Strong existing Intuitive relationship — $${Math.round(totalIntuitive / 1000)}K paid to ${surgeons.filter(s => s.intuitive_dollars_2yr > 0).length} surgeons across the hospital in the last 2 years (CMS Open Payments).`);
  } else if (totalIntuitive > 5000) {
    talkingPoints.push(`Moderate Intuitive footprint — $${Math.round(totalIntuitive / 1000)}K paid to staff. Room to deepen.`);
  } else {
    talkingPoints.push(`Limited prior Intuitive engagement at this hospital — opportunity to seed.`);
  }
  if (championCount > 0) {
    talkingPoints.push(`${championCount} Tier-A target${championCount === 1 ? '' : 's'} identified — convert priority.`);
  }
  if (developCount > 0) {
    talkingPoints.push(`${developCount} Tier-B surgeon${developCount === 1 ? '' : 's'} — develop track (training, peer-to-peer connections).`);
  }
  const kols = enrichedTop5.filter(s => s.kol_score >= 40);
  if (kols.length > 0) {
    talkingPoints.push(`${kols.length} research-active surgeon${kols.length === 1 ? '' : 's'} in the top 5 (publications + clinical-trial PI roles).`);
  }
  if (totalRoboticCases > 1000) {
    talkingPoints.push(`High robotic case volume — ${totalRoboticCases.toLocaleString()} Medicare robotic cases last year across the hospital's surgeons (CMS MPUP).`);
  }

  // 6) Existing project context (if we have it)
  let projectContext = null;
  if (project) {
    projectContext = {
      project_id: project.id,
      project_code: project.project_code,
      status: project.status,
      hospital_type: project.hospital_type,
      bed_count: project.bed_count,
      current_system: project.current_system,
      current_system_count: project.current_system_count,
      annual_surgical_volume: project.annual_surgical_volume,
      deep_link: `/intuitive/report/${project.id}`,
    };
    if (project.current_system && project.current_system !== 'none') {
      talkingPoints.unshift(`Already operating ${project.current_system_count || 1}× ${project.current_system} — upgrade conversation, not greenfield.`);
    } else {
      talkingPoints.unshift(`No current da Vinci system on record — greenfield opportunity.`);
    }
  } else {
    talkingPoints.unshift(`No active SurgicalMind project for this hospital — consider creating one to seed the workflow.`);
  }

  return {
    hospital,
    project: projectContext,
    surgeon_summary: {
      total_surgeons: surgeons.length,
      tier_a_count: championCount,
      tier_b_count: developCount,
      total_intuitive_dollars_2yr: totalIntuitive,
      total_robotic_cases: totalRoboticCases,
      surgeons_paid_last_year: surgeonsWithRecentPay,
    },
    top_5: enrichedTop5,
    talking_points: talkingPoints,
    suggested_actions: [
      project
        ? { action: 'open_report', label: `Open ${project.hospital_name} report`, deep_link: `/intuitive/report/${project.id}` }
        : { action: 'create_project', label: 'Create SurgicalMind project for this hospital', deep_link: '/intuitive/intake' },
      enrichedTop5.length > 0
        ? { action: 'send_survey', label: `Send surgeon survey to top ${enrichedTop5.length}`, tool: 'send_surgeon_survey' }
        : null,
      enrichedTop5.length > 0
        ? { action: 'draft_outreach', label: `Draft outreach to ${enrichedTop5[0].full_name}`, tool: 'draft_outreach' }
        : null,
    ].filter(Boolean),
    citations: [
      { source_name: 'CMS Care Compare', source_url: 'https://data.cms.gov/provider-data/dataset/mj5m-pzi6' },
      { source_name: 'CMS MPUP', source_url: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners' },
      { source_name: 'CMS Open Payments', source_url: 'https://openpaymentsdata.cms.gov' },
      { source_name: 'PubMed', source_url: 'https://pubmed.ncbi.nlm.nih.gov' },
      { source_name: 'ClinicalTrials.gov', source_url: 'https://clinicaltrials.gov' },
    ],
    elapsed_ms: Date.now() - t0,
  };
}

module.exports = {
  searchByTerritory,
  searchByHospital,
  generateBriefing,
  targetScore,
  kolScore,
  tier,
  kolBadge,
  fetchAffiliationsByNpi,
};
