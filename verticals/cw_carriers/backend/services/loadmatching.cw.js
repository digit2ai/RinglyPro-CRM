// RinglyPro Logistics — Load-to-Load Matching Engine
// Identifies combinable or sequence-compatible loads to improve truck utilization
// Types: backhaul, chain, round_trip, relay

const sequelize = require('./db.cw');

// Scoring weights
const WEIGHTS = {
  route: 0.35,
  timing: 0.30,
  equipment: 0.20,
  revenue: 0.15,
};

// Tuned for real TMS data with date-only timestamps
const MAX_DEADHEAD = 250;     // Miles — increased for rural/sparse markets
const MAX_GAP_HOURS = 72;     // Hours — 3 days gap for date-only data
const MIN_SCORE = 25;         // Minimum composite to return

// Adjacent state map for deadhead estimation
const ADJACENT = {
  TX: ['LA','AR','OK','NM','MS'], OK: ['TX','AR','KS','MO','CO','NM'], AR: ['TX','LA','MS','TN','MO','OK'],
  LA: ['TX','AR','MS'], CA: ['OR','NV','AZ'], FL: ['GA','AL'], GA: ['FL','SC','NC','TN','AL'],
  IL: ['IN','WI','MO','IA','KY'], IN: ['IL','OH','MI','KY'], OH: ['IN','PA','WV','KY','MI'],
  PA: ['OH','NY','NJ','DE','MD','WV'], NY: ['PA','NJ','CT','MA','VT'], NJ: ['NY','PA','DE'],
  TN: ['KY','VA','NC','GA','AL','MS','AR','MO'], KY: ['TN','VA','WV','OH','IN','IL','MO'],
  MO: ['IL','IA','KS','OK','AR','TN','KY','NE'], KS: ['MO','OK','NE','CO'],
  NC: ['SC','GA','TN','VA'], SC: ['NC','GA'], VA: ['NC','TN','KY','WV','MD','DC'],
  WI: ['IL','MN','IA','MI'], MN: ['WI','IA','ND','SD'], IA: ['MN','WI','IL','MO','NE','SD'],
  MI: ['OH','IN','WI'], AL: ['FL','GA','TN','MS'], MS: ['LA','AR','TN','AL'],
  NE: ['KS','MO','IA','SD','WY','CO'], CO: ['NM','OK','KS','NE','WY','UT'],
  AZ: ['CA','NV','UT','NM'], NV: ['CA','OR','AZ','UT','ID'], UT: ['NV','AZ','CO','WY','ID'],
  WA: ['OR','ID'], OR: ['CA','WA','NV','ID'], NM: ['TX','OK','CO','AZ'],
  WV: ['PA','OH','KY','VA','MD'], MD: ['PA','DE','VA','WV','DC'], DE: ['PA','NJ','MD'],
  CT: ['NY','MA','RI'], MA: ['NY','CT','RI','VT','NH'], ME: ['NH'], NH: ['ME','MA','VT'],
  VT: ['NH','MA','NY'], RI: ['MA','CT'], DC: ['MD','VA'],
  ND: ['MN','SD','MT'], SD: ['MN','IA','NE','ND','WY','MT'], MT: ['ND','SD','WY','ID'],
  WY: ['MT','SD','NE','CO','UT','ID'], ID: ['MT','WY','UT','NV','OR','WA'],
};

function estimateDeadhead(fromState, toState) {
  if (!fromState || !toState) return 200;
  if (fromState === toState) return 25;
  if (ADJACENT[fromState]?.includes(toState) || ADJACENT[toState]?.includes(fromState)) return 75;
  return 180;
}

async function find_load_pairs(input) {
  const { load_id, max_results, pair_types, tenant_id } = input;
  if (!load_id) throw new Error('load_id required');
  const tid = tenant_id || 'logistics';

  // Get the anchor load — search by ID or load_ref
  let anchor;
  const [[byId]] = await sequelize.query(`SELECT * FROM lg_loads WHERE id = $1 AND tenant_id = $2`, { bind: [load_id, tid] });
  if (byId) { anchor = byId; }
  else {
    const [[byRef]] = await sequelize.query(`SELECT * FROM lg_loads WHERE load_ref = $1 AND tenant_id = $2`, { bind: [String(load_id), tid] });
    anchor = byRef;
  }
  if (!anchor) throw new Error('Load not found');

  const anchorPickup = anchor.pickup_date || new Date().toISOString().split('T')[0];

  // Find candidates — wide window to maximize matches across the full load board
  const [candidates] = await sequelize.query(`
    SELECT * FROM lg_loads
    WHERE tenant_id = $1 AND id != $2 AND status IN ('open','quoted','covered')
      AND pickup_date BETWEEN ($3::DATE - INTERVAL '30 days') AND ($3::DATE + INTERVAL '30 days')
    ORDER BY ABS(EXTRACT(EPOCH FROM (pickup_date::timestamp - $3::timestamp))) ASC
    LIMIT 500
  `, { bind: [tid, anchor.id, anchorPickup] });

  const pairs = [];

  const anchorDestState = (anchor.destination_state || '').toUpperCase();
  const anchorOrigState = (anchor.origin_state || '').toUpperCase();
  const anchorDestCity = (anchor.destination_city || '').toLowerCase().trim();
  const anchorOrigCity = (anchor.origin_city || '').toLowerCase().trim();

  for (const cand of candidates) {
    const candOrigState = (cand.origin_state || '').toUpperCase();
    const candDestState = (cand.destination_state || '').toUpperCase();
    const candOrigCity = (cand.origin_city || '').toLowerCase().trim();
    const candDestCity = (cand.destination_city || '').toLowerCase().trim();

    // Skip if no geographic data
    if (!candOrigState || !anchorDestState) continue;

    // ── Determine pair type ──
    let pairType = null;
    let routeScore = 0;
    let deadheadMiles = 0;

    // Round trip: exact city match both ways
    const isRoundTrip = anchorDestCity === candOrigCity && anchorDestState === candOrigState
      && anchorOrigCity === candDestCity && anchorOrigState === candDestState;

    // Backhaul: B goes back toward A's origin
    const isBackhaulExact = anchorDestState === candOrigState && anchorOrigState === candDestState;
    const isBackhaulAdjacent = ADJACENT[anchorDestState]?.includes(candOrigState) && (anchorOrigState === candDestState || ADJACENT[anchorOrigState]?.includes(candDestState));

    // Chain: B picks up where A delivers
    const isChainExact = anchorDestState === candOrigState;
    const isChainAdjacent = ADJACENT[anchorDestState]?.includes(candOrigState);

    if (isRoundTrip) {
      pairType = 'round_trip';
      routeScore = 98;
      deadheadMiles = 5;
    } else if (isBackhaulExact && anchorDestCity === candOrigCity) {
      pairType = 'backhaul';
      routeScore = 92;
      deadheadMiles = 10;
    } else if (isBackhaulExact) {
      pairType = 'backhaul';
      routeScore = 75;
      deadheadMiles = estimateDeadhead(anchorDestState, candOrigState);
    } else if (isBackhaulAdjacent) {
      pairType = 'backhaul';
      routeScore = 55;
      deadheadMiles = estimateDeadhead(anchorDestState, candOrigState);
    } else if (isChainExact && anchorDestCity === candOrigCity) {
      pairType = 'chain';
      routeScore = 88;
      deadheadMiles = 10;
    } else if (isChainExact) {
      pairType = 'chain';
      routeScore = 65;
      deadheadMiles = estimateDeadhead(anchorDestState, candOrigState);
    } else if (isChainAdjacent) {
      pairType = 'chain';
      routeScore = 42;
      deadheadMiles = estimateDeadhead(anchorDestState, candOrigState);
    }

    if (!pairType) continue;
    if (pair_types && pair_types.length > 0 && !pair_types.includes(pairType)) continue;
    if (deadheadMiles > MAX_DEADHEAD) continue;

    // ── Timing score — tuned for planning-ahead scenarios ──
    let timingScore = 0;
    if (anchor.delivery_date && cand.pickup_date) {
      const gapDays = Math.abs((new Date(cand.pickup_date) - new Date(anchor.delivery_date)) / 86400000);
      if (gapDays <= 1) {
        timingScore = 100;     // Same day or next day
      } else if (gapDays <= 3) {
        timingScore = 85;      // Within 3 days
      } else if (gapDays <= 7) {
        timingScore = 65;      // Within a week
      } else if (gapDays <= 14) {
        timingScore = 45;      // Within 2 weeks
      } else if (gapDays <= 30) {
        timingScore = 30;      // Within a month — still plannable
      } else {
        timingScore = 15;      // Farther out — marginal
      }
    } else {
      timingScore = 50;        // No date info — neutral
    }
    if (timingScore <= 0) continue;

    // ── Equipment score — allow compatible types ──
    let equipScore = 0;
    if (anchor.equipment_type === cand.equipment_type) {
      equipScore = 100;
    } else if (
      (anchor.equipment_type === 'dry_van' && cand.equipment_type === 'dry_van') ||
      // Van-compatible combinations
      (['dry_van','reefer'].includes(anchor.equipment_type) && ['dry_van','reefer'].includes(cand.equipment_type))
    ) {
      equipScore = 60; // Compatible but not ideal
    } else {
      equipScore = 20; // Mismatch but don't hard-reject
    }

    // ── Revenue score ──
    const anchorMiles = parseFloat(anchor.miles) || 500;
    const candMiles = parseFloat(cand.miles) || 500;
    const totalMiles = anchorMiles + candMiles + deadheadMiles;
    const anchorRevenue = parseFloat(anchor.sell_rate) || parseFloat(anchor.buy_rate) || 0;
    const candRevenue = parseFloat(cand.sell_rate) || parseFloat(cand.buy_rate) || 0;
    const combinedRevenue = anchorRevenue + candRevenue;
    const combinedRpm = totalMiles > 0 ? combinedRevenue / totalMiles : 0;
    const singleRpm = anchorMiles > 0 ? anchorRevenue / anchorMiles : 0;
    const utilizationImprove = singleRpm > 0 ? ((combinedRpm - singleRpm) / singleRpm * 100) : 0;
    const revenueScore = Math.min(100, Math.max(10, 50 + utilizationImprove * 2));

    // ── Composite score ──
    const matchScore = Math.round(
      routeScore * WEIGHTS.route +
      timingScore * WEIGHTS.timing +
      equipScore * WEIGHTS.equipment +
      revenueScore * WEIGHTS.revenue
    );

    if (matchScore < MIN_SCORE) continue;

    pairs.push({
      load_b_id: cand.id,
      load_b_ref: cand.load_ref,
      pair_type: pairType,
      match_score: matchScore,
      scores: { route: routeScore, timing: timingScore, equipment: equipScore, revenue: Math.round(revenueScore) },
      load_b_lane: `${cand.origin_city || '?'}, ${cand.origin_state || '?'} → ${cand.destination_city || '?'}, ${cand.destination_state || '?'}`,
      load_b_pickup: cand.pickup_date,
      load_b_delivery: cand.delivery_date,
      load_b_equipment: cand.equipment_type,
      deadhead_miles: deadheadMiles,
      total_miles: Math.round(totalMiles),
      combined_revenue: Math.round(combinedRevenue * 100) / 100,
      combined_rpm: Math.round(combinedRpm * 100) / 100,
      utilization_improvement_pct: Math.round(utilizationImprove * 10) / 10,
    });
  }

  // Sort by score and limit
  pairs.sort((a, b) => b.match_score - a.match_score);
  const topPairs = pairs.slice(0, max_results || 20);

  // Persist results
  for (const p of topPairs) {
    await sequelize.query(`
      INSERT INTO lg_load_pairs (tenant_id, load_a_id, load_b_id, pair_type, match_score, route_score, timing_score,
        equipment_score, deadhead_miles, total_miles, combined_revenue, combined_rpm, utilization_improvement_pct, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
    `, { bind: [tid, anchor.id, p.load_b_id, p.pair_type, p.match_score, p.scores.route, p.scores.timing,
      p.scores.equipment, p.deadhead_miles, p.total_miles, p.combined_revenue, p.combined_rpm, p.utilization_improvement_pct] }).catch(() => {});
  }

  return {
    anchor_load: {
      id: anchor.id, ref: anchor.load_ref,
      lane: `${anchor.origin_city || '?'}, ${anchor.origin_state || '?'} → ${anchor.destination_city || '?'}, ${anchor.destination_state || '?'}`,
      equipment: anchor.equipment_type, pickup: anchor.pickup_date, delivery: anchor.delivery_date
    },
    candidates_evaluated: candidates.length,
    pairs_found: topPairs.length,
    pairs: topPairs,
  };
}

async function get_pair_detail(input) {
  const { pair_id, tenant_id } = input;
  if (!pair_id) throw new Error('pair_id required');
  const tid = tenant_id || 'logistics';
  const [[pair]] = await sequelize.query(`
    SELECT p.*, a.load_ref as load_a_ref, a.origin_city as a_origin_city, a.origin_state as a_origin_state,
      a.destination_city as a_dest_city, a.destination_state as a_dest_state, a.pickup_date as a_pickup, a.delivery_date as a_delivery,
      a.sell_rate as a_sell, a.miles as a_miles,
      b.load_ref as load_b_ref, b.origin_city as b_origin_city, b.origin_state as b_origin_state,
      b.destination_city as b_dest_city, b.destination_state as b_dest_state, b.pickup_date as b_pickup, b.delivery_date as b_delivery,
      b.sell_rate as b_sell, b.miles as b_miles
    FROM lg_load_pairs p
    JOIN lg_loads a ON a.id = p.load_a_id
    JOIN lg_loads b ON b.id = p.load_b_id
    WHERE p.id = $1 AND p.tenant_id = $2
  `, { bind: [pair_id, tid] });
  if (!pair) throw new Error('Pair not found');
  return pair;
}

async function accept_pair(input) {
  const { pair_id, user_id, tenant_id } = input;
  if (!pair_id) throw new Error('pair_id required');
  const tid = tenant_id || 'logistics';
  await sequelize.query(`UPDATE lg_load_pairs SET status = 'accepted', accepted_by = $1 WHERE id = $2 AND tenant_id = $3`, { bind: [user_id, pair_id, tid] });
  await sequelize.query(`INSERT INTO lg_user_feedback (tenant_id, feedback_type, reference_type, reference_id, user_id, created_at) VALUES ($1, 'pair_accepted', 'load_pair', $2, $3, NOW())`, { bind: [tid, pair_id, user_id] }).catch(() => {});
  return { success: true, pair_id, status: 'accepted' };
}

async function reject_pair(input) {
  const { pair_id, reason, user_id, tenant_id } = input;
  if (!pair_id) throw new Error('pair_id required');
  const tid = tenant_id || 'logistics';
  await sequelize.query(`UPDATE lg_load_pairs SET status = 'rejected' WHERE id = $1 AND tenant_id = $2`, { bind: [pair_id, tid] });
  await sequelize.query(`INSERT INTO lg_user_feedback (tenant_id, feedback_type, reference_type, reference_id, user_id, reason, created_at) VALUES ($1, 'pair_rejected', 'load_pair', $2, $3, $4, NOW())`, { bind: [tid, pair_id, user_id, reason] }).catch(() => {});
  return { success: true, pair_id, status: 'rejected' };
}

module.exports = { find_load_pairs, get_pair_detail, accept_pair, reject_pair };
