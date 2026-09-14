'use strict';

/**
 * Buying power estimate. NOT a pre-qualification: no credit check, no loan
 * program advice, no "you qualify". The range comes from two published
 * debt-to-income conventions (28/36 conservative, 31/43 stretch), both labelled.
 * With no income or no reference rate, the estimate is null and says why.
 */

const { monthlyPI } = require('./payment');
const { t, money, dateLabel } = require('./i18n');

function n(v) { return v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v); }

/** Largest price whose total monthly cost equals `payment`, given fixed down payment. */
function priceForPayment(payment, { rate, down, taxRate, insurance, pmiRate }) {
  const f = monthlyPI(1, rate); // payment per $1 of loan
  // payment = (P - down)*f + P*tax/12 + ins + [(P - down)*pmi/12 only while LTV > 80%]
  // Same rule as the payment engine, so the estimate and the report agree.
  const solve = (pmi) => (payment - insurance + down * (f + pmi / 12)) / (f + taxRate / 12 + pmi / 12);
  const noPmi = solve(0);
  let price;
  if (down >= 0.2 * noPmi) price = noPmi;
  else {
    const withPmi = solve(pmiRate || 0);
    price = down < 0.2 * withPmi ? withPmi : down / 0.2; // boundary: the 80% LTV price
  }
  return price > down ? price : null;
}

function estimate(input, settings = {}, lang = 'en') {
  const income = n(input.gross_income_annual);
  const debts = n(input.monthly_debts) || 0;
  const down = n(input.down_payment) || 0;
  const target = n(input.target_payment);
  const rate = n(settings.reference_rate);
  const taxRate = n(settings.tax_rate_default);
  const insurance = n(settings.insurance_monthly);
  const pmiRate = n(settings.pmi_rate_annual);

  const missing = [];
  if (income === null || income <= 0) missing.push('gross_income_annual');
  if (rate === null) missing.push('reference_rate');
  if (taxRate === null) missing.push('tax_rate');
  if (insurance === null) missing.push('insurance_monthly');

  const es = lang === 'es';
  const dflt = (k) => ((settings.defaulted || []).includes(k) ? ' ' + t(lang, 'basis.default_note') : '');
  const rateSource = settings.reference_rate_is_feed ? require('../services/rates').source(lang) : (settings.reference_rate_source || '-');
  const assumptions = [
    { key: 'dti', label: es ? 'Proporción deuda-ingreso' : 'Debt-to-income bands',
      value_display: '28/36 – 31/43', basis: es ? 'Convenciones habituales de préstamos; cada prestamista usa las suyas.' : 'Common lending conventions; every lender applies its own.' },
    { key: 'rate', label: t(lang, 'assumptions.rate'), value_display: rate !== null ? rate + '%' : t(lang, 'not_set'),
      basis: rate !== null ? t(lang, 'basis.rate', { source: rateSource, date: dateLabel(lang, settings.reference_rate_as_of) || '-' }) : '' },
    { key: 'tax', label: t(lang, 'assumptions.tax'), value_display: taxRate !== null ? (Math.round(taxRate * 10000) / 100) + '%' : t(lang, 'not_set'), basis: t(lang, 'basis.tax') + dflt('tax_rate_default') },
    { key: 'insurance', label: t(lang, 'assumptions.insurance'), value_display: insurance !== null ? money(lang, insurance) + (es ? '/mes' : '/mo') : t(lang, 'not_set'), basis: t(lang, 'basis.insurance') + dflt('insurance_monthly') },
    { key: 'pmi', label: t(lang, 'assumptions.pmi'), value_display: pmiRate !== null ? (Math.round(pmiRate * 10000) / 100) + '%' : t(lang, 'not_set'), basis: t(lang, 'basis.pmi') + dflt('pmi_rate_annual') },
    { key: 'fees', label: 'HOA / CDD', value_display: es ? 'No incluidos' : 'Not included', basis: es ? 'Varían por comunidad; su informe los muestra cuando están confirmados.' : 'They vary by community; your report shows them when confirmed.' },
    { key: 'term', label: es ? 'Plazo' : 'Term', value_display: es ? '30 años, tasa fija' : '30-year fixed', basis: '' }
  ];

  if (missing.length) return { ok: true, estimate: null, missing, assumptions, is_estimate: true };

  const monthlyIncome = income / 12;
  const low = Math.min(monthlyIncome * 0.28, monthlyIncome * 0.36 - debts);
  let high = Math.min(monthlyIncome * 0.31, monthlyIncome * 0.43 - debts);
  if (target !== null && target > 0) high = Math.min(high, target);
  const lowPay = Math.min(low, high);
  const args = { rate, down, taxRate, insurance, pmiRate };
  const pLow = lowPay > insurance ? priceForPayment(lowPay, args) : null;
  const pHigh = high > insurance ? priceForPayment(high, args) : null;
  if (pLow === null || pHigh === null) {
    return { ok: true, estimate: null, missing: ['payment_capacity'], assumptions, is_estimate: true };
  }
  const r1000 = (x) => Math.floor(x / 1000) * 1000;
  return {
    ok: true,
    estimate: { price_low: r1000(pLow), price_high: r1000(pHigh), payment_low: Math.round(lowPay), payment_high: Math.round(high) },
    missing: [], assumptions, is_estimate: true
  };
}

module.exports = { estimate, priceForPayment };
