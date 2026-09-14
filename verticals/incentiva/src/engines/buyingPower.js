'use strict';

/**
 * Buying power estimate. NOT a pre-qualification: no credit check, no loan
 * program advice, no "you qualify". The range comes from two published
 * debt-to-income bands (28/36 comfortable; 40/50 stretch, the most automated
 * underwriting such as Fannie Mae Desktop Underwriter generally approves), both labelled.
 * When the buyer's other debts, not their income, set the ceiling, the result says so
 * and shows what their own payment would buy and the range without those debts.
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
      value_display: '28/36 – 40/50', basis: es ? 'El rango bajo es cómodo; el alto es lo máximo que la aprobación automatizada (por ejemplo, Desktop Underwriter de Fannie Mae) suele aceptar para el total de deudas. Cada prestamista aplica sus propias reglas y FHA puede aceptar más con factores compensatorios.' : 'The low end is comfortable; the high end is about the most automated approval (for example Fannie Mae Desktop Underwriter) usually accepts for total debts. Every lender applies its own rules, and FHA can accept more with compensating factors.' },
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
  const incomeCap = monthlyIncome * 0.40, debtCap = monthlyIncome * 0.50 - debts;
  let high = Math.min(incomeCap, debtCap);
  const debtsBind = debtCap < incomeCap;
  if (target !== null && target > 0) high = Math.min(high, target);
  const limitedBy = target !== null && target > 0 && target <= Math.min(incomeCap, debtCap) ? 'target' : debtsBind ? 'debts' : 'income';
  const lowPay = Math.min(low, high);
  const args = { rate, down, taxRate, insurance, pmiRate };
  const pLow = lowPay > insurance ? priceForPayment(lowPay, args) : null;
  const pHigh = high > insurance ? priceForPayment(high, args) : null;
  const r1000 = (x) => Math.floor(x / 1000) * 1000;
  function debtsNote() {
    const fl = priceForPayment(monthlyIncome * 0.28, args), fh = priceForPayment(incomeCap, args);
    const at = target !== null && target > insurance ? priceForPayment(target, args) : null;
    return {
      debt_limit: Math.round(monthlyIncome * 0.50), debts: Math.round(debts), room: Math.max(0, Math.round(debtCap)),
      target: target !== null ? Math.round(target) : null, target_price: at !== null && at >= 50000 ? r1000(at) : null,
      without_debts: fh !== null && fh >= 50000 ? { price_low: fl !== null && fl >= 50000 ? r1000(fl) : null, price_high: r1000(fh), payment_low: Math.round(monthlyIncome * 0.28), payment_high: Math.round(incomeCap) } : null
    };
  }
  // Under $50,000 is not a realistic new-home price; treat it as no room rather than printing one.
  if (pHigh !== null && pHigh >= 50000) {
    return {
      ok: true,
      estimate: { price_low: pLow !== null && pLow >= 50000 ? r1000(pLow) : null, price_high: r1000(pHigh), payment_low: pLow !== null && pLow >= 50000 ? Math.round(lowPay) : null, payment_high: Math.round(high) },
      missing: [], assumptions, is_estimate: true, limited_by: limitedBy,
      debts_note: limitedBy === 'debts' ? debtsNote() : null
    };
  }
  // No room for a home payment. Say exactly why, with the arithmetic, instead of a bare "can't estimate".
  const debtLimit = monthlyIncome * 0.50;
  const room = debtLimit - debts;
  const frontLow = monthlyIncome * 0.28, frontHigh = monthlyIncome * 0.40;
  const byDebts = !(target !== null && target < Math.min(frontHigh, room));
  const fl = frontLow > insurance ? priceForPayment(frontLow, args) : null;
  const fh = frontHigh > insurance ? priceForPayment(frontHigh, args) : null;
  const atTargetRaw = target !== null && target > insurance ? priceForPayment(target, args) : null;
  const atTarget = atTargetRaw !== null && atTargetRaw >= 50000 ? atTargetRaw : null;
  return {
    ok: true, estimate: null, missing: [], assumptions, is_estimate: true,
    blocked: {
      reason: byDebts ? 'debts' : 'target_too_low',
      monthly_income: Math.round(monthlyIncome), debt_limit: Math.round(debtLimit), debts: Math.round(debts), room: Math.max(0, Math.round(room)),
      target: target !== null ? Math.round(target) : null, target_price: atTarget !== null ? r1000(atTarget) : null
    },
    // What the same income supports once the debts are gone (debts) or without the payment limit (target).
    alternative: fh !== null && fh >= 50000 ? { price_low: fl !== null ? r1000(fl) : null, price_high: r1000(fh), payment_low: fl !== null ? Math.round(frontLow) : null, payment_high: Math.round(frontHigh) } : null
  };
}

module.exports = { estimate, priceForPayment };
