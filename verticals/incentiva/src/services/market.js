'use strict';

/**
 * Market settings. Every assumption that moves a payment lives here, entered
 * by a person with its source. Stored defaults stay NULL, so the console always
 * shows what a person actually set.
 *
 * effectiveSettings() is what buyers see (owner decision, 2026-09-14: an estimate
 * with labelled assumptions beats "not estimated"). A field the agent left empty
 * is filled from a named source: the rate from Freddie Mac's weekly survey
 * (services/rates.js, source and date shown), and tax, insurance, mortgage
 * insurance and closing costs from labelled Tampa Bay defaults listed in
 * `defaulted`, whose basis text says so. Anything the agent sets wins.
 */

const db = require('../db');

const DEFAULT_SLUG = 'tampa-bay';
const DEFAULT_COUNTIES = ['Hillsborough', 'Pinellas', 'Pasco', 'Hernando', 'Manatee', 'Polk'];

const DEFAULT_SETTINGS = {
  reference_rate: null, reference_rate_source: null, reference_rate_as_of: null,
  tax_rate_by_county: {}, tax_rate_default: null,
  insurance_monthly: null, pmi_rate_annual: null, closing_cost_pct: null,
  down_payment_pct_default: 5,
  fresh_days_with_expiry: 21, fresh_days_no_expiry: 10,
  co_owner_user_ids: []
};

// Labelled buyer-facing defaults (env-overridable). Assumptions, not quotes.
const ASSUMED = {
  tax_rate_default: Number(process.env.INCENTIVA_DEFAULT_TAX_RATE || 0.018),
  insurance_monthly: Number(process.env.INCENTIVA_DEFAULT_INSURANCE_MONTHLY || 250),
  pmi_rate_annual: Number(process.env.INCENTIVA_DEFAULT_PMI_RATE || 0.005),
  closing_cost_pct: Number(process.env.INCENTIVA_DEFAULT_CLOSING_PCT || 3)
};

async function effectiveSettings(stored) {
  const s = Object.assign({}, stored);
  s.defaulted = [];
  if (s.reference_rate == null) {
    const r = await require('./rates').latest();
    if (r) {
      s.reference_rate = r.rate; s.reference_rate_as_of = r.as_of; s.reference_rate_is_feed = true;
      s.reference_rate_source = require('./rates').source('en');
    }
  }
  for (const k of Object.keys(ASSUMED)) {
    if (k === 'tax_rate_default' && Object.keys(s.tax_rate_by_county || {}).length) continue;
    if (s[k] == null) { s[k] = ASSUMED[k]; s.defaulted.push(k); }
  }
  return s;
}

const NUMERIC = ['reference_rate', 'tax_rate_default', 'insurance_monthly', 'pmi_rate_annual', 'closing_cost_pct', 'down_payment_pct_default', 'fresh_days_with_expiry', 'fresh_days_no_expiry'];
const RANGES = {
  reference_rate: [0, 20], tax_rate_default: [0, 0.05], insurance_monthly: [0, 5000], pmi_rate_annual: [0, 0.03],
  closing_cost_pct: [0, 10], down_payment_pct_default: [0, 100], fresh_days_with_expiry: [1, 60], fresh_days_no_expiry: [1, 30]
};

async function getMarket(tenantId) {
  let m = await db.one('SELECT * FROM nca_markets WHERE tenant_id = :t AND slug = :s', { t: tenantId, s: DEFAULT_SLUG });
  if (!m) {
    await db.exec(`INSERT INTO nca_markets (tenant_id, slug, name, counties, settings)
      VALUES (:t, :s, 'Tampa Bay', ARRAY[:c]::text[], :settings) ON CONFLICT (tenant_id, slug) DO NOTHING`,
    { t: tenantId, s: DEFAULT_SLUG, c: DEFAULT_COUNTIES, settings: JSON.stringify(DEFAULT_SETTINGS) });
    m = await db.one('SELECT * FROM nca_markets WHERE tenant_id = :t AND slug = :s', { t: tenantId, s: DEFAULT_SLUG });
  }
  m.settings = Object.assign({}, DEFAULT_SETTINGS, m.settings || {});
  return m;
}

/** Whitelisted, range-checked settings update. Returns {settings} or {error}. */
function sanitizeSettings(input, current) {
  const next = Object.assign({}, current);
  const errors = [];
  for (const k of NUMERIC) {
    if (!(k in input)) continue;
    if (input[k] === null || input[k] === '') { next[k] = null; continue; }
    const v = Number(input[k]);
    const [lo, hi] = RANGES[k];
    if (!isFinite(v) || v < lo || v > hi) errors.push(`${k} must be between ${lo} and ${hi}`);
    else next[k] = v;
  }
  if ('reference_rate_source' in input) next.reference_rate_source = input.reference_rate_source ? String(input.reference_rate_source).slice(0, 160) : null;
  if ('reference_rate_as_of' in input) {
    const d = input.reference_rate_as_of ? String(input.reference_rate_as_of).slice(0, 10) : null;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) errors.push('reference_rate_as_of must be YYYY-MM-DD'); else next.reference_rate_as_of = d;
  }
  if (input.tax_rate_by_county && typeof input.tax_rate_by_county === 'object') {
    const out = {};
    for (const [county, rate] of Object.entries(input.tax_rate_by_county)) {
      const v = Number(rate);
      if (rate === null || rate === '') continue;
      if (!isFinite(v) || v < 0 || v > 0.05) errors.push(`tax rate for ${county} must be between 0 and 0.05`);
      else out[String(county).slice(0, 60)] = v;
    }
    next.tax_rate_by_county = out;
  }
  if (next.reference_rate !== null && (!next.reference_rate_source || !next.reference_rate_as_of)) errors.push('A reference rate needs its source and as-of date');
  return errors.length ? { error: errors.join('; ') } : { settings: next };
}

module.exports = { effectiveSettings, ASSUMED, getMarket, sanitizeSettings, DEFAULT_SETTINGS, DEFAULT_COUNTIES };
