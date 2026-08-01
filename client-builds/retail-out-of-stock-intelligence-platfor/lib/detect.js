// =====================================================
// lib/detect.js — OOS event detection ("Measurement" step)
//
// Step 2 of the four-step framework. Converts a raw daily POS + inventory row
// set into discrete out-of-stock EVENTS. An event is not "a zero" — it is an
// item that was expected to sell and could not be bought.
//
// RESEARCH BASIS — Gruen & Corsten, "Shelf-Confidence" (2022). Two detection
// subtleties the book is emphatic about, both implemented here:
//
//   1. ZERO ON-HAND IS NOT THE ONLY STOCKOUT. The book's headline execution
//      finding is that stock frequently sits in the back room while the facing
//      is empty. A detector that only fires on on_hand <= 0 misses the largest
//      and most fixable category outright. We therefore also fire on an
//      explicit shelf-empty / planogram signal even when on_hand > 0.
//
//   2. CENSORED DEMAND. Sales during a stockout read as zero, which teaches the
//      forecast that nobody wants the item — the stockout then justifies itself
//      next cycle. We carry TRAILING velocity (measured before the stockout)
//      rather than same-day sales, so the lost-sales figure is not silently
//      suppressed by the very outage it is measuring.
//
// Detection is deliberately conservative: an item explicitly marked
// discontinued, seasonal-out or not-yet-authorized is NOT a stockout, because
// charging a manager for an item they were told to stop carrying destroys
// trust in every other number on the dashboard.
// =====================================================

'use strict';

function num(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : fallback;
}

function truthy(v) {
  if (v === true) return true;
  if (typeof v === 'string') return ['true', 'yes', 'y', '1'].includes(v.trim().toLowerCase());
  return v === 1;
}

function falsy(v) {
  if (v === false) return true;
  if (typeof v === 'string') return ['false', 'no', 'n', '0'].includes(v.trim().toLowerCase());
  return v === 0;
}

/**
 * Is this row an item we legitimately expect to be buyable today?
 * Anything intentionally absent is excluded from both numerator and denominator.
 */
function isExpectedToSell(row) {
  const status = String(row.status || row.item_status || 'active').trim().toLowerCase();
  if (['discontinued', 'delisted', 'inactive', 'seasonal_out', 'not_authorized'].includes(status)) {
    return false;
  }
  if (truthy(row.discontinued) || truthy(row.seasonal_out)) return false;
  if (row.active !== undefined && falsy(row.active)) return false;
  // An item with no demand history cannot generate a measurable lost sale.
  if (num(row.avg_velocity, 0) <= 0) return false;
  return true;
}

/**
 * Does this row represent an out-of-stock condition?
 * Two independent triggers, per the book's back-room finding.
 */
function isOutOfStock(row) {
  const onHand = num(row.on_hand, 0);
  if (onHand <= 0) return true;                                  // classic stockout
  if (truthy(row.shelf_empty) || truthy(row.not_on_shelf)) return true; // on-shelf stockout
  return false;
}

/**
 * Days the item was unavailable. Defaults to 1 (a single-day batch) so the
 * math is never silently zeroed by a missing column.
 */
function oosDays(row) {
  const explicit = num(row.oos_days, NaN);
  if (isFinite(explicit) && explicit > 0) return explicit;
  const hours = num(row.oos_hours, NaN);
  if (isFinite(hours) && hours > 0) return Math.round((hours / 24) * 100) / 100;
  return 1;
}

/**
 * Run detection across a batch of rows.
 *
 * @param {Array<object>} rows raw POS + inventory rows for one store-day
 * @returns {{events:Array<object>, total_skus:number, skipped:number}}
 *   events     — rows that are genuine stockouts, normalized + annotated
 *   total_skus — active SKUs expected to sell (the OOS-rate denominator)
 *   skipped    — rows excluded as not-expected-to-sell
 */
function detect(rows) {
  const events = [];
  let totalSkus = 0;
  let skipped = 0;

  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!raw || typeof raw !== 'object') { skipped += 1; continue; }

    if (!isExpectedToSell(raw)) { skipped += 1; continue; }
    totalSkus += 1;

    if (!isOutOfStock(raw)) continue;

    const days = oosDays(raw);
    const onHand = num(raw.on_hand, 0);

    events.push({
      // identity
      store_id: String(raw.store_id || raw.store || '').trim(),
      sku: String(raw.sku || raw.item_id || '').trim(),
      product_name: raw.product_name || raw.description || null,
      category: raw.category || null,
      // measurement inputs (trailing velocity — never same-day censored sales)
      on_hand: onHand,
      avg_velocity: num(raw.avg_velocity, 0),
      unit_price: num(raw.unit_price, 0),
      margin: num(raw.margin, 0),
      oos_days: days,
      // the on-shelf variant: stock exists in the building but not on the facing
      on_shelf_stockout: onHand > 0,
      // pass the raw row through so the classifier can read order/POG signals
      _raw: raw
    });
  }

  return { events, total_skus: totalSkus, skipped };
}

module.exports = { detect, isOutOfStock, isExpectedToSell, oosDays };
