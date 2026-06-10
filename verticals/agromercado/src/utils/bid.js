'use strict';

/**
 * AgroMercado — minimum-bid algorithm (per ISTC spec v1.0.1, §3.2)
 *
 *   P_min = P_actual + Δ_base × (1 + ln(Count_pujas + 1))
 *
 * where P_actual = current winning bid, Δ_base = per-category base increment
 * (e.g. $50 USD for high-genetics semovientes), and the logarithmic factor
 * scales the required increment with the lot's bid volume (urgency).
 */

/**
 * @param {number} currentBid  current winning bid in USD (use start price if no bids)
 * @param {number} baseIncrement  Δ_base for the category, USD
 * @param {number} bidCount  number of bids already placed on the lot
 * @returns {number} minimum acceptable next bid, rounded to 2 decimals
 */
function minimumBid(currentBid, baseIncrement, bidCount) {
  const p = Number(currentBid) || 0;
  const delta = Number(baseIncrement) || 0;
  const n = Math.max(0, Number(bidCount) || 0);
  const pMin = p + delta * (1 + Math.log(n + 1));
  return Math.round(pMin * 100) / 100;
}

module.exports = { minimumBid };
