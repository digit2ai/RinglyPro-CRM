'use strict';

// ClinicalTrials.gov API v2 connector — active-PI signal per surgeon
// Free, no key required. https://clinicaltrials.gov/data-api/api

const cache = require('./_cache');

const CT_API = 'https://clinicaltrials.gov/api/v2/studies';

// Active statuses indicating the surgeon is currently engaged
const ACTIVE_STATUSES = ['RECRUITING', 'ACTIVE_NOT_RECRUITING', 'ENROLLING_BY_INVITATION', 'NOT_YET_RECRUITING'];

function normalizeName(fullName) {
  if (!fullName) return null;
  return String(fullName)
    .replace(/^dr\.?\s+/i, '')
    .replace(/,?\s*(md|do|phd|mph|facs|frcs|jr|sr|ii|iii|iv)\.?$/gi, '')
    .replace(/,?\s*(md|do|phd|mph|facs|frcs|jr|sr|ii|iii|iv)\.?\s/gi, ' ')
    .trim();
}

async function fetchActiveTrials(fullName, opts = {}) {
  if (!fullName) return { active_count: 0, completed_count: 0, trials: [], skipped: true };

  const cleaned = normalizeName(fullName);
  if (!cleaned) return { active_count: 0, completed_count: 0, trials: [], skipped: true };

  const cacheKey = cleaned;
  const cached = await cache.get(opts.models, 'clinical-trials', cacheKey);
  if (cached) return cached;

  // Search by overall_official name. ClinicalTrials.gov uses full-text Essie syntax.
  const params = new URLSearchParams({
    'query.term': `AREA[OverallOfficialName]"${cleaned}"`,
    'fields': 'NCTId,BriefTitle,OverallStatus,Phase,StartDate,LeadSponsorName,OverallOfficialName',
    'pageSize': '20',
    'format': 'json',
  });

  try {
    const r = await cache.fetchWithRetry(
      `${CT_API}?${params.toString()}`,
      { headers: { 'Accept': 'application/json' } },
      8000, 1
    );
    if (!r.ok) throw new Error(`ClinicalTrials HTTP ${r.status}`);
    const json = await r.json();
    const studies = json.studies || [];

    const trials = [];
    let activeCount = 0;
    let completedCount = 0;

    for (const s of studies) {
      const proto = (s.protocolSection || {});
      const id = proto.identificationModule || {};
      const status = (proto.statusModule || {}).overallStatus || 'UNKNOWN';
      const sponsor = ((proto.sponsorCollaboratorsModule || {}).leadSponsor || {}).name || '';
      const officials = (proto.contactsLocationsModule || {}).overallOfficials || [];
      const phase = ((proto.designModule || {}).phases || []).join(',') || '';

      // Verify the surgeon is actually listed (not just text match)
      const matched = officials.some(o => (o.name || '').toLowerCase().includes(cleaned.toLowerCase()));
      if (!matched) continue;

      const isActive = ACTIVE_STATUSES.includes(status);
      if (isActive) activeCount++;
      if (status === 'COMPLETED') completedCount++;

      trials.push({
        nct_id: id.nctId,
        title: id.briefTitle,
        status,
        phase,
        sponsor,
        start_date: (proto.statusModule || {}).startDateStruct?.date || '',
        is_industry_sponsor: /intuitive|medtronic|stryker|j&j|johnson|olympus|boston scientific/i.test(sponsor),
      });
    }

    const result = {
      active_count: activeCount,
      completed_count: completedCount,
      total_trials: trials.length,
      trials: trials.slice(0, 10),
      industry_sponsored: trials.filter(t => t.is_industry_sponsor).length,
      intuitive_sponsored: trials.filter(t => /intuitive/i.test(t.sponsor || '')).length,
      source_url: `https://clinicaltrials.gov/search?term=${encodeURIComponent(cleaned)}`,
    };
    await cache.set(opts.models, 'clinical-trials', cacheKey, result, 7 * 24 * 60 * 60 * 1000);
    return result;
  } catch (e) {
    console.log('[DataSource:ClinicalTrials]', `error for ${fullName}:`, e.message);
    return { active_count: 0, completed_count: 0, trials: [], error: e.message };
  }
}

async function fetchBulk(surgeons, opts = {}) {
  // ClinicalTrials.gov has a generous rate limit (~50 req/sec) but we pace to be polite
  const rate = 150;
  const out = {};
  for (const s of surgeons) {
    const name = typeof s === 'string' ? s : s.full_name;
    const npi = typeof s === 'string' ? null : s.npi;
    const key = npi || name;
    const r = await fetchActiveTrials(name, opts);
    out[key] = r;
    await new Promise(res => setTimeout(res, rate));
  }
  return out;
}

module.exports = { fetchActiveTrials, fetchBulk, normalizeName };
