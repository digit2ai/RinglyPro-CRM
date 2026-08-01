// =====================================================
// lib/classifier.js — Deterministic 7-category root-cause engine
//                     ("Attribution" step)
//
// Step 3 of the four-step framework. Measurement tells you the shelf was empty;
// attribution tells you WHOSE problem it is and what to do Monday morning.
//
// RESEARCH BASIS — Gruen & Corsten, "Shelf-Confidence" (2022):
//   "70-75% of out-of-stocks are a direct result of store-level practice."
// That single finding is why every rule below carries a `layer` of 'shelf' or
// 'store' (in-store execution) versus 'upstream' (supply chain / HQ). If a
// deployment's mix comes back mostly 'upstream', the classifier is being fed
// thin data — real feeds land ~70-75% in-store. `layerMix()` surfaces that
// ratio so the mix itself acts as a data-quality alarm.
//
// DELIBERATELY NOT ML. Rules are auditable, explain themselves to a store
// manager, and never need a training set. The book's own warning applies:
// "technology alone is never the panacea" — a category a manager cannot act on
// is worth nothing regardless of the model that produced it.
//
// Every rule documents what REAL data would sharpen it, so the upgrade path
// from batch CSV to live WMS/POS/POG feeds is explicit rather than guessed at.
// =====================================================

'use strict';

// The seven categories. Order matters: rules are evaluated top-down and the
// FIRST match wins, so the most specific / most actionable signals sit highest.
const CATEGORIES = {
  PRODUCT_DATA_ACCURACY: 'Product Data Accuracy',
  ORDER_INVENTORY_ACCURACY: 'Order and Inventory Accuracy',
  DEMAND_FORECAST_ACCURACY: 'Demand Forecast Accuracy',
  REPLENISHMENT_ALLOCATION: 'Replenishment and Allocation',
  SHELF_SPACE_ALLOCATION: 'Shelf Space Allocation',
  PLANOGRAM_COMPLIANCE: 'Planogram Compliance',
  ITEM_MANAGEMENT: 'Item Management'
};

const CATEGORY_LIST = Object.values(CATEGORIES);

// Operational layer per category — the Store vs Shelf split the book insists on.
//   'shelf'    = product is IN the building but not on the shelf (pure execution)
//   'store'    = store-controlled ordering / counting / data discipline
//   'upstream' = supply chain, allocation, forecasting owned above the store
const CATEGORY_LAYER = {
  [CATEGORIES.PLANOGRAM_COMPLIANCE]: 'shelf',
  [CATEGORIES.SHELF_SPACE_ALLOCATION]: 'shelf',
  [CATEGORIES.ORDER_INVENTORY_ACCURACY]: 'store',
  [CATEGORIES.PRODUCT_DATA_ACCURACY]: 'store',
  [CATEGORIES.ITEM_MANAGEMENT]: 'store',
  [CATEGORIES.REPLENISHMENT_ALLOCATION]: 'upstream',
  [CATEGORIES.DEMAND_FORECAST_ACCURACY]: 'upstream'
};

// The corrective action a store manager can actually take today. Attribution
// without a next step is just a nicer-looking report.
const CATEGORY_ACTION = {
  [CATEGORIES.PLANOGRAM_COMPLIANCE]:
    'Walk the aisle: stock is in the back room or misplaced. Fill the facing and confirm against the planogram.',
  [CATEGORIES.SHELF_SPACE_ALLOCATION]:
    'Facing count cannot hold a day of demand. Request a planogram change to demand-based facings.',
  [CATEGORIES.ORDER_INVENTORY_ACCURACY]:
    'Perpetual inventory disagrees with the shelf. Cycle-count this SKU and reset the on-hand.',
  [CATEGORIES.PRODUCT_DATA_ACCURACY]:
    'Item master is incomplete (price, pack size or case pack). Route to data stewardship before reordering.',
  [CATEGORIES.REPLENISHMENT_ALLOCATION]:
    'Order was placed but not filled. Escalate to the DC or buyer on fill rate for this SKU.',
  [CATEGORIES.DEMAND_FORECAST_ACCURACY]:
    'Actual velocity outran forecast. Flag for forecast review and raise the safety stock.',
  [CATEGORIES.ITEM_MANAGEMENT]:
    'No single signal dominates. Review item lifecycle, ordering cadence and promo calendar for this SKU.'
};

function num(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : fallback;
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function truthy(v) {
  if (v === true) return true;
  if (typeof v === 'string') return ['true', 'yes', 'y', '1'].includes(v.trim().toLowerCase());
  return v === 1;
}

// ---------------------------------------------------------------------------
// THE RULES — evaluated in order, first match wins.
//
// Each rule: { category, test(row) -> bool, why, refine }
//   why    = the sentence shown to the store manager as evidence
//   refine = the real-world feed that would sharpen this rule (upgrade path)
// ---------------------------------------------------------------------------
const RULES = [
  // -----------------------------------------------------------------------
  // RULE 1 — PRODUCT DATA ACCURACY
  // A SKU with a broken item master cannot be ordered or scanned correctly.
  // This is checked FIRST: bad master data poisons every downstream signal,
  // so classifying it as anything else sends the manager on a wrong errand.
  // REFINE WITH: item master extract (GTIN, case pack, pack size, status).
  // -----------------------------------------------------------------------
  {
    category: CATEGORIES.PRODUCT_DATA_ACCURACY,
    test: (r) =>
      isBlank(r.unit_price) || num(r.unit_price, 0) <= 0 ||
      isBlank(r.sku) || truthy(r.product_data_incomplete) ||
      isBlank(r.case_pack) && truthy(r.item_master_flag),
    why: 'Item master fields are missing or invalid (price, case pack or identifier).',
    refine: 'A live item-master feed would validate GTIN, pack size, case pack and item status per SKU.'
  },

  // -----------------------------------------------------------------------
  // RULE 2 — PLANOGRAM COMPLIANCE
  // The book's signature finding in action: on_hand > 0 but the shelf is
  // empty. The product is in the building. This is the single most fixable
  // and most under-detected category, and it is pure shelf-level execution.
  // REFINE WITH: shelf-audit / computer-vision gap detection joined to POG.
  // -----------------------------------------------------------------------
  {
    category: CATEGORIES.PLANOGRAM_COMPLIANCE,
    test: (r) =>
      num(r.on_hand, 0) > 0 &&
      (truthy(r.shelf_empty) || truthy(r.planogram_violation) || truthy(r.not_on_shelf)),
    why: 'Inventory shows on hand but the facing is empty — stock is in the back room or misplaced.',
    refine: 'Shelf-level computer vision or audit scans joined to the POG file would confirm the gap in real time.'
  },

  // -----------------------------------------------------------------------
  // RULE 3 — ORDER AND INVENTORY ACCURACY
  // Phantom inventory: the system believed stock existed (or a delivery just
  // landed) yet the shelf went empty. Classic perpetual-inventory drift from
  // shrink, miscounts or unscanned receiving.
  // REFINE WITH: receiving/ASN timestamps + cycle-count history.
  // -----------------------------------------------------------------------
  {
    category: CATEGORIES.ORDER_INVENTORY_ACCURACY,
    test: (r) =>
      num(r.on_hand, 0) <= 0 &&
      (truthy(r.recent_delivery) || num(r.days_since_delivery, 999) <= 2 ||
       truthy(r.inventory_discrepancy)),
    why: 'On-hand hit zero despite a recent delivery — perpetual inventory has drifted from physical stock.',
    refine: 'Receiving/ASN timestamps and cycle-count history would separate shrink from unscanned receipts.'
  },

  // -----------------------------------------------------------------------
  // RULE 4 — REPLENISHMENT AND ALLOCATION
  // The store did its job: a PO exists, but it was never filled. Ownership
  // sits with the DC or the buyer, not the store manager.
  // REFINE WITH: PO status + DC fill-rate + supplier lead-time feed.
  // -----------------------------------------------------------------------
  {
    category: CATEGORIES.REPLENISHMENT_ALLOCATION,
    test: (r) =>
      (truthy(r.po_open) || num(r.po_qty_outstanding, 0) > 0 || truthy(r.po_placed)) &&
      !truthy(r.po_filled),
    why: 'A purchase order is open and unfilled — the replenishment did not arrive.',
    refine: 'Live PO status, DC fill-rate and supplier lead-time feeds would attribute this to a specific node.'
  },

  // -----------------------------------------------------------------------
  // RULE 5 — DEMAND FORECAST ACCURACY
  // Real demand outran the forecast. Threshold at 1.5x because normal weekly
  // noise sits well below that; a sustained 50% overshoot is a model miss,
  // not variance.
  // REFINE WITH: forecast-vs-actual series + promo calendar + weather.
  // -----------------------------------------------------------------------
  {
    category: CATEGORIES.DEMAND_FORECAST_ACCURACY,
    test: (r) => {
      const actual = num(r.actual_velocity, num(r.avg_velocity, 0));
      const forecast = num(r.forecast_velocity, 0);
      if (forecast > 0 && actual / forecast >= 1.5) return true;
      return truthy(r.demand_spike) || truthy(r.promo_active) && num(r.oos_days, 0) > 0;
    },
    why: 'Actual velocity ran at least 50% above forecast — demand was under-planned.',
    refine: 'A forecast-vs-actual time series plus the promo calendar would isolate promo lift from base-demand drift.'
  },

  // -----------------------------------------------------------------------
  // RULE 6 — SHELF SPACE ALLOCATION
  // The shelf physically cannot hold a replenishment cycle of demand. The
  // book's "demand-based planograms, not packout-based" recommendation is
  // exactly this category: the facing was sized to the case, not the sales.
  // REFINE WITH: POG facing counts + case pack + replenishment frequency.
  // -----------------------------------------------------------------------
  {
    category: CATEGORIES.SHELF_SPACE_ALLOCATION,
    test: (r) => {
      const cap = num(r.shelf_capacity, 0);
      const velocity = num(r.avg_velocity, 0);
      const min = num(r.min_shelf_qty, 0);
      if (cap > 0 && min > 0 && cap < min) return true;
      // A facing that cannot hold one day of demand will stock out structurally.
      return cap > 0 && velocity > 0 && cap < velocity;
    },
    why: 'Shelf capacity is below the minimum or cannot hold one day of demand — the facing is undersized.',
    refine: 'POG facing counts joined to case pack and replenishment frequency would size facings to demand.'
  }
];

/**
 * Classify one OOS event into exactly one of the seven categories.
 * Item Management is the deliberate fallback — the engine NEVER returns
 * UNCLASSIFIED, because an unlabelled row is a row nobody owns.
 *
 * @param {object} row raw POS/inventory/order row
 * @returns {{root_cause:string, layer:string, confidence:number, why:string, action:string, rule:string}}
 */
function classify(row) {
  const r = row || {};

  for (let i = 0; i < RULES.length; i++) {
    const rule = RULES[i];
    let hit = false;
    try {
      hit = !!rule.test(r);
    } catch (e) {
      hit = false; // a malformed row must never crash a batch
    }
    if (hit) {
      return {
        root_cause: rule.category,
        layer: CATEGORY_LAYER[rule.category],
        // Earlier rules fire on more specific evidence, so they carry more
        // confidence. Range 0.95 down to 0.70 across the six real rules.
        confidence: Math.round((0.95 - i * 0.05) * 100) / 100,
        why: rule.why,
        action: CATEGORY_ACTION[rule.category],
        rule: 'R' + (i + 1)
      };
    }
  }

  // FALLBACK — Item Management. Guarantees 100% classification coverage.
  return {
    root_cause: CATEGORIES.ITEM_MANAGEMENT,
    layer: CATEGORY_LAYER[CATEGORIES.ITEM_MANAGEMENT],
    confidence: 0.5,
    why: 'No dominant signal in the supplied fields — defaulted to item-level review.',
    action: CATEGORY_ACTION[CATEGORIES.ITEM_MANAGEMENT],
    rule: 'FALLBACK'
  };
}

/**
 * Root-cause mix across a set of classified events, sorted by count desc.
 * Only categories that actually occurred are returned.
 */
function mix(events) {
  const total = events.length || 1;
  const counts = new Map();
  for (const e of events) {
    const c = e.root_cause || CATEGORIES.ITEM_MANAGEMENT;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      count,
      pct: Math.round((count / total) * 1000) / 10,
      layer: CATEGORY_LAYER[category] || 'store',
      action: CATEGORY_ACTION[category] || ''
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Store-vs-shelf-vs-upstream split. Shelf-Confidence puts 70-75% of real-world
 * out-of-stocks inside the store (shelf + store layers combined). A deployment
 * reading far below that is almost always under-fed, not unusually well run —
 * `in_store_pct` doubles as a data-quality signal.
 */
function layerMix(events) {
  const total = events.length || 1;
  const buckets = { shelf: 0, store: 0, upstream: 0 };
  for (const e of events) {
    const layer = e.layer || CATEGORY_LAYER[e.root_cause] || 'store';
    if (buckets[layer] === undefined) buckets[layer] = 0;
    buckets[layer] += 1;
  }
  const inStore = buckets.shelf + buckets.store;
  return {
    shelf: buckets.shelf,
    store: buckets.store,
    upstream: buckets.upstream,
    in_store_pct: Math.round((inStore / total) * 1000) / 10,
    upstream_pct: Math.round((buckets.upstream / total) * 1000) / 10,
    // Gruen & Corsten (2022): 70-75% of OOS originate at store level.
    benchmark_in_store_pct: 72.5,
    benchmark_source: 'Gruen & Corsten, Shelf-Confidence (2022)'
  };
}

module.exports = {
  classify,
  mix,
  layerMix,
  CATEGORIES,
  CATEGORY_LIST,
  CATEGORY_LAYER,
  CATEGORY_ACTION,
  RULES
};
