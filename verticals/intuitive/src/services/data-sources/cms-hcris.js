'use strict';

// CMS HCRIS (Hospital Cost Report) connector
// Reads from the local hospital_cost_reports table populated by ingest-hcris.js
// Source: https://www.cms.gov/Research-Statistics-Data-and-Systems/Statistics-Trends-and-Reports/CostReports

const cache = require('./_cache');

async function fetchFor(hospitalName, state, opts = {}) {
  const log = (...m) => console.log('[DataSource:HCRIS]', ...m);
  const models = opts.models;
  const providerId = opts.providerId;

  if (!models || !models.IntuitiveHospitalCostReport) {
    return { data: null, citations: [], error: 'hospital_cost_reports model unavailable' };
  }
  if (!providerId) {
    log(`no providerId for ${hospitalName}; skipping`);
    return { data: null, citations: [], error: 'providerId required' };
  }

  const cacheKey = `provider:${providerId}`;
  const cached = await cache.get(models, 'cms-hcris', cacheKey);
  if (cached) return cached;

  try {
    const row = await models.IntuitiveHospitalCostReport.findOne({
      where: { provider_id: String(providerId) },
      order: [['fiscal_year', 'DESC']],
    });

    if (!row) {
      log(`no HCRIS record for provider ${providerId}`);
      return { data: null, citations: [], note: 'not in HCRIS table; ingest-hcris.js may need to run' };
    }

    const r = row.toJSON ? row.toJSON() : row;
    const result = {
      data: {
        provider_id: r.provider_id,
        fiscal_year: r.fiscal_year,
        total_revenue: Number(r.total_revenue) || 0,
        total_expenses: Number(r.total_expenses) || 0,
        surgical_revenue: Number(r.surgical_revenue) || 0,
        total_surgical_cases: Number(r.total_surgical_cases) || 0,
        payer_medicare_pct: Number(r.payer_medicare_pct) || 0,
        payer_medicaid_pct: Number(r.payer_medicaid_pct) || 0,
        payer_self_pay_pct: Number(r.payer_self_pay_pct) || 0,
        total_or_count: Number(r.total_or_count) || 0,
        beds_available: Number(r.beds_available) || 0,
        beds_staffed: Number(r.beds_staffed) || 0,
        raw_filing_url: r.raw_filing_url,
      },
      citations: [
        ...(r.beds_staffed ? [{ field: 'beds_staffed', value: Number(r.beds_staffed), source_name: 'CMS Hospital Cost Report (HCRIS)', source_url: `https://hcris.cms.gov/${providerId}`, last_updated_at: r.ingested_at, confidence: 'confirmed' }] : []),
        ...(r.total_revenue ? [{ field: 'total_revenue', value: Number(r.total_revenue), source_name: 'CMS Hospital Cost Report (HCRIS)', source_url: `https://hcris.cms.gov/${providerId}`, last_updated_at: r.ingested_at, confidence: 'confirmed' }] : []),
        ...(r.total_or_count ? [{ field: 'total_or_count', value: Number(r.total_or_count), source_name: 'CMS Hospital Cost Report (HCRIS)', source_url: `https://hcris.cms.gov/${providerId}`, last_updated_at: r.ingested_at, confidence: 'confirmed' }] : []),
        ...(r.payer_medicare_pct ? [{ field: 'payer_medicare_pct', value: Number(r.payer_medicare_pct), source_name: 'CMS Hospital Cost Report (HCRIS)', source_url: `https://hcris.cms.gov/${providerId}`, last_updated_at: r.ingested_at, confidence: 'confirmed' }] : []),
      ],
    };

    await cache.set(models, 'cms-hcris', cacheKey, result);
    log(`HCRIS hit for provider ${providerId}, FY ${r.fiscal_year}`);
    return result;
  } catch (e) {
    log(`error: ${e.message}`);
    return { data: null, citations: [], error: e.message };
  }
}

module.exports = { fetchFor };
