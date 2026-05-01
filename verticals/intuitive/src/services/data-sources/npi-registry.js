'use strict';

// NPI Registry (NPPES) connector — surgeon roster lookup
// Public, free, no API key. https://npiregistry.cms.hhs.gov

const cache = require('./_cache');

const SURGERY_TAXONOMIES = [
  { code: '208600000X', label: 'General Surgery', specialty_key: 'general' },
  { code: '208800000X', label: 'Urology', specialty_key: 'urology' },
  { code: '207V00000X', label: 'Obstetrics & Gynecology', specialty_key: 'gynecology' },
  { code: '208G00000X', label: 'Thoracic Surgery (Cardiothoracic Vascular Surgery)', specialty_key: 'thoracic' },
  { code: '208C00000X', label: 'Colon & Rectal Surgery', specialty_key: 'colorectal' },
  { code: '207Y00000X', label: 'Otolaryngology', specialty_key: 'head_neck' },
  { code: '208200000X', label: 'Surgery — Plastic', specialty_key: 'plastic' },
  { code: '2086S0102X', label: 'Surgery — Surgical Oncology', specialty_key: 'oncology' },
  { code: '208VP0014X', label: 'Pain Medicine — Interventional', specialty_key: 'other' },
];

async function fetchPage(opts = {}) {
  const params = new URLSearchParams();
  params.set('version', '2.1');
  params.set('limit', String(opts.limit || 200));
  if (opts.postal_code) params.set('postal_code', opts.postal_code);
  if (opts.state) params.set('state', opts.state);
  if (opts.taxonomy_description) params.set('taxonomy_description', opts.taxonomy_description);
  if (opts.first_name) params.set('first_name', opts.first_name);
  if (opts.last_name) params.set('last_name', opts.last_name);
  if (opts.skip) params.set('skip', String(opts.skip));
  // enumeration_type=NPI-1 is individual providers (vs NPI-2 organizations)
  params.set('enumeration_type', 'NPI-1');

  const url = `https://npiregistry.cms.hhs.gov/api/?${params.toString()}`;
  const r = await cache.fetchWithRetry(url, { headers: { 'Accept': 'application/json' } }, 10000, 1);
  if (!r.ok) throw new Error(`NPI Registry HTTP ${r.status}`);
  return r.json();
}

function normalizeAddress(addr) {
  if (!addr) return '';
  return String(addr).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function streetMatch(npiAddress, hospitalAddress) {
  if (!hospitalAddress) return true; // accept all if no hospital address provided
  const a = normalizeAddress(npiAddress);
  const b = normalizeAddress(hospitalAddress);
  if (!a || !b) return false;
  // require shared house-number + first significant street word
  const aTokens = a.split(' ');
  const bTokens = b.split(' ');
  const aNum = aTokens[0];
  const bNum = bTokens[0];
  if (/^\d+$/.test(aNum) && /^\d+$/.test(bNum) && aNum !== bNum) return false;
  // count shared tokens
  const shared = aTokens.filter(t => bTokens.includes(t));
  return shared.length >= 2;
}

function classifyTaxonomy(taxonomyCode, taxonomyDesc) {
  for (const t of SURGERY_TAXONOMIES) {
    if (t.code === taxonomyCode) return t;
  }
  // partial match on description
  const desc = String(taxonomyDesc || '').toLowerCase();
  if (/urolog/.test(desc)) return SURGERY_TAXONOMIES.find(x => x.specialty_key === 'urology');
  if (/obstet|gynecolog/.test(desc)) return SURGERY_TAXONOMIES.find(x => x.specialty_key === 'gynecology');
  if (/colon|rectal/.test(desc)) return SURGERY_TAXONOMIES.find(x => x.specialty_key === 'colorectal');
  if (/thoracic|cardiothoracic/.test(desc)) return SURGERY_TAXONOMIES.find(x => x.specialty_key === 'thoracic');
  if (/otolaryngolog/.test(desc)) return SURGERY_TAXONOMIES.find(x => x.specialty_key === 'head_neck');
  if (/general\s+surger/.test(desc)) return SURGERY_TAXONOMIES.find(x => x.specialty_key === 'general');
  return null;
}

async function fetchFor(hospitalName, state, opts = {}) {
  const log = (...m) => console.log('[DataSource:NPI]', ...m);
  if (!state) {
    return { data: { surgeons: [], confirmed_surgeon_count_by_specialty: {} }, citations: [], error: 'state required' };
  }
  const cacheKey = `${hospitalName}|${state}|${opts.zip || ''}`;
  const cached = await cache.get(opts.models, 'npi-registry', cacheKey);
  if (cached) {
    log(`cache hit for ${hospitalName}`);
    return cached;
  }

  const surgeons = [];
  const seen = new Set();

  try {
    // Strategy: query ZIP + each surgical taxonomy. Most ZIPs return <50 providers per taxonomy.
    const queries = [];
    for (const t of SURGERY_TAXONOMIES) {
      queries.push({ postal_code: opts.zip, state, taxonomy_description: t.label.split(' ')[0] });
    }
    // If no zip, fall back to state-wide query (will be noisy but at least returns something).
    if (!opts.zip) {
      queries.length = 0;
      queries.push({ state, taxonomy_description: 'Surgery' });
    }

    for (const q of queries.slice(0, 8)) { // cap parallel calls
      try {
        const result = await fetchPage(q);
        const list = result.results || [];
        for (const r of list) {
          const npi = String(r.number);
          if (seen.has(npi)) continue;
          const basic = r.basic || {};
          const taxonomies = r.taxonomies || [];
          const primary = taxonomies.find(t => t.primary) || taxonomies[0];
          if (!primary) continue;
          const cls = classifyTaxonomy(primary.code, primary.desc);
          if (!cls) continue;
          const addresses = r.addresses || [];
          const practice = addresses.find(a => a.address_purpose === 'LOCATION') || addresses[0];
          const practiceStreet = practice ? `${practice.address_1 || ''} ${practice.address_2 || ''}` : '';
          if (opts.address && !streetMatch(practiceStreet, opts.address)) continue;
          seen.add(npi);
          surgeons.push({
            npi,
            full_name: `${basic.first_name || ''} ${basic.last_name || ''}`.trim(),
            credential: basic.credential || '',
            specialty_taxonomy: primary.code,
            specialty_label: cls.label,
            specialty_key: cls.specialty_key,
            license_state: primary.state || '',
            practice_address: practice ? `${practiceStreet}, ${practice.city || ''}, ${practice.state || ''} ${practice.postal_code || ''}` : '',
          });
        }
      } catch (e) {
        log(`query failed (${q.taxonomy_description}): ${e.message}`);
      }
    }

    // Aggregate by specialty
    const counts = {};
    for (const s of surgeons) {
      counts[s.specialty_key] = (counts[s.specialty_key] || 0) + 1;
    }

    const result = {
      data: {
        surgeons,
        confirmed_surgeon_count_by_specialty: counts,
        total_surgeons_found: surgeons.length,
      },
      citations: [{
        field: 'credentialed_robotic_surgeons',
        value: surgeons.length,
        source_name: 'NPI Registry (NPPES)',
        source_url: 'https://npiregistry.cms.hhs.gov/',
        last_updated_at: new Date().toISOString().slice(0, 10),
        confidence: 'confirmed',
      }],
    };

    await cache.set(opts.models, 'npi-registry', cacheKey, result);
    log(`fetched ${surgeons.length} surgeons for ${hospitalName} (${state})`);
    return result;
  } catch (e) {
    log(`error: ${e.message}`);
    return { data: null, citations: [], error: e.message };
  }
}

module.exports = { fetchFor, SURGERY_TAXONOMIES };
