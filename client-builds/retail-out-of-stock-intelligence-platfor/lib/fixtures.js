// =====================================================
// lib/fixtures.js — a synthetic single store-day feed.
//
// Used by SIT (classifier coverage, lost-sales math) and by the read-only
// dashboard demo preview. Shaped to exercise EVERY one of the seven root-cause
// rules plus the Item Management fallback, and to include rows that must NOT
// be counted as stockouts (discontinued, seasonal, healthy stock).
//
// Row 1 is the acceptance-criteria anchor and must not change:
//   velocity 10/day x $4.00 x 1 day = $40.00 lost sales, $12.00 lost GP.
// =====================================================

'use strict';

const STORE = 'S001';

// Each row is one SKU's daily POS + inventory + order + planogram state.
const ROWS = [
  // --- ANCHOR: AC #4 verifiable math (falls to Item Management fallback) ---
  { store_id: STORE, sku: 'SKU-0001', product_name: 'Whole Milk 1 Gal', category: 'Dairy',
    on_hand: 0, avg_velocity: 10, unit_price: 4.00, margin: 0.30, oos_days: 1 },

  // --- R1 Product Data Accuracy: broken item master ---
  { store_id: STORE, sku: 'SKU-0002', product_name: 'Sports Drink 32oz', category: 'Beverage',
    on_hand: 0, avg_velocity: 6, unit_price: 0, margin: 0.35, oos_days: 1, product_data_incomplete: true },
  { store_id: STORE, sku: 'SKU-0003', product_name: 'Granola Bar 6ct', category: 'Snacks',
    on_hand: 0, avg_velocity: 4.5, unit_price: null, margin: 0.40, oos_days: 2 },

  // --- R2 Planogram Compliance: stock in the building, facing empty ---
  { store_id: STORE, sku: 'SKU-0004', product_name: 'Greek Yogurt 4pk', category: 'Dairy',
    on_hand: 24, avg_velocity: 8, unit_price: 5.49, margin: 0.32, oos_days: 1, shelf_empty: true },
  { store_id: STORE, sku: 'SKU-0005', product_name: 'Salted Butter 1lb', category: 'Dairy',
    on_hand: 12, avg_velocity: 5.2, unit_price: 4.79, margin: 0.28, oos_days: 1, planogram_violation: true },
  { store_id: STORE, sku: 'SKU-0006', product_name: 'Sparkling Water 12pk', category: 'Beverage',
    on_hand: 36, avg_velocity: 11, unit_price: 6.99, margin: 0.30, oos_days: 2, not_on_shelf: true },

  // --- R3 Order and Inventory Accuracy: phantom inventory after a delivery ---
  { store_id: STORE, sku: 'SKU-0007', product_name: 'Sourdough Loaf', category: 'Bakery',
    on_hand: 0, avg_velocity: 9, unit_price: 3.99, margin: 0.45, oos_days: 1, recent_delivery: true },
  { store_id: STORE, sku: 'SKU-0008', product_name: 'Large Eggs 12ct', category: 'Dairy',
    on_hand: 0, avg_velocity: 14, unit_price: 3.29, margin: 0.22, oos_days: 1, days_since_delivery: 1 },
  { store_id: STORE, sku: 'SKU-0009', product_name: 'Ground Coffee 12oz', category: 'Beverage',
    on_hand: 0, avg_velocity: 3.8, unit_price: 8.99, margin: 0.38, oos_days: 3, inventory_discrepancy: true },

  // --- R4 Replenishment and Allocation: PO open, never filled ---
  { store_id: STORE, sku: 'SKU-0010', product_name: 'Paper Towels 6pk', category: 'Household',
    on_hand: 0, avg_velocity: 4, unit_price: 11.49, margin: 0.25, oos_days: 4, po_open: true, po_filled: false },
  { store_id: STORE, sku: 'SKU-0011', product_name: 'Laundry Detergent 64oz', category: 'Household',
    on_hand: 0, avg_velocity: 2.5, unit_price: 12.99, margin: 0.27, oos_days: 5, po_qty_outstanding: 24 },
  { store_id: STORE, sku: 'SKU-0012', product_name: 'Trash Bags 40ct', category: 'Household',
    on_hand: 0, avg_velocity: 3.1, unit_price: 9.49, margin: 0.29, oos_days: 2, po_placed: true, po_filled: false },

  // --- R5 Demand Forecast Accuracy: actual outran forecast ---
  { store_id: STORE, sku: 'SKU-0013', product_name: 'Charcoal 16lb', category: 'Seasonal',
    on_hand: 0, avg_velocity: 18, actual_velocity: 18, forecast_velocity: 6, unit_price: 10.99, margin: 0.33, oos_days: 2 },
  { store_id: STORE, sku: 'SKU-0014', product_name: 'Hot Dog Buns 8ct', category: 'Bakery',
    on_hand: 0, avg_velocity: 22, actual_velocity: 22, forecast_velocity: 9, unit_price: 2.49, margin: 0.41, oos_days: 1 },
  { store_id: STORE, sku: 'SKU-0015', product_name: 'Ice Cream 1.5qt', category: 'Frozen',
    on_hand: 0, avg_velocity: 12, unit_price: 5.99, margin: 0.36, oos_days: 1, demand_spike: true },

  // --- R6 Shelf Space Allocation: facing cannot hold a day of demand ---
  { store_id: STORE, sku: 'SKU-0016', product_name: 'Bottled Water 24pk', category: 'Beverage',
    on_hand: 0, avg_velocity: 20, unit_price: 4.99, margin: 0.18, oos_days: 1, shelf_capacity: 8 },
  { store_id: STORE, sku: 'SKU-0017', product_name: 'Tortilla Chips 13oz', category: 'Snacks',
    on_hand: 0, avg_velocity: 7, unit_price: 4.29, margin: 0.42, oos_days: 1, shelf_capacity: 4, min_shelf_qty: 12 },
  { store_id: STORE, sku: 'SKU-0018', product_name: 'Soda 12pk Cans', category: 'Beverage',
    on_hand: 0, avg_velocity: 16, unit_price: 7.49, margin: 0.24, oos_days: 2, shelf_capacity: 10 },

  // --- FALLBACK Item Management: no dominant signal ---
  { store_id: STORE, sku: 'SKU-0019', product_name: 'Canned Soup 15oz', category: 'Pantry',
    on_hand: 0, avg_velocity: 2.2, unit_price: 2.19, margin: 0.34, oos_days: 1 },
  { store_id: STORE, sku: 'SKU-0020', product_name: 'Pasta Sauce 24oz', category: 'Pantry',
    on_hand: 0, avg_velocity: 3.4, unit_price: 3.49, margin: 0.37, oos_days: 2 },
  { store_id: STORE, sku: 'SKU-0021', product_name: 'Peanut Butter 16oz', category: 'Pantry',
    on_hand: 0, avg_velocity: 2.8, unit_price: 4.59, margin: 0.31, oos_days: 1 },
  { store_id: STORE, sku: 'SKU-0022', product_name: 'Cereal 18oz', category: 'Pantry',
    on_hand: 0, avg_velocity: 5.1, unit_price: 4.99, margin: 0.35, oos_days: 3 },

  // --- MUST NOT be counted: healthy stock ---
  { store_id: STORE, sku: 'SKU-0100', product_name: 'Bananas lb', category: 'Produce',
    on_hand: 180, avg_velocity: 45, unit_price: 0.59, margin: 0.30, oos_days: 0 },
  { store_id: STORE, sku: 'SKU-0101', product_name: 'Apples 3lb Bag', category: 'Produce',
    on_hand: 60, avg_velocity: 12, unit_price: 4.99, margin: 0.33, oos_days: 0 },
  { store_id: STORE, sku: 'SKU-0102', product_name: 'Chicken Breast lb', category: 'Meat',
    on_hand: 40, avg_velocity: 15, unit_price: 5.49, margin: 0.26, oos_days: 0 },

  // --- MUST NOT be counted: intentionally absent ---
  { store_id: STORE, sku: 'SKU-0200', product_name: 'Pumpkin Spice Creamer', category: 'Seasonal',
    on_hand: 0, avg_velocity: 4, unit_price: 4.49, margin: 0.35, oos_days: 30, status: 'seasonal_out' },
  { store_id: STORE, sku: 'SKU-0201', product_name: 'Discontinued Energy Bar', category: 'Snacks',
    on_hand: 0, avg_velocity: 1.2, unit_price: 2.99, margin: 0.40, oos_days: 14, status: 'discontinued' },
  { store_id: STORE, sku: 'SKU-0202', product_name: 'Not Yet Authorized Item', category: 'Pantry',
    on_hand: 0, avg_velocity: 0, unit_price: 3.99, margin: 0.30, oos_days: 7, status: 'not_authorized' }
];

// ---------------------------------------------------------------------------
// DEMO DAY = the fixture above + healthy filler, so the preview reads like a
// real store instead of a test rig.
//
// ROWS is deliberately stockout-dense (every rule must fire), which lands it
// near an 84% OOS rate — a number no retailer would recognise and one that
// makes the whole dashboard look broken. Padding to ~250 active SKUs puts the
// demo at roughly 8%, inside the 8.3% worldwide average Gruen & Corsten report,
// so the benchmark comparison on the tile means something.
//
// Generated deterministically (no RNG) so the demo is identical on every load
// and SIT stays reproducible.
// ---------------------------------------------------------------------------
const FILLER_CATEGORIES = ['Pantry', 'Beverage', 'Snacks', 'Dairy', 'Frozen', 'Household', 'Produce', 'Bakery'];

function healthyFiller(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    // Deterministic spread across price/velocity bands.
    const velocity = 1 + ((i * 7) % 40) / 2;
    const price = 1.29 + ((i * 13) % 1400) / 100;
    const margin = 0.18 + ((i * 11) % 30) / 100;
    out.push({
      store_id: STORE,
      sku: 'SKU-1' + String(i).padStart(3, '0'),
      product_name: 'Assorted Item ' + (i + 1),
      category: FILLER_CATEGORIES[i % FILLER_CATEGORIES.length],
      on_hand: 20 + ((i * 3) % 180),   // always healthy stock
      avg_velocity: Math.round(velocity * 10) / 10,
      unit_price: Math.round(price * 100) / 100,
      margin: Math.round(margin * 100) / 100,
      oos_days: 0
    });
  }
  return out;
}

// 21 stockouts against ~250 active SKUs -> ~8.4% OOS rate.
const DEMO_ROWS = ROWS.concat(healthyFiller(225));

module.exports = { ROWS, DEMO_ROWS, STORE, healthyFiller };
