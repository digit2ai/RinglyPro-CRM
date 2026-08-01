// =====================================================
// lib/costModel.js — Lost-sales dollarization ("Motivation" step)
//
// Turns an out-of-stock event into money. This is Step 1 of the four-step
// framework (Motivation -> Measurement -> Attribution -> Action): nobody
// funds an availability program until the bleed has a dollar sign on it.
//
// RESEARCH BASIS — Gruen & Corsten, "Shelf-Confidence: A Practical Guide to
// Reducing Out-Of-Stocks and Improving Product Availability in Retail"
// (iUniverse, 2022), and the foundational Gruen, Corsten & Bharadwaj (2002)
// worldwide study for the Grocery Manufacturers of America:
//   - Worldwide average OOS rate ~8.3%, regularly >10% on promoted / fast movers
//   - Retailers lose ~4% of sales to out-of-stocks, with a comparable ~4% hit
//     to earnings per share
//   - Shoppers respond to a stockout in exactly five ways (see SHOPPER_RESPONSE)
//
// The five-response model matters because GROSS lost sales overstates what the
// retailer actually loses: a shopper who substitutes another item in the same
// store costs the retailer nothing (it costs the MANUFACTURER a unit). Only the
// "buy elsewhere" and "don't buy" branches are true retailer losses. We report
// both figures so the store manager sees the honest number and the category
// manager sees the brand number.
// =====================================================

'use strict';

// ---------------------------------------------------------------------------
// Shopper response distribution to a stockout.
// Source: Gruen, Corsten & Bharadwaj (2002), GMA — the canonical split still
// cited throughout the Shelf-Confidence book. Percentages are of shoppers who
// intended to buy the out-of-stock item.
// ---------------------------------------------------------------------------
const SHOPPER_RESPONSE = {
  substitute_same_brand: 0.26,   // different size/variant, same brand — retailer keeps the sale
  substitute_other_brand: 0.19,  // switches brand — retailer keeps it, manufacturer loses it
  delay_purchase: 0.15,          // comes back to THIS store later — recoverable
  buy_elsewhere: 0.31,           // walks to a competitor — the response that destroys shelf-confidence
  do_not_purchase: 0.09          // demand evaporates — lost by everyone
};

// What the RETAILER truly loses: the shopper left or bought nothing.
const RETAILER_LOSS_SHARE =
  SHOPPER_RESPONSE.buy_elsewhere + SHOPPER_RESPONSE.do_not_purchase; // 0.40

// What the MANUFACTURER/brand loses: anything that is not their own item sold.
const BRAND_LOSS_SHARE =
  SHOPPER_RESPONSE.substitute_other_brand +
  SHOPPER_RESPONSE.buy_elsewhere +
  SHOPPER_RESPONSE.do_not_purchase; // 0.59

// Round to cents without float drift (0.1 + 0.2 problems compound over a batch).
function money(n) {
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : fallback;
}

/**
 * Price a single out-of-stock event.
 *
 * Headline math (the figure a store manager is held to):
 *   lost_units        = avg_velocity (units/day) x oos_days
 *   lost_sales_usd    = lost_units x unit_price
 *   lost_gross_profit = lost_sales_usd x margin
 *
 * Shelf-Confidence refinements (reported alongside, never instead):
 *   net_retailer_loss_usd — gross x 0.40, the share where the shopper actually
 *                           left the store or bought nothing
 *   brand_loss_usd        — gross x 0.59, the share the item's manufacturer lost
 *   recoverable_usd       — gross x 0.15, the delayed-purchase share that comes
 *                           back if the item is restocked promptly
 *
 * @param {object} row
 * @param {number} row.avg_velocity  trailing average daily unit sales
 * @param {number} row.unit_price    retail price per unit (USD)
 * @param {number} row.margin        gross margin as a decimal (0.30 = 30%)
 * @param {number} row.oos_days      days the item was unavailable
 * @returns {object} priced event fields
 */
function priceEvent(row) {
  const velocity = Math.max(0, num(row.avg_velocity, 0));
  const price = Math.max(0, num(row.unit_price, 0));
  const margin = Math.min(1, Math.max(0, num(row.margin, 0)));
  const days = Math.max(0, num(row.oos_days, 0));

  const lostUnits = velocity * days;
  const lostSales = lostUnits * price;
  const lostGp = lostSales * margin;

  return {
    lost_units: money(lostUnits),
    lost_sales_usd: money(lostSales),
    lost_gross_profit_usd: money(lostGp),
    // Shelf-Confidence five-response adjustments
    net_retailer_loss_usd: money(lostSales * RETAILER_LOSS_SHARE),
    brand_loss_usd: money(lostSales * BRAND_LOSS_SHARE),
    recoverable_usd: money(lostSales * SHOPPER_RESPONSE.delay_purchase)
  };
}

/**
 * Roll a set of priced events into store-level totals.
 * `total_skus` is the denominator for the OOS rate — the count of active SKUs
 * that were expected to sell, NOT the count of stockouts.
 */
function summarize(events, totalSkus) {
  const denom = Math.max(1, num(totalSkus, events.length || 1));
  const sum = (key) => events.reduce((acc, e) => acc + num(e[key], 0), 0);

  return {
    oos_count: events.length,
    total_skus: num(totalSkus, events.length),
    oos_rate: money((events.length / denom) * 100),
    lost_sales_usd: money(sum('lost_sales_usd')),
    lost_gross_profit_usd: money(sum('lost_gross_profit_usd')),
    net_retailer_loss_usd: money(sum('net_retailer_loss_usd')),
    brand_loss_usd: money(sum('brand_loss_usd')),
    recoverable_usd: money(sum('recoverable_usd'))
  };
}

/**
 * Annualized run-rate from one day's bleed. Store managers discount a $400 day;
 * they do not discount $146,000 a year. This is the "Motivation" lever.
 */
function annualize(dailyUsd) {
  return money(num(dailyUsd, 0) * 365);
}

module.exports = {
  priceEvent,
  summarize,
  annualize,
  money,
  SHOPPER_RESPONSE,
  RETAILER_LOSS_SHARE,
  BRAND_LOSS_SHARE
};
