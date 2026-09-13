'use strict';

/**
 * Payment engine. Deterministic. No model ever produces a figure a buyer sees.
 *
 * Rules that must not regress:
 *  - An unknown HOA or CDD is NOT zero. The payment is marked `from:true`.
 *  - A temporary buydown always carries the payment after it ends (year3plus)
 *    in the same scenario.
 *  - An incentive whose effect cannot be computed from its stated terms is
 *    `modeled:false` with a reason. Nothing is estimated into existence.
 *  - Each incentive option is modeled on its own; stacking is not modeled.
 */

function round(n) { return n == null || !isFinite(n) ? null : Math.round(n); }
function num(v) { return v === null || v === undefined || v === '' ? null : Number(v); }

function monthlyPI(loan, ratePct, years = 30) {
  if (!(loan > 0)) return 0;
  const n = years * 12;
  const m = ratePct / 1200;
  if (m === 0) return loan / n;
  return loan * m / (1 - Math.pow(1 + m, -n));
}

function monthlyFee(fee) {
  if (!fee || fee.amount_usd === null || fee.amount_usd === undefined) return null;
  const a = Number(fee.amount_usd);
  if (fee.period === 'year') return a / 12;
  if (fee.period === 'one_time') return 0;
  return a;
}

function defaultDownPct(financing, settings) {
  if (financing === 'va') return 0;
  if (financing === 'fha') return 3.5;
  return num(settings.down_payment_pct_default) ?? 5;
}

/**
 * @param {object} p
 *  price, financing, down_payment (usd, optional), county,
 *  settings: { reference_rate, tax_rate_by_county{}, tax_rate_default, insurance_monthly,
 *              pmi_rate_annual, closing_cost_pct, down_payment_pct_default },
 *  fees: [{fee_type, amount_usd, period}]  (a missing type = unknown)
 *  incentives: [{id, type, value_usd, value_percent, value_cap_usd, rate, buydown_schedule,
 *                use_restriction, requires_affiliated_lender, headline, choice_group}]
 */
function scenarios(p) {
  const s = p.settings || {};
  const price = num(p.price);
  const cash = p.financing === 'cash';
  const rate = num(s.reference_rate);
  const out = { assumptions: {}, fees_known: true, base: null, options: [] };
  if (!(price > 0)) return out;

  const downPct = defaultDownPct(p.financing, s);
  const downUsd = num(p.down_payment) != null ? Math.min(num(p.down_payment), price) : price * downPct / 100;
  const taxRate = num((s.tax_rate_by_county || {})[p.county]) ?? num(s.tax_rate_default);
  const insurance = num(s.insurance_monthly);
  const pmiRate = num(s.pmi_rate_annual);
  const ccPct = num(s.closing_cost_pct);

  // Fees: hoa and cdd are the two that decide Tampa Bay payments. Unknown = from.
  const byType = {};
  (p.fees || []).forEach((f) => { byType[f.fee_type] = f; });
  const hoa = byType.hoa ? monthlyFee(byType.hoa) : null;
  const cddParts = ['cdd_om', 'cdd_debt'].filter((t) => byType[t]).map((t) => monthlyFee(byType[t]));
  const cdd = cddParts.length && cddParts.every((x) => x !== null) ? cddParts.reduce((a, b) => a + b, 0) : null;
  const feesKnown = hoa !== null && cdd !== null;
  const knownFees = (hoa || 0) + (cdd || 0) + (byType.amenity ? (monthlyFee(byType.amenity) || 0) : 0);
  out.fees_known = feesKnown;

  const missing = [];
  if (!cash && rate === null) missing.push('reference_rate');
  if (taxRate === null) missing.push('tax_rate');
  if (insurance === null) missing.push('insurance_monthly');

  out.assumptions = {
    rate, down_payment_usd: round(downUsd), down_payment_pct: cash ? null : round((downUsd / price) * 1000) / 10,
    tax_rate: taxRate, insurance_monthly: insurance, pmi_rate_annual: pmiRate, closing_cost_pct: ccPct, missing
  };

  function monthly(priceX, ratePct) {
    const loan = cash ? 0 : Math.max(priceX - downUsd, 0);
    const pi = cash ? 0 : monthlyPI(loan, ratePct);
    const tax = taxRate !== null ? priceX * taxRate / 12 : 0;
    const ltv = priceX > 0 ? loan / priceX : 0;
    const pmi = !cash && p.financing !== 'va' && ltv > 0.8 && pmiRate !== null ? loan * pmiRate / 12 : 0;
    return pi + tax + (insurance || 0) + pmi + knownFees;
  }
  function cashToClose(priceX, credit) {
    if (ccPct === null) return null;
    // Round each component first so the total equals the parts a buyer sees printed.
    const cc = Math.round(priceX * ccPct / 100);
    return Math.round(cash ? priceX : downUsd) + Math.max(cc - Math.round(credit || 0), 0);
  }

  const canModel = cash || rate !== null;
  const unmodeledReason = !canModel ? 'no_reference_rate' : null;

  out.base = {
    key: 'base', incentive_id: null, modeled: canModel, reason: unmodeledReason, from: !feesKnown || missing.length > 0,
    year1: canModel ? round(monthly(price, rate)) : null,
    year2: canModel ? round(monthly(price, rate)) : null,
    year3plus: canModel ? round(monthly(price, rate)) : null,
    cash_to_close: round(cashToClose(price, 0))
  };

  for (const inc of p.incentives || []) {
    const sc = { key: 'inc_' + inc.id, incentive_id: inc.id, choice_group: inc.choice_group || null,
      modeled: false, reason: null, from: out.base.from, year1: null, year2: null, year3plus: null, cash_to_close: null };
    out.options.push(sc);

    if (inc.requires_affiliated_lender === true && cash) { sc.reason = 'lender_required_cash_buyer'; continue; }
    if (!canModel) { sc.reason = unmodeledReason; continue; }

    const vUsd = num(inc.value_usd);
    const vPct = num(inc.value_percent);
    const cap = num(inc.value_cap_usd);
    const amount = () => {
      let a = vUsd !== null ? vUsd : (vPct !== null ? price * vPct / 100 : null);
      if (a !== null && cap !== null) a = Math.min(a, cap);
      return a;
    };

    switch (inc.type) {
      case 'price_reduction': {
        const a = amount();
        if (a === null) { sc.reason = 'value_not_stated'; break; }
        const pr = Math.max(price - a, 0);
        const m = monthly(pr, rate);
        Object.assign(sc, { modeled: true, year1: round(m), year2: round(m), year3plus: round(m), cash_to_close: round(cashToClose(pr, 0)) });
        break;
      }
      case 'rate_buydown_permanent':
      case 'below_market_fixed_rate': {
        const r = num(inc.rate);
        if (cash) { sc.reason = 'cash_buyer_no_loan'; break; }
        if (r === null) { sc.reason = 'rate_not_stated'; break; }
        const m = monthly(price, r);
        Object.assign(sc, { modeled: true, year1: round(m), year2: round(m), year3plus: round(m), cash_to_close: round(cashToClose(price, 0)) });
        break;
      }
      case 'rate_buydown_temporary': {
        const sch = Array.isArray(inc.buydown_schedule) ? inc.buydown_schedule.map(Number) : null;
        if (cash) { sc.reason = 'cash_buyer_no_loan'; break; }
        if (!sch || !sch.length) { sc.reason = 'schedule_not_stated'; break; }
        if (sch.length > 2) { sc.reason = 'schedule_longer_than_two_years'; break; }
        // Payment amortizes on the note rate; the buydown subsidizes years 1-2.
        // Year 3+ is the payment after the buydown ends: ALWAYS present.
        Object.assign(sc, {
          modeled: true,
          year1: round(monthly(price, Math.max(rate - sch[0], 0))),
          year2: round(monthly(price, Math.max(rate - (sch[1] || 0), 0))),
          year3plus: round(monthly(price, rate)),
          cash_to_close: round(cashToClose(price, 0))
        });
        break;
      }
      case 'closing_cost_assistance':
      case 'flex_cash': {
        const a = amount();
        if (a === null) { sc.reason = 'value_not_stated'; break; }
        if (ccPct === null) { sc.reason = 'closing_costs_not_estimated'; break; }
        const m = monthly(price, rate);
        Object.assign(sc, { modeled: true, year1: round(m), year2: round(m), year3plus: round(m), cash_to_close: round(cashToClose(price, a)) });
        break;
      }
      default:
        sc.reason = 'credit_not_applied_to_payment';
    }
  }
  return out;
}

module.exports = { scenarios, monthlyPI, monthlyFee };
