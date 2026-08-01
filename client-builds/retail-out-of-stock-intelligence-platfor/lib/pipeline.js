// =====================================================
// lib/pipeline.js — the four-step framework, end to end, in one call.
//
//   Motivation  -> costModel.priceEvent  (what is this costing us?)
//   Measurement -> detect.detect         (which items were actually unbuyable?)
//   Attribution -> classifier.classify   (whose problem is it?)
//   Action      -> classifier action     (what do we do Monday morning?)
//
// Pure function over rows. No I/O, no DB — so the same pipeline runs inside the
// ingest route, inside SIT, and inside the Store Health AI upgrade without
// three drifting copies of the math.
// =====================================================

'use strict';

const { detect } = require('./detect');
const { classify, mix, layerMix } = require('./classifier');
const { priceEvent, summarize, annualize } = require('./costModel');

/**
 * @param {Array<object>} rows raw POS + inventory rows (one store-day)
 * @param {object} opts { tenant_id, batch_id, event_date }
 * @returns {{events:Array, summary:object, root_cause_mix:Array, layer_mix:object, total_skus:number, skipped:number}}
 */
function run(rows, opts = {}) {
  const tenantId = opts.tenant_id || 1;
  const batchId = opts.batch_id || null;
  const eventDate = opts.event_date || new Date().toISOString().slice(0, 10);

  // --- Measurement ---
  const { events: detected, total_skus, skipped } = detect(rows);

  // --- Motivation + Attribution, per event ---
  const events = detected.map((e) => {
    const priced = priceEvent(e);
    // The classifier reads the ORIGINAL row (order/POG/forecast columns live
    // there), merged with the normalized detection fields.
    const verdict = classify({ ...(e._raw || {}), ...e });

    return {
      tenant_id: tenantId,
      batch_id: batchId,
      store_id: e.store_id,
      sku: e.sku,
      product_name: e.product_name,
      category: e.category,

      on_hand: e.on_hand,
      avg_velocity: e.avg_velocity,
      unit_price: e.unit_price,
      margin: e.margin,
      oos_days: e.oos_days,
      on_shelf_stockout: e.on_shelf_stockout,

      lost_units: priced.lost_units,
      lost_sales_usd: priced.lost_sales_usd,
      lost_gross_profit_usd: priced.lost_gross_profit_usd,
      net_retailer_loss_usd: priced.net_retailer_loss_usd,
      brand_loss_usd: priced.brand_loss_usd,
      recoverable_usd: priced.recoverable_usd,

      root_cause: verdict.root_cause,
      layer: verdict.layer,
      confidence: verdict.confidence,
      rule: verdict.rule,
      why: verdict.why,
      action: verdict.action,

      event_date: eventDate,
      created_at: new Date()
    };
  });

  const summary = summarize(events, total_skus);
  summary.annualized_lost_sales_usd = annualize(summary.lost_sales_usd);
  summary.annualized_lost_gross_profit_usd = annualize(summary.lost_gross_profit_usd);
  // How many stockouts had stock in the building — the back-room share.
  summary.on_shelf_stockout_count = events.filter((e) => e.on_shelf_stockout).length;

  return {
    events,
    summary,
    root_cause_mix: mix(events),
    layer_mix: layerMix(events),
    total_skus,
    skipped
  };
}

module.exports = { run };
