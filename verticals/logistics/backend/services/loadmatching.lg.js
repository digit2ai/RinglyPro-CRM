// RinglyPro Logistics — Load-to-Load Matching Engine
// Identifies combinable or sequence-compatible loads to improve truck utilization
// Types: backhaul, chain, round_trip, relay

const sequelize = require('./db.lg');

// Scoring weights
const WEIGHTS = {
  route: 0.35,    // Geographic compatibility
  timing: 0.30,   // Schedule feasibility
  equipment: 0.20, // Equipment match
  revenue: 0.15,  // Combined RPM benefit
};

// Max deadhead miles for viable pairing
const MAX_DEADHEAD = 150;
// Max hours between loads
const MAX_GAP_HOURS = 12;

async function find_load_pairs(input) {
  const { load_id, max_results, pair_types, tenant_id } = input;
  if (!load_id) throw new Error('load_id required');
  const tid = tenant_id || 'logistics';

  // Get the anchor load
  const [[anchor]] = await sequelize.query(`SELECT * FROM lg_loads WHERE id = $1 AND tenant_id = $2`, { bind: [load_id, tid] });
  if (!anchor) throw new Error('Load not found');

  // Find candidate loads that could pair with the anchor
  const [candidates] = await sequelize.query(`
    SELECT * FROM lg_loads
    WHERE tenant_id = $1 AND id != $2 AND status IN ('open','quoted')
      AND equipment_type = $3
      AND pickup_date BETWEEN ($4::DATE - INTERVAL '3 days') AND ($4::DATE + INTERVAL '7 days')
    ORDER BY pickup_date ASC
    LIMIT 200
  `, { bind: [tid, load_id, anchor.equipment_type, anchor.pickup_date || new Date().toISOString().split('T')[0]] });

  const pairs = [];

  for (const cand of candidates) {
    // Calculate geographic compatibility
    const anchorDestCity = (anchor.destination_city || '').toLowerCase();
    const anchorDestState = (anchor.destination_state || '').toUpperCase();
    const candOrigCity = (cand.origin_city || '').toLowerCase();
    const candOrigState = (cand.origin_state || '').toUpperCase();
    const candDestCity = (cand.destination_city || '').toLowerCase();
    const candDestState = (cand.destination_state || '').toUpperCase();
    const anchorOrigCity = (anchor.origin_city || '').toLowerCase();
    const anchorOrigState = (anchor.origin_state || '').toUpperCase();

    // Determine pair type
    let pairType = null;
    let routeScore = 0;
    let deadheadMiles = 0;

    // Backhaul: Load B origin is near Load A destination, Load B destination is near Load A origin
    const isBackhaul = anchorDestState === candOrigState && anchorOrigState === candDestState;
    // Chain: Load B origin is near Load A destination (sequential)
    const isChain = anchorDestState === candOrigState;
    // Round trip: A→B then B→A (same cities)
    const isRoundTrip = anchorDestCity === candOrigCity && anchorDestState === candOrigState
      && anchorOrigCity === candDestCity && anchorOrigState === candDestState;

    if (isRoundTrip) {
      pairType = 'round_trip';
      routeScore = 95;
      deadheadMiles = 10; // Minimal repositioning
    } else if (isBackhaul && anchorDestCity === candOrigCity) {
      pairType = 'backhaul';
      routeScore = 90;
      deadheadMiles = 15;
    } else if (isBackhaul) {
      pairType = 'backhaul';
      routeScore = 70;
      deadheadMiles = estimateDeadhead(anchorDestState, candOrigState);
    } else if (isChain && anchorDestCity === candOrigCity) {
      pairType = 'chain';
      routeScore = 85;
      deadheadMiles = 10;
    } else if (isChain) {
      pairType = 'chain';
      routeScore = 60;
      deadheadMiles = estimateDeadhead(anchorDestState, candOrigState);
    }

    // Filter by allowed pair types
    if (!pairType) continue;
    if (pair_types && pair_types.length > 0 && !pair_types.includes(pairType)) continue;
    if (deadheadMiles > MAX_DEADHEAD) continue;

    // Timing score
    let timingScore = 0;
    if (anchor.delivery_date && cand.pickup_date) {
      const gapHours = (new Date(cand.pickup_date) - new Date(anchor.delivery_date)) / 3600000;
      if (gapHours >= 2 && gapHours <= MAX_GAP_HOURS) {
        timingScore = Math.round(100 - (gapHours / MAX_GAP_HOURS) * 50);
      } else if (gapHours > MAX_GAP_HOURS && gapHours <= 48) {
        timingScore = Math.max(20, 50 - (gapHours - MAX_GAP_HOURS) * 2);
      } else if (gapHours >= 0 && gapHours < 2) {
        timingScore = 60; // Tight but possible
      }
    } else {
      timingScore = 50; // No date info
    }
    if (timingScore <= 0) continue;

    // Equipment score
    const equipScore = anchor.equipment_type === cand.equipment_type ? 100 : 0;

    // Revenue score — combined RPM
    const anchorMiles = parseFloat(anchor.miles) || 500;
    const candMiles = parseFloat(cand.miles) || 500;
    const totalMiles = anchorMiles + candMiles + deadheadMiles;
    const anchorRevenue = parseFloat(anchor.sell_rate) || parseFloat(anchor.buy_rate) || 0;
    const candRevenue = parseFloat(cand.sell_rate) || parseFloat(cand.buy_rate) || 0;
    const combinedRevenue = anchorRevenue + candRevenue;
    const combinedRpm = totalMiles > 0 ? combinedRevenue / totalMiles : 0;
    const singleRpm = anchorMiles > 0 ? anchorRevenue / anchorMiles : 0;
    const utilizationImprove = singleRpm > 0 ? ((combinedRpm - singleRpm) / singleRpm * 100) : 0;
    const revenueScore = Math.min(100, Math.max(0, 50 + utilizationImprove * 2));

    // Final composite score
    const matchScore = Math.round(
      routeScore * WEIGHTS.route +
      timingScore * WEIGHTS.timing +
      equipScore * WEIGHTS.equipment +
      revenueScore * WEIGHTS.revenue
    );

    pairs.push({
      load_b_id: cand.id,
      load_b_ref: cand.load_ref,
      pair_type: pairType,
      match_score: matchScore,
      scores: { route: routeScore, timing: timingScore, equipment: equipScore, revenue: revenueScore },
      load_b_lane: `${cand.origin_city}, ${cand.origin_state} → ${cand.destination_city}, ${cand.destination_state}`,
      load_b_pickup: cand.pickup_date,
      load_b_delivery: cand.delivery_date,
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
    `, { bind: [tid, load_id, p.load_b_id, p.pair_type, p.match_score, p.scores.route, p.scores.timing,
      p.scores.equipment, p.deadhead_miles, p.total_miles, p.combined_revenue, p.combined_rpm, p.utilization_improvement_pct] }).catch(() => {});
  }

  return {
    anchor_load: { id: anchor.id, ref: anchor.load_ref, lane: `${anchor.origin_city}, ${anchor.origin_state} → ${anchor.destination_city}, ${anchor.destination_state}`, equipment: anchor.equipment_type, pickup: anchor.pickup_date, delivery: anchor.delivery_date },
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
  // Log feedback
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

// Helper: rough deadhead estimate between states
function estimateDeadhead(fromState, toState) {
  if (fromState === toState) return 30;
  // Adjacent states get lower estimate
  const adjacent = {
    TX: ['LA','AR','OK','NM'], CA: ['OR','NV','AZ'], FL: ['GA','AL'], GA: ['FL','SC','NC','TN','AL'],
    IL: ['IN','WI','MO','IA','KY'], OH: ['IN','PA','WV','KY','MI'], PA: ['OH','NY','NJ','DE','MD','WV'],
    NY: ['PA','NJ','CT','MA','VT'], NJ: ['NY','PA','DE'], TN: ['KY','VA','NC','GA','AL','MS','AR','MO'],
  };
  if (adjacent[fromState]?.includes(toState) || adjacent[toState]?.includes(fromState)) return 80;
  return 120;
}

module.exports = { find_load_pairs, get_pair_detail, accept_pair, reject_pair };
