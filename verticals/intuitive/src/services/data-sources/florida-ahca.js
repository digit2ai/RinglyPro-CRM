'use strict';

// Florida AHCA (Agency for Health Care Administration) connector
// Reads from local florida_ahca_hospitals table populated by ingest-florida-ahca.js
// Source: https://ahca.myflorida.com / https://www.floridahealthfinder.gov
//
// TODO: Add CA OSHPD, TX DSHS, NY SPARCS as additional state sources following the
// same pattern (one connector file + one Postgres table + one ingestion script).

const cache = require('./_cache');

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchFor(hospitalName, opts = {}) {
  const log = (...m) => console.log('[DataSource:FL-AHCA]', ...m);
  const models = opts.models;
  if (!models || !models.IntuitiveFloridaAhcaHospital) {
    return { data: null, citations: [], error: 'florida_ahca_hospitals model unavailable' };
  }

  const norm = normalizeName(hospitalName);
  const cacheKey = `name:${norm}`;
  const cached = await cache.get(models, 'florida-ahca', cacheKey);
  if (cached) return cached;

  try {
    const { Op } = require('sequelize');
    // Try exact normalized match first, then partial.
    let row = await models.IntuitiveFloridaAhcaHospital.findOne({
      where: { hospital_name_normalized: norm },
      order: [['fiscal_year', 'DESC']],
    });
    if (!row) {
      const tokens = norm.split(' ').filter(t => t.length > 3);
      if (tokens.length) {
        row = await models.IntuitiveFloridaAhcaHospital.findOne({
          where: {
            hospital_name_normalized: { [Op.iLike]: `%${tokens[0]}%` },
          },
          order: [['fiscal_year', 'DESC']],
        });
      }
    }

    if (!row) {
      log(`no Florida AHCA record for ${hospitalName}`);
      return { data: null, citations: [], note: 'not in Florida AHCA table; ingest-florida-ahca.js may need to run' };
    }

    const r = row.toJSON ? row.toJSON() : row;
    const data = {
      provider_id: r.provider_id,
      license_number: r.license_number,
      hospital_name: r.hospital_name,
      licensed_beds: Number(r.licensed_beds) || 0,
      staffed_beds: Number(r.staffed_beds) || 0,
      hospital_type: r.hospital_type,
      ownership: r.ownership,
      total_or_count: Number(r.total_or_count) || 0,
      total_admissions: Number(r.total_admissions) || 0,
      fiscal_year: r.fiscal_year,
    };

    const citations = [];
    if (data.licensed_beds > 0) citations.push({ field: 'bed_count', value: data.licensed_beds, source_name: 'Florida Agency for Health Care Administration', source_url: 'https://www.floridahealthfinder.gov/facility/Search.aspx', last_updated_at: `${data.fiscal_year}-12-31`, confidence: 'confirmed' });
    if (data.staffed_beds > 0) citations.push({ field: 'beds_staffed', value: data.staffed_beds, source_name: 'Florida Agency for Health Care Administration', source_url: 'https://www.floridahealthfinder.gov/facility/Search.aspx', last_updated_at: `${data.fiscal_year}-12-31`, confidence: 'confirmed' });
    if (data.total_or_count > 0) citations.push({ field: 'total_or_count', value: data.total_or_count, source_name: 'Florida Agency for Health Care Administration', source_url: 'https://www.floridahealthfinder.gov/facility/Search.aspx', last_updated_at: `${data.fiscal_year}-12-31`, confidence: 'confirmed' });

    const result = { data, citations };
    await cache.set(models, 'florida-ahca', cacheKey, result);
    log(`FL AHCA hit for ${data.hospital_name}, FY ${data.fiscal_year}`);
    return result;
  } catch (e) {
    log(`error: ${e.message}`);
    return { data: null, citations: [], error: e.message };
  }
}

module.exports = { fetchFor };
