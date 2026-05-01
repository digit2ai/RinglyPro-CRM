'use strict';

// CMS Open Payments (Sunshine Act) connector — surgeon-Intuitive payment lookup
// Reads from local open_payments_intuitive table populated by ingest-open-payments.js.
// Live API fallback: https://openpaymentsdata.cms.gov/api/1/datastore/query/<dataset_id>

const cache = require('./_cache');

function championScore({ total_amount, last_payment_date, payment_count }) {
  const dollars = Number(total_amount) || 0;
  const recencyMs = last_payment_date ? Date.now() - new Date(last_payment_date).getTime() : Infinity;
  const recencyDays = recencyMs / (1000 * 60 * 60 * 24);
  // 60 pts for $: $50K+ -> 60 pts saturating; $0 -> 0 pts
  const dollarPts = Math.min(60, Math.round((dollars / 50000) * 60));
  // 25 pts for recency: <90d -> 25, <365d -> 15, <730d -> 5, older -> 0
  const recencyPts = recencyDays < 90 ? 25 : recencyDays < 365 ? 15 : recencyDays < 730 ? 5 : 0;
  // 15 pts for breadth: payment_count >=10 -> 15
  const breadthPts = Math.min(15, Math.round(((Number(payment_count) || 1) / 10) * 15));
  return Math.min(100, dollarPts + recencyPts + breadthPts);
}

async function fetchFor(npis, opts = {}) {
  const log = (...m) => console.log('[DataSource:OpenPayments]', ...m);
  const models = opts.models;

  if (!Array.isArray(npis) || npis.length === 0) {
    return { data: { surgeon_payments: [] }, citations: [] };
  }
  if (!models || !models.IntuitiveOpenPaymentsIntuitive) {
    return { data: null, citations: [], error: 'open_payments_intuitive model unavailable' };
  }

  const npiList = npis.map(n => String(typeof n === 'string' ? n : n.npi)).filter(Boolean);
  const cacheKey = `npis:${npiList.sort().join(',')}`;
  const cached = await cache.get(models, 'cms-open-payments', cacheKey);
  if (cached) return cached;

  try {
    const rows = await models.IntuitiveOpenPaymentsIntuitive.findAll({
      where: { npi: npiList },
      order: [['fiscal_year', 'DESC']],
    });

    // Aggregate per NPI across years
    const byNpi = {};
    for (const row of rows) {
      const r = row.toJSON ? row.toJSON() : row;
      const key = r.npi;
      if (!byNpi[key]) {
        byNpi[key] = {
          npi: r.npi,
          total_amount_2yr: 0,
          payment_categories: new Set(),
          last_payment_date: null,
          years: [],
        };
      }
      byNpi[key].total_amount_2yr += Number(r.total_amount) || 0;
      byNpi[key].years.push(r.fiscal_year);
      const cats = r.categories || {};
      Object.keys(cats).forEach(c => byNpi[key].payment_categories.add(c));
      const lpd = r.last_payment_date ? new Date(r.last_payment_date) : null;
      if (lpd && (!byNpi[key].last_payment_date || lpd > byNpi[key].last_payment_date)) {
        byNpi[key].last_payment_date = lpd;
      }
    }

    const surgeon_payments = Object.values(byNpi).map(s => ({
      npi: s.npi,
      total_payments_2yr: Math.round(s.total_amount_2yr),
      payment_categories: Array.from(s.payment_categories),
      last_payment_date: s.last_payment_date ? s.last_payment_date.toISOString().slice(0, 10) : null,
      years_with_payments: s.years.sort(),
      champion_score: championScore({
        total_amount: s.total_amount_2yr,
        last_payment_date: s.last_payment_date,
        payment_count: s.years.length,
      }),
    })).sort((a, b) => b.total_payments_2yr - a.total_payments_2yr);

    const result = {
      data: { surgeon_payments },
      citations: surgeon_payments.slice(0, 5).map(sp => ({
        field: `intuitive_payments_npi_${sp.npi}`,
        value: sp.total_payments_2yr,
        source_name: 'CMS Open Payments',
        source_url: `https://openpaymentsdata.cms.gov/physician/${sp.npi}`,
        last_updated_at: sp.last_payment_date,
        confidence: 'confirmed',
      })),
    };

    await cache.set(models, 'cms-open-payments', cacheKey, result);
    log(`Open Payments aggregated for ${surgeon_payments.length} surgeons`);
    return result;
  } catch (e) {
    log(`error: ${e.message}`);
    return { data: null, citations: [], error: e.message };
  }
}

module.exports = { fetchFor, championScore };
