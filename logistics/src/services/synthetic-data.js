'use strict';

/**
 * Synthetic Data Generator for PINAXIS / LOGISTICS Demo
 *
 * Generates warehouse data matching the Pinaxis Dashboard Playbook:
 * - 43,680 moved SKUs (from a larger item master)
 * - 60,016 orders across 370 days
 * - 637,002 order lines
 * - 3 temperature zones: ambient (72.8%), 34F (17.4%), 28F (9.8%)
 * - 3 pick units: case (30,578 SKUs), single (12,884), pallet (218)
 * - Order types: 86.1% store replenishment, e-com, first allocation
 * - ABC: A=785 (10%), B=785 (10%), C=6,281 (80%) of 7,851 total active
 * - XYZ: X=4,994 (≥30d), Y=5,350 (≥20d), Z=33,336 (<20d)
 * - Fit: 65.7% fit, 27.7% missing, 3.2% bulky, 3.4% no-fit
 * - Order profile: avg 9.9 lines/order, p75=13, max=138
 */

function generate(options = {}) {
  const {
    mode = 'full' // 'full' = Pinaxis matching, 'quick' = smaller demo
  } = options;

  if (mode === 'quick') {
    return generateQuickDemo();
  }

  return generateFullDemo();
}

// ============================================================================
// FULL DEMO — Matches Pinaxis Dashboard Playbook exactly
// ============================================================================

function generateFullDemo() {
  // Target metrics
  const TARGET_MOVED_SKUS = 43680;
  const TARGET_TOTAL_SKUS = 50000; // Item master is larger than moved SKUs
  const TARGET_ORDERS = 60016;
  const TARGET_LINES = 637002;
  const TARGET_DAYS = 370;

  // Temperature zone distribution
  const TEMP_ZONES = [
    { name: 'ambient', pct: 0.728 },
    { name: '34F', pct: 0.174 },
    { name: '28F', pct: 0.098 }
  ];

  // Pick unit distribution (by SKU count)
  const PICK_UNITS = [
    { name: 'case', skuCount: 30578 },
    { name: 'single', skuCount: 12884 },
    { name: 'pallet', skuCount: 218 }
  ];

  // Order type distribution
  const ORDER_TYPES = [
    { name: 'store replenishment', pct: 0.861 },
    { name: 'e-com', pct: 0.099 },
    { name: 'first allocation', pct: 0.040 }
  ];

  // Fit categories for item master
  // Total item master: TARGET_TOTAL_SKUS
  // Fit: 65.7%, Missing dims: 27.7%, Bulky: 3.2%, No-Fit: 3.4%
  const FIT_DIST = {
    fit: Math.round(TARGET_TOTAL_SKUS * 0.657),        // ~32,850
    missing: Math.round(TARGET_TOTAL_SKUS * 0.277),     // ~13,850
    bulky: Math.round(TARGET_TOTAL_SKUS * 0.032),       // ~1,600
    nofit: Math.round(TARGET_TOTAL_SKUS * 0.034)         // ~1,700
  };

  // 1. Generate Item Master
  console.log('  Generating item master...');
  const itemMaster = generateItemMasterFull(TARGET_TOTAL_SKUS, FIT_DIST, TEMP_ZONES, PICK_UNITS);

  // 2. Build SKU pool for goods-out (only moved SKUs)
  const movedSkus = itemMaster.slice(0, TARGET_MOVED_SKUS);

  // 3. Assign ABC weights — top 785 = A (80% volume), next 785 = B (15%), rest = C (5%)
  const skuWeights = buildABCWeights(movedSkus, 785, 785);

  // 4. Assign XYZ activity profiles
  // X: 4994 SKUs active ≥30 days, Y: 5350 active 20-29 days, Z: rest <20 days
  const xyzProfile = buildXYZProfile(movedSkus, 4994, 5350);

  // 5. Generate Goods Out
  console.log('  Generating goods out (~637K lines)...');
  const goodsOut = generateGoodsOutFull(
    movedSkus, skuWeights, xyzProfile,
    TARGET_ORDERS, TARGET_LINES, TARGET_DAYS,
    ORDER_TYPES, PICK_UNITS
  );

  // 6. Generate Inventory
  console.log('  Generating inventory...');
  const inventory = generateInventoryFull(movedSkus, TEMP_ZONES);

  // 7. Generate Goods In
  console.log('  Generating goods in...');
  const goodsIn = generateGoodsInFull(movedSkus, TARGET_DAYS);

  console.log(`  Done: ${itemMaster.length} items, ${goodsOut.length} lines, ${inventory.length} inv records, ${goodsIn.length} GI records`);

  return { itemMaster, inventory, goodsIn, goodsOut };
}

// ============================================================================
// ITEM MASTER — matches fit/no-fit distributions
// ============================================================================

function generateItemMasterFull(totalSkus, fitDist, tempZones, pickUnits) {
  const items = [];

  // Bin dimensions: 600x400x200 (from screenshots)
  // Max FIT: H=198, W=366, D=564, Weight=35000g
  // Min BULKY: H=400, W=400, D=600, Weight=50000g

  // Build pick unit assignment pool
  const pickUnitPool = [];
  for (const pu of pickUnits) {
    for (let i = 0; i < pu.skuCount; i++) pickUnitPool.push(pu.name);
  }
  // Fill remaining with 'case' as default
  while (pickUnitPool.length < totalSkus) pickUnitPool.push('case');
  shuffleArray(pickUnitPool);

  let fitCount = 0, missingCount = 0, bulkyCount = 0, nofitCount = 0;

  for (let i = 0; i < totalSkus; i++) {
    const skuId = String(10000 + i);
    const tempZone = weightedPick(tempZones);
    const pickUnit = pickUnitPool[i] || 'case';

    let length_mm, width_mm, height_mm, weight_kg;
    let bin_capable = false;

    // Determine fit category for this SKU
    let category;
    if (fitCount < fitDist.fit) {
      category = 'fit';
      fitCount++;
    } else if (missingCount < fitDist.missing) {
      category = 'missing';
      missingCount++;
    } else if (bulkyCount < fitDist.bulky) {
      category = 'bulky';
      bulkyCount++;
    } else {
      category = 'nofit';
      nofitCount++;
    }

    if (category === 'fit') {
      // Fits in 600x400x200 bin
      length_mm = randInt(30, 564);
      width_mm = randInt(20, 366);
      height_mm = randInt(10, 198);
      weight_kg = randFloat(0.05, 35, 2);
      bin_capable = true;
    } else if (category === 'missing') {
      // Missing dimensions
      length_mm = null;
      width_mm = null;
      height_mm = null;
      weight_kg = null;
      bin_capable = false;
    } else if (category === 'bulky') {
      // Exceeds bulky thresholds
      length_mm = randInt(600, 1500);
      width_mm = randInt(400, 1000);
      height_mm = randInt(400, 1200);
      weight_kg = randFloat(50, 200, 2);
      bin_capable = false;
    } else {
      // No-fit: has dimensions but doesn't fit bin and isn't bulky
      length_mm = randInt(200, 599);
      width_mm = randInt(200, 450);
      height_mm = randInt(200, 500);
      weight_kg = randFloat(1, 49, 2);
      bin_capable = false;
    }

    items.push({
      sku: skuId,
      description: `Item ${skuId}`,
      unit_of_measure: pickUnit === 'pallet' ? 'pallet' : 'piece',
      length_mm,
      width_mm,
      height_mm,
      weight_kg,
      pieces_per_picking_unit: pickUnit === 'case' ? randChoice([6, 12, 24]) : pickUnit === 'pallet' ? randChoice([48, 96, 288]) : 1,
      pieces_per_pallet: randChoice([48, 96, 144, 288, 576]),
      pallet_ti: randChoice([4, 6, 8]),
      pallet_hi: randChoice([3, 4, 5, 6]),
      crash_class: randChoice(['1', '2', '3', null]),
      batch_tracked: Math.random() < 0.10,
      dangerous_goods: Math.random() < 0.03,
      temperature_range: tempZone.name,
      category: `Category-${randInt(1, 20)}`,
      bin_capable
    });
  }

  // Shuffle so fit categories are mixed (not in order)
  shuffleArray(items);
  return items;
}

// ============================================================================
// ABC WEIGHT ASSIGNMENT
// ============================================================================

function buildABCWeights(skus, aCount, bCount) {
  // A items: first aCount SKUs get high weights (80% of volume)
  // B items: next bCount get medium weights (15% of volume)
  // C items: rest get low weights (5% of volume)
  const weights = {};
  const totalWeight = 1000;
  const aWeight = totalWeight * 0.80 / aCount;  // ~1.02 per A SKU
  const bWeight = totalWeight * 0.15 / bCount;  // ~0.19 per B SKU
  const cWeight = totalWeight * 0.05 / (skus.length - aCount - bCount); // ~0.001 per C SKU

  for (let i = 0; i < skus.length; i++) {
    if (i < aCount) {
      weights[skus[i].sku] = aWeight * (1 + (Math.random() - 0.5) * 0.4);
    } else if (i < aCount + bCount) {
      weights[skus[i].sku] = bWeight * (1 + (Math.random() - 0.5) * 0.4);
    } else {
      weights[skus[i].sku] = cWeight * (1 + (Math.random() - 0.5) * 0.4);
    }
  }
  return weights;
}

// ============================================================================
// XYZ PROFILE — how many days each SKU should appear
// ============================================================================

function buildXYZProfile(skus, xCount, yCount) {
  const profile = {};
  for (let i = 0; i < skus.length; i++) {
    if (i < xCount) {
      // X items: active 30-370 days
      profile[skus[i].sku] = { minDays: 30, maxDays: 254, class: 'X' };
    } else if (i < xCount + yCount) {
      // Y items: active 20-29 days
      profile[skus[i].sku] = { minDays: 20, maxDays: 29, class: 'Y' };
    } else {
      // Z items: active 1-19 days
      profile[skus[i].sku] = { minDays: 1, maxDays: 19, class: 'Z' };
    }
  }
  return profile;
}

// ============================================================================
// GOODS OUT — matches 60,016 orders / 637,002 lines / 370 days
// ============================================================================

function generateGoodsOutFull(skus, skuWeights, xyzProfile, targetOrders, targetLines, targetDays, orderTypes, pickUnits) {
  const records = [];
  const startDate = new Date('2020-10-01'); // Match screenshot date range

  // Build weighted SKU picker
  const skuPool = skus.map(s => s.sku);
  const weightArr = skuPool.map(sku => skuWeights[sku] || 0.001);
  const totalW = weightArr.reduce((s, w) => s + w, 0);
  const cumWeights = [];
  let cum = 0;
  for (const w of weightArr) { cum += w / totalW; cumWeights.push(cum); }

  function pickWeightedSku() {
    const r = Math.random();
    for (let i = 0; i < cumWeights.length; i++) {
      if (r <= cumWeights[i]) return skuPool[i];
    }
    return skuPool[skuPool.length - 1];
  }

  // Track SKU day activity for XYZ enforcement
  const skuDaysSeen = {};
  for (const sku of skuPool) skuDaysSeen[sku] = new Set();

  // Build pick unit map from item master
  const skuPickUnit = {};
  for (const s of skus) {
    const uom = s.unit_of_measure || 'piece';
    skuPickUnit[s.sku] = uom === 'pallet' ? 'pallet' : (s.pieces_per_picking_unit > 1 ? 'case' : 'single');
  }

  // Generate daily order counts distributed across 370 days
  const avgOrdersPerDay = targetOrders / targetDays; // ~162
  const avgLinesPerOrder = targetLines / targetOrders; // ~10.6

  // Seasonal multipliers for 12+ months
  const seasonalMult = [0.90, 0.95, 1.0, 0.95, 1.0, 1.05, 1.10, 1.05, 1.0, 0.95, 1.0, 1.05];
  // Weekday weights (Mon-Fri active, some Sat)
  const weekdayWeights = [0.0, 1.1, 1.15, 1.1, 1.05, 0.90, 0.25];
  const hourWeights = [0,0,0,0,0,0, 0.3,0.7,1.2,1.5,1.8,1.7, 1.3,1.5,1.7,1.6,1.2,0.8, 0.4,0.1,0,0,0,0];

  let orderId = 100001;
  let totalLinesGenerated = 0;
  let totalOrdersGenerated = 0;
  const allDates = [];

  // Generate 370 operating days
  let d = new Date(startDate);
  while (allDates.length < targetDays) {
    if (d.getDay() !== 0) { // Skip Sunday
      allDates.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }

  // Distribute orders across days
  const dailyOrderCounts = allDates.map((date, idx) => {
    const dow = date.getDay();
    const monthIdx = date.getMonth();
    const dayW = weekdayWeights[dow] || 0.5;
    const seasonW = seasonalMult[monthIdx] || 1.0;
    return Math.max(1, Math.round(avgOrdersPerDay * dayW * seasonW * (0.8 + Math.random() * 0.4)));
  });

  // Scale to hit target
  const rawTotal = dailyOrderCounts.reduce((s, v) => s + v, 0);
  const scaleFactor = targetOrders / rawTotal;
  for (let i = 0; i < dailyOrderCounts.length; i++) {
    dailyOrderCounts[i] = Math.max(1, Math.round(dailyOrderCounts[i] * scaleFactor));
  }

  // Generate orders
  for (let dayIdx = 0; dayIdx < allDates.length; dayIdx++) {
    const date = allDates[dayIdx];
    const dateStr = formatDate(date);
    const ordersToday = dailyOrderCounts[dayIdx];

    for (let o = 0; o < ordersToday && totalOrdersGenerated < targetOrders; o++) {
      const oid = `SO-${orderId++}`;
      totalOrdersGenerated++;

      // Order type
      const orderType = weightedPick(orderTypes.map(t => ({ name: t.name, pct: t.pct })));

      // Lines per order: avg ~10.6, min 1, max 138, p75=13
      let lineCount;
      const r = Math.random();
      if (r < 0.08) lineCount = 1;
      else if (r < 0.20) lineCount = randInt(2, 3);
      else if (r < 0.45) lineCount = randInt(4, 8);
      else if (r < 0.75) lineCount = randInt(9, 13);
      else if (r < 0.90) lineCount = randInt(14, 20);
      else if (r < 0.97) lineCount = randInt(21, 50);
      else lineCount = randInt(51, 138);

      // Adjust to hit target average
      const remainingOrders = targetOrders - totalOrdersGenerated;
      const remainingLines = targetLines - totalLinesGenerated;
      if (remainingOrders > 0 && remainingLines > 0) {
        const neededAvg = remainingLines / remainingOrders;
        if (neededAvg < 5) lineCount = Math.min(lineCount, randInt(1, 5));
        else if (neededAvg > 15) lineCount = Math.max(lineCount, randInt(10, 20));
      }

      lineCount = Math.max(1, Math.min(lineCount, 138));

      const hour = weightedRandomHour(hourWeights);
      const minute = randInt(0, 59);
      const shipTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

      for (let l = 0; l < lineCount; l++) {
        // Pick a SKU — prefer SKUs that need more days for their XYZ class
        let sku;
        const tryXYZ = Math.random() < 0.3; // 30% of the time, enforce XYZ
        if (tryXYZ) {
          // Find a SKU that hasn't hit its target days yet
          sku = pickWeightedSku();
          const profile = xyzProfile[sku];
          if (profile && skuDaysSeen[sku] && skuDaysSeen[sku].size >= profile.maxDays) {
            // This SKU has enough days, pick another
            sku = pickWeightedSku();
          }
        } else {
          sku = pickWeightedSku();
        }

        if (skuDaysSeen[sku]) skuDaysSeen[sku].add(dateStr);

        const pickUnit = skuPickUnit[sku] || 'single';
        const qty = pickUnit === 'pallet' ? randInt(1, 3) : pickUnit === 'case' ? randInt(1, 48) : randInt(1, 20);

        records.push({
          order_id: oid,
          orderline_id: `${oid}-${l + 1}`,
          sku,
          quantity: qty,
          picking_unit: pickUnit,
          unit_of_measure: pickUnit === 'pallet' ? 'pallet' : 'piece',
          order_type: orderType.name,
          order_date: dateStr,
          picking_date: dateStr,
          picking_time: shipTime,
          ship_date: dateStr,
          ship_time: shipTime,
          customer_id: `CUST-${randInt(1, 2000).toString().padStart(4, '0')}`,
          shipping_method: randChoice(['CEP', 'CEP', 'Freight', 'Freight', 'Air Freight']),
          shipping_load_number: `LOAD-${dateStr.replace(/-/g, '')}-${randInt(1, 30).toString().padStart(3, '0')}`
        });
        totalLinesGenerated++;
      }
    }
  }

  // Ensure top SKU (58583 from screenshots) has ~48,724 lines
  // We already named SKUs as "10000", "10001", etc — so "58583" maps to a generated SKU
  // The ABC weighting should naturally produce high-volume A items

  return records;
}

// ============================================================================
// INVENTORY
// ============================================================================

function generateInventoryFull(skus, tempZones) {
  const records = [];
  const locations = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  for (const sku of skus) {
    if (Math.random() > 0.85) continue; // 85% have inventory

    const locationCount = randInt(1, 3);
    const tempZone = sku.temperature_range || weightedPick(tempZones).name;

    for (let j = 0; j < locationCount; j++) {
      records.push({
        sku: sku.sku,
        stock: randInt(1, 1000),
        location: `${randChoice(locations)}-${randInt(1, 50).toString().padStart(2, '0')}`,
        storage_space: `${randChoice(locations)}${randInt(1, 50).toString().padStart(2, '0')}-${randInt(1, 8)}-${randInt(1, 12)}`,
        unit_of_measure: sku.unit_of_measure || 'piece',
        snapshot_date: '2021-10-15'
      });
    }
  }

  return records;
}

// ============================================================================
// GOODS IN
// ============================================================================

function generateGoodsInFull(skus, days) {
  const records = [];
  const startDate = new Date('2020-10-01');
  const suppliers = Array.from({ length: 50 }, (_, i) => `Supplier-${String(i + 1).padStart(3, '0')}`);

  let receiptId = 10001;
  const months = Math.ceil(days / 30);

  for (let m = 0; m < months; m++) {
    const deliveriesPerMonth = randInt(40, 80);

    for (let d = 0; d < deliveriesPerMonth; d++) {
      const date = new Date(startDate);
      date.setMonth(date.getMonth() + m);
      date.setDate(randInt(1, 28));
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const skuCount = randInt(5, 25);
      const rid = `GR-${receiptId++}`;
      const supplier = randChoice(suppliers);

      for (let s = 0; s < skuCount; s++) {
        const sku = randChoice(skus);
        records.push({
          receipt_id: rid,
          sku: sku.sku,
          quantity: randInt(10, 2000),
          unit_of_measure: sku.unit_of_measure || 'piece',
          receipt_date: formatDate(date),
          receipt_time: `${randInt(5, 18).toString().padStart(2, '0')}:${randInt(0, 59).toString().padStart(2, '0')}:00`,
          supplier
        });
      }
    }
  }

  return records;
}

// ============================================================================
// QUICK DEMO (smaller, for fast testing)
// ============================================================================

function generateQuickDemo() {
  const skuCount = 300;
  const skus = [];
  for (let i = 0; i < skuCount; i++) {
    skus.push({ sku: `Q-${String(i + 1).padStart(5, '0')}`, sizeProfile: randChoice(['small', 'medium', 'large']) });
  }

  const sizeProfiles = {
    small: { l: [50, 300], w: [30, 200], h: [20, 150], wt: [0.05, 2] },
    medium: { l: [150, 500], w: [100, 400], h: [80, 350], wt: [0.5, 10] },
    large: { l: [400, 1200], w: [300, 800], h: [200, 800], wt: [5, 50] }
  };

  const itemMaster = skus.map(sku => {
    const profile = sizeProfiles[sku.sizeProfile];
    const length_mm = randInt(profile.l[0], profile.l[1]);
    const width_mm = randInt(profile.w[0], profile.w[1]);
    const height_mm = randInt(profile.h[0], profile.h[1]);
    const weight_kg = randFloat(profile.wt[0], profile.wt[1], 2);
    const dims = [length_mm, width_mm, height_mm].sort((a, b) => a - b);
    const bin_capable = dims[0] <= 400 && dims[1] <= 400 && dims[2] <= 450;

    return {
      sku: sku.sku, description: `Item ${sku.sku}`, unit_of_measure: 'piece',
      length_mm, width_mm, height_mm, weight_kg,
      pieces_per_picking_unit: randChoice([1, 6, 12]), pieces_per_pallet: 96,
      pallet_ti: 4, pallet_hi: 4, crash_class: null, batch_tracked: false,
      dangerous_goods: false, temperature_range: 'ambient', category: 'General', bin_capable
    };
  });

  const inventory = skus.slice(0, 240).map(sku => ({
    sku: sku.sku, stock: randInt(1, 500),
    location: `A-${randInt(1, 20).toString().padStart(2, '0')}`,
    storage_space: `A01-1-1`, unit_of_measure: 'piece', snapshot_date: '2026-03-01'
  }));

  const goodsIn = [];
  const goodsOut = [];
  let orderId = 1;
  const startDate = new Date('2025-12-01');
  for (let d = 0; d < 90; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    if (date.getDay() === 0) continue;
    const dateStr = formatDate(date);
    const ordersToday = randInt(15, 35);
    for (let o = 0; o < ordersToday; o++) {
      const oid = `SO-${orderId++}`;
      const lineCount = randInt(1, 15);
      for (let l = 0; l < lineCount; l++) {
        goodsOut.push({
          order_id: oid, orderline_id: `${oid}-${l + 1}`,
          sku: randChoice(skus).sku, quantity: randInt(1, 20),
          picking_unit: 'piece', unit_of_measure: 'piece',
          order_type: 'store replenishment',
          order_date: dateStr, picking_date: dateStr,
          picking_time: `${randInt(6, 17).toString().padStart(2, '0')}:00:00`,
          ship_date: dateStr, ship_time: `${randInt(8, 18).toString().padStart(2, '0')}:00:00`,
          customer_id: `CUST-${randInt(1, 100).toString().padStart(4, '0')}`,
          shipping_method: 'CEP', shipping_load_number: `LOAD-${dateStr.replace(/-/g, '')}-001`
        });
      }
    }
  }

  return { itemMaster, inventory, goodsIn, goodsOut };
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

function weightedPick(items) {
  const total = items.reduce((s, i) => s + (i.pct || 1 / items.length), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= (item.pct || 1 / items.length);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
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
