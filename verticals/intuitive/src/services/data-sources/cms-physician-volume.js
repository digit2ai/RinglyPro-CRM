'use strict';

// CMS Medicare Physician Procedure Volume (MPUP) connector
// Reads from local physician_procedure_volume table populated by ingest-physician-volume.js
// Source: https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners

const path = require('path');
const cache = require('./_cache');

let CPT_CODES = null;
function loadCptCodes() {
  if (CPT_CODES) return CPT_CODES;
  try {
    CPT_CODES = require(path.join(__dirname, '..', '..', '..', 'data', 'robotic-cpt-codes.json'));
  } catch (e) {
    CPT_CODES = { codes: {}, modifier: 'S2900' };
  }
  return CPT_CODES;
}

async function fetchFor(npis, opts = {}) {
  const log = (...m) => console.log('[DataSource:MPUP]', ...m);
  const models = opts.models;

  if (!Array.isArray(npis) || npis.length === 0) {
    return { data: { surgeon_volumes: [] }, citations: [] };
  }
  if (!models || !models.IntuitivePhysicianProcedureVolume) {
    return { data: null, citations: [], error: 'physician_procedure_volume model unavailable' };
  }

  const npiList = npis.map(n => String(typeof n === 'string' ? n : n.npi)).filter(Boolean);
  const cacheKey = `npis:${npiList.sort().join(',')}`;
  const cached = await cache.get(models, 'cms-physician-volume', cacheKey);
  if (cached) return cached;

  const cpt = loadCptCodes();
  const roboticCptList = Object.keys(cpt.codes || {});

  try {
    const rows = await models.IntuitivePhysicianProcedureVolume.findAll({
      where: { npi: npiList },
      order: [['fiscal_year', 'DESC']],
    });

    // Aggregate per NPI: total robotic-relevant cases for the most recent year available.
    const byNpi = {};
    const latestYearByNpi = {};
    for (const row of rows) {
      const r = row.toJSON ? row.toJSON() : row;
      if (!latestYearByNpi[r.npi] || r.fiscal_year > latestYearByNpi[r.npi]) {
        latestYearByNpi[r.npi] = r.fiscal_year;
      }
    }
    for (const row of rows) {
      const r = row.toJSON ? row.toJSON() : row;
      if (r.fiscal_year !== latestYearByNpi[r.npi]) continue;
      if (!byNpi[r.npi]) {
        byNpi[r.npi] = {
          npi: r.npi,
          fiscal_year: r.fiscal_year,
          total_robotic_cases_last_yr: 0,
          procedure_breakdown: {},
        };
      }
      const isRoboticRelevant = roboticCptList.includes(r.hcpcs_code);
      if (isRoboticRelevant) {
        byNpi[r.npi].total_robotic_cases_last_yr += Number(r.total_services) || 0;
        const family = (cpt.codes[r.hcpcs_code] || {}).family || 'other';
        byNpi[r.npi].procedure_breakdown[family] = (byNpi[r.npi].procedure_breakdown[family] || 0) + Number(r.total_services || 0);
      }
    }

    const surgeon_volumes = Object.values(byNpi).sort((a, b) => b.total_robotic_cases_last_yr - a.total_robotic_cases_last_yr);

    const result = {
      data: { surgeon_volumes },
      citations: surgeon_volumes.slice(0, 5).map(sv => ({
        field: `robotic_cases_npi_${sv.npi}`,
        value: sv.total_robotic_cases_last_yr,
        source_name: 'CMS Medicare Physician Provider Utilization',
        source_url: `https://data.cms.gov/provider-data/topic/physicians`,
        last_updated_at: `${sv.fiscal_year}-12-31`,
        confidence: 'confirmed',
      })),
    };

    await cache.set(models, 'cms-physician-volume', cacheKey, result);
    log(`MPUP aggregated for ${surgeon_volumes.length} surgeons`);
    return result;
  } catch (e) {
    log(`error: ${e.message}`);
    return { data: null, citations: [], error: e.message };
  }
}

module.exports = { fetchFor };
