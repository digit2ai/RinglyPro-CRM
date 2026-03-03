'use strict';

/**
 * Synthetic Data Generator for PINAXIS Demo
 *
 * Generates realistic warehouse data for an e-commerce/retail distribution center:
 * - 2,500 SKUs (mix of small/medium/large items)
 * - 12 months of goods-out data (~50K orders)
 * - Realistic ABC distribution (80/15/5 rule)
 * - Seasonal patterns, weekday concentration, hourly peaks
 */

function generate(options = {}) {
  const {
    skuCount = 800,
    monthsOfData = 6,
    avgOrdersPerDay = 60,
    singleLinePct = 42
  } = options;

  const skus = generateSKUs(skuCount);
  const itemMaster = generateItemMaster(skus);
  const inventory = generateInventory(skus);
  const goodsIn = generateGoodsIn(skus, monthsOfData);
  const goodsOut = generateGoodsOut(skus, monthsOfData, avgOrdersPerDay, singleLinePct);

  return { itemMaster, inventory, goodsIn, goodsOut };
}

// ============================================================================
// SKU GENERATION
// ============================================================================

function generateSKUs(count) {
  const categories = [
    { name: 'Electronics', prefix: 'EL', pct: 0.15, sizeProfile: 'small' },
    { name: 'Apparel', prefix: 'AP', pct: 0.20, sizeProfile: 'small' },
    { name: 'Home & Garden', prefix: 'HG', pct: 0.15, sizeProfile: 'medium' },
    { name: 'Sports', prefix: 'SP', pct: 0.10, sizeProfile: 'medium' },
    { name: 'Food & Beverage', prefix: 'FB', pct: 0.12, sizeProfile: 'small' },
    { name: 'Automotive', prefix: 'AU', pct: 0.08, sizeProfile: 'large' },
    { name: 'Industrial', prefix: 'IN', pct: 0.08, sizeProfile: 'large' },
    { name: 'Health', prefix: 'HE', pct: 0.07, sizeProfile: 'small' },
    { name: 'Office', prefix: 'OF', pct: 0.05, sizeProfile: 'small' }
  ];

  const skus = [];
  let id = 1;

  for (const cat of categories) {
    const catCount = Math.round(count * cat.pct);
    for (let i = 0; i < catCount && skus.length < count; i++) {
      skus.push({
        sku: `${cat.prefix}-${String(id++).padStart(5, '0')}`,
        category: cat.name,
        sizeProfile: cat.sizeProfile
      });
    }
  }

  // Fill remaining
  while (skus.length < count) {
    skus.push({
      sku: `GN-${String(id++).padStart(5, '0')}`,
      category: 'General',
      sizeProfile: 'medium'
    });
  }

  return skus;
}

// ============================================================================
// ITEM MASTER
// ============================================================================

function generateItemMaster(skus) {
  const sizeProfiles = {
    small: { l: [50, 300], w: [30, 200], h: [20, 150], wt: [0.05, 2] },
    medium: { l: [150, 500], w: [100, 400], h: [80, 350], wt: [0.5, 10] },
    large: { l: [400, 1200], w: [300, 800], h: [200, 800], wt: [5, 50] }
  };

  return skus.map(sku => {
    const profile = sizeProfiles[sku.sizeProfile];
    const length_mm = randInt(profile.l[0], profile.l[1]);
    const width_mm = randInt(profile.w[0], profile.w[1]);
    const height_mm = randInt(profile.h[0], profile.h[1]);
    const weight_kg = randFloat(profile.wt[0], profile.wt[1], 2);

    return {
      sku: sku.sku,
      description: `${sku.category} Item ${sku.sku}`,
      unit_of_measure: 'piece',
      length_mm,
      width_mm,
      height_mm,
      weight_kg,
      pieces_per_picking_unit: randChoice([1, 6, 12, 24]),
      pieces_per_pallet: randChoice([48, 96, 144, 288, 576]),
      pallet_ti: randChoice([4, 6, 8]),
      pallet_hi: randChoice([3, 4, 5, 6]),
      crash_class: randChoice(['1', '2', '3', null]),
      batch_tracked: Math.random() < 0.15,
      dangerous_goods: Math.random() < 0.05,
      temperature_range: randChoice(['ambient', 'ambient', 'ambient', 'cool', null]),
      category: sku.category
    };
  });
}

// ============================================================================
// INVENTORY
// ============================================================================

function generateInventory(skus) {
  const locations = ['A', 'B', 'C', 'D', 'E', 'F'];
  const records = [];

  for (const sku of skus) {
    // 80% of SKUs have inventory
    if (Math.random() > 0.8) continue;

    const locationCount = randInt(1, 3);
    for (let j = 0; j < locationCount; j++) {
      records.push({
        sku: sku.sku,
        stock: randInt(1, 500),
        location: `${randChoice(locations)}-${randInt(1, 20).toString().padStart(2, '0')}`,
        storage_space: `${randChoice(locations)}${randInt(1, 20).toString().padStart(2, '0')}-${randInt(1, 5)}-${randInt(1, 8)}`,
        unit_of_measure: 'piece',
        snapshot_date: '2026-02-28'
      });
    }
  }

  return records;
}

// ============================================================================
// GOODS IN
// ============================================================================

function generateGoodsIn(skus, months) {
  const records = [];
  const startDate = new Date('2025-03-01');
  const suppliers = ['Supplier Alpha', 'Supplier Beta', 'Supplier Gamma', 'Supplier Delta',
                     'Supplier Epsilon', 'Supplier Zeta', 'Supplier Eta', 'Supplier Theta'];

  let receiptId = 10001;

  for (let m = 0; m < months; m++) {
    // ~100 deliveries per month
    const deliveriesPerMonth = randInt(80, 120);

    for (let d = 0; d < deliveriesPerMonth; d++) {
      const date = new Date(startDate);
      date.setMonth(date.getMonth() + m);
      date.setDate(randInt(1, 28));

      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const skuCount = randInt(3, 15);
      const rid = `GR-${receiptId++}`;
      const supplier = randChoice(suppliers);

      for (let s = 0; s < skuCount; s++) {
        const sku = randChoice(skus);
        records.push({
          receipt_id: rid,
          sku: sku.sku,
          quantity: randInt(10, 500),
          unit_of_measure: 'piece',
          receipt_date: formatDate(date),
          receipt_time: `${randInt(6, 16).toString().padStart(2, '0')}:${randInt(0, 59).toString().padStart(2, '0')}:00`,
          supplier
        });
      }
    }
  }

  return records;
}

// ============================================================================
// GOODS OUT — with realistic ABC distribution and temporal patterns
// ============================================================================

function generateGoodsOut(skus, months, avgOrdersPerDay, singleLinePct) {
  const records = [];
  const startDate = new Date('2025-03-01');

  // Create ABC distribution for SKU frequency
  // A items (top 20% of SKUs) = 80% of picks
  const sortedSkus = [...skus];
  shuffleArray(sortedSkus);
  const aCount = Math.round(skus.length * 0.20);
  const bCount = Math.round(skus.length * 0.30);
  const aSkus = sortedSkus.slice(0, aCount);
  const bSkus = sortedSkus.slice(aCount, aCount + bCount);
  const cSkus = sortedSkus.slice(aCount + bCount);

  function pickSku() {
    const r = Math.random();
    if (r < 0.80) return randChoice(aSkus);
    if (r < 0.95) return randChoice(bSkus);
    return randChoice(cSkus);
  }

  // Seasonal multipliers (peak in Nov-Dec)
  const seasonalMultipliers = [0.85, 0.80, 0.90, 1.0, 1.05, 1.0, 0.95, 0.90, 1.0, 1.1, 1.35, 1.25];

  // Weekday weights (Mon=1.1, Tue=1.15, Wed=1.1, Thu=1.05, Fri=0.9, Sat=0.3, Sun=0.0)
  const weekdayWeights = [0.0, 1.1, 1.15, 1.1, 1.05, 0.9, 0.3];

  // Hour distribution (peak at 10-11am and 2-3pm)
  const hourWeights = [0,0,0,0,0,0, 0.3,0.7,1.2,1.5,1.8,1.7, 1.3,1.5,1.7,1.6,1.2,0.8, 0.4,0.1,0,0,0,0];

  const customers = Array.from({ length: 500 }, (_, i) => `CUST-${String(i + 1).padStart(4, '0')}`);
  const shippingMethods = ['CEP', 'CEP', 'CEP', 'Freight', 'Freight', 'Air Freight'];

  let orderId = 100001;

  for (let m = 0; m < months; m++) {
    const monthIndex = (startDate.getMonth() + m) % 12;
    const seasonMult = seasonalMultipliers[monthIndex];
    const daysInMonth = 28 + randInt(0, 3);

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(startDate);
      date.setMonth(date.getMonth() + m);
      date.setDate(d);

      const dow = date.getDay();
      const dayWeight = weekdayWeights[dow];
      if (dayWeight === 0) continue;

      const ordersToday = Math.round(avgOrdersPerDay * seasonMult * dayWeight * (0.85 + Math.random() * 0.30));
      const dateStr = formatDate(date);

      for (let o = 0; o < ordersToday; o++) {
        const oid = `SO-${orderId++}`;
        const customerId = randChoice(customers);
        const method = randChoice(shippingMethods);

        // Determine order line count
        let lineCount;
        if (Math.random() * 100 < singleLinePct) {
          lineCount = 1;
        } else {
          // Distribution of multi-line orders
          const r = Math.random();
          if (r < 0.3) lineCount = 2;
          else if (r < 0.5) lineCount = 3;
          else if (r < 0.65) lineCount = randInt(4, 5);
          else if (r < 0.8) lineCount = randInt(6, 10);
          else if (r < 0.92) lineCount = randInt(11, 20);
          else lineCount = randInt(21, 50);
        }

        // Pick a ship hour based on distribution
        const hour = weightedRandomHour(hourWeights);
        const minute = randInt(0, 59);
        const shipTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

        for (let l = 0; l < lineCount; l++) {
          const sku = pickSku();
          records.push({
            order_id: oid,
            orderline_id: `${oid}-${l + 1}`,
            sku: sku.sku,
            quantity: randInt(1, 20),
            picking_unit: 'piece',
            unit_of_measure: 'piece',
            order_date: dateStr,
            picking_date: dateStr,
            picking_time: shipTime,
            ship_date: dateStr,
            ship_time: shipTime,
            customer_id: customerId,
            shipping_method: method,
            shipping_load_number: `LOAD-${dateStr.replace(/-/g, '')}-${randInt(1, 20).toString().padStart(3, '0')}`
          });
        }
      }
    }
  }

  return records;
}

// ============================================================================
// HELPERS
// ============================================================================

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function weightedRandomHour(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let h = 0; h < weights.length; h++) {
    r -= weights[h];
    if (r <= 0) return h;
  }
  return 12;
}

module.exports = { generate };
