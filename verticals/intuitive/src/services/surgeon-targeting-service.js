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

// ---------------------------------------------------------------------------
// resolveHospitalByName — multi-strategy fuzzy lookup against IntuitiveHospital
//
// Real-world queries don't always match CMS official names:
//   "Mayo Clinic Florida" (user) vs. "MAYO CLINIC" (CMS) in Jacksonville, FL
//   "Orlando Regional Medical Center" (user) vs. "ORLANDO HEALTH" in Orlando, FL
//   "AdventHealth Orlando" (user) vs. "ADVENTHEALTH ORLANDO" (CMS)  — direct hit
//
// Strategy (in order):
//   1. Literal ILIKE — exact substring on facility_name
//   2. Strip state words ("florida", "ny", "tx" etc.) — retry literal
//   3. Token AND match — every non-trivial token from query must appear in facility_name
//   4. Match against (facility_name OR city OR state) — for queries like "Mayo Florida"
//
// Returns the best-scored candidate. Scoring prefers shorter name (closer length to query),
// startsWith match, and 50-state hospitals over US territories.
// ---------------------------------------------------------------------------
const STATE_WORDS = new Set([
  'florida','fl','california','ca','texas','tx','new york','ny','illinois','il',
  'pennsylvania','pa','ohio','oh','georgia','ga','north carolina','nc','michigan','mi',
  'new jersey','nj','virginia','va','washington','wa','arizona','az','massachusetts','ma',
  'tennessee','tn','indiana','in','missouri','mo','maryland','md','wisconsin','wi',
  'colorado','co','minnesota','mn','south carolina','sc','alabama','al','louisiana','la',
  'kentucky','ky','oregon','or','oklahoma','ok','connecticut','ct','utah','ut','iowa','ia',
  'nevada','nv','arkansas','ar','mississippi','ms','kansas','ks','new mexico','nm',
  'nebraska','ne','west virginia','wv','idaho','id','hawaii','hi','new hampshire','nh',
  'maine','me','montana','mt','rhode island','ri','delaware','de','south dakota','sd',
  'north dakota','nd','alaska','ak','vermont','vt','wyoming','wy','dc','district of columbia',
]);
const TERRITORIES = new Set(['PR', 'GU', 'VI', 'MP', 'AS']);

function scoreHospitalCandidate(candidate, query) {
  const name = (candidate.facility_name || '').toUpperCase();
  const q = (query || '').toUpperCase();
  const lenDiff = Math.abs(name.length - q.length);
  const startsWithBonus = name.startsWith(q) ? 100 : 0;
  const territoryPenalty = TERRITORIES.has(candidate.state) ? 1000 : 0;
  return lenDiff + territoryPenalty - startsWithBonus;
}

// Branded-name aliases for hospitals whose marketing name differs from their CMS official name.
// Expanded over time as the demo encounters new edge cases. CCN keys are the CMS Facility ID.
const HOSPITAL_ALIASES = {
  'ormc':                                  '100006', // Orlando Regional Medical Center → ORLANDO HEALTH
  'orlando regional medical center':       '100006',
  'orlando regional':                      '100006',
  'mayo clinic jacksonville':              '100151',
  'mayo jacksonville':                     '100151',
  'mayo clinic florida':                   '100151',
  'tampa general':                         '100128',
  'tgh':                                   '100128',
  'memorial regional':                     '100143', // Memorial Regional Hollywood FL
  'cleveland clinic florida':              '100087',
  // Moffitt CCN omitted — verify before adding (different facilities under similar names)
};

async function resolveHospitalByName(models, hospitalName) {
  if (!hospitalName) return null;
  const { Op } = require('sequelize');
  const original = hospitalName.trim();

  // 0) Alias shortcut — branded names that don't match CMS legal names
  const aliasKey = original.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  if (HOSPITAL_ALIASES[aliasKey]) {
    const row = await models.IntuitiveHospital.findOne({
      where: { ccn: HOSPITAL_ALIASES[aliasKey] }, raw: true,
    });
    if (row) return row;
  }

  // Build progressive query variants, longest match first
  const variants = [original];
  // Strip state words
  const stripped = original.split(/\s+/)
    .filter(w => !STATE_WORDS.has(w.toLowerCase().replace(/[,.]/g, '')))
    .join(' ').trim();
  if (stripped && stripped !== original) variants.push(stripped);

  // Try each variant as a single ILIKE substring
  for (const v of variants) {
    if (!v) continue;
    const candidates = await models.IntuitiveHospital.findAll({
      where: { facility_name: { [Op.iLike]: `%${v}%` } },
      raw: true, limit: 25,
    });
    if (candidates.length) {
      // Prefer the candidate that EXACTLY equals the variant (ignoring case)
      const exact = candidates.find(c => (c.facility_name || '').toUpperCase() === v.toUpperCase());
      if (exact) return exact;
      // Otherwise score
      const scored = candidates.map(c => ({ ...c, _score: scoreHospitalCandidate(c, v) }))
        .sort((a, b) => a._score - b._score);
      return scored[0];
    }
  }

  // Token AND match: every non-trivial query token must appear in facility_name
  const tokens = stripped.split(/\s+/).filter(t => t.length > 2);
  if (tokens.length >= 2) {
    const andWhere = {
      [Op.and]: tokens.map(t => ({ facility_name: { [Op.iLike]: `%${t}%` } })),
    };
    const candidates = await models.IntuitiveHospital.findAll({ where: andWhere, raw: true, limit: 25 });
    if (candidates.length) {
      const scored = candidates.map(c => ({ ...c, _score: scoreHospitalCandidate(c, stripped) }))
        .sort((a, b) => a._score - b._score);
      return scored[0];
    }
  }

  // Final fallback: match query tokens against facility_name + city — e.g. "Mayo Florida" picks
  // hospitals whose name contains "Mayo" AND city/state matches "Florida"/"FL"
  if (tokens.length >= 2) {
    // Detect state hint (one of the stripped state words from original query)
    const stateHint = original.split(/\s+/)
      .map(w => w.toLowerCase().replace(/[,.]/g, ''))
      .find(w => STATE_WORDS.has(w));
    const nameTokens = tokens.filter(t => !STATE_WORDS.has(t.toLowerCase()));
    if (nameTokens.length && stateHint) {
      // Convert state name → 2-letter code (best-effort)
      const stateMap = { florida:'FL', california:'CA', texas:'TX', 'new york':'NY', illinois:'IL', georgia:'GA', ohio:'OH', arizona:'AZ', minnesota:'MN' };
      const stateCode = stateMap[stateHint] || (stateHint.length === 2 ? stateHint.toUpperCase() : null);
      if (stateCode) {
        const where = {
          state: stateCode,
          [Op.and]: nameTokens.map(t => ({ facility_name: { [Op.iLike]: `%${t}%` } })),
        };
        const candidates = await models.IntuitiveHospital.findAll({ where, raw: true, limit: 25 });
        if (candidates.length) {
          const scored = candidates.map(c => ({ ...c, _score: scoreHospitalCandidate(c, nameTokens.join(' ')) }))
            .sort((a, b) => a._score - b._score);
          return scored[0];
        }
      }
    }
  }

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
  // Prefer the NEW tables (IntuitiveHospital + IntuitiveSurgeonHospitalAffiliation)
  // which are populated in prod. Fall back to the old IntuitiveProviderAffiliation
  // (Care Compare DAC group-practice approximation) if the new tables are empty.
  const useNewSchema = models && models.IntuitiveHospital && models.IntuitiveSurgeonHospitalAffiliation;

  const { Op } = require('sequelize');
  let resolvedHospital = null;
  let npis = [];

  if (useNewSchema) {
    // Resolve hospital via the master table — multi-strategy fuzzy match
    let hospitalRow = null;
    if (hospital_ccn) {
      hospitalRow = await models.IntuitiveHospital.findOne({ where: { ccn: String(hospital_ccn) }, raw: true });
    } else if (hospital_name) {
      hospitalRow = await resolveHospitalByName(models, hospital_name);
    }
    if (hospitalRow) {
      resolvedHospital = {
        ccn: hospitalRow.ccn,
        name: hospitalRow.facility_name,
        state: hospitalRow.state,
        city: hospitalRow.city,
      };
      const links = await models.IntuitiveSurgeonHospitalAffiliation.findAll({
        where: { facility_ccn: hospitalRow.ccn, facility_type: 'Hospital' },
        attributes: ['npi', 'surgeon_first_name', 'surgeon_last_name'],
        raw: true,
      });
      var nameByNpi = {};
      for (const l of links) {
        if (l.npi) {
          npis.push(l.npi);
          const fn = (l.surgeon_first_name || '').trim();
          const ln = (l.surgeon_last_name || '').trim();
          if (ln && !nameByNpi[l.npi]) nameByNpi[l.npi] = `${fn} ${ln}`.trim();
        }
      }
    }
  }

  // Fallback: legacy Care Compare DAC table (group practice approximation)
  let legacyRows = [];
  if (!resolvedHospital && models && models.IntuitiveProviderAffiliation) {
    const where = hospital_ccn
      ? { hospital_ccn: String(hospital_ccn) }
      : { hospital_name: { [Op.iLike]: `%${hospital_name}%` } };
    legacyRows = await models.IntuitiveProviderAffiliation.findAll({ where, raw: true });
    if (legacyRows.length > 0) {
      resolvedHospital = {
        ccn: legacyRows[0].hospital_ccn,
        name: legacyRows[0].hospital_name,
        state: legacyRows[0].hospital_state,
      };
      npis = legacyRows.map(a => a.npi);
    }
  }

  if (!resolvedHospital || npis.length === 0) {
    return {
      targets: [], total: 0, elapsed_ms: Date.now() - t0,
      message: 'No surgeons found at this hospital.',
      hint: useNewSchema ? 'Try a more specific or shorter hospital name (e.g. "Mayo Clinic Florida" or "AdventHealth Orlando").' : 'Ingest CMS Care Compare data first.',
    };
  }

  // Pull MPUP volume + Open Payments for the resolved NPIs
  const uniqueNpis = Array.from(new Set(npis));
  const [mpupResult, opResult] = await Promise.all([
    mpup.fetchFor(uniqueNpis, { models }),
    openPayments.fetchFor(uniqueNpis, { models }),
  ]);
  const volByNpi = {};
  for (const v of ((mpupResult.data && mpupResult.data.surgeon_volumes) || [])) volByNpi[v.npi] = v;
  const payByNpi = {};
  for (const p of ((opResult.data && opResult.data.surgeon_payments) || [])) payByNpi[p.npi] = p;

  const targets = uniqueNpis.map(npi => {
    const vol = volByNpi[npi] || {};
    const pay = payByNpi[npi] || {};
    const score = targetScore({
      robotic_cases: vol.total_robotic_cases_last_yr || 0,
      intuitive_dollars_2yr: pay.total_payments_2yr || 0,
      last_payment_date: pay.last_payment_date,
    });
    const t = tier(score);
    const legacyRow = legacyRows.find(r => r.npi === npi);
    return {
      npi,
      full_name: (typeof nameByNpi !== 'undefined' ? nameByNpi[npi] : null) || legacyRow?.full_name || null,
      credential: legacyRow?.credential || null,
      specialty: legacyRow?.primary_specialty || null,
      hospital_name: resolvedHospital.name,
      hospital_ccn: resolvedHospital.ccn,
      group_legal_name: legacyRow?.group_legal_name || null,
      medical_school: legacyRow?.medical_school || null,
      graduation_year: legacyRow?.graduation_year || null,
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

  // Specialty filter (best-effort — only works on rows with specialty data)
  const specFilter = (specialty || 'all').toLowerCase();
  const filteredTargets = specFilter === 'all'
    ? targets
    : targets.filter(t => (t.specialty || '').toLowerCase().includes(specFilter));

  filteredTargets.sort((a, b) => b.target_score - a.target_score);

  return {
    targets: filteredTargets,
    total: filteredTargets.length,
    hospital: resolvedHospital,
    elapsed_ms: Date.now() - t0,
    data_sources: [
      { name: 'CMS Hospital General Information', url: 'https://data.cms.gov/provider-data/dataset/xubh-q36u' },
      { name: 'CMS Facility Affiliation Data', url: 'https://data.cms.gov/provider-data/dataset/27ea-46a8' },
      { name: 'CMS MPUP', url: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners' },
      { name: 'CMS Open Payments', url: 'https://openpaymentsdata.cms.gov' },
    ],
    summary: {
      tier_a: filteredTargets.filter(t => t.target_score >= 75).length,
      tier_b: filteredTargets.filter(t => t.target_score >= 50 && t.target_score < 75).length,
      total_robotic_cases: filteredTargets.reduce((s, t) => s + (t.robotic_cases_last_yr || 0), 0),
      total_intuitive_dollars_2yr: filteredTargets.reduce((s, t) => s + (t.intuitive_dollars_2yr || 0), 0),
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

// ---------------------------------------------------------------------------
// compareHospitalProcedureVolumes — cross-tab Medicare procedure volumes
// across multiple hospitals in ONE round-trip. Replaces N×M tool calls.
// ---------------------------------------------------------------------------
let _hcpcsFamilies = null;
function loadHcpcsFamilies() {
  if (_hcpcsFamilies) return _hcpcsFamilies;
  try {
    _hcpcsFamilies = require('../data/hcpcs-families.json');
  } catch (e) {
    _hcpcsFamilies = { families: {} };
  }
  return _hcpcsFamilies;
}

function expandFamilies(familySlugs) {
  const lib = loadHcpcsFamilies();
  const codeMap = {}; // code → [familySlug]
  const familyMap = {}; // slug → { label, codes:[code], specialty }
  for (const slug of familySlugs || []) {
    const fam = lib.families[slug];
    if (!fam) continue;
    familyMap[slug] = {
      label: fam.label,
      specialty: fam.specialty,
      codes: (fam.codes || []).map(c => c.code),
    };
    for (const c of (fam.codes || [])) {
      codeMap[c.code] = codeMap[c.code] || [];
      codeMap[c.code].push(slug);
    }
  }
  return { codeMap, familyMap };
}

async function compareHospitalProcedureVolumes({
  hospital_ccns,
  hospital_names,
  hcpcs_codes,
  procedure_families,
  fiscal_year,
}, ctx) {
  const t0 = Date.now();
  const models = ctx.models;
  if (!models) throw new Error('models required');
  if (!models.IntuitiveHospital) {
    throw new Error('Hospital master table missing. Run scripts/ingest-hospital-general-info.js first.');
  }
  if (!models.IntuitiveSurgeonHospitalAffiliation) {
    throw new Error('Surgeon-hospital affiliations missing. Run scripts/ingest-facility-affiliation.js first.');
  }
  if (!models.IntuitivePhysicianProcedureVolume) {
    throw new Error('MPUP physician volume table missing');
  }

  // 1) Resolve hospitals via IntuitiveHospital master table (5,400 real US hospitals)
  const { Op, fn, col } = require('sequelize');
  const hospitalRowsBySource = new Map(); // ccn → { ccn, name, state }

  if (Array.isArray(hospital_ccns) && hospital_ccns.length) {
    const rows = await models.IntuitiveHospital.findAll({
      where: { ccn: hospital_ccns.map(String) },
      attributes: ['ccn', 'facility_name', 'state', 'city', 'hospital_type'],
      raw: true,
    });
    for (const r of rows) {
      hospitalRowsBySource.set(r.ccn, {
        ccn: r.ccn, name: r.facility_name, state: r.state, city: r.city, type: r.hospital_type,
      });
    }
  }
  if (Array.isArray(hospital_names) && hospital_names.length) {
    // Multi-strategy fuzzy resolver — handles real-world queries like
    // "Mayo Clinic Florida" → "MAYO CLINIC" (Jacksonville, FL) and
    // "Orlando Regional Medical Center" → "ORLANDO HEALTH" (Orlando, FL).
    for (const name of hospital_names) {
      if (!name || typeof name !== 'string') continue;
      const matched = await resolveHospitalByName(models, name);
      if (matched && !hospitalRowsBySource.has(matched.ccn)) {
        hospitalRowsBySource.set(matched.ccn, {
          ccn: matched.ccn, name: matched.facility_name, state: matched.state,
          city: matched.city, type: matched.hospital_type, matched_query: name,
        });
      }
    }
  }
  if (hospitalRowsBySource.size === 0) {
    return {
      hospitals: [], families: [], matrix: {},
      elapsed_ms: Date.now() - t0,
      error: 'No hospitals resolved. Provide hospital_ccns or hospital_names that exist in CMS Hospital General Information.',
    };
  }
  const hospitals = Array.from(hospitalRowsBySource.values());

  // 2) Build target HCPCS list (union of explicit codes + expanded families)
  const { codeMap, familyMap } = expandFamilies(procedure_families || []);
  const explicitCodes = new Set();
  for (const c of (hcpcs_codes || [])) explicitCodes.add(String(c));

  // Auto-tag explicit codes against family library so they show up in the matrix
  const lib = loadHcpcsFamilies();
  for (const explicit of explicitCodes) {
    if (codeMap[explicit]) continue;
    let matched = false;
    for (const [slug, fam] of Object.entries(lib.families || {})) {
      for (const c of (fam.codes || [])) {
        if (c.code === explicit) {
          codeMap[explicit] = codeMap[explicit] || [];
          codeMap[explicit].push(slug);
          if (!familyMap[slug]) {
            familyMap[slug] = {
              label: fam.label, specialty: fam.specialty,
              codes: (fam.codes || []).map(x => x.code),
            };
          }
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    // If not matched to any family, file under "_other"
    if (!matched) {
      codeMap[explicit] = ['_other'];
      familyMap._other = familyMap._other || { label: 'Other (explicit codes)', specialty: 'other', codes: [] };
      familyMap._other.codes.push(explicit);
    }
  }
  const allCodes = Array.from(new Set([...Object.keys(codeMap), ...explicitCodes]));
  if (allCodes.length === 0) {
    return {
      hospitals, families: [], matrix: {},
      elapsed_ms: Date.now() - t0,
      error: 'No procedure_families or hcpcs_codes provided.',
    };
  }

  // 3) Pull all affiliated surgeon NPIs for the resolved hospitals
  // Uses the IntuitiveSurgeonHospitalAffiliation table (many-to-many surgeon ↔ hospital)
  // sourced from CMS "Facility Affiliation Data" — true hospital affiliations, not group practices.
  const ccnList = hospitals.map(h => h.ccn);
  const affRows = await models.IntuitiveSurgeonHospitalAffiliation.findAll({
    where: {
      facility_ccn: ccnList,
      facility_type: 'Hospital', // exclude long-term care, rehab, etc.
    },
    attributes: ['npi', 'facility_ccn', 'surgeon_last_name', 'surgeon_first_name'],
    raw: true,
  });

  const npisByCcn = {};
  const surgeonNameByNpi = {};
  for (const row of affRows) {
    if (!npisByCcn[row.facility_ccn]) npisByCcn[row.facility_ccn] = new Set();
    npisByCcn[row.facility_ccn].add(row.npi);
    const first = row.surgeon_first_name || '';
    const last = row.surgeon_last_name || '';
    if (last && !surgeonNameByNpi[row.npi]) {
      surgeonNameByNpi[row.npi] = `${first} ${last}`.trim();
    }
  }
  const allNpis = Array.from(new Set(affRows.map(r => r.npi)));
  if (allNpis.length === 0) {
    return {
      hospitals, families: [], matrix: {},
      elapsed_ms: Date.now() - t0,
      error: 'No surgeons affiliated with the resolved hospitals.',
    };
  }

  // 4) Resolve fiscal year — use latest available in MPUP for this slice
  let yearUsed = Number(fiscal_year) || null;
  if (!yearUsed) {
    const yearRow = await models.IntuitivePhysicianProcedureVolume.findOne({
      where: { npi: allNpis },
      attributes: [[fn('MAX', col('fiscal_year')), 'max_year']],
      raw: true,
    });
    yearUsed = (yearRow && yearRow.max_year) ? Number(yearRow.max_year) : null;
  }
  if (!yearUsed) {
    return {
      hospitals, families: [], matrix: {},
      elapsed_ms: Date.now() - t0,
      error: 'MPUP physician volume table has no rows for these surgeons. Run ingest-physician-volume.js with the latest MUP_PHY CSV.',
    };
  }

  // 5) ONE bulk volume query
  const volRows = await models.IntuitivePhysicianProcedureVolume.findAll({
    where: { npi: allNpis, hcpcs_code: allCodes, fiscal_year: yearUsed },
    attributes: ['npi', 'hcpcs_code', 'total_services'],
    raw: true,
  });

  // 6) Aggregate into hospital × family matrix
  const matrix = {}; // ccn → family → { volume, surgeon_count, surgeon_volumes: Map<npi,vol> }
  for (const h of hospitals) {
    matrix[h.ccn] = {};
    for (const fam of Object.keys(familyMap)) {
      matrix[h.ccn][fam] = { volume: 0, surgeon_count: 0, surgeon_volumes: new Map() };
    }
  }
  // Build reverse index: npi → set of CCNs they belong to
  const ccnsByNpi = {};
  for (const r of affRows) {
    if (!ccnsByNpi[r.npi]) ccnsByNpi[r.npi] = new Set();
    ccnsByNpi[r.npi].add(r.facility_ccn);
  }

  for (const v of volRows) {
    const services = Number(v.total_services) || 0;
    if (services <= 0) continue;
    const families = codeMap[v.hcpcs_code] || [];
    const ccns = ccnsByNpi[v.npi];
    if (!ccns || !families.length) continue;
    for (const ccn of ccns) {
      for (const fam of families) {
        if (!matrix[ccn] || !matrix[ccn][fam]) continue;
        matrix[ccn][fam].volume += services;
        const prior = matrix[ccn][fam].surgeon_volumes.get(v.npi) || 0;
        matrix[ccn][fam].surgeon_volumes.set(v.npi, prior + services);
      }
    }
  }

  // 7) Compute per-hospital totals + per-family totals + share %, finalize matrix shape
  const familyTotals = {};
  for (const ccn of Object.keys(matrix)) {
    for (const fam of Object.keys(matrix[ccn])) {
      familyTotals[fam] = (familyTotals[fam] || 0) + matrix[ccn][fam].volume;
    }
  }
  const finalMatrix = {};
  for (const ccn of Object.keys(matrix)) {
    finalMatrix[ccn] = {};
    for (const fam of Object.keys(matrix[ccn])) {
      const cell = matrix[ccn][fam];
      const surgeonList = Array.from(cell.surgeon_volumes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([npi, vol]) => ({ npi, name: surgeonNameByNpi[npi] || null, volume: vol }));
      const total = familyTotals[fam] || 0;
      finalMatrix[ccn][fam] = {
        volume: cell.volume,
        surgeon_count: cell.surgeon_volumes.size,
        share_pct: total > 0 ? Math.round((cell.volume / total) * 1000) / 10 : 0,
        top_surgeons: surgeonList,
      };
    }
  }

  // 8) Per-hospital totals across all families
  for (const h of hospitals) {
    h.total_volume = Object.values(finalMatrix[h.ccn] || {})
      .reduce((s, c) => s + (c.volume || 0), 0);
  }
  hospitals.sort((a, b) => b.total_volume - a.total_volume);

  const families = Object.entries(familyMap).map(([slug, fam]) => ({
    slug,
    label: fam.label,
    specialty: fam.specialty,
    hcpcs_codes: fam.codes,
    total_volume: familyTotals[slug] || 0,
  })).sort((a, b) => b.total_volume - a.total_volume);

  return {
    hospitals,
    families,
    matrix: finalMatrix,
    fiscal_year_used: yearUsed,
    surgeons_considered: allNpis.length,
    elapsed_ms: Date.now() - t0,
    citations: [
      { source_name: 'CMS Care Compare (surgeon-hospital affiliations)', source_url: 'https://data.cms.gov/provider-data/dataset/mj5m-pzi6' },
      { source_name: 'CMS MPUP (Medicare physician procedure volume)', source_url: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners' },
    ],
  };
}

// ---------------------------------------------------------------------------
// hospitalDrgVolume — direct hospital-level Medicare DRG discharges
// More accurate than summing surgeons' MPUP when the question is institutional.
// Requires intuitive_hospital_drg_volume table populated via
// scripts/ingest-medicare-inpatient-drg.js.
// ---------------------------------------------------------------------------
const SURGICAL_DRG_DESC_RE = /\b(SURG|SURGERY|SURGICAL|PROCEDURE|RESECTION|EXCISION|REPAIR|REMOVAL|TRANSPLANT|BYPASS|GRAFT|REPLACEMENT|FUSION|AMPUTATION|MASTECTOMY|HYSTERECTOMY|PROSTATECTOMY|NEPHRECTOMY|COLECTOMY|LOBECTOMY|CHOLECYSTECTOMY|HERNIA)\b/i;

async function hospitalDrgVolume({ hospital_ccn, drg_codes, mdc, surgical_only, fiscal_year }, ctx) {
  const t0 = Date.now();
  const models = ctx.models;
  if (!hospital_ccn) throw new Error('hospital_ccn required');
  if (!models?.IntuitiveHospitalDrgVolume) {
    throw new Error('Hospital DRG volume table missing. Run scripts/ingest-medicare-inpatient-drg.js first.');
  }

  const { Op, fn, col } = require('sequelize');
  const where = { hospital_ccn: String(hospital_ccn) };

  // Resolve fiscal year — latest available if not specified
  let yearUsed = Number(fiscal_year) || null;
  if (!yearUsed) {
    const row = await models.IntuitiveHospitalDrgVolume.findOne({
      where: { hospital_ccn: String(hospital_ccn) },
      attributes: [[fn('MAX', col('fiscal_year')), 'max_year']],
      raw: true,
    });
    yearUsed = (row && row.max_year) ? Number(row.max_year) : null;
  }
  if (!yearUsed) {
    return {
      hospital_ccn, drgs: [], total_discharges: 0,
      error: 'No DRG data found for this CCN. Either the CCN is wrong or the bulk ingest has not been run.',
      elapsed_ms: Date.now() - t0,
    };
  }
  where.fiscal_year = yearUsed;

  if (Array.isArray(drg_codes) && drg_codes.length) {
    where.drg_cd = drg_codes.map(String);
  }

  let rows = await models.IntuitiveHospitalDrgVolume.findAll({
    where,
    order: [['total_discharges', 'DESC']],
    raw: true,
    limit: 200,
  });

  if (surgical_only) {
    rows = rows.filter(r => SURGICAL_DRG_DESC_RE.test(r.drg_desc || ''));
  }

  const totalDischarges = rows.reduce((s, r) => s + (Number(r.total_discharges) || 0), 0);
  const totalMcrPayment = rows.reduce((s, r) =>
    s + (Number(r.avg_medicare_payment) || 0) * (Number(r.total_discharges) || 0), 0);

  return {
    hospital_ccn,
    fiscal_year_used: yearUsed,
    surgical_only: !!surgical_only,
    drg_codes_filter: drg_codes || null,
    drgs: rows.map(r => ({
      drg_cd: r.drg_cd,
      drg_desc: r.drg_desc,
      total_discharges: r.total_discharges,
      avg_medicare_payment: r.avg_medicare_payment,
      avg_total_payment: r.avg_total_payment,
      avg_covered_charges: r.avg_covered_charges,
    })),
    summary: {
      drg_count: rows.length,
      total_discharges: totalDischarges,
      estimated_medicare_payments: Math.round(totalMcrPayment),
    },
    elapsed_ms: Date.now() - t0,
    citations: [
      { source_name: 'CMS Medicare Inpatient Hospitals by Provider and Service', source_url: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals' },
    ],
  };
}

module.exports = {
  searchByTerritory,
  searchByHospital,
  generateBriefing,
  compareHospitalProcedureVolumes,
  hospitalDrgVolume,
  resolveHospitalByName,
  loadHcpcsFamilies,
  targetScore,
  kolScore,
  tier,
  kolBadge,
  fetchAffiliationsByNpi,
};
