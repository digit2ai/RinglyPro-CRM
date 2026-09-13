'use strict';

/**
 * Change detection between what a source says now and what buyers can see.
 *
 * ASYMMETRIC SAFETY: a decrease or a removal hides the current incentive from
 * buyers immediately (action 'withdraw_current'), then asks the agent. A new
 * or larger incentive waits for the agent (action 'propose').
 */

const RATE_TYPES = ['below_market_fixed_rate', 'rate_buydown_permanent'];

function comparable(v) {
  if (!v) return null;
  if (RATE_TYPES.includes(v.type)) return v.rate != null ? -Number(v.rate) : null; // lower rate = more value
  if (v.type === 'rate_buydown_temporary') return Array.isArray(v.buydown_schedule) ? v.buydown_schedule.reduce((a, b) => a + Number(b), 0) : null;
  if (v.value_cap_usd != null) return Number(v.value_cap_usd);
  if (v.value_usd != null) return Number(v.value_usd);
  if (v.value_percent != null) return Number(v.value_percent) * 1e6; // keep percent and usd from comparing as equals
  return null;
}

const TERM_FIELDS = ['requires_affiliated_lender', 'use_restriction', 'contract_by', 'close_by', 'expires_on', 'combinable_with'];

function sameValue(a, b) {
  const x = a === undefined ? null : a, y = b === undefined ? null : b;
  if (x === null && y === null) return true;
  if (x instanceof Date || y instanceof Date) return String(x).slice(0, 10) === String(y).slice(0, 10);
  return String(x).slice(0, 10) === String(y).slice(0, 10);
}

/**
 * @param current  the currently visible (verified) version, or null
 * @param observed the freshly extracted item
 */
function classify(current, observed) {
  if (!current) return { change_kind: 'new', action: 'propose' };
  const a = comparable(current), b = comparable(observed);
  if (a !== null && b !== null && a !== b) {
    return b > a ? { change_kind: 'increase', action: 'propose' } : { change_kind: 'decrease', action: 'withdraw_current' };
  }
  if (a !== null && b === null) {
    // Value disappeared from the wording: treat as a decrease until a person looks.
    return { change_kind: 'decrease', action: 'withdraw_current' };
  }
  const termsChanged = TERM_FIELDS.some((f) => observed[f] !== null && observed[f] !== undefined && !sameValue(current[f], observed[f]));
  if (termsChanged) {
    // A new close-by or a newly required lender narrows the offer: hide first.
    const narrowed = (observed.requires_affiliated_lender === true && current.requires_affiliated_lender !== true)
      || (observed.close_by && current.close_by && String(observed.close_by) < String(current.close_by).slice(0, 10))
      || (observed.expires_on && current.expires_on && String(observed.expires_on) < String(current.expires_on).slice(0, 10));
    return { change_kind: 'terms_changed', action: narrowed ? 'withdraw_current' : 'propose' };
  }
  return { change_kind: 'reconfirmed', action: 'observe' };
}

/** Pair an observed item with an existing incentive of the same community. */
function match(existing, observed) {
  const same = existing.filter((e) => e.type === observed.type && e.audience === observed.audience);
  if (same.length <= 1) return same[0] || null;
  const head = String(observed.headline || '').toLowerCase().slice(0, 40);
  return same.find((e) => String(e.headline || '').toLowerCase().slice(0, 40) === head) || same[0];
}

module.exports = { classify, match, comparable };
