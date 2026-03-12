// RinglyPro Logistics — Analytics & KPI Reporting Service
// Generates dashboards, summaries, operational scorecards, exports
// Management-facing KPI layer

const sequelize = require('./db.cw');

async function get_operations_dashboard(input) {
  const { tenant_id, date_from, date_to } = input;
  const tid = tenant_id || 'logistics';
  const from = date_from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const to = date_to || new Date().toISOString().split('T')[0];

  // Load volume & status breakdown
  const [loadStats] = await sequelize.query(`
    SELECT COUNT(*) as total, status,
      SUM(sell_rate) as revenue, SUM(buy_rate) as cost, SUM(margin) as margin,
      AVG(margin_pct) as avg_margin_pct, AVG(rate_per_mile) as avg_rpm, SUM(miles) as total_miles
    FROM lg_loads WHERE tenant_id = $1 AND created_at BETWEEN $2 AND ($3::DATE + 1)
    GROUP BY status
  `, { bind: [tid, from, to] });

  const totals = loadStats.reduce((acc, s) => {
    acc.total += parseInt(s.total) || 0;
    acc.revenue += parseFloat(s.revenue) || 0;
    acc.cost += parseFloat(s.cost) || 0;
    acc.margin += parseFloat(s.margin) || 0;
    acc.miles += parseFloat(s.total_miles) || 0;
    return acc;
  }, { total: 0, revenue: 0, cost: 0, margin: 0, miles: 0 });

  const statusBreakdown = {};
  loadStats.forEach(s => { statusBreakdown[s.status] = parseInt(s.total); });

  // Carrier performance
  const [carrierStats] = await sequelize.query(`
    SELECT COUNT(DISTINCT assigned_carrier_id) as active_carriers,
      (SELECT COUNT(*) FROM lg_carriers WHERE tenant_id = $1) as total_carriers
    FROM lg_loads WHERE tenant_id = $1 AND assigned_carrier_id IS NOT NULL
      AND created_at BETWEEN $2 AND ($3::DATE + 1)
  `, { bind: [tid, from, to] });

  // Customer stats
  const [customerStats] = await sequelize.query(`
    SELECT COUNT(DISTINCT customer_id) as active_customers,
      (SELECT COUNT(*) FROM lg_customers WHERE tenant_id = $1) as total_customers
    FROM lg_loads WHERE tenant_id = $1 AND customer_id IS NOT NULL
      AND created_at BETWEEN $2 AND ($3::DATE + 1)
  `, { bind: [tid, from, to] });

  // Call activity
  const [callStats] = await sequelize.query(`
    SELECT COUNT(*) as total_calls, direction,
      COUNT(CASE WHEN outcome = 'accepted' THEN 1 END) as accepted,
      COUNT(CASE WHEN outcome = 'booked' THEN 1 END) as booked,
      AVG(duration_seconds) as avg_duration
    FROM lg_call_interactions WHERE tenant_id = $1
      AND created_at BETWEEN $2 AND ($3::DATE + 1)
    GROUP BY direction
  `, { bind: [tid, from, to] });

  // Top lanes
  const [topLanes] = await sequelize.query(`
    SELECT origin_state || ' → ' || destination_state as lane,
      COUNT(*) as loads, AVG(margin_pct) as avg_margin, SUM(sell_rate) as revenue
    FROM lg_loads WHERE tenant_id = $1 AND origin_state IS NOT NULL AND destination_state IS NOT NULL
      AND created_at BETWEEN $2 AND ($3::DATE + 1)
    GROUP BY origin_state, destination_state
    ORDER BY loads DESC LIMIT 10
  `, { bind: [tid, from, to] });

  // Upload activity
  const [uploadStats] = await sequelize.query(`
    SELECT COUNT(*) as total_uploads, SUM(imported_rows) as total_rows_imported,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
    FROM lg_data_uploads WHERE tenant_id = $1
      AND created_at BETWEEN $2 AND ($3::DATE + 1)
  `, { bind: [tid, from, to] });

  const carrier = carrierStats[0] || {};
  const customer = customerStats[0] || {};
  const upload = uploadStats[0] || {};

  return {
    period: { from, to },
    kpis: {
      total_loads: totals.total,
      total_revenue: Math.round(totals.revenue * 100) / 100,
      total_cost: Math.round(totals.cost * 100) / 100,
      total_margin: Math.round(totals.margin * 100) / 100,
      avg_margin_pct: totals.revenue > 0 ? Math.round((totals.margin / totals.revenue) * 10000) / 100 : 0,
      total_miles: Math.round(totals.miles),
      avg_revenue_per_load: totals.total > 0 ? Math.round(totals.revenue / totals.total) : 0,
      avg_rpm: totals.miles > 0 ? Math.round(totals.cost / totals.miles * 100) / 100 : 0,
    },
    load_status: statusBreakdown,
    carriers: { total: parseInt(carrier.total_carriers) || 0, active: parseInt(carrier.active_carriers) || 0 },
    customers: { total: parseInt(customer.total_customers) || 0, active: parseInt(customer.active_customers) || 0 },
    calls: callStats.map(c => ({
      direction: c.direction, total: parseInt(c.total_calls), accepted: parseInt(c.accepted) || 0,
      booked: parseInt(c.booked) || 0, avg_duration_sec: Math.round(parseFloat(c.avg_duration) || 0),
    })),
    top_lanes: topLanes.map(l => ({
      lane: l.lane, loads: parseInt(l.loads),
      avg_margin: l.avg_margin ? parseFloat(l.avg_margin).toFixed(1) + '%' : 'N/A',
      revenue: Math.round(parseFloat(l.revenue) || 0),
    })),
    data_ingestion: {
      uploads: parseInt(upload.total_uploads) || 0,
      rows_imported: parseInt(upload.total_rows_imported) || 0,
      success_rate: upload.total_uploads > 0 ? Math.round(parseInt(upload.successful) / parseInt(upload.total_uploads) * 100) : 0,
    },
  };
}

async function get_carrier_scorecard(input) {
  const { carrier_id, tenant_id, days } = input;
  if (!carrier_id) throw new Error('carrier_id required');
  const tid = tenant_id || 'logistics';
  const lookback = days || 90;

  const [[carrier]] = await sequelize.query(`SELECT * FROM lg_carriers WHERE id = $1 AND tenant_id = $2`, { bind: [carrier_id, tid] });
  if (!carrier) throw new Error('Carrier not found');

  const [loadStats] = await sequelize.query(`
    SELECT COUNT(*) as total_loads,
      AVG(buy_rate) as avg_rate, SUM(buy_rate) as total_paid, AVG(miles) as avg_miles,
      COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
    FROM lg_loads WHERE assigned_carrier_id = $1 AND tenant_id = $2
      AND created_at > NOW() - ($3 || ' days')::INTERVAL
  `, { bind: [carrier_id, tid, lookback.toString()] });

  const [topLanes] = await sequelize.query(`
    SELECT origin_state || ' → ' || destination_state as lane, COUNT(*) as loads, AVG(buy_rate) as avg_rate
    FROM lg_loads WHERE assigned_carrier_id = $1 AND tenant_id = $2
      AND created_at > NOW() - ($3 || ' days')::INTERVAL
      AND origin_state IS NOT NULL
    GROUP BY origin_state, destination_state ORDER BY loads DESC LIMIT 5
  `, { bind: [carrier_id, tid, lookback.toString()] });

  const [callHistory] = await sequelize.query(`
    SELECT COUNT(*) as total, outcome, AVG(duration_seconds) as avg_duration
    FROM lg_call_interactions WHERE carrier_id = $1 AND tenant_id = $2
      AND created_at > NOW() - ($3 || ' days')::INTERVAL
    GROUP BY outcome
  `, { bind: [carrier_id, tid, lookback.toString()] });

  const stats = loadStats[0] || {};
  const onTimePct = (parseInt(stats.total_loads) || 0) > 0
    ? Math.round((parseInt(stats.delivered) || 0) / parseInt(stats.total_loads) * 100) : 0;

  return {
    carrier: { id: carrier.id, name: carrier.carrier_name, mc: carrier.mc_number, dot: carrier.dot_number },
    period_days: lookback,
    performance: {
      total_loads: parseInt(stats.total_loads) || 0,
      delivered: parseInt(stats.delivered) || 0,
      cancelled: parseInt(stats.cancelled) || 0,
      on_time_pct: onTimePct,
      avg_rate: stats.avg_rate ? parseFloat(stats.avg_rate).toFixed(2) : null,
      total_paid: stats.total_paid ? parseFloat(stats.total_paid).toFixed(2) : null,
      avg_miles: stats.avg_miles ? Math.round(parseFloat(stats.avg_miles)) : null,
    },
    top_lanes: topLanes.map(l => ({ lane: l.lane, loads: parseInt(l.loads), avg_rate: parseFloat(l.avg_rate).toFixed(2) })),
    call_history: callHistory.map(c => ({ outcome: c.outcome, count: parseInt(c.total), avg_duration: Math.round(parseFloat(c.avg_duration) || 0) })),
    reliability_score: carrier.reliability_score ? parseFloat(carrier.reliability_score) : onTimePct,
  };
}

async function get_customer_profitability(input) {
  const { customer_id, tenant_id, days } = input;
  const tid = tenant_id || 'logistics';
  const lookback = days || 90;
  const customerFilter = customer_id ? 'AND customer_id = $3' : '';
  const binds = customer_id ? [tid, lookback.toString(), customer_id] : [tid, lookback.toString()];

  const [customers] = await sequelize.query(`
    SELECT c.id, c.customer_name, COUNT(l.id) as loads,
      SUM(l.sell_rate) as revenue, SUM(l.margin) as margin, AVG(l.margin_pct) as avg_margin_pct,
      SUM(l.miles) as total_miles
    FROM lg_customers c
    LEFT JOIN lg_loads l ON l.customer_id = c.id AND l.created_at > NOW() - ($2 || ' days')::INTERVAL
    WHERE c.tenant_id = $1 ${customer_id ? 'AND c.id = $3' : ''}
    GROUP BY c.id, c.customer_name
    ORDER BY revenue DESC NULLS LAST
    LIMIT 50
  `, { bind: binds });

  return {
    period_days: lookback,
    customers: customers.map(c => ({
      id: c.id,
      name: c.customer_name,
      loads: parseInt(c.loads) || 0,
      revenue: c.revenue ? Math.round(parseFloat(c.revenue)) : 0,
      margin: c.margin ? Math.round(parseFloat(c.margin)) : 0,
      avg_margin_pct: c.avg_margin_pct ? parseFloat(c.avg_margin_pct).toFixed(1) : 'N/A',
      total_miles: c.total_miles ? Math.round(parseFloat(c.total_miles)) : 0,
    })),
  };
}

async function get_exception_summary(input) {
  const { tenant_id, days } = input;
  const tid = tenant_id || 'logistics';
  const lookback = days || 30;

  const [exceptions] = await sequelize.query(`
    SELECT event_type, COUNT(*) as count,
      json_agg(json_build_object('load_id', load_id, 'location', location, 'notes', notes, 'created_at', created_at) ORDER BY created_at DESC) as details
    FROM lg_shipment_events
    WHERE tenant_id = $1 AND event_type IN ('delay','exception')
      AND created_at > NOW() - ($2 || ' days')::INTERVAL
    GROUP BY event_type
  `, { bind: [tid, lookback.toString()] });

  const [cancelledLoads] = await sequelize.query(`
    SELECT COUNT(*) as cancelled FROM lg_loads WHERE tenant_id = $1 AND status = 'cancelled'
      AND updated_at > NOW() - ($2 || ' days')::INTERVAL
  `, { bind: [tid, lookback.toString()] });

  return {
    period_days: lookback,
    delays: exceptions.find(e => e.event_type === 'delay') || { count: 0, details: [] },
    exceptions: exceptions.find(e => e.event_type === 'exception') || { count: 0, details: [] },
    cancelled_loads: parseInt(cancelledLoads[0]?.cancelled) || 0,
  };
}

async function get_daily_report(input) {
  const { tenant_id, date } = input;
  const tid = tenant_id || 'logistics';
  const reportDate = date || new Date().toISOString().split('T')[0];

  const [newLoads] = await sequelize.query(`SELECT COUNT(*) as c FROM lg_loads WHERE tenant_id=$1 AND created_at::DATE=$2`, { bind: [tid, reportDate] });
  const [covered] = await sequelize.query(`SELECT COUNT(*) as c FROM lg_loads WHERE tenant_id=$1 AND status IN ('covered','dispatched') AND updated_at::DATE=$2`, { bind: [tid, reportDate] });
  const [delivered] = await sequelize.query(`SELECT COUNT(*) as c, SUM(sell_rate) as rev, SUM(margin) as margin FROM lg_loads WHERE tenant_id=$1 AND status='delivered' AND updated_at::DATE=$2`, { bind: [tid, reportDate] });
  const [calls] = await sequelize.query(`SELECT COUNT(*) as c, direction FROM lg_call_interactions WHERE tenant_id=$1 AND created_at::DATE=$2 GROUP BY direction`, { bind: [tid, reportDate] });
  const [uploads] = await sequelize.query(`SELECT COUNT(*) as c, SUM(imported_rows) as rows FROM lg_data_uploads WHERE tenant_id=$1 AND created_at::DATE=$2`, { bind: [tid, reportDate] });

  const del = delivered[0] || {};
  return {
    date: reportDate,
    summary: {
      new_loads: parseInt(newLoads[0]?.c) || 0,
      loads_covered: parseInt(covered[0]?.c) || 0,
      loads_delivered: parseInt(del.c) || 0,
      revenue_delivered: del.rev ? Math.round(parseFloat(del.rev)) : 0,
      margin_delivered: del.margin ? Math.round(parseFloat(del.margin)) : 0,
      inbound_calls: parseInt(calls.find(c => c.direction === 'inbound')?.c) || 0,
      outbound_calls: parseInt(calls.find(c => c.direction === 'outbound')?.c) || 0,
      data_uploads: parseInt(uploads[0]?.c) || 0,
      rows_imported: parseInt(uploads[0]?.rows) || 0,
    },
  };
}

module.exports = { get_operations_dashboard, get_carrier_scorecard, get_customer_profitability, get_exception_summary, get_daily_report };
