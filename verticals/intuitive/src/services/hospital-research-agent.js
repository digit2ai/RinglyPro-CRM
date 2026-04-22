'use strict';

/**
 * AI Business Analyst Agent — 4-Pass Maker-Checker Architecture
 *
 * Pass 0: DATA GATHERER (code) — CMS API + web search + cache + reference data
 * Pass 1: MAKER (Opus) — researches hospital with real-time context
 * Pass 2: CHECKER (Opus) — validates maker output against reference data
 * Pass 3: DETERMINISTIC VALIDATOR (code) — hard math rules, normalization
 *
 * Designed for CFO-grade accuracy in hospital profiling.
 */

const fs = require('fs');
const path = require('path');

// ── Lazy-loaded dependencies ──────────────────────────────────────────
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const OPUS_MODEL = 'claude-opus-4-20250514';

// ── Research Cache (7-day TTL) ────────────────────────────────────────
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const researchCache = new Map();

function normalizeHospitalName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function getCachedResearch(hospitalName) {
  const key = normalizeHospitalName(hospitalName);
  const cached = researchCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.data;
  }
  researchCache.delete(key);
  return null;
}

function setCachedResearch(hospitalName, data) {
  const key = normalizeHospitalName(hospitalName);
  researchCache.set(key, { data, timestamp: Date.now() });
}

// ── Industry Benchmarks ───────────────────────────────────────────────
const INDUSTRY_BENCHMARKS = {
  academic: {
    volume_per_bed: { min: 30, typical: 40, max: 55 },
    robotic_adoption_pct: 25,
    specialty_mix: { urology: 20, gynecology: 20, general: 25, thoracic: 10, colorectal: 10, head_neck: 5, cardiac: 10 },
    surgeons_per_100_beds: { credentialed: 2.5, interested: 4 },
    or_per_100_beds: 3,
    robot_ready_or_pct: 30,
    los_days: 4.5, complication_pct: 4.5, readmission_pct: 12,
    payer: { medicare: 35, commercial: 40, medicaid: 15, self_pay: 5 }
  },
  community: {
    volume_per_bed: { min: 18, typical: 25, max: 35 },
    robotic_adoption_pct: 15,
    specialty_mix: { urology: 25, gynecology: 25, general: 30, thoracic: 5, colorectal: 10, head_neck: 3, cardiac: 2 },
    surgeons_per_100_beds: { credentialed: 1.5, interested: 3 },
    or_per_100_beds: 2.5,
    robot_ready_or_pct: 20,
    los_days: 3.8, complication_pct: 5, readmission_pct: 13,
    payer: { medicare: 40, commercial: 35, medicaid: 15, self_pay: 10 }
  },
  specialty: {
    volume_per_bed: { min: 35, typical: 50, max: 70 },
    robotic_adoption_pct: 30,
    specialty_mix: { urology: 15, gynecology: 15, general: 20, thoracic: 15, colorectal: 10, head_neck: 10, cardiac: 15 },
    surgeons_per_100_beds: { credentialed: 3, interested: 5 },
    or_per_100_beds: 4,
    robot_ready_or_pct: 40,
    los_days: 3.5, complication_pct: 3.5, readmission_pct: 10,
    payer: { medicare: 30, commercial: 50, medicaid: 10, self_pay: 10 }
  },
  VA: {
    volume_per_bed: { min: 15, typical: 20, max: 28 },
    robotic_adoption_pct: 10,
    specialty_mix: { urology: 30, gynecology: 5, general: 35, thoracic: 10, colorectal: 10, head_neck: 5, cardiac: 5 },
    surgeons_per_100_beds: { credentialed: 1, interested: 2 },
    or_per_100_beds: 2,
    robot_ready_or_pct: 15,
    los_days: 5, complication_pct: 5.5, readmission_pct: 14,
    payer: { medicare: 0, commercial: 0, medicaid: 0, self_pay: 0 }
  },
  rural: {
    volume_per_bed: { min: 10, typical: 15, max: 22 },
    robotic_adoption_pct: 5,
    specialty_mix: { urology: 20, gynecology: 25, general: 40, thoracic: 3, colorectal: 7, head_neck: 2, cardiac: 3 },
    surgeons_per_100_beds: { credentialed: 0.5, interested: 1.5 },
    or_per_100_beds: 1.5,
    robot_ready_or_pct: 10,
    los_days: 3.5, complication_pct: 5.5, readmission_pct: 14,
    payer: { medicare: 45, commercial: 25, medicaid: 20, self_pay: 10 }
  }
};

// National robotic-to-open ratios (from top_25 reference data)
const NATIONAL_ROBOTIC_RATIOS = {
  urology: { robotic_pct: 42, source: 'AUA 2024 -- prostatectomy 94.8% robotic, overall urology ~40-45%' },
  gynecology: { robotic_pct: 28, source: 'AAGL/PMC -- hysterectomy ~61% robotic, overall GYN ~25-30%' },
  general: { robotic_pct: 22, source: 'iData Research 2025 -- hernia/chole fastest growing' },
  thoracic: { robotic_pct: 18, source: 'STS Database -- lobectomy growing robotic adoption' },
  colorectal: { robotic_pct: 17, source: 'PMC -- colectomy grew from 1.5% (2012) to ~15-20% (2024)' },
  head_neck: { robotic_pct: 12, source: 'TORS adoption estimates' },
  cardiac: { robotic_pct: 8, source: 'STS -- CABG/mitral valve still early robotic adoption' }
};

// Known hospital system sizes for validation
const KNOWN_SYSTEMS = {
  'adventhealth': { min_beds: 100, max_beds: 500, type: 'community', typical_beds: 250 },
  'hca': { min_beds: 100, max_beds: 600, type: 'community', typical_beds: 300 },
  'ascension': { min_beds: 100, max_beds: 500, type: 'community', typical_beds: 250 },
  'commonspirit': { min_beds: 100, max_beds: 500, type: 'community', typical_beds: 250 },
  'mayo clinic': { min_beds: 200, max_beds: 2000, type: 'academic', typical_beds: 600 },
  'cleveland clinic': { min_beds: 200, max_beds: 1400, type: 'academic', typical_beds: 500 },
  'johns hopkins': { min_beds: 800, max_beds: 1200, type: 'academic', typical_beds: 1000 },
  'orlando health': { min_beds: 600, max_beds: 1000, type: 'academic', typical_beds: 808 },
  'tampa general': { min_beds: 900, max_beds: 1200, type: 'academic', typical_beds: 1041 },
  'memorial hermann': { min_beds: 200, max_beds: 700, type: 'community', typical_beds: 400 },
  'baptist health': { min_beds: 150, max_beds: 600, type: 'community', typical_beds: 300 },
  'mount sinai': { min_beds: 800, max_beds: 1200, type: 'academic', typical_beds: 1000 },
  'northwell': { min_beds: 200, max_beds: 900, type: 'academic', typical_beds: 500 },
  'intermountain': { min_beds: 100, max_beds: 500, type: 'community', typical_beds: 250 }
};

// ══════════════════════════════════════════════════════════════════════
// PASS 0: DATA GATHERER (code, no AI)
// ══════════════════════════════════════════════════════════════════════
async function gatherExternalData(hospitalName, state, progress) {
  const externalData = {
    cms_metrics: null,
    cms_provider: null,
    web_search_results: null,
    known_system_bounds: null,
    national_ratios: NATIONAL_ROBOTIC_RATIOS
  };

  // 1. CMS Hospital Compare lookup
  progress('Pass 0: Fetching CMS Hospital Compare data...');
  try {
    const cmsClient = require('./cms-hospital-compare');
    const cmsResult = await cmsClient.fetchAllForHospital(hospitalName, state || '');
    if (cmsResult && cmsResult.provider) {
      externalData.cms_provider = cmsResult.provider;
      externalData.cms_metrics = cmsResult.metrics || [];
      progress('Pass 0: CMS data found -- provider ID: ' + (cmsResult.provider.provider_id || 'N/A') + ', ' + (cmsResult.metrics || []).length + ' metrics');
    } else {
      progress('Pass 0: CMS lookup -- hospital not found in CMS database');
    }
  } catch (e) {
    progress('Pass 0: CMS fetch skipped (' + e.message + ')');
  }

  // 2. Web search for recent data (Brave Search or fallback)
  progress('Pass 0: Searching web for recent hospital data...');
  try {
    const searchQueries = [
      `"${hospitalName}" licensed beds 2024 2025 2026`,
      `"${hospitalName}" da Vinci robotic surgery program`
    ];
    const searchResults = [];

    for (const query of searchQueries) {
      try {
        // Try Brave Search API first if available
        if (process.env.BRAVE_SEARCH_API_KEY) {
          const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`, {
            headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY, 'Accept': 'application/json' }
          });
          if (resp.ok) {
            const data = await resp.json();
            const snippets = (data.web?.results || []).map(r => r.title + ': ' + r.description).join('\n');
            if (snippets) { searchResults.push({ query, snippets }); continue; }
          }
        }

        // Fallback: DuckDuckGo HTML search (no API key needed)
        const ddgResp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'SurgicalMind AI Research Agent/1.0' }
        });
        if (ddgResp.ok) {
          const html = await ddgResp.text();
          // Extract result snippets from DDG HTML response
          const snippetMatches = html.match(/class="result__snippet"[^>]*>(.*?)<\//g) || [];
          const titleMatches = html.match(/class="result__a"[^>]*>(.*?)<\//g) || [];
          const snippets = snippetMatches.slice(0, 5).map((s, i) => {
            const title = (titleMatches[i] || '').replace(/<[^>]+>/g, '').replace(/class="[^"]*"/g, '').trim();
            const snippet = s.replace(/<[^>]+>/g, '').replace(/class="[^"]*"/g, '').trim();
            return (title ? title + ': ' : '') + snippet;
          }).filter(s => s.length > 10).join('\n');
          if (snippets) searchResults.push({ query, snippets, source: 'duckduckgo' });
        }
      } catch (e) { /* search failed, continue */ }
    }

    if (searchResults.length > 0) {
      externalData.web_search_results = searchResults;
      progress('Pass 0: Web search found ' + searchResults.length + ' result sets');
    } else {
      progress('Pass 0: Web search -- no results found');
    }
  } catch (e) {
    progress('Pass 0: Web search skipped');
  }

  // 3. Check known hospital system bounds
  const nameLower = hospitalName.toLowerCase();
  for (const [system, bounds] of Object.entries(KNOWN_SYSTEMS)) {
    if (nameLower.includes(system)) {
      externalData.known_system_bounds = { system_name: system, ...bounds };
      progress('Pass 0: Matched known system "' + system + '" -- typical beds: ' + bounds.typical_beds);
      break;
    }
  }

  return externalData;
}

// ══════════════════════════════════════════════════════════════════════
// PASS 1: MAKER (Opus -- research with real-time context)
// ══════════════════════════════════════════════════════════════════════
async function runMaker(hospitalName, externalData, progress) {
  progress('Pass 1 (Maker): Opus researching hospital with real-time data context...');

  // Build context from Pass 0
  let contextBlock = '';

  if (externalData.cms_provider) {
    contextBlock += `\n\nCMS HOSPITAL COMPARE DATA (verified, use this):\n`;
    contextBlock += `Provider ID: ${externalData.cms_provider.provider_id || 'N/A'}\n`;
    contextBlock += `Official Name: ${externalData.cms_provider.hospital_name || 'N/A'}\n`;
    contextBlock += `Address: ${externalData.cms_provider.address || ''}, ${externalData.cms_provider.city || ''}, ${externalData.cms_provider.state || ''}\n`;
    contextBlock += `Hospital Type: ${externalData.cms_provider.hospital_type || 'N/A'}\n`;
    contextBlock += `Ownership: ${externalData.cms_provider.ownership || 'N/A'}\n`;
    if (externalData.cms_provider.overall_rating) contextBlock += `CMS Overall Rating: ${externalData.cms_provider.overall_rating}/5 stars\n`;
  }

  if (externalData.cms_metrics && externalData.cms_metrics.length > 0) {
    contextBlock += `\nCMS QUALITY METRICS (${externalData.cms_metrics.length} measures):\n`;
    externalData.cms_metrics.slice(0, 10).forEach(m => {
      contextBlock += `- ${m.measure_name || m.measure_id}: score=${m.score}, national_avg=${m.national_avg}, comparison=${m.comparison}\n`;
    });
  }

  if (externalData.web_search_results && externalData.web_search_results.length > 0) {
    contextBlock += `\nRECENT WEB SEARCH RESULTS:\n`;
    externalData.web_search_results.forEach(r => {
      contextBlock += `Query: "${r.query}"\n${r.snippets}\n\n`;
    });
  }

  if (externalData.known_system_bounds) {
    const ksb = externalData.known_system_bounds;
    contextBlock += `\nKNOWN HOSPITAL SYSTEM DATA:\n`;
    contextBlock += `System: ${ksb.system_name} -- typical beds per facility: ${ksb.typical_beds} (range: ${ksb.min_beds}-${ksb.max_beds}), typical type: ${ksb.type}\n`;
  }

  contextBlock += `\nNATIONAL ROBOTIC-TO-OPEN RATIOS (use for specialty robotic estimates):\n`;
  for (const [spec, data] of Object.entries(NATIONAL_ROBOTIC_RATIOS)) {
    contextBlock += `- ${spec}: ~${data.robotic_pct}% robotic nationally (${data.source})\n`;
  }

  const researchPrompt = `You are researching "${hospitalName}" to build a da Vinci robotic surgery business plan.

${contextBlock}

Using the VERIFIED DATA above (CMS, web search, known system data) AND your training knowledge, provide the following. For each field, indicate if the value is CONFIRMED (from CMS/verified source) or ESTIMATED (your best assessment).

Return ONLY a valid JSON object with these exact fields:

{
  "hospital_name": "Official full name",
  "hospital_type": "academic OR community OR specialty OR rural OR VA OR military",
  "bed_count": number,
  "bed_count_confidence": "confirmed OR estimated",
  "bed_count_source": "where this number comes from",
  "state": "2-letter state code",
  "country": "United States",
  "annual_surgical_volume": number,
  "annual_surgical_volume_confidence": "confirmed OR estimated",
  "current_robotic_cases": number,
  "current_robotic_cases_confidence": "confirmed OR estimated",
  "current_system": "none OR dV5 OR Xi OR X OR SP OR Si OR competitor",
  "current_system_count": number,
  "current_system_age_years": number or null,
  "specialty_urology": number,
  "specialty_gynecology": number,
  "specialty_general": number,
  "specialty_thoracic": number,
  "specialty_colorectal": number,
  "specialty_head_neck": number,
  "specialty_cardiac": number,
  "credentialed_robotic_surgeons": number,
  "surgeons_interested": number,
  "convertible_lap_cases": number,
  "total_or_count": number,
  "robot_ready_ors": number,
  "or_sqft": number,
  "ceiling_height_ft": number,
  "capital_budget": "<1M OR 1-2M OR 2-3M OR 3M+",
  "acquisition_preference": "purchase OR lease OR usage_based",
  "avg_los_days": number,
  "complication_rate_pct": number,
  "readmission_rate_pct": number,
  "payer_medicare_pct": number,
  "payer_commercial_pct": number,
  "payer_medicaid_pct": number,
  "payer_self_pay_pct": number,
  "value_based_contract_pct": number,
  "competitor_robot_nearby": boolean,
  "competitor_details": "string",
  "primary_goal": "volume_growth OR cost_reduction OR competitive OR quality OR recruitment",
  "notes": "Key facts, recent expansions, robotic program history, Magnet status",
  "research_sources": ["list"],
  "confidence_level": "high OR medium OR low",
  "data_notes": "What was confirmed vs estimated",
  "field_confidence": {}
}

The "field_confidence" object should map each major field to "confirmed" or "estimated":
{ "bed_count": "confirmed", "annual_surgical_volume": "estimated", ... }

IMPORTANT:
- USE CMS DATA when available -- it is the most reliable source
- Specialty percentages MUST sum to exactly 100
- Bed count: use LICENSED beds, account for recent expansions
- Surgical volume must be proportional to bed count (20-50/bed/year)
- Return ONLY the JSON object`;

  const message = await getAnthropic().messages.create({
    model: OPUS_MODEL,
    max_tokens: 5000,
    system: 'You are a senior hospital business intelligence analyst. ACCURACY IS PARAMOUNT -- this data will be presented to hospital CFOs. Use the verified CMS and web data provided. When data is confirmed from a source, mark it confirmed. When you estimate, explain your reasoning. Return only valid JSON.',
    messages: [{ role: 'user', content: researchPrompt }]
  });

  const content = (message.content[0]?.text || '').trim();
  const jsonStr = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const makerData = JSON.parse(jsonStr);

  const confirmedFields = Object.values(makerData.field_confidence || {}).filter(v => v === 'confirmed').length;
  const totalFields = Object.keys(makerData.field_confidence || {}).length;
  progress('Pass 1 complete -- ' + (makerData.hospital_name || hospitalName) + ', ' + makerData.bed_count + ' beds, ' + confirmedFields + '/' + totalFields + ' fields confirmed');

  return makerData;
}

// ══════════════════════════════════════════════════════════════════════
// PASS 2: CHECKER (Opus -- validate against reference data)
// ══════════════════════════════════════════════════════════════════════
async function runChecker(hospitalName, makerData, externalData, progress) {
  progress('Pass 2 (Checker): Opus validating against reference data...');

  const bench = INDUSTRY_BENCHMARKS[makerData.hospital_type] || INDUSTRY_BENCHMARKS.community;

  const checkerPrompt = `You are a QUALITY ASSURANCE REVIEWER for hospital business intelligence. Review this profile for "${hospitalName}".

MAKER'S OUTPUT:
${JSON.stringify(makerData, null, 2)}

VALIDATION REFERENCE DATA:

1. INDUSTRY BENCHMARKS for "${makerData.hospital_type}" hospitals:
   - Surgical volume/bed: ${bench.volume_per_bed.min}-${bench.volume_per_bed.max} (typical: ${bench.volume_per_bed.typical})
   - Robotic adoption: ~${bench.robotic_adoption_pct}%
   - Surgeons/100 beds: ${bench.surgeons_per_100_beds.credentialed} credentialed
   - ORs/100 beds: ${bench.or_per_100_beds}

2. KNOWN SYSTEM BOUNDS: ${externalData.known_system_bounds ? JSON.stringify(externalData.known_system_bounds) : 'None matched'}

3. CMS VERIFIED DATA: ${externalData.cms_provider ? 'Provider found: ' + (externalData.cms_provider.hospital_name || 'N/A') : 'No CMS match'}

4. NATIONAL ROBOTIC RATIOS:
${Object.entries(NATIONAL_ROBOTIC_RATIOS).map(([s, d]) => `   - ${s}: ~${d.robotic_pct}% robotic`).join('\n')}

YOUR VALIDATION CHECKLIST:
- bed_count: Is it within the known system bounds? Is it licensed (not staffed)?
- annual_surgical_volume / bed_count = ${makerData.annual_surgical_volume || 0} / ${makerData.bed_count || 1} = ${Math.round((makerData.annual_surgical_volume || 0) / Math.max(makerData.bed_count || 1, 1))} surgeries/bed. Is this in the ${bench.volume_per_bed.min}-${bench.volume_per_bed.max} range?
- Specialty percentages sum: ${['specialty_urology', 'specialty_gynecology', 'specialty_general', 'specialty_thoracic', 'specialty_colorectal', 'specialty_head_neck', 'specialty_cardiac'].reduce((s, f) => s + (makerData[f] || 0), 0)}. Must be exactly 100.
- Payer percentages sum: ${(makerData.payer_medicare_pct || 0) + (makerData.payer_commercial_pct || 0) + (makerData.payer_medicaid_pct || 0) + (makerData.payer_self_pay_pct || 0)}. Should be ~100.
- current_robotic_cases (${makerData.current_robotic_cases || 0}) <= annual_surgical_volume * 0.8 (${Math.round((makerData.annual_surgical_volume || 0) * 0.8)})?
- robot_ready_ors (${makerData.robot_ready_ors || 0}) <= total_or_count (${makerData.total_or_count || 0})?
- credentialed_robotic_surgeons (${makerData.credentialed_robotic_surgeons || 0}) * 400 >= current_robotic_cases (${makerData.current_robotic_cases || 0})? Each surgeon maxes ~350-400 cases/yr.

CORRECT any values that fail these checks. Return the corrected JSON with a "checker_corrections" field (array of strings).
Return ONLY valid JSON.`;

  const message = await getAnthropic().messages.create({
    model: OPUS_MODEL,
    max_tokens: 5000,
    system: 'You are a meticulous QA reviewer. Catch errors using the reference data and math checks provided. Only correct values that are clearly wrong. Return only valid JSON.',
    messages: [{ role: 'user', content: checkerPrompt }]
  });

  const content = (message.content[0]?.text || '').trim();
  const jsonStr = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const checkerData = JSON.parse(jsonStr);

  const corrections = checkerData.checker_corrections || [];
  if (corrections.length > 0) {
    progress('Pass 2 found ' + corrections.length + ' correction(s): ' + corrections.slice(0, 2).join('; '));
  } else {
    progress('Pass 2 -- all values validated, no corrections needed');
  }

  return checkerData;
}

// ══════════════════════════════════════════════════════════════════════
// PASS 3: DETERMINISTIC VALIDATOR (code, no AI)
// ══════════════════════════════════════════════════════════════════════
function runDeterministicValidator(data, progress) {
  progress('Pass 3 (Validator): Running deterministic math checks...');
  const issues = [];
  const type = data.hospital_type || 'community';
  const bench = INDUSTRY_BENCHMARKS[type] || INDUSTRY_BENCHMARKS.community;
  const beds = data.bed_count || 200;

  // 1. Specialty percentages must sum to exactly 100
  const specFields = ['specialty_urology', 'specialty_gynecology', 'specialty_general',
    'specialty_thoracic', 'specialty_colorectal', 'specialty_head_neck', 'specialty_cardiac'];
  let specSum = specFields.reduce((s, f) => s + (data[f] || 0), 0);
  if (specSum === 0) {
    const bm = bench.specialty_mix;
    specFields.forEach(f => { data[f] = bm[f.replace('specialty_', '')] || 0; });
    issues.push('FIXED: Specialty mix was all zeros -- applied ' + type + ' benchmarks');
    specSum = 100;
  } else if (Math.abs(specSum - 100) > 0.5) {
    const factor = 100 / specSum;
    specFields.forEach(f => { data[f] = Math.round((data[f] || 0) * factor); });
    const newSum = specFields.reduce((s, f) => s + data[f], 0);
    data.specialty_general = (data.specialty_general || 0) + (100 - newSum);
    issues.push('FIXED: Specialty sum was ' + specSum + ' -- normalized to 100');
  }

  // 2. Payer mix must sum to ~100
  const payerSum = (data.payer_medicare_pct || 0) + (data.payer_commercial_pct || 0) +
    (data.payer_medicaid_pct || 0) + (data.payer_self_pay_pct || 0);
  if (payerSum === 0) {
    data.payer_medicare_pct = bench.payer.medicare;
    data.payer_commercial_pct = bench.payer.commercial;
    data.payer_medicaid_pct = bench.payer.medicaid;
    data.payer_self_pay_pct = bench.payer.self_pay;
    issues.push('FIXED: Payer mix was all zeros -- applied ' + type + ' benchmarks');
  } else if (Math.abs(payerSum - 100) > 10) {
    const factor = 100 / payerSum;
    data.payer_medicare_pct = Math.round((data.payer_medicare_pct || 0) * factor);
    data.payer_commercial_pct = Math.round((data.payer_commercial_pct || 0) * factor);
    data.payer_medicaid_pct = Math.round((data.payer_medicaid_pct || 0) * factor);
    data.payer_self_pay_pct = 100 - data.payer_medicare_pct - data.payer_commercial_pct - data.payer_medicaid_pct;
    issues.push('FIXED: Payer sum was ' + payerSum + ' -- normalized to 100');
  }

  // 3. Surgical volume proportional to bed count
  const volumePerBed = beds > 0 ? Math.round(data.annual_surgical_volume / beds) : 0;
  if (!data.annual_surgical_volume || data.annual_surgical_volume === 0) {
    data.annual_surgical_volume = Math.round(beds * bench.volume_per_bed.typical);
    issues.push('FIXED: Surgical volume was 0 -- set to ' + data.annual_surgical_volume + ' (' + bench.volume_per_bed.typical + '/bed)');
  } else if (volumePerBed < bench.volume_per_bed.min * 0.7) {
    const corrected = Math.round(beds * bench.volume_per_bed.min);
    issues.push('FLAG: Volume/bed ratio (' + volumePerBed + ') below minimum (' + bench.volume_per_bed.min + '). Was ' + data.annual_surgical_volume + ', corrected to ' + corrected);
    data.annual_surgical_volume = corrected;
  } else if (volumePerBed > bench.volume_per_bed.max * 1.3) {
    const corrected = Math.round(beds * bench.volume_per_bed.max);
    issues.push('FLAG: Volume/bed ratio (' + volumePerBed + ') above maximum (' + bench.volume_per_bed.max + '). Was ' + data.annual_surgical_volume + ', corrected to ' + corrected);
    data.annual_surgical_volume = corrected;
  }

  // 4. Robotic cases cannot exceed 80% of total volume
  if (data.current_robotic_cases > data.annual_surgical_volume * 0.8) {
    const corrected = Math.round(data.annual_surgical_volume * 0.4);
    issues.push('FIXED: Robotic cases (' + data.current_robotic_cases + ') > 80% of volume. Set to ' + corrected);
    data.current_robotic_cases = corrected;
  }

  // 5. Robot-ready ORs cannot exceed total ORs
  if (!data.total_or_count) data.total_or_count = Math.max(4, Math.round(beds * bench.or_per_100_beds / 100));
  if (!data.robot_ready_ors) data.robot_ready_ors = Math.max(1, Math.round(data.total_or_count * bench.robot_ready_or_pct / 100));
  if (data.robot_ready_ors > data.total_or_count) {
    issues.push('FIXED: Robot-ready ORs (' + data.robot_ready_ors + ') > total ORs (' + data.total_or_count + ')');
    data.robot_ready_ors = Math.min(data.robot_ready_ors, data.total_or_count);
  }

  // 6. Surgeon capacity check
  if (!data.credentialed_robotic_surgeons) {
    data.credentialed_robotic_surgeons = Math.max(1, Math.round(beds * bench.surgeons_per_100_beds.credentialed / 100));
  }
  if (data.current_robotic_cases > 0 && data.credentialed_robotic_surgeons * 400 < data.current_robotic_cases) {
    const needed = Math.ceil(data.current_robotic_cases / 350);
    issues.push('FLAG: ' + data.credentialed_robotic_surgeons + ' surgeons cannot do ' + data.current_robotic_cases + ' cases (max ~350/surgeon/yr). Adjusted to ' + needed);
    data.credentialed_robotic_surgeons = needed;
  }
  if (!data.surgeons_interested) data.surgeons_interested = Math.round(beds * bench.surgeons_per_100_beds.interested / 100);

  // 7. Fill remaining gaps
  if (!data.convertible_lap_cases) data.convertible_lap_cases = Math.round(data.annual_surgical_volume * 0.3);
  if (!data.or_sqft) data.or_sqft = 600;
  if (!data.ceiling_height_ft) data.ceiling_height_ft = 10;
  if (!data.avg_los_days) data.avg_los_days = bench.los_days;
  if (!data.complication_rate_pct) data.complication_rate_pct = bench.complication_pct;
  if (!data.readmission_rate_pct) data.readmission_rate_pct = bench.readmission_pct;
  if (!data.capital_budget) data.capital_budget = beds > 400 ? '3M+' : beds > 200 ? '2-3M' : '1-2M';
  if (!data.acquisition_preference) data.acquisition_preference = 'purchase';
  if (!data.primary_goal) data.primary_goal = 'volume_growth';
  if (!data.value_based_contract_pct) data.value_based_contract_pct = 20;

  // 8. Compute final per-field confidence
  const fieldConfidence = data.field_confidence || {};
  const confirmedCount = Object.values(fieldConfidence).filter(v => v === 'confirmed').length;
  const totalMajorFields = 10; // bed_count, volume, robotic, system, specialties, surgeons, ORs, payer, LOS, readmission
  if (confirmedCount >= 7) data.confidence_level = 'high';
  else if (confirmedCount >= 4) data.confidence_level = 'medium';
  else data.confidence_level = 'low';

  if (issues.length > 0) {
    progress('Pass 3 applied ' + issues.length + ' fix(es): ' + issues.slice(0, 2).join('; '));
  } else {
    progress('Pass 3 -- all math checks passed');
  }

  data.deterministic_fixes = issues;
  return data;
}

// ══════════════════════════════════════════════════════════════════════
// MAIN: researchHospital (4-pass orchestrator)
// ══════════════════════════════════════════════════════════════════════
async function researchHospital(hospitalName, progressCallback) {
  const progress = progressCallback || (() => {});
  progress('Starting 4-pass research for: ' + hospitalName);

  // Check cache first
  const cached = getCachedResearch(hospitalName);
  if (cached) {
    progress('Cache hit -- using cached research (< 7 days old)');
    return cached;
  }

  let researchData;
  try {
    // Pass 0: Gather external data
    const externalData = await gatherExternalData(hospitalName, null, progress);

    // Pass 1: Maker
    const makerData = await runMaker(hospitalName, externalData, progress);

    // Pass 2: Checker
    const checkerData = await runChecker(hospitalName, makerData, externalData, progress);

    // Pass 3: Deterministic validator
    researchData = runDeterministicValidator(checkerData, progress);

    // Merge sources
    researchData.research_sources = [
      ...(makerData.research_sources || []),
      ...(checkerData.research_sources || []),
      ...(externalData.cms_provider ? ['CMS Hospital Compare API'] : []),
      ...(externalData.web_search_results ? ['Web search results'] : [])
    ].filter((v, i, a) => a.indexOf(v) === i);

    // Add validation metadata
    researchData.data_notes = (researchData.data_notes || '') +
      ' | 4-Pass validated: Pass 0 (data gather), Pass 1 (Opus maker), Pass 2 (Opus checker' +
      (researchData.checker_corrections?.length ? ', ' + researchData.checker_corrections.length + ' corrections' : '') +
      '), Pass 3 (deterministic' +
      (researchData.deterministic_fixes?.length ? ', ' + researchData.deterministic_fixes.length + ' fixes' : '') + ')';

    progress('4-pass research complete -- confidence: ' + (researchData.confidence_level || 'medium'));
  } catch (err) {
    console.error('4-pass research error:', err);
    progress('Research error, using fallback: ' + err.message);
    researchData = buildFallbackProfile(hospitalName);
  }

  // Note: retry disabled to prevent infinite loops on API failures.
  // Low-confidence profiles proceed with fallback benchmarks.

  // Build final project data and cache
  const projectData = buildProjectData(researchData);
  setCachedResearch(hospitalName, projectData);

  progress('Research complete for ' + projectData.hospital_name);
  return projectData;
}

// ── Fallback Profile ──────────────────────────────────────────────────
function buildFallbackProfile(hospitalName) {
  const nameLower = hospitalName.toLowerCase();
  let type = 'community', beds = 250;

  if (nameLower.includes('university') || nameLower.includes('academic') || nameLower.includes('medical center')) { type = 'academic'; beds = 600; }
  else if (nameLower.includes('va ') || nameLower.includes('veterans')) { type = 'VA'; beds = 200; }
  else if (nameLower.includes('children') || nameLower.includes('specialty') || nameLower.includes('cancer')) { type = 'specialty'; beds = 150; }

  // Check known systems
  for (const [system, bounds] of Object.entries(KNOWN_SYSTEMS)) {
    if (nameLower.includes(system)) { beds = bounds.typical_beds; type = bounds.type; break; }
  }

  const bench = INDUSTRY_BENCHMARKS[type] || INDUSTRY_BENCHMARKS.community;
  return {
    hospital_name: hospitalName, hospital_type: type, bed_count: beds,
    state: 'FL', country: 'United States',
    annual_surgical_volume: Math.round(beds * bench.volume_per_bed.typical),
    current_robotic_cases: Math.round(beds * bench.volume_per_bed.typical * bench.robotic_adoption_pct / 100),
    current_system: bench.robotic_adoption_pct > 15 ? 'Xi' : 'none',
    current_system_count: bench.robotic_adoption_pct > 15 ? Math.ceil(beds / 300) : 0,
    specialty_urology: bench.specialty_mix.urology, specialty_gynecology: bench.specialty_mix.gynecology,
    specialty_general: bench.specialty_mix.general, specialty_thoracic: bench.specialty_mix.thoracic,
    specialty_colorectal: bench.specialty_mix.colorectal, specialty_head_neck: bench.specialty_mix.head_neck,
    specialty_cardiac: bench.specialty_mix.cardiac,
    credentialed_robotic_surgeons: Math.round(beds * bench.surgeons_per_100_beds.credentialed / 100),
    surgeons_interested: Math.round(beds * bench.surgeons_per_100_beds.interested / 100),
    convertible_lap_cases: Math.round(beds * bench.volume_per_bed.typical * 0.3),
    total_or_count: Math.max(4, Math.round(beds * bench.or_per_100_beds / 100)),
    robot_ready_ors: Math.max(1, Math.round(beds * bench.or_per_100_beds / 100 * bench.robot_ready_or_pct / 100)),
    or_sqft: 600, ceiling_height_ft: 10,
    capital_budget: beds > 400 ? '3M+' : beds > 200 ? '2-3M' : '1-2M',
    acquisition_preference: 'purchase',
    avg_los_days: bench.los_days, complication_rate_pct: bench.complication_pct, readmission_rate_pct: bench.readmission_pct,
    payer_medicare_pct: bench.payer.medicare, payer_commercial_pct: bench.payer.commercial,
    payer_medicaid_pct: bench.payer.medicaid, payer_self_pay_pct: bench.payer.self_pay,
    value_based_contract_pct: 20, competitor_robot_nearby: true, competitor_details: 'Market analysis pending',
    primary_goal: 'volume_growth', notes: 'Fallback profile from benchmarks. Validate with hospital contact.',
    research_sources: ['Industry benchmarks', 'Known system data'], confidence_level: 'low',
    data_notes: 'All values estimated. Recommend manual validation.', field_confidence: {}
  };
}

// ── Build Project Data ────────────────────────────────────────────────
function buildProjectData(data) {
  return {
    hospital_name: data.hospital_name, hospital_type: data.hospital_type,
    bed_count: data.bed_count, state: data.state, country: data.country || 'United States',
    annual_surgical_volume: data.annual_surgical_volume,
    current_robotic_cases: data.current_robotic_cases || 0,
    current_system: data.current_system || 'none',
    current_system_count: data.current_system_count || 0,
    current_system_age_years: data.current_system_age_years || null,
    specialty_urology: data.specialty_urology || 0, specialty_gynecology: data.specialty_gynecology || 0,
    specialty_general: data.specialty_general || 0, specialty_thoracic: data.specialty_thoracic || 0,
    specialty_colorectal: data.specialty_colorectal || 0, specialty_head_neck: data.specialty_head_neck || 0,
    specialty_cardiac: data.specialty_cardiac || 0,
    credentialed_robotic_surgeons: data.credentialed_robotic_surgeons || 0,
    surgeons_interested: data.surgeons_interested || 0,
    convertible_lap_cases: data.convertible_lap_cases || 0,
    total_or_count: data.total_or_count || 0, robot_ready_ors: data.robot_ready_ors || 0,
    or_sqft: data.or_sqft || 600, ceiling_height_ft: data.ceiling_height_ft || 10,
    capital_budget: data.capital_budget || '2-3M',
    acquisition_preference: data.acquisition_preference || 'purchase',
    avg_los_days: data.avg_los_days || 4, complication_rate_pct: data.complication_rate_pct || 5,
    readmission_rate_pct: data.readmission_rate_pct || 12,
    payer_medicare_pct: data.payer_medicare_pct || 35, payer_commercial_pct: data.payer_commercial_pct || 40,
    payer_medicaid_pct: data.payer_medicaid_pct || 15, payer_self_pay_pct: data.payer_self_pay_pct || 5,
    value_based_contract_pct: data.value_based_contract_pct || 20,
    competitor_robot_nearby: data.competitor_robot_nearby || false,
    competitor_details: data.competitor_details || '',
    primary_goal: data.primary_goal || 'volume_growth',
    notes: data.notes || '',
    extended_data: {
      ai_researched: true,
      architecture: '4-pass-maker-checker',
      research_sources: data.research_sources || [],
      confidence_level: data.confidence_level || 'medium',
      field_confidence: data.field_confidence || {},
      checker_corrections: data.checker_corrections || [],
      deterministic_fixes: data.deterministic_fixes || [],
      data_notes: data.data_notes || '',
      researched_at: new Date().toISOString()
    }
  };
}

// ── Full Pipeline ─────────────────────────────────────────────────────
async function runFullPipeline(hospitalName, models, progressCallback) {
  const progress = progressCallback || (() => {});
  const systemMatcher = require('./system-matcher');
  let drgLib; try { drgLib = require('./drg-reimbursement'); } catch (e) {}
  let dollarizationEngine; try { dollarizationEngine = require('./clinical-dollarization'); } catch (e) {}

  progress('step:research');
  const projectData = await researchHospital(hospitalName, progress);

  progress('step:project');
  progress('Creating project for ' + projectData.hospital_name + '...');
  const projectCode = 'INTV-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 90000) + 10000);
  const project = await models.IntuitiveProject.create({ project_code: projectCode, ...projectData });
  progress('Project created: ' + project.project_code);

  // Store CMS metrics if available
  try {
    const cmsClient = require('./cms-hospital-compare');
    const cmsResult = await cmsClient.fetchAllForHospital(projectData.hospital_name, projectData.state);
    if (cmsResult?.metrics?.length > 0 && models.IntuitiveCMSMetrics) {
      for (const m of cmsResult.metrics.slice(0, 20)) {
        await models.IntuitiveCMSMetrics.create({
          project_id: project.id, cms_provider_id: cmsResult.provider?.provider_id,
          measure_id: m.measure_id, measure_name: m.measure_name, measure_category: m.category,
          score: m.score, national_avg: m.national_avg, comparison: m.comparison,
          reporting_period: m.reporting_period, fetched_at: new Date()
        });
      }
      progress('Stored ' + Math.min(cmsResult.metrics.length, 20) + ' CMS metrics');
    }
  } catch (e) { /* CMS storage non-fatal */ }

  progress('step:analysis');
  progress('Running 16-module analysis engine...');
  const analysisResults = await systemMatcher.runAll(models, project.id);
  progress('Analysis complete');

  progress('step:businessplan');
  progress('Creating business plan...');
  const modelMatch = analysisResults.model_matching;
  const recommended = modelMatch?.primary_recommendation;
  const systemType = recommended?.model || 'Xi';
  const sys = systemMatcher.SYSTEMS[systemType];
  const avgPrice = sys ? (sys.price_range[0] + sys.price_range[1]) / 2 : 1750000;

  const plan = await models.IntuitiveBusinessPlan.create({
    project_id: project.id,
    plan_name: projectData.hospital_name + ' - da Vinci Business Plan',
    system_type: systemType, system_price: avgPrice,
    annual_service_cost: sys ? sys.service_annual : 175000,
    system_quantity: analysisResults.utilization_forecast?.systems_needed || 1,
    acquisition_model: projectData.acquisition_preference || 'purchase',
    prepared_by: 'SurgicalMind AI', prepared_for: projectData.hospital_name + ' Leadership',
    notes: 'Auto-generated (4-pass validated) on ' + new Date().toISOString().split('T')[0]
  });

  // Auto-populate surgeon commitments
  progress('Generating surgeon commitments...');
  try {
    const topProcs = (analysisResults.procedure_pareto?.procedures || []).slice(0, 12);
    const specNames = { urology: 'Urology', gynecology: 'Gynecology', general: 'General Surgery', thoracic: 'Thoracic', colorectal: 'Colorectal', head_neck: 'ENT/Head & Neck', cardiac: 'Cardiac' };
    const surgeonNames = ['Dr. A. Martinez', 'Dr. S. Patel', 'Dr. R. Johnson', 'Dr. L. Chen', 'Dr. M. Williams', 'Dr. K. Thompson', 'Dr. J. Davis', 'Dr. N. Rodriguez'];
    const specProcs = {};
    topProcs.forEach(p => { const s = p.specialty || 'general'; if (!specProcs[s]) specProcs[s] = []; specProcs[s].push(p); });
    const specKeys = Object.keys(specProcs);
    const numSurgeons = Math.min(projectData.credentialed_robotic_surgeons || 4, surgeonNames.length, specKeys.length + 2);

    for (let i = 0; i < numSurgeons; i++) {
      const spec = specKeys[i % specKeys.length];
      const procs = (specProcs[spec] || []).slice(0, 2).map(p => {
        const monthly = Math.max(1, Math.round((p.incremental_opportunity || Math.round((p.total_cases || p.cases || 10) * 0.2)) / 12));
        let reimb = 12000;
        if (drgLib) {
          const all = drgLib.getAllProcedures ? drgLib.getAllProcedures() : [];
          const match = all.find(d => (p.procedure_name || '').toLowerCase().includes(d.procedure_name.toLowerCase().split(' ')[0]));
          if (match) reimb = match.avg_blended_rate || 12000;
        }
        return { procedure_type: (p.procedure_name || '').toLowerCase().replace(/[^a-z0-9]/g, '_'), procedure_name: p.procedure_name || 'Procedure', incremental_cases_monthly: monthly, incremental_cases_annual: monthly * 12, reimbursement_rate: reimb };
      });
      const totalAnnual = procs.reduce((s, p) => s + p.incremental_cases_annual, 0);
      const totalRev = procs.reduce((s, p) => s + (p.incremental_cases_annual * p.reimbursement_rate), 0);
      await models.IntuitiveSurgeonCommitment.create({
        business_plan_id: plan.id, project_id: project.id, surgeon_name: surgeonNames[i],
        surgeon_specialty: specNames[spec] || spec, hospital_affiliation: projectData.hospital_name,
        procedures: procs, total_incremental_annual: totalAnnual, total_revenue_impact: totalRev,
        source: 'ai_generated', status: 'draft'
      });
    }
    const allC = await models.IntuitiveSurgeonCommitment.findAll({ where: { business_plan_id: plan.id } });
    const tCases = allC.reduce((s, c) => s + (c.total_incremental_annual || 0), 0);
    const tRev = allC.reduce((s, c) => s + (parseFloat(c.total_revenue_impact) || 0), 0);
    await plan.update({ total_incremental_cases_annual: tCases, total_incremental_revenue: tRev });
    progress('Generated ' + numSurgeons + ' surgeon commitments');
  } catch (e) { progress('Surgeon gen (non-fatal): ' + e.message); }

  // Clinical dollarization
  progress('step:dollarization');
  progress('Running clinical outcome dollarization...');
  if (dollarizationEngine) {
    const hospitalCaseData = {};
    const specMap = { urology: projectData.specialty_urology, gynecology: projectData.specialty_gynecology, general_surgery: projectData.specialty_general, thoracic: projectData.specialty_thoracic, colorectal: projectData.specialty_colorectal, ent_head_neck: projectData.specialty_head_neck, cardiac: projectData.specialty_cardiac };
    const crPct = projectData.annual_surgical_volume > 0 ? Math.round((projectData.current_robotic_cases / projectData.annual_surgical_volume) * 100) : 5;
    for (const [spec, pct] of Object.entries(specMap)) {
      if (pct > 0) {
        const cases = Math.round(projectData.annual_surgical_volume * pct / 100);
        hospitalCaseData[spec] = { annual_cases: cases, open_pct: Math.max(0, 100 - crPct * 2 - 30), lap_pct: 30, robotic_pct: Math.min(100, crPct * 2) };
        const t = hospitalCaseData[spec].open_pct + hospitalCaseData[spec].lap_pct + hospitalCaseData[spec].robotic_pct;
        if (t !== 100) hospitalCaseData[spec].open_pct += (100 - t);
      }
    }
    try {
      const dr = dollarizationEngine.calculateDollarization(hospitalCaseData);
      await models.IntuitiveClinicalOutcome.create({
        business_plan_id: plan.id, project_id: project.id, hospital_case_data: hospitalCaseData,
        dollarization_results: dr, total_clinical_savings_annual: dr.total_clinical_savings_annual || 0,
        citations: dr.all_citations || [], computed_at: new Date()
      });
      const curRev = parseFloat(plan.total_incremental_revenue) || 0;
      await plan.update({ total_clinical_outcome_savings: dr.total_clinical_savings_annual || 0, total_combined_roi: curRev + (dr.total_clinical_savings_annual || 0) });
      progress('Dollarization: $' + (dr.total_clinical_savings_annual || 0).toLocaleString() + ' annual savings');
    } catch (e) { progress('Dollarization error: ' + e.message); }
  }

  // Survey template
  progress('step:survey');
  const survey = await models.IntuitiveSurvey.create({
    project_id: project.id, business_plan_id: plan.id,
    title: projectData.hospital_name + ' - Surgeon Volume Assessment',
    hospital_name: projectData.hospital_name,
    system_type: systemType === 'dV5' ? 'da Vinci 5' : 'da Vinci ' + systemType,
    status: 'draft'
  });

  progress('step:complete');
  progress('Full pipeline complete for ' + projectData.hospital_name);

  return {
    project, analysis: analysisResults, businessPlan: plan, survey,
    research: {
      architecture: '4-pass-maker-checker',
      confidence_level: projectData.extended_data?.confidence_level,
      sources: projectData.extended_data?.research_sources,
      checker_corrections: projectData.extended_data?.checker_corrections,
      deterministic_fixes: projectData.extended_data?.deterministic_fixes,
      field_confidence: projectData.extended_data?.field_confidence,
      data_notes: projectData.extended_data?.data_notes
    }
  };
}

module.exports = { researchHospital, runFullPipeline };
