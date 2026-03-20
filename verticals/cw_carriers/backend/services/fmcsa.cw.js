/**
 * FMCSA Integration Service — CW Carriers
 *
 * Layer 1: On-demand query (no bulk storage) — search carriers by state, name, fleet size
 * Layer 2: Live lookup — auto-fill carrier details by MC or DOT number
 * Layer 3: Compliance check — verify operating authority status
 *
 * Data sources:
 *   - Company Census File: https://data.transportation.gov/resource/az4n-8mr2.json
 *   - SMS Motor Carrier Census: https://data.transportation.gov/resource/kjg3-diqy.json
 *
 * Free, no authentication required. SODA API with JSON responses.
 */

const CENSUS_API = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const SMS_API = 'https://data.transportation.gov/resource/kjg3-diqy.json';

// In-memory cache — TTL 1 hour for search results, 24 hours for individual lookups
const cache = new Map();
const SEARCH_TTL = 3600000;    // 1 hour
const LOOKUP_TTL = 86400000;   // 24 hours

function getCached(key, ttl) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return entry.data;
  return null;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  // Prune cache if too large (keep under 500 entries)
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 100);
    oldest.forEach(([k]) => cache.delete(k));
  }
}

/**
 * Layer 1: Search carriers on demand — no storage, live from FMCSA
 */
async function searchCarriers({ state, name, min_fleet_size, equipment, limit = 50 }) {
  const cacheKey = `search:${state}:${name}:${min_fleet_size}:${equipment}:${limit}`;
  const cached = getCached(cacheKey, SEARCH_TTL);
  if (cached) return { ...cached, cached: true };

  const params = new URLSearchParams();
  params.set('$limit', Math.min(limit, 200));
  params.set('$order', 'power_units DESC');

  // Build WHERE clause
  const where = [];
  if (state) where.push(`phy_state='${state.toUpperCase()}'`);
  if (name) where.push(`upper(legal_name) like '%${name.toUpperCase().replace(/'/g, "''")}%'`);
  if (min_fleet_size) where.push(`power_units >= ${parseInt(min_fleet_size)}`);
  // Only active carriers
  where.push(`status_code='A'`);

  if (where.length > 0) params.set('$where', where.join(' AND '));

  try {
    const resp = await fetch(`${CENSUS_API}?${params}`);
    if (!resp.ok) throw new Error(`FMCSA API error: ${resp.status}`);
    const raw = await resp.json();

    const carriers = raw.map(r => ({
      dot_number: r.dot_number,
      mc_number: r.docket1prefix && r.docket1 ? `${r.docket1prefix}-${r.docket1}` : null,
      legal_name: r.legal_name,
      phone: r.phone,
      city: r.phy_city,
      state: r.phy_state,
      zip: r.phy_zip,
      street: r.phy_street,
      power_units: parseInt(r.power_units) || 0,
      truck_units: parseInt(r.truck_units) || 0,
      total_drivers: parseInt(r.total_drivers) || 0,
      fleet_size: parseInt(r.fleetsize) || parseInt(r.power_units) || 0,
      carrier_operation: r.carrier_operation,
      hazmat: r.hm_ind === 'Y',
      business_type: r.business_org_desc,
      mcs150_mileage: parseInt(r.mcs150_mileage) || 0,
      status: r.status_code === 'A' ? 'active' : 'inactive',
      source: 'fmcsa_census',
    }));

    const result = { carriers, total: carriers.length, query: { state, name, min_fleet_size } };
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[FMCSA] Search error:', err.message);
    throw new Error('FMCSA API unavailable: ' + err.message);
  }
}

/**
 * Layer 2: Lookup single carrier by DOT or MC number — auto-fill fields
 */
async function lookupCarrier({ dot_number, mc_number }) {
  if (!dot_number && !mc_number) throw new Error('dot_number or mc_number required');

  const cacheKey = `lookup:${dot_number || mc_number}`;
  const cached = getCached(cacheKey, LOOKUP_TTL);
  if (cached) return { ...cached, cached: true };

  try {
    let params = new URLSearchParams({ '$limit': '1' });

    if (dot_number) {
      params.set('dot_number', String(dot_number));
    } else if (mc_number) {
      // MC number format: "MC-123456" or just "123456"
      const mcNum = String(mc_number).replace(/^MC-?/i, '').trim();
      params.set('docket1', mcNum);
    }

    // Try Census API first (more fields)
    let resp = await fetch(`${CENSUS_API}?${params}`);
    let data = await resp.json();

    // If not found in Census, try SMS API
    if (!data || data.length === 0) {
      const smsParams = new URLSearchParams({ '$limit': '1' });
      if (dot_number) smsParams.set('dot_number', String(dot_number));
      resp = await fetch(`${SMS_API}?${smsParams}`);
      data = await resp.json();

      if (data && data.length > 0) {
        const r = data[0];
        const result = {
          found: true,
          dot_number: r.dot_number,
          mc_number: null,
          legal_name: r.legal_name,
          dba_name: r.dba_name,
          phone: r.telephone,
          email: r.email_address,
          city: r.phy_city,
          state: r.phy_state,
          zip: r.phy_zip,
          street: r.phy_street,
          power_units: parseInt(r.nbr_power_unit) || 0,
          total_drivers: parseInt(r.driver_total) || 0,
          carrier_operation: r.carrier_operation,
          hazmat: r.hm_flag === 'Y',
          authorized_for_hire: r.authorized_for_hire === 'Y',
          private_only: r.private_only === 'Y',
          mcs150_date: r.mcs150_date,
          recent_mileage: parseInt(r.recent_mileage) || 0,
          source: 'fmcsa_sms',
        };
        setCache(cacheKey, result);
        return result;
      }

      return { found: false, dot_number, mc_number, message: 'Carrier not found in FMCSA database' };
    }

    const r = data[0];
    const result = {
      found: true,
      dot_number: r.dot_number,
      mc_number: r.docket1prefix && r.docket1 ? `${r.docket1prefix}-${r.docket1}` : null,
      legal_name: r.legal_name,
      phone: r.phone,
      city: r.phy_city,
      state: r.phy_state,
      zip: r.phy_zip,
      street: r.phy_street,
      power_units: parseInt(r.power_units) || 0,
      truck_units: parseInt(r.truck_units) || 0,
      total_drivers: parseInt(r.total_drivers) || 0,
      total_cdl: parseInt(r.total_cdl) || 0,
      fleet_size: parseInt(r.fleetsize) || parseInt(r.power_units) || 0,
      carrier_operation: r.carrier_operation,
      hazmat: r.hm_ind === 'Y',
      business_type: r.business_org_desc,
      mcs150_mileage: parseInt(r.mcs150_mileage) || 0,
      status: r.status_code === 'A' ? 'active' : 'inactive',
      interstate_beyond_100: r.interstate_beyond_100_miles === 'X',
      interstate_within_100: r.interstate_within_100_miles === 'X',
      intrastate_beyond_100: r.intrastate_beyond_100_miles === 'X',
      source: 'fmcsa_census',
    };
    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[FMCSA] Lookup error:', err.message);
    throw new Error('FMCSA lookup failed: ' + err.message);
  }
}

/**
 * Layer 3: Compliance check — verify operating authority for existing carriers
 */
async function checkCompliance(carriers) {
  if (!Array.isArray(carriers) || carriers.length === 0) throw new Error('carriers array required');

  const results = [];
  // Rate limit: max 5 concurrent lookups
  const batchSize = 5;

  for (let i = 0; i < carriers.length; i += batchSize) {
    const batch = carriers.slice(i, i + batchSize);
    const promises = batch.map(async (carrier) => {
      try {
        const lookup = await lookupCarrier({
          dot_number: carrier.dot_number,
          mc_number: carrier.mc_number
        });

        if (!lookup.found) {
          return {
            carrier_id: carrier.id,
            carrier_name: carrier.carrier_name || carrier.company_name,
            dot_number: carrier.dot_number,
            mc_number: carrier.mc_number,
            status: 'NOT_FOUND',
            severity: 'critical',
            message: 'Carrier not found in FMCSA database',
          };
        }

        const issues = [];
        if (lookup.status !== 'active') {
          issues.push({ type: 'authority', severity: 'critical', message: `Operating authority is ${lookup.status}` });
        }
        if (lookup.authorized_for_hire === false && !lookup.private_only) {
          issues.push({ type: 'authority_type', severity: 'warning', message: 'Not authorized for hire' });
        }
        if (lookup.power_units === 0) {
          issues.push({ type: 'fleet', severity: 'warning', message: 'No power units registered' });
        }

        return {
          carrier_id: carrier.id,
          carrier_name: lookup.legal_name,
          dot_number: lookup.dot_number,
          mc_number: lookup.mc_number,
          status: issues.some(i => i.severity === 'critical') ? 'FAIL' : issues.length > 0 ? 'WARNING' : 'PASS',
          severity: issues.some(i => i.severity === 'critical') ? 'critical' : issues.length > 0 ? 'warning' : 'ok',
          fmcsa_status: lookup.status,
          power_units: lookup.power_units,
          total_drivers: lookup.total_drivers,
          city: lookup.city,
          state: lookup.state,
          issues,
          source: lookup.source,
          cached: lookup.cached || false,
        };
      } catch (err) {
        return {
          carrier_id: carrier.id,
          carrier_name: carrier.carrier_name || carrier.company_name,
          dot_number: carrier.dot_number,
          status: 'ERROR',
          severity: 'warning',
          message: err.message,
        };
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  const summary = {
    total: results.length,
    pass: results.filter(r => r.status === 'PASS').length,
    warning: results.filter(r => r.status === 'WARNING').length,
    fail: results.filter(r => r.status === 'FAIL').length,
    not_found: results.filter(r => r.status === 'NOT_FOUND').length,
    error: results.filter(r => r.status === 'ERROR').length,
  };

  return { results, summary };
}

/**
 * Get cache stats
 */
function getCacheStats() {
  return {
    entries: cache.size,
    searches: [...cache.keys()].filter(k => k.startsWith('search:')).length,
    lookups: [...cache.keys()].filter(k => k.startsWith('lookup:')).length,
  };
}

module.exports = { searchCarriers, lookupCarrier, checkCompliance, getCacheStats };
