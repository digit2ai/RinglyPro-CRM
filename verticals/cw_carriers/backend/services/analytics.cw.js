const sequelize = require('./db.cw');

async function getDashboard() {
  try {
    const [[openLoads]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_loads WHERE status = 'open'`);
    const [[coveredToday]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_loads WHERE status = 'covered' AND updated_at::date = CURRENT_DATE`);
    const [[activeCarriers]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_contacts WHERE contact_type = 'carrier'`);
    const [[callsToday]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_call_logs WHERE created_at::date = CURRENT_DATE`);
    const [[hsContacts]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_contacts WHERE hubspot_id IS NOT NULL`);
    const [[pendingSync]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_hubspot_sync WHERE status = 'pending'`);
    const [[totalContacts]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_contacts`);
    const [[totalLoads]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_loads`);
    const [[totalCalls]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_call_logs`);

    return {
      open_loads: parseInt(openLoads.count),
      covered_today: parseInt(coveredToday.count),
      active_carriers: parseInt(activeCarriers.count),
      calls_today: parseInt(callsToday.count),
      hubspot_contacts: parseInt(hsContacts.count),
      pending_sync: parseInt(pendingSync.count),
      total_contacts: parseInt(totalContacts.count),
      total_loads: parseInt(totalLoads.count),
      total_calls: parseInt(totalCalls.count)
    };
  } catch (err) {
    console.error('CW analytics dashboard error:', err.message);
    return {};
  }
}

async function getLanes() {
  try {
    const [rows] = await sequelize.query(
      `SELECT origin, destination,
        COUNT(*) as total_loads,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'open') as open_loads,
        AVG(rate_usd)::numeric(10,2) as avg_rate,
        SUM(rate_usd)::numeric(10,2) as total_revenue,
        MIN(rate_usd)::numeric(10,2) as min_rate,
        MAX(rate_usd)::numeric(10,2) as max_rate
       FROM cw_loads
       WHERE origin IS NOT NULL AND destination IS NOT NULL
       GROUP BY origin, destination
       ORDER BY total_loads DESC`
    );
    return rows;
  } catch (err) {
    console.error('CW analytics lanes error:', err.message);
    return [];
  }
}

async function getCarrierPerformance() {
  try {
    const [rows] = await sequelize.query(
      `SELECT c.id, c.company_name, c.full_name, c.phone, c.email,
        COUNT(l.id) as total_loads,
        COUNT(l.id) FILTER (WHERE l.status = 'delivered') as delivered,
        COUNT(l.id) FILTER (WHERE l.status = 'in_transit') as in_transit,
        AVG(l.rate_usd)::numeric(10,2) as avg_rate,
        CASE WHEN COUNT(l.id) > 0
          THEN ROUND(COUNT(l.id) FILTER (WHERE l.status = 'delivered')::numeric / COUNT(l.id) * 100, 1)
          ELSE 0 END as delivery_rate
       FROM cw_contacts c
       LEFT JOIN cw_loads l ON l.carrier_id = c.id
       WHERE c.contact_type = 'carrier'
       GROUP BY c.id, c.company_name, c.full_name, c.phone, c.email
       ORDER BY total_loads DESC`
    );
    return rows;
  } catch (err) {
    console.error('CW analytics carriers error:', err.message);
    return [];
  }
}

async function getCoverageStats() {
  try {
    const [[total]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_loads`);
    const [[covered]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_loads WHERE status IN ('covered','in_transit','delivered')`);
    const [[callsMade]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_call_logs WHERE call_type = 'carrier_coverage'`);
    const [[interested]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_call_logs WHERE call_type = 'carrier_coverage' AND outcome = 'qualified'`);
    const [[booked]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_call_logs WHERE call_type = 'carrier_coverage' AND outcome = 'booked'`);

    return {
      total_loads: parseInt(total.count),
      covered_loads: parseInt(covered.count),
      coverage_rate: total.count > 0 ? Math.round(parseInt(covered.count) / parseInt(total.count) * 100) : 0,
      calls_made: parseInt(callsMade.count),
      interested: parseInt(interested.count),
      booked: parseInt(booked.count)
    };
  } catch (err) {
    console.error('CW analytics coverage error:', err.message);
    return {};
  }
}

async function getCallStats() {
  try {
    const [daily] = await sequelize.query(
      `SELECT created_at::date as date, COUNT(*) as count
       FROM cw_call_logs
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY created_at::date
       ORDER BY date ASC`
    );
    const [outcomes] = await sequelize.query(
      `SELECT outcome, COUNT(*) as count
       FROM cw_call_logs
       GROUP BY outcome`
    );
    const [byType] = await sequelize.query(
      `SELECT call_type, COUNT(*) as count
       FROM cw_call_logs
       GROUP BY call_type`
    );
    return { daily, outcomes, byType };
  } catch (err) {
    console.error('CW analytics call stats error:', err.message);
    return { daily: [], outcomes: [], byType: [] };
  }
}

module.exports = { getDashboard, getLanes, getCarrierPerformance, getCoverageStats, getCallStats };
