'use strict';

// IRS Form 990 connector via ProPublica Nonprofit Explorer
// Public free API. https://projects.propublica.org/nonprofits/api/v2/

const cache = require('./_cache');

const HOSPITAL_NTEE_PREFIXES = ['E20', 'E21', 'E22', 'E24', 'E30', 'E31', 'E32']; // hospitals + general medical

async function searchOrg(hospitalName, state) {
  const params = new URLSearchParams();
  params.set('q', hospitalName);
  if (state) params.append('state[]', state);
  const url = `https://projects.propublica.org/nonprofits/api/v2/search.json?${params.toString()}`;
  const r = await cache.fetchWithRetry(url, { headers: { 'Accept': 'application/json' } }, 10000, 1);
  if (!r.ok) throw new Error(`ProPublica search HTTP ${r.status}`);
  const data = await r.json();
  return data.organizations || [];
}

async function getOrg(ein) {
  const url = `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`;
  const r = await cache.fetchWithRetry(url, { headers: { 'Accept': 'application/json' } }, 10000, 1);
  if (!r.ok) throw new Error(`ProPublica org HTTP ${r.status}`);
  return r.json();
}

async function fetchFor(hospitalName, state, opts = {}) {
  const log = (...m) => console.log('[DataSource:IRS990]', ...m);
  if (!hospitalName) return { data: null, citations: [], error: 'hospitalName required' };

  const cacheKey = `${hospitalName}|${state || ''}`;
  const cached = await cache.get(opts.models, 'propublica-990', cacheKey);
  if (cached) {
    log(`cache hit for ${hospitalName}`);
    return cached;
  }

  try {
    const orgs = await searchOrg(hospitalName, state);
    if (!orgs.length) {
      log(`no ProPublica match for ${hospitalName}`);
      return { data: null, citations: [], note: 'not found in ProPublica (may be for-profit or unlisted)' };
    }

    // Filter to hospitals (NTEE prefix E2x/E3x) and rank by name similarity
    const candidates = orgs.filter(o => {
      const ntee = String(o.ntee_code || '').slice(0, 3);
      return HOSPITAL_NTEE_PREFIXES.includes(ntee) || /hospital|medical center|clinic/i.test(o.name || '');
    });
    if (!candidates.length) candidates.push(orgs[0]);
    const top = candidates[0];

    const orgDetails = await getOrg(top.ein);
    const filings = (orgDetails.filings_with_data || []).sort((a, b) => (b.tax_prd_yr || 0) - (a.tax_prd_yr || 0));
    const latest = filings[0];

    if (!latest) {
      log(`no Form 990 filings for EIN ${top.ein}`);
      return { data: { ein: top.ein, name: top.name }, citations: [], note: 'no recent 990 filings' };
    }

    const data = {
      ein: top.ein,
      name: top.name,
      tax_year: latest.tax_prd_yr,
      total_revenue: Number(latest.totrevenue || 0),
      total_expenses: Number(latest.totfuncexpns || 0),
      total_assets: Number(latest.totassetsend || 0),
      ceo_name: latest.officer_name_1 || null,
      ceo_compensation: Number(latest.officer_comp_1 || 0),
      charity_care_dollars: Number(latest.unmblbnsfschc || 0),
      filing_url: `https://projects.propublica.org/nonprofits/organizations/${top.ein}`,
    };

    const citations = [];
    if (data.total_revenue > 0) citations.push({ field: 'total_revenue', value: data.total_revenue, source_name: 'IRS Form 990 (via ProPublica Nonprofit Explorer)', source_url: data.filing_url, last_updated_at: `${data.tax_year}-12-31`, confidence: 'confirmed' });
    if (data.total_expenses > 0) citations.push({ field: 'total_expenses', value: data.total_expenses, source_name: 'IRS Form 990 (via ProPublica Nonprofit Explorer)', source_url: data.filing_url, last_updated_at: `${data.tax_year}-12-31`, confidence: 'confirmed' });
    if (data.ceo_name) citations.push({ field: 'ceo_name', value: data.ceo_name, source_name: 'IRS Form 990 (via ProPublica Nonprofit Explorer)', source_url: data.filing_url, last_updated_at: `${data.tax_year}-12-31`, confidence: 'confirmed' });

    const result = { data, citations };
    await cache.set(opts.models, 'propublica-990', cacheKey, result);
    log(`Form 990 fetched for ${top.name} (EIN ${top.ein}), tax year ${data.tax_year}`);
    return result;
  } catch (e) {
    log(`error: ${e.message}`);
    return { data: null, citations: [], error: e.message };
  }
}

module.exports = { fetchFor };
