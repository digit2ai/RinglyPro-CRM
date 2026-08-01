'use strict';

// =====================================================
// oos-intelligence.js — On-Shelf Availability intelligence for Store Health AI
//
// Upgrades Store Health AI from "this SKU is out" to "this stockout cost $X,
// here is why it happened, and here is who fixes it."
//
// RESEARCH BASIS — Gruen & Corsten, "Shelf-Confidence: A Practical Guide to
// Reducing Out-Of-Stocks and Improving Product Availability in Retail" (2022),
// and Gruen, Corsten & Bharadwaj (2002), Grocery Manufacturers of America.
//
// DIVISION OF LABOUR with the standalone platform:
//   client-builds/retail-out-of-stock-intelligence-platfor  = single store, single
//     day, batch upload. It explicitly DEFERS chain and category rollups.
//   this service = the multi-store layer. Store Health AI already owns stores,
//     regions, districts, alerts, tasks and the voice agents, so the chain
//     rollup, the ranked store league table and the alert wiring belong HERE.
//
// The four-step math is IMPORTED, never reimplemented — one classifier, one cost
// model, so a figure on the chain scorecard can never disagree with the same
// figure on the store dashboard.
// =====================================================

const { Op } = require('sequelize');
const { Store, InventoryLevel, OutOfStockEvent, sequelize } = require('../../models');

// ---------------------------------------------------------------------------
// Shared intelligence libs. Loaded defensively: if the client build is ever
// removed, Store Health AI must degrade to its existing behaviour rather than
// fail to boot and take /aiastore off the air.
// ---------------------------------------------------------------------------
let classifier = null;
let costModel = null;
let pipeline = null;
let libError = null;

try {
  const base = '../../../client-builds/retail-out-of-stock-intelligence-platfor/lib/';
  classifier = require(base + 'classifier');
  costModel = require(base + 'costModel');
  pipeline = require(base + 'pipeline');
} catch (err) {
  libError = err.message;
  console.error('[oos-intelligence] shared OOS libs unavailable:', err.message);
}

function available() {
  return !!(classifier && costModel && pipeline);
}

// ---------------------------------------------------------------------------
// Idempotent schema top-up.
//
// The attribution columns are added by ALTER, not by sync({alter:false}) —
// which never adds columns to an existing table. Runs once per process on the
// first OOS call, and is non-fatal: if the ALTER cannot run (read-only role,
// permissions), the analysis endpoints still work off InventoryLevel; only the
// backfill/persist path needs the new columns.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
let schemaPromise = null;

function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    try {
      const sqlPath = path.join(__dirname, '..', '..', 'migrations', '20260801-oos-intelligence.sql');
      await sequelize.query(fs.readFileSync(sqlPath, 'utf8'));
      return true;
    } catch (err) {
      console.error('[oos-intelligence] schema top-up skipped:', err.message);
      return false;
    }
  })();
  return schemaPromise;
}

// ---------------------------------------------------------------------------
// Pricing defaults.
//
// InventoryLevel carries no unit_price or margin — it was built for days-of-
// cover, not dollarization. Rather than invent a per-SKU price, we fall back to
// configurable org-level averages and LABEL the result.
//
// `price_basis` is 'actual' only when the row genuinely carried a price. A
// dollar figure derived from a default is always reported as an estimate — a
// fabricated precise number is worse than an honest approximate one, because a
// manager will act on it and then stop trusting the dashboard.
// ---------------------------------------------------------------------------
const DEFAULT_UNIT_PRICE = parseFloat(process.env.OOS_DEFAULT_UNIT_PRICE || '4.50');
const DEFAULT_MARGIN = parseFloat(process.env.OOS_DEFAULT_MARGIN || '0.30');

/**
 * Map a Store Health AI InventoryLevel row onto the shared pipeline's row shape.
 * Signals the pipeline can use but this schema lacks (PO status, planogram
 * flags, forecast velocity) are read from `metadata` when a feed has supplied
 * them, so a richer integration sharpens attribution with no code change here.
 */
function toPipelineRow(inv) {
  const meta = (inv.metadata && typeof inv.metadata === 'object') ? inv.metadata : {};
  const price = parseFloat(meta.unit_price);
  const margin = parseFloat(meta.margin);

  return {
    // Spread the whole metadata bag FIRST so every attribution signal the feed
    // supplies reaches the classifier. An explicit allowlist here silently
    // dropped signals the rule engine knows how to use (product_data_incomplete,
    // inventory_discrepancy, days_since_delivery, demand_spike, not_on_shelf,
    // po_qty_outstanding, ...), which made whole root-cause categories
    // unreachable no matter what the feed sent. The canonical fields below
    // still win, so metadata can never overwrite real inventory columns.
    ...meta,

    store_id: String(inv.store_id),
    sku: inv.sku,
    product_name: inv.product_name,
    category: inv.category,
    on_hand: parseInt(inv.quantity_on_hand, 10) || 0,
    avg_velocity: parseFloat(inv.average_daily_sales) || 0,
    unit_price: isFinite(price) && price > 0 ? price : DEFAULT_UNIT_PRICE,
    margin: isFinite(margin) && margin > 0 ? margin : DEFAULT_MARGIN,
    oos_days: parseFloat(meta.oos_days) || 1,
    status: 'active',

    _price_basis: (isFinite(price) && price > 0) ? 'actual' : 'default'
  };
}

/**
 * Run the full four-step pipeline for ONE store on ONE date.
 * @returns dashboard-shaped object, or null when no inventory exists for the day
 */
async function analyzeStore(storeId, date) {
  if (!available()) throw new Error('OOS intelligence libs unavailable: ' + libError);
  await ensureSchema(); // reconciles inventory_levels with its model before reading

  const snapshotDate = date || new Date().toISOString().slice(0, 10);

  const inventory = await InventoryLevel.findAll({
    where: { store_id: storeId, snapshot_date: snapshotDate },
    raw: true
  });

  if (!inventory.length) return null;

  const rows = inventory.map(toPipelineRow);
  const result = pipeline.run(rows, { tenant_id: storeId, event_date: snapshotDate });

  // Honesty: how much of the dollar figure rests on default pricing?
  const actualPriced = rows.filter((r) => r._price_basis === 'actual').length;
  const priceBasis = actualPriced === rows.length ? 'actual'
    : (actualPriced === 0 ? 'default' : 'mixed');

  return {
    store_id: storeId,
    snapshot_date: snapshotDate,
    ...result.summary,
    root_cause_mix: result.root_cause_mix,
    top_3_root_causes: result.root_cause_mix.slice(0, 3),
    layer_mix: result.layer_mix,
    events: result.events,
    price_basis: priceBasis,
    is_estimated: priceBasis !== 'actual',
    estimation_note: priceBasis === 'actual' ? null
      : `Lost-sales dollars use a default unit price of $${DEFAULT_UNIT_PRICE.toFixed(2)} and ${(DEFAULT_MARGIN * 100).toFixed(0)}% margin for ${rows.length - actualPriced} of ${rows.length} SKUs. Supply unit_price/margin in inventory metadata for actual figures.`,
    benchmarks: BENCHMARKS
  };
}

/**
 * Chain rollup — every store in an organization for one date, ranked by the
 * dollars bleeding out. This is what the standalone single-store platform
 * defers, and it is the reason this lives in Store Health AI.
 */
async function analyzeChain(organizationId, date) {
  if (!available()) throw new Error('OOS intelligence libs unavailable: ' + libError);

  const snapshotDate = date || new Date().toISOString().slice(0, 10);

  const where = { status: 'active' };
  if (organizationId) where.organization_id = organizationId;
  const stores = await Store.findAll({ where, raw: true });

  const perStore = [];
  // Chain-wide cause mix is re-aggregated from every store's raw events, so the
  // mix is weighted by real event counts rather than by averaging store
  // percentages (which would let a 200-SKU store swing the chain number as hard
  // as a 20,000-SKU one). Collected in the SAME pass as the league table —
  // analyzing each store twice would double the query load for no new data.
  const allEvents = [];

  for (const s of stores) {
    const r = await analyzeStore(s.id, snapshotDate);
    if (!r) continue;
    allEvents.push(...r.events);
    perStore.push({
      store_id: s.id,
      store_code: s.store_code,
      name: s.name,
      city: s.city,
      state: s.state,
      region_id: s.region_id,
      district_id: s.district_id,
      oos_rate: r.oos_rate,
      oos_count: r.oos_count,
      total_skus: r.total_skus,
      lost_sales_usd: r.lost_sales_usd,
      lost_gross_profit_usd: r.lost_gross_profit_usd,
      net_retailer_loss_usd: r.net_retailer_loss_usd,
      in_store_pct: r.layer_mix.in_store_pct,
      top_root_cause: r.top_3_root_causes[0] ? r.top_3_root_causes[0].category : null,
      is_estimated: r.is_estimated
    });
  }

  // Chain aggregates
  const sum = (k) => perStore.reduce((a, s) => a + (parseFloat(s[k]) || 0), 0);
  const totalSkus = perStore.reduce((a, s) => a + (s.total_skus || 0), 0);
  const totalOos = perStore.reduce((a, s) => a + (s.oos_count || 0), 0);

  const lostSales = costModel.money(sum('lost_sales_usd'));
  const lostGp = costModel.money(sum('lost_gross_profit_usd'));

  return {
    organization_id: organizationId || null,
    snapshot_date: snapshotDate,
    store_count: perStore.length,
    oos_count: totalOos,
    total_skus: totalSkus,
    oos_rate: totalSkus ? costModel.money((totalOos / totalSkus) * 100) : 0,
    lost_sales_usd: lostSales,
    lost_gross_profit_usd: lostGp,
    net_retailer_loss_usd: costModel.money(sum('net_retailer_loss_usd')),
    annualized_lost_sales_usd: costModel.annualize(lostSales),
    annualized_lost_gross_profit_usd: costModel.annualize(lostGp),
    root_cause_mix: classifier.mix(allEvents),
    layer_mix: classifier.layerMix(allEvents),
    // Worst offenders first — the league table a district manager works from.
    stores_by_impact: perStore.sort((a, b) => b.lost_sales_usd - a.lost_sales_usd),
    is_estimated: perStore.some((s) => s.is_estimated),
    benchmarks: BENCHMARKS
  };
}

/**
 * Persist root cause + dollarization onto existing out_of_stock_events rows.
 * Only fills columns that are still null, so a human correction is never
 * overwritten by a later automated pass.
 */
async function backfillEvents(storeId, date, limit) {
  if (!available()) throw new Error('OOS intelligence libs unavailable: ' + libError);
  await ensureSchema(); // the attribution columns must exist before we write them

  const cap = Math.min(5000, parseInt(limit, 10) || 1000);
  const where = { root_cause: null };
  if (storeId) where.store_id = storeId;

  const events = await OutOfStockEvent.findAll({ where, limit: cap });
  if (!events.length) return { updated: 0, scanned: 0 };

  // Pull the matching inventory context for attribution signals.
  const skus = Array.from(new Set(events.map((e) => e.sku)));
  const inventory = await InventoryLevel.findAll({
    where: { sku: { [Op.in]: skus } },
    raw: true
  });
  const invBySku = new Map();
  for (const i of inventory) invBySku.set(i.store_id + '|' + i.sku, i);

  let updated = 0;
  for (const ev of events) {
    const inv = invBySku.get(ev.store_id + '|' + ev.sku);
    const row = inv ? toPipelineRow(inv) : {
      store_id: String(ev.store_id), sku: ev.sku, on_hand: 0,
      avg_velocity: 0, unit_price: DEFAULT_UNIT_PRICE, margin: DEFAULT_MARGIN
    };
    // duration_hours is the real observed outage when we have it.
    row.oos_days = ev.duration_hours ? Math.max(0.01, ev.duration_hours / 24) : 1;

    const verdict = classifier.classify(row);
    const priced = costModel.priceEvent(row);

    const patch = {
      root_cause: verdict.root_cause,
      oos_layer: verdict.layer,
      root_cause_confidence: verdict.confidence,
      root_cause_why: verdict.why,
      recommended_action: verdict.action
    };
    // Never overwrite an existing lost-sales figure that came from a real feed.
    if (ev.estimated_lost_sales === null || ev.estimated_lost_sales === undefined) {
      patch.estimated_lost_sales = priced.lost_sales_usd;
    }
    if (ev.lost_gross_profit === null || ev.lost_gross_profit === undefined) {
      patch.lost_gross_profit = priced.lost_gross_profit_usd;
    }

    await ev.update(patch);
    updated += 1;
  }

  return { updated, scanned: events.length };
}

const BENCHMARKS = {
  worldwide_oos_rate_pct: 8.3,
  retailer_sales_loss_pct: 4.0,
  in_store_root_cause_pct: 72.5,
  shopper_response: {
    substitute_same_brand_pct: 26,
    substitute_other_brand_pct: 19,
    delay_purchase_pct: 15,
    buy_elsewhere_pct: 31,
    do_not_purchase_pct: 9
  },
  source: 'Gruen & Corsten, Shelf-Confidence: A Practical Guide to Reducing Out-Of-Stocks and Improving Product Availability in Retail (iUniverse, 2022); Gruen, Corsten & Bharadwaj (2002), Grocery Manufacturers of America'
};

/**
 * On-Shelf Availability score, 0-100, for the Store Health composite.
 * Anchored on the research: the worldwide average 8.3% rate scores 50, a
 * perfect shelf scores 100, and double the world average scores 0. A store that
 * merely matches the global average should read as average, not as healthy.
 */
function osaScore(oosRate) {
  const rate = parseFloat(oosRate) || 0;
  const world = BENCHMARKS.worldwide_oos_rate_pct;
  if (rate <= 0) return 100;
  if (rate >= world * 2) return 0;
  return Math.round(Math.max(0, Math.min(100, 100 - (rate / (world * 2)) * 100)));
}

module.exports = {
  available,
  ensureSchema,
  analyzeStore,
  analyzeChain,
  backfillEvents,
  osaScore,
  toPipelineRow,
  BENCHMARKS,
  libError: () => libError
};
