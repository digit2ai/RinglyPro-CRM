'use strict';

/**
 * AgroMercado — FX poller. Runs twice daily (09:00 & 13:00, aligned to BCV).
 * Persists BCV + parallel into am_fx_rates. On source failure, re-persists the
 * last indexed BCV (cache fallback) and derives parallel via fixed delta.
 */

const { FxRate, DEFAULT_TENANT } = require('../models');
const { fetchRates, parallelFallback } = require('../utils/fx');

async function pollOnce(tenantId = DEFAULT_TENANT) {
  try {
    let rates = await fetchRates();
    if (!rates) {
      // Fallback to last indexed value.
      const last = await FxRate.findOne({ where: { tenant_id: tenantId }, order: [['fetched_at', 'DESC']] });
      if (!last) { console.log('[agromercado/fx] no source + no cached rate — skipping'); return null; }
      rates = { bcv_ves: Number(last.bcv_ves), parallel_ves: parallelFallback(Number(last.bcv_ves)), source: 'cache_fallback' };
    }
    const row = await FxRate.create({
      tenant_id: tenantId, bcv_ves: rates.bcv_ves, parallel_ves: rates.parallel_ves, source: rates.source
    });
    console.log(`[agromercado/fx] rate stored: BCV ${rates.bcv_ves} / paralelo ${rates.parallel_ves} (${rates.source})`);
    return row;
  } catch (e) {
    console.error('[agromercado/fx] poll error:', e.message);
    return null;
  }
}

// Lightweight scheduler: checks every 15 min, fires once per 09:00 / 13:00 window.
function startScheduler() {
  let lastFiredHour = null;
  const tick = async () => {
    const h = new Date().getHours();
    if ((h === 9 || h === 13) && lastFiredHour !== h) {
      lastFiredHour = h;
      await pollOnce();
    }
    if (h !== 9 && h !== 13) lastFiredHour = null;
  };
  setInterval(tick, 15 * 60 * 1000);
  console.log('[agromercado/fx] scheduler started (09:00 & 13:00)');
}

module.exports = { pollOnce, startScheduler };
