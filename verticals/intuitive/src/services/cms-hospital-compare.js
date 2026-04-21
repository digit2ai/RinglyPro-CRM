'use strict';

/**
 * CMS Hospital Compare Service
 * Fetches hospital quality metrics from the public CMS Provider Data API.
 * API docs: https://data.cms.gov/provider-data/
 * No authentication required.
 */

const CMS_API_BASE = 'https://data.cms.gov/provider-data/api/1';

// CMS dataset IDs
const DATASETS = {
  hospital_info: 'xubh-q36u',        // Hospital General Information
  readmissions: '632h-zaca',          // Unplanned Hospital Visits
  infections: '77hc-ibv8',            // Healthcare-Associated Infections
  mortality: 'ynj2-r877',             // Complications and Deaths
  timely_care: 'yv7e-xc69',          // Timely and Effective Care
  patient_experience: 'dgck-syfz'     // Patient Experience
};

// Map dataset keys to human-readable categories
const CATEGORY_LABELS = {
  readmissions: 'Unplanned Hospital Visits / Readmissions',
  infections: 'Healthcare-Associated Infections',
  mortality: 'Complications and Deaths',
  timely_care: 'Timely and Effective Care',
  patient_experience: 'Patient Experience'
};

/**
 * Internal helper: query a CMS dataset with conditions
 * @param {string} datasetId - CMS dataset identifier
 * @param {Array} conditions - Array of {property, value, operator?} filter conditions
 * @param {number} [limit=100] - Max rows to return
 * @returns {Promise<Array>} Array of result rows
 */
async function queryDataset(datasetId, conditions, limit = 100) {
  try {
    const url = new URL(`${CMS_API_BASE}/datastore/query/${datasetId}`);

    // Build query parameters for conditions
    conditions.forEach((cond, idx) => {
      url.searchParams.set(`conditions[${idx}][property]`, cond.property);
      url.searchParams.set(`conditions[${idx}][value]`, cond.value);
      if (cond.operator) {
        url.searchParams.set(`conditions[${idx}][operator]`, cond.operator);
      }
    });
    url.searchParams.set('limit', String(limit));

    const response = await fetch(url.toString());

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (err) {
    return [];
  }
}

/**
 * Find a hospital by name and state in the CMS Hospital General Information dataset
 * @param {string} hospitalName - Full or partial hospital name
 * @param {string} state - Two-letter state code (e.g., 'FL', 'CA')
 * @returns {Promise<{provider_id: string, hospital_name: string, address: string, city: string, state: string, zip: string, hospital_type: string, ownership: string}|null>}
 */
async function findHospital(hospitalName, state) {
  try {
    const conditions = [
      { property: 'hospital_name', value: hospitalName.toUpperCase(), operator: 'CONTAINS' }
    ];

    if (state) {
      conditions.push({ property: 'state', value: state.toUpperCase() });
    }

    const results = await queryDataset(DATASETS.hospital_info, conditions, 10);

    if (!results || results.length === 0) {
      return null;
    }

    // Return the best match (first result)
    const h = results[0];
    return {
      provider_id: h.provider_id || h.facility_id || h.provider_number || '',
      hospital_name: h.hospital_name || h.facility_name || '',
      address: h.address || '',
      city: h.city || '',
      state: h.state || '',
      zip: h.zip_code || h.zip || '',
      hospital_type: h.hospital_type || '',
      ownership: h.hospital_ownership || h.ownership || '',
      phone: h.phone_number || '',
      overall_rating: h.hospital_overall_rating || null,
      emergency_services: h.emergency_services || null
    };
  } catch (err) {
    return null;
  }
}

/**
 * Fetch quality metrics for a given CMS provider ID across multiple datasets
 * @param {string} providerId - CMS provider / facility ID (CCN)
 * @returns {Promise<Array<{measure_id: string, measure_name: string, category: string, score: string, national_avg: string, comparison: string}>>}
 */
async function fetchMetrics(providerId) {
  const metrics = [];
  const metricDatasets = ['readmissions', 'infections', 'mortality'];

  try {
    // Query all metric datasets in parallel
    const promises = metricDatasets.map(async (key) => {
      const datasetId = DATASETS[key];
      const category = CATEGORY_LABELS[key] || key;

      const conditions = [
        { property: 'provider_id', value: providerId }
      ];

      const results = await queryDataset(datasetId, conditions, 200);

      return results.map(row => ({
        measure_id: row.measure_id || row.measure || '',
        measure_name: row.measure_name || row.condition || row.measure || '',
        category,
        score: row.score || row.compared_to_national || '',
        national_avg: row.national_rate || row.national_average || row.benchmark || '',
        comparison: row.compared_to_national || row.comparison || '',
        footnote: row.footnote || ''
      }));
    });

    const allResults = await Promise.all(promises);
    allResults.forEach(resultSet => metrics.push(...resultSet));

    return metrics;
  } catch (err) {
    return metrics;
  }
}

/**
 * Full pipeline: find a hospital and fetch all its quality metrics
 * @param {string} hospitalName - Hospital name to search
 * @param {string} state - Two-letter state code
 * @returns {Promise<{provider: object|null, metrics: Array, fetched_at: string, error?: string}>}
 */
async function fetchAllForHospital(hospitalName, state) {
  try {
    const provider = await findHospital(hospitalName, state);

    if (!provider) {
      return {
        provider: null,
        metrics: [],
        fetched_at: new Date().toISOString(),
        error: `Hospital not found: "${hospitalName}" in ${state || 'any state'}. Try a more specific name or check the state code.`
      };
    }

    const metrics = await fetchMetrics(provider.provider_id);

    return {
      provider,
      metrics,
      fetched_at: new Date().toISOString()
    };
  } catch (err) {
    return {
      provider: null,
      metrics: [],
      fetched_at: new Date().toISOString(),
      error: `CMS API error: ${err.message}`
    };
  }
}

module.exports = { findHospital, fetchMetrics, fetchAllForHospital, DATASETS };
