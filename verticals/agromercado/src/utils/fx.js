'use strict';

/**
 * AgroMercado — FX (BCV official + parallel) fetch with fallback.
 *
 * Strategy (ISTC spec v1.0.1, §3.3):
 *  - Prices stored in USD; rendered to VES dynamically.
 *  - Poll twice daily (09:00 & 13:00, aligned to BCV).
 *  - Fallbacks: BCV → last indexed value; Parallel → Official + fixed % delta.
 *
 * Source is pluggable via AGROMERCADO_FX_SOURCE_URL (must return JSON with
 * numeric fields the adapter below understands). When unset or unreachable,
 * the caller persists the last-known value and applies the parallel delta.
 */

const fetch = require('node-fetch');

const PARALLEL_DELTA_PCT = 0.40; // parallel ≈ official + 40% when parallel unknown

/**
 * Fetch current rates. Returns { bcv_ves, parallel_ves, source } or null on failure.
 * Adapter is intentionally defensive — it accepts several common JSON shapes from
 * public VES-rate APIs without hardcoding any single provider.
 */
async function fetchRates() {
  const url = process.env.AGROMERCADO_FX_SOURCE_URL;
  if (!url) return null;
  try {
    const r = await fetch(url, { timeout: 8000 });
    if (!r.ok) return null;
    const j = await r.json();
    const bcv = pickNumber(j, ['bcv', 'oficial', 'official', 'usd', 'promedio', 'rate']);
    const par = pickNumber(j, ['paralelo', 'parallel', 'enparalelo', 'bcv_paralelo']);
    if (!bcv) return null;
    return {
      bcv_ves: bcv,
      parallel_ves: par || round2(bcv * (1 + PARALLEL_DELTA_PCT)),
      source: 'AGROMERCADO_FX_SOURCE_URL'
    };
  } catch (e) {
    return null;
  }
}

// Walk a (possibly nested) JSON object looking for the first numeric value under
// any of the given key names.
function pickNumber(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (keys.includes(k.toLowerCase())) {
      const n = typeof v === 'object' ? pickNumber(v, ['value', 'price', 'rate', 'venta', 'promedio']) : Number(v);
      if (n && isFinite(n)) return n;
    }
    if (v && typeof v === 'object') {
      const nested = pickNumber(v, keys);
      if (nested) return nested;
    }
  }
  return null;
}

function round2(n) { return Math.round(Number(n) * 100) / 100; }

/** Apply the parallel fallback to a known BCV value. */
function parallelFallback(bcvVes) {
  return round2(Number(bcvVes) * (1 + PARALLEL_DELTA_PCT));
}

module.exports = { fetchRates, parallelFallback, PARALLEL_DELTA_PCT };
