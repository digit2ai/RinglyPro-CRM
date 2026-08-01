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
let currency = null;
let libError = null;

try {
  const base = '../../../client-builds/retail-out-of-stock-intelligence-platfor/lib/';
  classifier = require(base + 'classifier');
  costModel = require(base + 'costModel');
  pipeline = require(base + 'pipeline');
  currency = require(base + 'currency');
} catch (err) {
  libError = err.message;
  console.error('[oos-intelligence] shared OOS libs unavailable:', err.message);
}

function available() {
  return !!(classifier && costModel && pipeline && currency);
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
    const sqlPath = path.join(__dirname, '..', '..', 'migrations', '20260801-oos-intelligence.sql');
    let sql;
    try {
      sql = fs.readFileSync(sqlPath, 'utf8');
    } catch (err) {
      console.error('[oos-intelligence] migration file unreadable:', err.message);
      return false;
    }

    // Run statement by statement, each independently.
    //
    // Sending the whole file as one query puts every statement in a single
    // implicit transaction: one failure rolls back ALL of them. That is exactly
    // what happened in production — a legacy-column ALTER that does not apply to
    // every environment aborted the batch, so `metadata` was never added and
    // every OOS read 500'd with 'column "metadata" does not exist'. Isolating
    // statements means an inapplicable one costs only itself.
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter((s) => s.length > 0);

    let applied = 0;
    const failures = [];
    for (const stmt of statements) {
      try {
        await sequelize.query(stmt);
        applied += 1;
      } catch (err) {
        failures.push(err.message.split('\n')[0]);
      }
    }

    if (failures.length) {
      console.error(`[oos-intelligence] schema top-up: ${applied}/${statements.length} applied, ${failures.length} skipped:`);
      failures.forEach((f) => console.error('   - ' + f));
    } else {
      console.log(`[oos-intelligence] schema top-up: ${applied}/${statements.length} statements applied`);
    }

    // Success is defined by the columns the service actually needs existing,
    // not by every statement succeeding — some are legacy fixes that simply do
    // not apply in a given environment.
    try {
      const [rows] = await sequelize.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='inventory_levels' AND column_name IN ('metadata','quantity_on_hand','average_daily_sales','snapshot_date','product_name')"
      );
      const have = new Set(rows.map((r) => r.column_name));
      const need = ['metadata', 'quantity_on_hand', 'average_daily_sales', 'snapshot_date', 'product_name'];
      const missing = need.filter((c) => !have.has(c));
      if (missing.length) {
        console.error('[oos-intelligence] still missing columns:', missing.join(', '));
        return false;
      }
      return true;
    } catch (err) {
      console.error('[oos-intelligence] schema verification failed:', err.message);
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

  // Store identity travels with the analysis: a drill-down view has to name the
  // store, its country and the currency its figures are in, or a district
  // manager comparing two tabs cannot tell which is which.
  const store = await Store.findByPk(storeId, { raw: true });

  const rows = inventory.map(toPipelineRow);
  const result = pipeline.run(rows, { tenant_id: storeId, event_date: snapshotDate });

  // Honesty: how much of the dollar figure rests on default pricing?
  const actualPriced = rows.filter((r) => r._price_basis === 'actual').length;
  const priceBasis = actualPriced === rows.length ? 'actual'
    : (actualPriced === 0 ? 'default' : 'mixed');

  const localCcy = (store && store.currency) || 'USD';

  return {
    store_id: storeId,
    store: store ? {
      id: store.id,
      store_code: store.store_code,
      name: store.name,
      address: store.address,
      city: store.city,
      state: store.state,
      country: store.country || 'US',
      currency: localCcy,
      timezone: store.timezone,
      manager_name: store.manager_name,
      manager_email: store.manager_email,
      region_id: store.region_id,
      district_id: store.district_id
    } : null,
    // Figures below are in the STORE'S OWN currency — this view belongs to the
    // person who works that building, not to chain finance. The chain rollup is
    // where normalization happens.
    currency: localCcy,
    currency_symbol: currency.symbolFor(localCcy),
    reporting_currency: currency.reportingCurrency(),
    fx_rate_to_reporting: currency.rateFor(currency.reportingCurrency()) && currency.rateFor(localCcy)
      ? Math.round((currency.rateFor(currency.reportingCurrency()) / currency.rateFor(localCcy)) * 1e6) / 1e6
      : null,
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
async function analyzeChain(organizationId, date, filters) {
  if (!available()) throw new Error('OOS intelligence libs unavailable: ' + libError);

  const snapshotDate = date || new Date().toISOString().slice(0, 10);
  const f = filters || {};
  const reporting = currency.reportingCurrency();

  const where = { status: 'active' };
  if (organizationId) where.organization_id = organizationId;
  // Hierarchy filters — country / region / district. A chain with hundreds of
  // stores is unreadable as one flat list; a district manager needs their slice.
  if (f.country) where.country = String(f.country).toUpperCase();
  if (f.region_id) where.region_id = parseInt(f.region_id, 10);
  if (f.district_id) where.district_id = parseInt(f.district_id, 10);
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

    // Every store's figures are native to its own currency. Normalize to ONE
    // reporting currency before they are summed or ranked — otherwise a CAD
    // store showing 9,000 outranks a USD store showing 8,000 despite losing
    // less money. `_native` keeps the local figure for the store detail view.
    const localCcy = (s.currency || 'USD').toUpperCase();
    const norm = currency.normalize({
      lost_sales: r.lost_sales_usd,
      lost_gross_profit: r.lost_gross_profit_usd,
      net_retailer_loss: r.net_retailer_loss_usd
    }, localCcy, reporting);

    perStore.push({
      store_id: s.id,
      store_code: s.store_code,
      name: s.name,
      city: s.city,
      state: s.state,
      country: s.country || 'US',
      currency: localCcy,
      region_id: s.region_id,
      district_id: s.district_id,
      manager_name: s.manager_name,
      oos_rate: r.oos_rate,
      oos_count: r.oos_count,
      total_skus: r.total_skus,

      // normalized to the reporting currency — what the league table sorts on
      lost_sales_usd: norm.values.lost_sales !== null ? norm.values.lost_sales : r.lost_sales_usd,
      lost_gross_profit_usd: norm.values.lost_gross_profit !== null ? norm.values.lost_gross_profit : r.lost_gross_profit_usd,
      net_retailer_loss_usd: norm.values.net_retailer_loss !== null ? norm.values.net_retailer_loss : r.net_retailer_loss_usd,

      // native figures, for the store's own manager
      native: {
        currency: localCcy,
        lost_sales: r.lost_sales_usd,
        lost_gross_profit: r.lost_gross_profit_usd
      },
      fx_rate: norm.fx_rate,
      fx_converted: norm.converted,
      fx_source: norm.fx_source,

      in_store_pct: r.layer_mix.in_store_pct,
      osa_score: osaScore(r.oos_rate),
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
    filters: {
      country: f.country ? String(f.country).toUpperCase() : null,
      region_id: f.region_id ? parseInt(f.region_id, 10) : null,
      district_id: f.district_id ? parseInt(f.district_id, 10) : null
    },
    store_count: perStore.length,
    oos_count: totalOos,
    total_skus: totalSkus,
    oos_rate: totalSkus ? costModel.money((totalOos / totalSkus) * 100) : 0,
    lost_sales_usd: lostSales,
    lost_gross_profit_usd: lostGp,
    net_retailer_loss_usd: costModel.money(sum('net_retailer_loss_usd')),
    annualized_lost_sales_usd: costModel.annualize(lostSales),
    annualized_lost_gross_profit_usd: costModel.annualize(lostGp),

    // Currency provenance for every figure above.
    reporting_currency: reporting,
    currencies_present: Array.from(new Set(perStore.map((s) => s.currency))).sort(),
    fx_source: 'configured',
    fx_note: 'Store figures are normalized to the reporting currency at configured rates, not live market rates. Override with OOS_FX_<CCY>.',

    root_cause_mix: classifier.mix(allEvents),
    layer_mix: classifier.layerMix(allEvents),

    // Hierarchy rollups — an international chain is navigated top-down:
    // country -> region -> district -> store, not as one flat list.
    by_country: rollup(perStore, 'country', reporting),
    by_region: rollup(perStore, 'region_id', reporting),
    by_district: rollup(perStore, 'district_id', reporting),

    // Worst offenders first — the league table a district manager works from.
    stores_by_impact: perStore.slice().sort((a, b) => b.lost_sales_usd - a.lost_sales_usd),
    is_estimated: perStore.some((s) => s.is_estimated),
    benchmarks: BENCHMARKS
  };
}

/**
 * Group the per-store rows by one key and aggregate.
 *
 * Rates are recomputed from summed counts, never averaged from the child rates:
 * averaging percentages lets a 200-SKU store move the group number as hard as a
 * 20,000-SKU one, which quietly misreports every rollup above store level.
 */
function rollup(perStore, key, reportingCcy) {
  const groups = new Map();

  for (const s of perStore) {
    const k = s[key];
    if (k === null || k === undefined) continue;
    if (!groups.has(k)) {
      groups.set(k, {
        key: k, store_count: 0, oos_count: 0, total_skus: 0,
        lost_sales_usd: 0, lost_gross_profit_usd: 0,
        in_store_sum: 0, currencies: new Set(), estimated: false
      });
    }
    const g = groups.get(k);
    g.store_count += 1;
    g.oos_count += s.oos_count || 0;
    g.total_skus += s.total_skus || 0;
    g.lost_sales_usd += s.lost_sales_usd || 0;
    g.lost_gross_profit_usd += s.lost_gross_profit_usd || 0;
    g.in_store_sum += (s.in_store_pct || 0) * (s.oos_count || 0);
    g.currencies.add(s.currency);
    if (s.is_estimated) g.estimated = true;
  }

  return Array.from(groups.values()).map((g) => ({
    key: g.key,
    store_count: g.store_count,
    oos_count: g.oos_count,
    total_skus: g.total_skus,
    oos_rate: g.total_skus ? costModel.money((g.oos_count / g.total_skus) * 100) : 0,
    lost_sales_usd: costModel.money(g.lost_sales_usd),
    lost_gross_profit_usd: costModel.money(g.lost_gross_profit_usd),
    annualized_lost_sales_usd: costModel.annualize(g.lost_sales_usd),
    // Event-weighted, so a small store cannot swing the group's split.
    in_store_pct: g.oos_count ? Math.round((g.in_store_sum / g.oos_count) * 10) / 10 : 0,
    osa_score: osaScore(g.total_skus ? (g.oos_count / g.total_skus) * 100 : 0),
    currencies: Array.from(g.currencies).sort(),
    reporting_currency: reportingCcy,
    is_estimated: g.estimated
  })).sort((a, b) => b.lost_sales_usd - a.lost_sales_usd);
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
  rollup,
  analyzeStore,
  analyzeChain,
  backfillEvents,
  osaScore,
  toPipelineRow,
  BENCHMARKS,
  libError: () => libError
};
