'use strict';

// =====================================================
// oos-demo-seed.js — one realistic inventory day for every active store.
//
// Shared by the CLI (store-health-ai/seed-oos-demo.js) and the JWT-gated
// POST /api/v1/oos/seed-demo endpoint. The endpoint exists because the local
// .env DATABASE_URL and the production DATABASE_URL are DIFFERENT databases —
// seeding from a laptop populates dev, not prod.
//
// Deterministic (no RNG) so a demo looks identical every time it is shown, and
// idempotent: re-running for a date replaces that date's rows rather than
// duplicating them.
// =====================================================

const { Store, InventoryLevel } = require('../../models');
const oos = require('./oos-intelligence');

const CATEGORIES = ['Pantry', 'Beverage', 'Snacks', 'Dairy', 'Frozen', 'Household', 'Produce', 'Bakery', 'Seasonal', 'Meat'];
const SKUS_PER_STORE = 250;

// Small deterministic hash so each store gets its own stable pattern.
function h(n) {
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

function buildStoreDay(store, date) {
  const rows = [];
  // Target rate varies 4%-13% across stores so the league table is meaningful
  // and the benchmark comparison is not uniform across the chain.
  const targetRate = 0.04 + h(store.id * 7 + 1) * 0.09;
  const oosCount = Math.round(SKUS_PER_STORE * targetRate);

  for (let i = 0; i < SKUS_PER_STORE; i++) {
    const seed = h(store.id * 1000 + i);
    const isOos = i < oosCount;
    const velocity = Math.round((0.5 + seed * 24) * 10) / 10;
    const price = Math.round((1.25 + h(i * 3 + store.id) * 13) * 100) / 100;
    const margin = Math.round((0.18 + h(i * 5 + store.id) * 0.3) * 100) / 100;

    const meta = { unit_price: price, margin: margin };
    let onHand = 15 + Math.round(seed * 180);

    if (isOos) {
      meta.oos_days = 1 + Math.round(h(i + store.id) * 3);
      // Spread the seven causes across the stockouts, weighted toward
      // store-level causes so the mix lands near the 70-75% the research finds.
      const bucket = i % 10;
      if (bucket <= 2) {
        onHand = 12 + Math.round(seed * 40);   // Planogram Compliance (shelf)
        meta.shelf_empty = true;
      } else if (bucket === 3 || bucket === 4) {
        onHand = 0; meta.recent_delivery = true;              // Order/Inventory Accuracy
      } else if (bucket === 5) {
        onHand = 0; meta.shelf_capacity = Math.max(1, Math.floor(velocity / 2)); // Shelf Space
      } else if (bucket === 6) {
        onHand = 0; meta.po_open = true; meta.po_filled = false;  // Replenishment
      } else if (bucket === 7) {
        onHand = 0; meta.forecast_velocity = Math.max(0.5, velocity / 2.5); // Forecast
      } else if (bucket === 8) {
        onHand = 0; meta.product_data_incomplete = true;      // Product Data Accuracy
      } else {
        onHand = 0;                                           // Item Management fallback
      }
    }

    rows.push({
      store_id: store.id,
      sku: `${store.store_code}-${String(i).padStart(4, '0')}`,
      product_name: `${CATEGORIES[i % CATEGORIES.length]} Item ${i + 1}`,
      category: CATEGORIES[i % CATEGORIES.length],
      snapshot_date: date,
      quantity: onHand,
      quantity_on_hand: onHand,
      average_daily_sales: velocity,
      days_of_cover: velocity > 0 ? Math.round((onHand / velocity) * 100) / 100 : 0,
      is_top_sku: i < 25,
      is_out_of_stock: isOos && onHand === 0,
      status: isOos ? 'red' : (onHand < velocity * 2 ? 'yellow' : 'green'),
      metadata: meta
    });
  }
  return rows;
}

/**
 * Seed one demo day across every active store.
 * @param {string} date YYYY-MM-DD (defaults to today)
 * @returns {{seeded_rows:number, stores:number, date:string, chain:object}}
 */
async function seedDemoDay(date) {
  const day = date || new Date().toISOString().slice(0, 10);

  const schemaOk = await oos.ensureSchema();
  if (!schemaOk) {
    throw new Error('schema top-up incomplete — see logs; cannot seed');
  }

  const stores = await Store.findAll({ where: { status: 'active' }, raw: true });
  if (!stores.length) throw new Error('no active stores to seed');

  let total = 0;
  const perStore = [];
  for (const s of stores) {
    // Idempotent: this date's rows for this store are replaced, not duplicated.
    await InventoryLevel.destroy({ where: { store_id: s.id, snapshot_date: day } });
    const rows = buildStoreDay(s, day);
    await InventoryLevel.bulkCreate(rows);
    total += rows.length;
    perStore.push({ store_id: s.id, store_code: s.store_code, rows: rows.length });
  }

  const chain = await oos.analyzeChain(null, day);

  return {
    date: day,
    stores: stores.length,
    seeded_rows: total,
    per_store: perStore,
    chain: {
      oos_rate: chain.oos_rate,
      oos_count: chain.oos_count,
      total_skus: chain.total_skus,
      lost_sales_usd: chain.lost_sales_usd,
      lost_gross_profit_usd: chain.lost_gross_profit_usd,
      annualized_lost_sales_usd: chain.annualized_lost_sales_usd,
      in_store_pct: chain.layer_mix.in_store_pct,
      root_cause_mix: chain.root_cause_mix
    }
  };
}

module.exports = { seedDemoDay, buildStoreDay, SKUS_PER_STORE };
