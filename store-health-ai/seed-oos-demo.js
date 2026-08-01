'use strict';

// =====================================================
// seed-oos-demo.js — one realistic inventory day for every active store.
//
//   NODE_ENV=production node store-health-ai/seed-oos-demo.js [YYYY-MM-DD]
//
// inventory_levels was empty, so the OOS surface had nothing to render. This
// lays down a believable day per store: ~250 SKUs each, an OOS rate that varies
// by store around the 8.3% worldwide average, and attribution signals spread so
// all seven root causes appear in the chain mix.
//
// Idempotent: re-running for the same date replaces that date's rows.
// Deterministic (no RNG) so a demo looks identical every time it is shown.
// =====================================================

require('dotenv').config();

const { Store, InventoryLevel, sequelize } = require('./models');
const oos = require('./src/services/oos-intelligence');

const CATEGORIES = ['Pantry', 'Beverage', 'Snacks', 'Dairy', 'Frozen', 'Household', 'Produce', 'Bakery', 'Seasonal', 'Meat'];
const SKUS_PER_STORE = 250;

// A small deterministic hash so each store gets its own stable pattern.
function h(n) {
  let x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

function buildStoreDay(store, idx, date) {
  const rows = [];
  // Target rate varies 4%-13% across stores so the league table is meaningful
  // and the benchmark comparison is not uniform.
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
      if (bucket === 0 || bucket === 1 || bucket === 2) {
        // Planogram Compliance — stock in the back room (shelf layer)
        onHand = 12 + Math.round(seed * 40);
        meta.shelf_empty = true;
      } else if (bucket === 3 || bucket === 4) {
        // Order and Inventory Accuracy (store layer)
        onHand = 0; meta.recent_delivery = true;
      } else if (bucket === 5) {
        // Shelf Space Allocation (shelf layer)
        onHand = 0; meta.shelf_capacity = Math.max(1, Math.floor(velocity / 2));
      } else if (bucket === 6) {
        // Replenishment and Allocation (upstream)
        onHand = 0; meta.po_open = true; meta.po_filled = false;
      } else if (bucket === 7) {
        // Demand Forecast Accuracy (upstream)
        onHand = 0; meta.forecast_velocity = Math.max(0.5, velocity / 2.5);
      } else if (bucket === 8) {
        // Product Data Accuracy (store layer)
        onHand = 0; meta.unit_price = price; meta.product_data_incomplete = true;
      } else {
        // Item Management fallback (store layer)
        onHand = 0;
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

(async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);

  const applied = await oos.ensureSchema();
  if (!applied) {
    console.error('Schema top-up failed — cannot seed. Run migrations/20260801-oos-intelligence.sql by hand.');
    process.exit(1);
  }

  const stores = await Store.findAll({ where: { status: 'active' }, raw: true });
  if (!stores.length) {
    console.error('No active stores found. Seed stores first.');
    process.exit(1);
  }

  console.log(`Seeding OOS demo day ${date} across ${stores.length} stores…`);

  let total = 0;
  for (let i = 0; i < stores.length; i++) {
    const s = stores[i];
    // Idempotent: this date's rows for this store are replaced, not duplicated.
    await InventoryLevel.destroy({ where: { store_id: s.id, snapshot_date: date } });
    const rows = buildStoreDay(s, i, date);
    await InventoryLevel.bulkCreate(rows);
    total += rows.length;
    console.log(`  ${s.store_code.padEnd(12)} ${rows.length} SKUs`);
  }

  console.log(`\nSeeded ${total} inventory rows.\n`);

  const chain = await oos.analyzeChain(null, date);
  console.log('Chain result:');
  console.log(`  stores            ${chain.store_count}`);
  console.log(`  OOS rate          ${chain.oos_rate}%  (worldwide avg 8.3%)`);
  console.log(`  stockouts         ${chain.oos_count} of ${chain.total_skus} SKUs`);
  console.log(`  lost sales        $${chain.lost_sales_usd.toLocaleString()}`);
  console.log(`  lost gross profit $${chain.lost_gross_profit_usd.toLocaleString()}`);
  console.log(`  annualized        $${chain.annualized_lost_sales_usd.toLocaleString()}/yr`);
  console.log(`  in-store causes   ${chain.layer_mix.in_store_pct}%  (benchmark 70-75%)`);
  console.log('  root cause mix:');
  chain.root_cause_mix.forEach((c) => {
    console.log(`    ${String(c.count).padStart(4)}  ${c.pct.toFixed(1).padStart(5)}%  ${c.category} [${c.layer}]`);
  });

  await sequelize.close();
  process.exit(0);
})().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
