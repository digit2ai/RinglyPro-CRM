// =====================================================
// lib/currency.js — multi-currency normalization for an international chain.
//
// A chain operating in several countries cannot rank stores by lost sales until
// every store's number is expressed in ONE currency. A CAD store showing
// "9,000 lost" is not worse than a USD store showing "8,000 lost".
//
// HONESTY RULE, and it is the whole point of this module:
// these rates are CONFIGURED, not live. Nothing here calls an FX API. Every
// converted figure is stamped with the rate used, the reporting currency, and
// `fx_source` so a reader can tell a normalized number from a native one. A
// dashboard that quietly converts at a stale rate and presents the result as
// fact is worse than one that does not convert at all — the error is invisible
// and compounds across every rollup.
//
// Override any rate with OOS_FX_<CCY> (units of that currency per 1 USD), e.g.
//   OOS_FX_CAD=1.36  OOS_FX_MXN=17.10
// Set the reporting currency with OOS_REPORTING_CURRENCY (default USD).
// =====================================================

'use strict';

// Units of each currency per 1 USD. Baseline defaults — deliberately rounded,
// because pretending to four decimals implies a precision configured rates do
// not have. Override per deployment via env.
const DEFAULT_RATES = {
  USD: 1,
  CAD: 1.36,
  MXN: 17.10,
  EUR: 0.92,
  GBP: 0.79,
  AUD: 1.52,
  BRL: 5.05,
  COP: 3950,
  CLP: 930,
  ARS: 990,
  DOP: 59,
  JPY: 157,
  PHP: 58
};

const SYMBOLS = {
  USD: '$', CAD: 'C$', MXN: 'MX$', EUR: '€', GBP: '£', AUD: 'A$',
  BRL: 'R$', COP: 'COL$', CLP: 'CLP$', ARS: 'AR$', DOP: 'RD$', JPY: '¥', PHP: '₱'
};

// Currencies conventionally written without decimal places.
const ZERO_DECIMAL = new Set(['JPY', 'CLP', 'COP']);

function reportingCurrency() {
  return (process.env.OOS_REPORTING_CURRENCY || 'USD').toUpperCase();
}

/** Rate for a currency: env override wins, then the baseline table. */
function rateFor(currency) {
  const ccy = String(currency || 'USD').toUpperCase();
  const override = parseFloat(process.env['OOS_FX_' + ccy]);
  if (isFinite(override) && override > 0) return override;
  const base = DEFAULT_RATES[ccy];
  return isFinite(base) && base > 0 ? base : null;
}

function isSupported(currency) {
  return rateFor(currency) !== null;
}

function symbolFor(currency) {
  return SYMBOLS[String(currency || 'USD').toUpperCase()] || '';
}

/**
 * Convert an amount between currencies via USD.
 * Returns null when either currency has no configured rate — a null the caller
 * must handle, rather than a silent 1:1 fallback that would understate or
 * overstate the chain total with no trace.
 */
function convert(amount, from, to) {
  const a = parseFloat(amount);
  if (!isFinite(a)) return null;

  const fromRate = rateFor(from);
  const toRate = rateFor(to);
  if (fromRate === null || toRate === null) return null;

  const usd = a / fromRate;
  const out = usd * toRate;
  return Math.round((out + Number.EPSILON) * 100) / 100;
}

/**
 * Convert a store's figures into the reporting currency and attach full
 * provenance. `fx_rate` is expressed as "reporting units per 1 local unit" so
 * the arithmetic on the dashboard is checkable by hand.
 */
function normalize(amounts, localCurrency, toCurrency) {
  const target = (toCurrency || reportingCurrency()).toUpperCase();
  const local = String(localCurrency || 'USD').toUpperCase();

  const supported = isSupported(local) && isSupported(target);
  const out = {};

  for (const [key, value] of Object.entries(amounts || {})) {
    out[key] = supported ? convert(value, local, target) : null;
  }

  return {
    values: out,
    local_currency: local,
    reporting_currency: target,
    fx_rate: supported ? Math.round((rateFor(target) / rateFor(local)) * 1e6) / 1e6 : null,
    converted: supported && local !== target,
    // Unsupported currency is reported, never silently treated as parity.
    fx_source: supported ? 'configured' : 'unavailable',
    fx_note: supported
      ? 'Rates are configured per deployment, not live market rates. Override with OOS_FX_<CCY>.'
      : `No configured FX rate for ${local}. Figure omitted rather than assumed at parity.`
  };
}

/** Display helper — respects zero-decimal currency conventions. */
function format(amount, currency) {
  const ccy = String(currency || 'USD').toUpperCase();
  const n = parseFloat(amount) || 0;
  const digits = ZERO_DECIMAL.has(ccy) ? 0 : 2;
  return symbolFor(ccy) + n.toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits
  });
}

/** Every currency this deployment can normalize, with its live-configured rate. */
function supportedCurrencies() {
  return Object.keys(DEFAULT_RATES).map((ccy) => ({
    currency: ccy,
    symbol: symbolFor(ccy),
    units_per_usd: rateFor(ccy),
    overridden: isFinite(parseFloat(process.env['OOS_FX_' + ccy]))
  }));
}

module.exports = {
  convert,
  normalize,
  format,
  rateFor,
  isSupported,
  symbolFor,
  reportingCurrency,
  supportedCurrencies,
  DEFAULT_RATES,
  ZERO_DECIMAL
};
