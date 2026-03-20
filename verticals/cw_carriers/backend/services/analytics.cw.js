const sequelize = require('./db.cw');

// Safe query helper
async function sq(sql) {
  try { const [rows] = await sequelize.query(sql); return rows; } catch { return []; }
}
async function sq1(sql) {
  try { const [[row]] = await sequelize.query(sql); return row; } catch { return {}; }
}

async function getDashboard() {
  try {
    // Query both cw_loads AND lg_loads for load stats
    const cwLoads = await sq1(`SELECT
      COUNT(*) FILTER (WHERE status = 'open') as open_loads,
      COUNT(*) FILTER (WHERE status = 'covered' AND updated_at::date = CURRENT_DATE) as covered_today,
      COUNT(*) as total FROM cw_loads`);
    const lgLoads = await sq1(`SELECT
      COUNT(*) FILTER (WHERE status = 'open') as open_loads,
      COUNT(*) FILTER (WHERE status = 'covered' AND updated_at::date = CURRENT_DATE) as covered_today,
      COUNT(*) as total FROM lg_loads`);

    // Contacts: both cw_contacts (carrier type) AND lg_carriers
    const cwCarriers = await sq1(`SELECT COUNT(*) as count FROM cw_contacts WHERE contact_type = 'carrier'`);
    const lgCarriers = await sq1(`SELECT COUNT(*) as count FROM lg_carriers`);

    // Calls
    const callsToday = await sq1(`SELECT COUNT(*) as count FROM cw_call_logs WHERE created_at::date = CURRENT_DATE`);

    // HubSpot
    const hsContacts = await sq1(`SELECT COUNT(*) as count FROM cw_contacts WHERE hubspot_id IS NOT NULL`);
    const pendingSync = await sq1(`SELECT COUNT(*) as count FROM cw_hubspot_sync WHERE status = 'pending'`);

    // Totals (merged)
    const cwContactTotal = await sq1(`SELECT COUNT(*) as count FROM cw_contacts`);
    const lgContactTotal = await sq1(`SELECT
      (SELECT COUNT(*) FROM lg_carriers) + (SELECT COUNT(*) FROM lg_customers) as count`);
    const cwCallTotal = await sq1(`SELECT COUNT(*) as count FROM cw_call_logs`);

    return {
      open_loads: parseInt(cwLoads.open_loads || 0) + parseInt(lgLoads.open_loads || 0),
      covered_today: parseInt(cwLoads.covered_today || 0) + parseInt(lgLoads.covered_today || 0),
      active_carriers: parseInt(cwCarriers.count || 0) + parseInt(lgCarriers.count || 0),
      calls_today: parseInt(callsToday.count || 0),
      hubspot_contacts: parseInt(hsContacts.count || 0),
      pending_sync: parseInt(pendingSync.count || 0),
      total_contacts: parseInt(cwContactTotal.count || 0) + parseInt(lgContactTotal.count || 0),
      total_loads: parseInt(cwLoads.total || 0) + parseInt(lgLoads.total || 0),
      total_calls: parseInt(cwCallTotal.count || 0)
    };
  } catch (err) {
    console.error('CW analytics dashboard error:', err.message);
    return {};
  }
}

async function getLanes() {
  try {
    // CW lanes
    const cwLanes = await sq(
      `SELECT origin as lane_origin, destination as lane_dest,
        COUNT(*) as total_loads,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'open') as open_loads,
        AVG(rate_usd)::numeric(10,2) as avg_rate,
        SUM(rate_usd)::numeric(10,2) as total_revenue
       FROM cw_loads WHERE origin IS NOT NULL AND destination IS NOT NULL
       GROUP BY origin, destination ORDER BY total_loads DESC LIMIT 50`);

    // LG lanes
    const lgLanes = await sq(
      `SELECT origin_city || ', ' || origin_state as lane_origin,
              destination_city || ', ' || destination_state as lane_dest,
        COUNT(*) as total_loads,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'open') as open_loads,
        AVG(buy_rate)::numeric(10,2) as avg_rate,
        SUM(sell_rate)::numeric(10,2) as total_revenue
       FROM lg_loads WHERE origin_city IS NOT NULL AND destination_city IS NOT NULL
       GROUP BY origin_city, origin_state, destination_city, destination_state
       ORDER BY total_loads DESC LIMIT 50`);

    // Merge and sort
    const all = [...cwLanes.map(r => ({ ...r, origin: r.lane_origin, destination: r.lane_dest })),
                 ...lgLanes.map(r => ({ ...r, origin: r.lane_origin, destination: r.lane_dest }))]
      .sort((a, b) => parseInt(b.total_loads) - parseInt(a.total_loads))
      .slice(0, 50);
    return all;
  } catch (err) {
    console.error('CW analytics lanes error:', err.message);
    return [];
  }
}

async function getCarrierPerformance() {
  try {
    // CW carriers
    const cwCarriers = await sq(
      `SELECT c.id, c.company_name, c.full_name, c.phone, c.email, 'cw' as source,
        COUNT(l.id) as total_loads,
        COUNT(l.id) FILTER (WHERE l.status = 'delivered') as delivered,
        AVG(l.rate_usd)::numeric(10,2) as avg_rate
       FROM cw_contacts c LEFT JOIN cw_loads l ON l.carrier_id = c.id
       WHERE c.contact_type = 'carrier'
       GROUP BY c.id, c.company_name, c.full_name, c.phone, c.email`);

    // LG carriers
    const lgCarriers = await sq(
      `SELECT c.id, c.carrier_name as company_name, c.contact_name as full_name, c.phone, c.email, 'lg' as source,
        c.total_loads_completed as total_loads,
        c.total_loads_completed as delivered,
        c.avg_rate_per_mile as avg_rate
       FROM lg_carriers c ORDER BY c.total_loads_completed DESC`);

    const all = [...cwCarriers, ...lgCarriers]
      .sort((a, b) => parseInt(b.total_loads || 0) - parseInt(a.total_loads || 0))
      .slice(0, 50);
    return all;
  } catch (err) {
    console.error('CW analytics carriers error:', err.message);
    return [];
  }
}

async function getCoverageStats() {
  try {
    const cwTotal = await sq1(`SELECT COUNT(*) as count FROM cw_loads`);
    const cwCovered = await sq1(`SELECT COUNT(*) as count FROM cw_loads WHERE status IN ('covered','in_transit','delivered')`);
    const lgTotal = await sq1(`SELECT COUNT(*) as count FROM lg_loads`);
    const lgCovered = await sq1(`SELECT COUNT(*) as count FROM lg_loads WHERE status IN ('covered','dispatched','in_transit','delivered','invoiced','paid')`);
    const callsMade = await sq1(`SELECT COUNT(*) as count FROM cw_call_logs WHERE call_type = 'carrier_coverage'`);
    const interested = await sq1(`SELECT COUNT(*) as count FROM cw_call_logs WHERE call_type = 'carrier_coverage' AND outcome = 'qualified'`);
    const booked = await sq1(`SELECT COUNT(*) as count FROM cw_call_logs WHERE call_type = 'carrier_coverage' AND outcome = 'booked'`);

    const total = parseInt(cwTotal.count || 0) + parseInt(lgTotal.count || 0);
    const covered = parseInt(cwCovered.count || 0) + parseInt(lgCovered.count || 0);

    return {
      total_loads: total,
      covered_loads: covered,
      coverage_rate: total > 0 ? Math.round(covered / total * 100) : 0,
      calls_made: parseInt(callsMade.count || 0),
      interested: parseInt(interested.count || 0),
      booked: parseInt(booked.count || 0)
    };
  } catch (err) {
    console.error('CW analytics coverage error:', err.message);
    return {};
  }
}

async function getCallStats() {
  try {
    const daily = await sq(
      `SELECT created_at::date as date, COUNT(*) as count
       FROM cw_call_logs WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY created_at::date ORDER BY date ASC`);
    const outcomes = await sq(
      `SELECT outcome, COUNT(*) as count FROM cw_call_logs GROUP BY outcome`);
    const byType = await sq(
      `SELECT call_type, COUNT(*) as count FROM cw_call_logs GROUP BY call_type`);
    return { daily, outcomes, byType };
  } catch (err) {
    console.error('CW analytics call stats error:', err.message);
    return { daily: [], outcomes: [], byType: [] };
  }
}

module.exports = { getDashboard, getLanes, getCarrierPerformance, getCoverageStats, getCallStats };
