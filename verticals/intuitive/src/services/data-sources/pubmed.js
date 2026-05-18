'use strict';

// PubMed (NCBI E-utilities) connector — publication signal per surgeon
// Free, no key required (NCBI_API_KEY env var optional for higher rate limit).
// https://www.ncbi.nlm.nih.gov/books/NBK25501/

const cache = require('./_cache');

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const API_KEY = process.env.NCBI_API_KEY || '';

// Convert "John Q Smith MD" → "Smith J[Author]"
// PubMed indexes author as "Lastname FI" (last name + first initial)
function buildAuthorQuery(fullName) {
  if (!fullName) return null;
  const cleaned = String(fullName)
    .replace(/^dr\.?\s+/i, '')
    .replace(/,?\s*(md|do|phd|mph|facs|frcs|jr|sr|ii|iii|iv)\.?$/gi, '')
    .replace(/,?\s*(md|do|phd|mph|facs|frcs|jr|sr|ii|iii|iv)\.?\s/gi, ' ')
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1];
  const firstInitial = (tokens[0] || '')[0];
  if (!last || !firstInitial) return null;
  // Disambiguate with surgery-related terms to reduce false positives from common names
  return `${last} ${firstInitial}[Author]`;
}

async function fetchPublicationCount(fullName, opts = {}) {
  if (!fullName) return { count: 0, recent_pmids: [], skipped: true };

  const yearsBack = opts.years || 5;
  const maxYear = new Date().getFullYear();
  const minYear = maxYear - yearsBack;
  const authorTerm = buildAuthorQuery(fullName);
  if (!authorTerm) return { count: 0, recent_pmids: [], skipped: true, reason: 'name_unparseable' };

  // Filter to surgery/medicine to reduce false positives on common names
  const term = `(${authorTerm}) AND (surgery[mh] OR surgical[tiab] OR robotic[tiab]) AND ("${minYear}"[PDAT] : "${maxYear}"[PDAT])`;
  const cacheKey = `${authorTerm}|${minYear}-${maxYear}`;
  const cached = await cache.get(opts.models, 'pubmed', cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    db: 'pubmed',
    term,
    retmode: 'json',
    retmax: '5',
    sort: 'date',
  });
  if (API_KEY) params.set('api_key', API_KEY);

  try {
    const r = await cache.fetchWithRetry(
      `${EUTILS}/esearch.fcgi?${params.toString()}`,
      { headers: { 'Accept': 'application/json' } },
      8000, 1
    );
    if (!r.ok) throw new Error(`PubMed HTTP ${r.status}`);
    const json = await r.json();
    const count = Number((json.esearchresult || {}).count) || 0;
    const recent_pmids = (json.esearchresult || {}).idlist || [];
    const result = {
      count,
      recent_pmids,
      years_back: yearsBack,
      author_query: authorTerm,
      source_url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`,
    };
    await cache.set(opts.models, 'pubmed', cacheKey, result, 7 * 24 * 60 * 60 * 1000); // 7d TTL
    return result;
  } catch (e) {
    console.log('[DataSource:PubMed]', `error for ${fullName}:`, e.message);
    return { count: 0, recent_pmids: [], error: e.message };
  }
}

// Bulk variant — rate-limited (NCBI permits 3 req/sec without key, 10/sec with key)
async function fetchBulk(surgeons, opts = {}) {
  const rate = API_KEY ? 100 : 350; // ms between requests
  const out = {};
  for (const s of surgeons) {
    const name = typeof s === 'string' ? s : s.full_name;
    const npi = typeof s === 'string' ? null : s.npi;
    const key = npi || name;
    const r = await fetchPublicationCount(name, opts);
    out[key] = r;
    await new Promise(res => setTimeout(res, rate));
  }
  return out;
}

module.exports = { fetchPublicationCount, fetchBulk, buildAuthorQuery };
