// neural.agent.js
// FreightMind AI — Neural Intelligence Agent
// Scans ALL data across ALL active tiers, generates Findings with Diagnostic + Prescription.
// Does NOT execute fixes — that is the Treatment add-on.

const { FreightMindAgent, registerAgent } = require('../agent-framework.cw');
const sequelize = require('../db.cw');
const { v4: uuidv4 } = require('uuid');

// ── Scan Helpers ──────────────────────────────────────────────────────────────

function finding(severity, category, diagnostic, prescription, data = {}) {
  return {
    finding_id: uuidv4(),
    severity,
    category,
    diagnostic,
    prescription,
    data,
    created_at: new Date().toISOString(),
  };
}

function r(val) { return Math.round((parseFloat(val) || 0) * 100) / 100; }

// ── Individual Scan Functions ─────────────────────────────────────────────────

async function scanOperations(tid) {
  const findings = [];

  // Deadhead %
  const [deadhead] = await sequelize.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN deadhead_miles > 0 THEN 1 END) as with_deadhead,
           AVG(deadhead_miles) FILTER (WHERE deadhead_miles > 0) as avg_deadhead,
           AVG(miles) as avg_loaded_miles
    FROM lg_dispatches WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
  `, { bind: [tid] });
  const dh = deadhead[0] || {};
  const total = parseInt(dh.total) || 0;
  const withDH = parseInt(dh.with_deadhead) || 0;
  const dhPct = total > 0 ? (withDH / total) * 100 : 0;
  const avgDH = r(dh.avg_deadhead);
  if (dhPct > 20) {
    findings.push(finding('critical', 'operations',
      `Deadhead rate is ${r(dhPct)}% (${withDH}/${total} dispatches) with avg ${avgDH} empty miles over last 30 days.`,
      'Review dispatch planning: consolidate lanes, seek backhauls, or partner with nearby carriers for relay opportunities.',
      { deadhead_pct: r(dhPct), dispatches_with_deadhead: withDH, total_dispatches: total, avg_deadhead_miles: avgDH }
    ));
  } else if (dhPct > 15) {
    findings.push(finding('warning', 'operations',
      `Deadhead rate is ${r(dhPct)}% — above the 15% target.`,
      'Identify top deadhead lanes and post trucks on load boards earlier to fill empty miles.',
      { deadhead_pct: r(dhPct), dispatches_with_deadhead: withDH, total_dispatches: total }
    ));
  }

  // Truck utilization
  const [trucks] = await sequelize.query(`
    SELECT COUNT(*) as total_trucks,
           COUNT(CASE WHEN status = 'active' OR status = 'dispatched' THEN 1 END) as active,
           COUNT(CASE WHEN status = 'idle' OR status = 'available' THEN 1 END) as idle,
           COUNT(CASE WHEN status = 'maintenance' OR status = 'out_of_service' THEN 1 END) as down
    FROM lg_trucks WHERE tenant_id = $1
  `, { bind: [tid] });
  const t = trucks[0] || {};
  const totalTrucks = parseInt(t.total_trucks) || 0;
  const idle = parseInt(t.idle) || 0;
  const utilPct = totalTrucks > 0 ? ((totalTrucks - idle) / totalTrucks) * 100 : 0;
  if (utilPct < 70 && totalTrucks > 0) {
    findings.push(finding('warning', 'operations',
      `Fleet utilization is ${r(utilPct)}% — ${idle} of ${totalTrucks} trucks idle.`,
      'Increase load sourcing, consider short-term leasing out idle equipment, or reduce fleet size.',
      { utilization_pct: r(utilPct), total_trucks: totalTrucks, idle_trucks: idle, down_trucks: parseInt(t.down) || 0 }
    ));
  }

  // Load rejection rate
  const [rejections] = await sequelize.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN status = 'rejected' OR status = 'cancelled' THEN 1 END) as rejected
    FROM lg_loads WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
  `, { bind: [tid] });
  const rej = rejections[0] || {};
  const totalLoads = parseInt(rej.total) || 0;
  const rejectedLoads = parseInt(rej.rejected) || 0;
  const rejPct = totalLoads > 0 ? (rejectedLoads / totalLoads) * 100 : 0;
  if (rejPct > 10) {
    findings.push(finding('warning', 'operations',
      `Load rejection/cancellation rate is ${r(rejPct)}% (${rejectedLoads}/${totalLoads}) over last 30 days.`,
      'Investigate rejection reasons — are rates too low, lanes undesirable, or capacity mismatched?',
      { rejection_pct: r(rejPct), rejected: rejectedLoads, total: totalLoads }
    ));
  }

  if (findings.length === 0) {
    findings.push(finding('info', 'operations',
      'Operations scan completed — no issues detected.',
      'Continue monitoring. All KPIs within normal ranges.',
      { deadhead_pct: r(dhPct), utilization_pct: r(utilPct), rejection_pct: r(rejPct) }
    ));
  }

  return findings;
}

async function scanFinancial(tid) {
  const findings = [];

  // AR aging
  const [ar] = await sequelize.query(`
    SELECT COUNT(*) as total_invoices,
           COUNT(CASE WHEN status = 'overdue' OR (due_date < NOW() AND status != 'paid') THEN 1 END) as overdue,
           SUM(CASE WHEN status = 'overdue' OR (due_date < NOW() AND status != 'paid') THEN total_amount ELSE 0 END) as overdue_amount,
           SUM(CASE WHEN status != 'paid' THEN total_amount ELSE 0 END) as total_outstanding,
           AVG(EXTRACT(DAY FROM NOW() - invoice_date)) FILTER (WHERE status != 'paid') as avg_age_days
    FROM lg_invoices WHERE tenant_id = $1
  `, { bind: [tid] });
  const a = ar[0] || {};
  const overdue = parseInt(a.overdue) || 0;
  const overdueAmt = r(a.overdue_amount);
  const avgAge = r(a.avg_age_days);
  if (overdue > 0 && avgAge > 45) {
    findings.push(finding('critical', 'financial',
      `${overdue} overdue invoices totaling $${overdueAmt.toLocaleString()} with avg age ${avgAge} days.`,
      'Escalate collections on invoices >45 days. Consider offering early-payment discounts to high-balance shippers.',
      { overdue_invoices: overdue, overdue_amount: overdueAmt, total_outstanding: r(a.total_outstanding), avg_age_days: avgAge }
    ));
  } else if (overdue > 0) {
    findings.push(finding('warning', 'financial',
      `${overdue} overdue invoices totaling $${overdueAmt.toLocaleString()}.`,
      'Follow up on overdue invoices within 48 hours to prevent aging further.',
      { overdue_invoices: overdue, overdue_amount: overdueAmt }
    ));
  }

  // Margin trends
  const [margins] = await sequelize.query(`
    SELECT AVG(margin_pct) as avg_margin,
           AVG(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN margin_pct END) as margin_7d,
           AVG(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN margin_pct END) as margin_30d,
           COUNT(CASE WHEN margin_pct < 0 THEN 1 END) as negative_margin_loads
    FROM lg_loads WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '90 days'
      AND sell_rate IS NOT NULL AND buy_rate IS NOT NULL
  `, { bind: [tid] });
  const m = margins[0] || {};
  const margin7d = r(m.margin_7d);
  const margin30d = r(m.margin_30d);
  const negativeLoads = parseInt(m.negative_margin_loads) || 0;
  if (margin7d > 0 && margin30d > 0 && margin7d < margin30d * 0.8) {
    findings.push(finding('warning', 'financial',
      `Margins are declining: 7-day avg ${margin7d}% vs 30-day avg ${margin30d}% — a ${r(((margin30d - margin7d) / margin30d) * 100)}% drop.`,
      'Review recent rate quotes against market. Ensure cost increases (fuel, driver pay) are reflected in pricing.',
      { margin_7d: margin7d, margin_30d: margin30d, negative_margin_loads: negativeLoads }
    ));
  }
  if (negativeLoads > 0) {
    findings.push(finding('warning', 'financial',
      `${negativeLoads} loads with negative margins detected in the last 90 days.`,
      'Audit these loads — identify if pricing errors, emergency covers, or market misjudgment caused the losses.',
      { negative_margin_loads: negativeLoads }
    ));
  }

  // Driver settlement costs
  const [settlements] = await sequelize.query(`
    SELECT SUM(total_amount) as total_settled,
           AVG(total_amount) as avg_settlement,
           COUNT(*) as settlement_count
    FROM lg_settlements WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
  `, { bind: [tid] });
  const s = settlements[0] || {};
  if (findings.length === 0) {
    findings.push(finding('info', 'financial',
      'Financial scan completed — no critical issues.',
      'Continue monitoring AR aging and margin trends.',
      { avg_margin: r(m.avg_margin), total_outstanding: r(a.total_outstanding), settlements_30d: r(s.total_settled) }
    ));
  }

  return findings;
}

async function scanCompliance(tid) {
  const findings = [];

  // Expiring documents
  const [docs] = await sequelize.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN expiry_date < NOW() THEN 1 END) as expired,
           COUNT(CASE WHEN expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days' THEN 1 END) as expiring_soon,
           COUNT(CASE WHEN expiry_date BETWEEN NOW() AND NOW() + INTERVAL '7 days' THEN 1 END) as expiring_7d
    FROM lg_compliance WHERE tenant_id = $1
  `, { bind: [tid] });
  const d = docs[0] || {};
  const expired = parseInt(d.expired) || 0;
  const expiring7d = parseInt(d.expiring_7d) || 0;
  const expiringSoon = parseInt(d.expiring_soon) || 0;
  if (expired > 0) {
    findings.push(finding('critical', 'compliance',
      `${expired} compliance document(s) have EXPIRED. Operations may be at legal risk.`,
      'Immediately suspend affected assets/drivers and prioritize renewal. Check insurance, authority, and registration.',
      { expired, expiring_7d: expiring7d, expiring_30d: expiringSoon }
    ));
  }
  if (expiring7d > 0) {
    findings.push(finding('warning', 'compliance',
      `${expiring7d} document(s) expiring within 7 days.`,
      'Start renewal process immediately to avoid lapses. Notify affected drivers and schedule inspections if needed.',
      { expiring_7d: expiring7d, expiring_30d: expiringSoon }
    ));
  } else if (expiringSoon > 0) {
    findings.push(finding('advisory', 'compliance',
      `${expiringSoon} document(s) expiring within 30 days.`,
      'Plan renewals now to avoid last-minute rushes.',
      { expiring_30d: expiringSoon }
    ));
  }

  // HOS violations (drivers)
  const [hos] = await sequelize.query(`
    SELECT COUNT(*) as total_drivers,
           COUNT(CASE WHEN hos_violations > 0 THEN 1 END) as drivers_with_violations,
           SUM(hos_violations) as total_violations
    FROM lg_drivers WHERE tenant_id = $1
  `, { bind: [tid] });
  const h = hos[0] || {};
  const driversWithViol = parseInt(h.drivers_with_violations) || 0;
  const totalViol = parseInt(h.total_violations) || 0;
  if (totalViol > 0) {
    findings.push(finding(totalViol > 5 ? 'critical' : 'warning', 'compliance',
      `${totalViol} HOS violation(s) across ${driversWithViol} driver(s).`,
      'Review ELD logs, retrain violating drivers, and ensure dispatch is not scheduling unrealistic routes.',
      { drivers_with_violations: driversWithViol, total_violations: totalViol }
    ));
  }

  // PM overdue (maintenance)
  const [pm] = await sequelize.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue,
           COUNT(CASE WHEN next_due_date < NOW() THEN 1 END) as past_due
    FROM lg_maintenance WHERE tenant_id = $1
  `, { bind: [tid] });
  const p = pm[0] || {};
  const pmOverdue = Math.max(parseInt(p.overdue) || 0, parseInt(p.past_due) || 0);
  if (pmOverdue > 0) {
    findings.push(finding('warning', 'compliance',
      `${pmOverdue} preventive maintenance item(s) are overdue.`,
      'Schedule overdue PM immediately. Deferred maintenance increases breakdown risk and DOT inspection failures.',
      { pm_overdue: pmOverdue }
    ));
  }

  if (findings.length === 0) {
    findings.push(finding('info', 'compliance',
      'Compliance scan completed — all documents current, no violations detected.',
      'Continue regular monitoring.',
      { expired: 0, expiring_30d: expiringSoon, hos_violations: totalViol, pm_overdue: pmOverdue }
    ));
  }

  return findings;
}

async function scanFleetHealth(tid) {
  const findings = [];

  // Maintenance costs
  const [maint] = await sequelize.query(`
    SELECT SUM(cost) as total_cost, AVG(cost) as avg_cost, COUNT(*) as repair_count,
           COUNT(CASE WHEN maintenance_type = 'breakdown' OR maintenance_type = 'emergency' THEN 1 END) as breakdowns
    FROM lg_maintenance WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '90 days'
  `, { bind: [tid] });
  const mc = maint[0] || {};
  const breakdowns = parseInt(mc.breakdowns) || 0;
  const totalCost = r(mc.total_cost);
  if (breakdowns > 3) {
    findings.push(finding('warning', 'fleet_health',
      `${breakdowns} breakdown/emergency repairs in the last 90 days costing $${totalCost.toLocaleString()}.`,
      'Review PM schedules for affected units. Breakdowns signal deferred maintenance or aging equipment.',
      { breakdowns, total_maintenance_cost: totalCost, avg_repair_cost: r(mc.avg_cost) }
    ));
  }

  // Truck age / mileage
  const [fleet] = await sequelize.query(`
    SELECT AVG(EXTRACT(YEAR FROM AGE(NOW(), year::text::date))) as avg_age_years,
           AVG(mileage) as avg_mileage,
           COUNT(CASE WHEN mileage > 500000 THEN 1 END) as high_mileage_units,
           COUNT(*) as total
    FROM lg_trucks WHERE tenant_id = $1 AND year IS NOT NULL
  `, { bind: [tid] });
  const f = fleet[0] || {};
  const highMileage = parseInt(f.high_mileage_units) || 0;
  if (highMileage > 0) {
    findings.push(finding('advisory', 'fleet_health',
      `${highMileage} truck(s) exceed 500,000 miles — increased breakdown and maintenance risk.`,
      'Create replacement plan for high-mileage units. Evaluate lease vs purchase options.',
      { high_mileage_units: highMileage, avg_mileage: r(f.avg_mileage), avg_age_years: r(f.avg_age_years) }
    ));
  }

  if (findings.length === 0) {
    findings.push(finding('info', 'fleet_health',
      'Fleet health scan completed — no issues detected.',
      'Continue regular PM and monitoring.',
      { total_maintenance_cost_90d: totalCost, breakdowns_90d: breakdowns }
    ));
  }

  return findings;
}

async function scanMarket(tid) {
  const findings = [];

  // Rate trends by lane
  const [trends] = await sequelize.query(`
    SELECT l.origin_state, l.destination_state, l.equipment_type,
           AVG(CASE WHEN l.created_at > NOW() - INTERVAL '7 days' THEN l.sell_rate / NULLIF(l.miles, 0) END) as rpm_7d,
           AVG(CASE WHEN l.created_at > NOW() - INTERVAL '30 days' THEN l.sell_rate / NULLIF(l.miles, 0) END) as rpm_30d,
           COUNT(CASE WHEN l.created_at > NOW() - INTERVAL '7 days' THEN 1 END) as loads_7d,
           AVG(b.rate_per_mile_avg) as benchmark_rpm
    FROM lg_loads l
    LEFT JOIN lg_rate_benchmarks b
      ON l.origin_state = b.origin_state AND l.destination_state = b.destination_state AND l.equipment_type = b.equipment_type
    WHERE l.tenant_id = $1 AND l.created_at > NOW() - INTERVAL '30 days'
      AND l.sell_rate IS NOT NULL AND l.miles > 0
    GROUP BY l.origin_state, l.destination_state, l.equipment_type
    HAVING COUNT(CASE WHEN l.created_at > NOW() - INTERVAL '7 days' THEN 1 END) >= 2
    ORDER BY COUNT(*) DESC LIMIT 20
  `, { bind: [tid] });

  for (const lane of trends) {
    const rpm7d = r(lane.rpm_7d);
    const rpm30d = r(lane.rpm_30d);
    const benchmarkRpm = r(lane.benchmark_rpm);
    if (rpm7d > 0 && rpm30d > 0 && rpm7d < rpm30d * 0.85) {
      findings.push(finding('warning', 'market',
        `Rate declining on ${lane.origin_state}->${lane.destination_state} (${lane.equipment_type}): 7d RPM $${rpm7d} vs 30d $${rpm30d} — ${r(((rpm30d - rpm7d) / rpm30d) * 100)}% drop.`,
        'Adjust pricing strategy for this lane. Consider reducing exposure or seeking contract freight.',
        { lane: `${lane.origin_state}->${lane.destination_state}`, equipment: lane.equipment_type, rpm_7d: rpm7d, rpm_30d: rpm30d, benchmark_rpm: benchmarkRpm }
      ));
    }
    if (benchmarkRpm > 0 && rpm7d > 0 && rpm7d < benchmarkRpm * 0.9) {
      findings.push(finding('advisory', 'market',
        `${lane.origin_state}->${lane.destination_state} RPM ($${rpm7d}) is ${r(((benchmarkRpm - rpm7d) / benchmarkRpm) * 100)}% below market benchmark ($${benchmarkRpm}).`,
        'Review if you are underpricing this lane. Consider raising spot quotes to benchmark levels.',
        { lane: `${lane.origin_state}->${lane.destination_state}`, rpm_7d: rpm7d, benchmark_rpm: benchmarkRpm }
      ));
    }
  }

  if (findings.length === 0) {
    findings.push(finding('info', 'market',
      'Market scan completed — rates stable across active lanes.',
      'Continue monitoring for seasonal shifts.',
      { lanes_analyzed: trends.length }
    ));
  }

  return findings;
}

async function scanWinLoss(tid) {
  const findings = [];

  const [stats] = await sequelize.query(`
    SELECT COUNT(*) as total_quotes,
           COUNT(CASE WHEN outcome = 'won' THEN 1 END) as won,
           COUNT(CASE WHEN outcome = 'lost' THEN 1 END) as lost,
           AVG(CASE WHEN outcome = 'won' THEN quoted_rate END) as avg_won_rate,
           AVG(CASE WHEN outcome = 'lost' THEN quoted_rate END) as avg_lost_rate,
           AVG(competitor_rate) FILTER (WHERE competitor_rate IS NOT NULL AND outcome = 'lost') as avg_competitor_rate
    FROM lg_quotes WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
  `, { bind: [tid] });
  const s = stats[0] || {};
  const won = parseInt(s.won) || 0;
  const lost = parseInt(s.lost) || 0;
  const decided = won + lost;
  const winRate = decided > 0 ? (won / decided) * 100 : null;

  if (winRate !== null && winRate < 30) {
    findings.push(finding('critical', 'win_loss',
      `Win rate is critically low at ${r(winRate)}% (${won}W/${lost}L) over last 30 days.`,
      'Urgently review pricing strategy. You may be overpricing — compare avg lost rate ($' + r(s.avg_lost_rate) + ') vs competitor avg ($' + r(s.avg_competitor_rate) + ').',
      { win_rate_pct: r(winRate), won, lost, avg_won_rate: r(s.avg_won_rate), avg_lost_rate: r(s.avg_lost_rate), avg_competitor_rate: r(s.avg_competitor_rate) }
    ));
  } else if (winRate !== null && winRate < 50) {
    findings.push(finding('warning', 'win_loss',
      `Win rate is below target at ${r(winRate)}% (${won}W/${lost}L) over last 30 days.`,
      'Analyze lost lanes — are you losing on price or service? Avg delta from winners: $' + r((parseFloat(s.avg_lost_rate) || 0) - (parseFloat(s.avg_competitor_rate) || 0)) + '.',
      { win_rate_pct: r(winRate), won, lost }
    ));
  } else if (winRate !== null && winRate > 80) {
    findings.push(finding('advisory', 'win_loss',
      `Win rate is unusually high at ${r(winRate)}% — you may be leaving money on the table.`,
      'Consider raising rates by 3-5% on high-win lanes to capture more margin.',
      { win_rate_pct: r(winRate), won, lost }
    ));
  }

  if (findings.length === 0) {
    findings.push(finding('info', 'win_loss',
      `Win/loss scan completed — win rate at ${winRate !== null ? r(winRate) + '%' : 'N/A'} (${decided} decided quotes).`,
      'Continue tracking outcomes for all quotes.',
      { win_rate_pct: winRate !== null ? r(winRate) : null, total_quotes: parseInt(s.total_quotes) || 0 }
    ));
  }

  return findings;
}

async function scanShipperRelationship(tid) {
  const findings = [];

  const [shippers] = await sequelize.query(`
    SELECT s.id, s.name,
           COUNT(l.id) as load_count_30d,
           COUNT(CASE WHEN l.created_at > NOW() - INTERVAL '7 days' THEN 1 END) as loads_7d,
           COUNT(CASE WHEN l.created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' THEN 1 END) as loads_prev_30d,
           AVG(l.sell_rate) as avg_rate,
           SUM(l.sell_rate) as total_revenue
    FROM lg_shippers s
    LEFT JOIN lg_loads l ON l.shipper_id = s.id AND l.tenant_id = $1 AND l.created_at > NOW() - INTERVAL '60 days'
    WHERE s.tenant_id = $1
    GROUP BY s.id, s.name
    ORDER BY total_revenue DESC NULLS LAST
  `, { bind: [tid] });

  for (const shipper of shippers) {
    const current = parseInt(shipper.load_count_30d) || 0;
    const previous = parseInt(shipper.loads_prev_30d) || 0;
    if (previous > 5 && current < previous * 0.5) {
      findings.push(finding('warning', 'shipper_relationship',
        `${shipper.name}: volume dropped ${r(((previous - current) / previous) * 100)}% (${previous} -> ${current} loads) — possible churn risk.`,
        'Proactively reach out to this shipper. Offer rate review, added capacity, or service improvements.',
        { shipper_id: shipper.id, shipper_name: shipper.name, loads_current_30d: current, loads_prev_30d: previous, total_revenue: r(shipper.total_revenue) }
      ));
    }
    if (previous === 0 && current > 3) {
      findings.push(finding('info', 'shipper_relationship',
        `New shipper ${shipper.name} ramping up — ${current} loads in the last 30 days.`,
        'Assign a dedicated rep to nurture this relationship and ensure service quality.',
        { shipper_id: shipper.id, shipper_name: shipper.name, loads_30d: current }
      ));
    }
  }

  if (findings.length === 0) {
    findings.push(finding('info', 'shipper_relationship',
      'Shipper relationship scan completed — no churn risks detected.',
      'Continue regular check-ins with top shippers.',
      { shippers_analyzed: shippers.length }
    ));
  }

  return findings;
}

async function scanVoice(tid) {
  const findings = [];

  const [calls] = await sequelize.query(`
    SELECT COUNT(*) as total_calls,
           COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as calls_7d,
           COUNT(CASE WHEN created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' THEN 1 END) as calls_prev_7d,
           AVG(CASE WHEN sentiment_score IS NOT NULL THEN sentiment_score END) as avg_sentiment,
           COUNT(CASE WHEN sentiment_score < 0.3 THEN 1 END) as negative_calls,
           COUNT(CASE WHEN outcome = 'booked' OR outcome = 'converted' THEN 1 END) as conversions,
           AVG(duration_seconds) as avg_duration
    FROM lg_calls WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
  `, { bind: [tid] });
  const c = calls[0] || {};
  const totalCalls = parseInt(c.total_calls) || 0;
  const calls7d = parseInt(c.calls_7d) || 0;
  const callsPrev7d = parseInt(c.calls_prev_7d) || 0;
  const avgSentiment = r(c.avg_sentiment);
  const negativeCalls = parseInt(c.negative_calls) || 0;
  const conversions = parseInt(c.conversions) || 0;
  const convRate = totalCalls > 0 ? (conversions / totalCalls) * 100 : 0;

  if (callsPrev7d > 5 && calls7d < callsPrev7d * 0.5) {
    findings.push(finding('warning', 'voice',
      `Call volume dropped ${r(((callsPrev7d - calls7d) / callsPrev7d) * 100)}% week-over-week (${callsPrev7d} -> ${calls7d}).`,
      'Investigate: is the dialer down, staff short, or has inbound volume shifted to email/web?',
      { calls_7d: calls7d, calls_prev_7d: callsPrev7d }
    ));
  }

  if (avgSentiment > 0 && avgSentiment < 0.4) {
    findings.push(finding('warning', 'voice',
      `Average call sentiment is low (${avgSentiment}/1.0) with ${negativeCalls} negative calls in 30 days.`,
      'Review negative call recordings for common complaints. Escalate service issues mentioned in calls.',
      { avg_sentiment: avgSentiment, negative_calls: negativeCalls }
    ));
  }

  if (convRate > 0 && convRate < 10) {
    findings.push(finding('advisory', 'voice',
      `Call conversion rate is ${r(convRate)}% (${conversions}/${totalCalls}) — below 10% target.`,
      'Review call scripts, offer training on objection handling, and ensure reps have competitive rates.',
      { conversion_rate_pct: r(convRate), conversions, total_calls: totalCalls }
    ));
  }

  if (findings.length === 0) {
    findings.push(finding('info', 'voice',
      `Voice scan completed — ${totalCalls} calls in 30 days, ${r(convRate)}% conversion, ${avgSentiment} avg sentiment.`,
      'Continue monitoring call quality and conversion trends.',
      { total_calls: totalCalls, conversion_rate_pct: r(convRate), avg_sentiment: avgSentiment }
    ));
  }

  return findings;
}

// ── Scan Router ───────────────────────────────────────────────────────────────

const SCAN_MAP = {
  operations: scanOperations,
  financial: scanFinancial,
  compliance: scanCompliance,
  fleet_health: scanFleetHealth,
  market: scanMarket,
  win_loss: scanWinLoss,
  shipper_relationship: scanShipperRelationship,
  voice: scanVoice,
};

// ── Tool Handlers ─────────────────────────────────────────────────────────────

// (1) run_neural_scan
async function runNeuralScan(input) {
  const { scan_type, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const startTime = Date.now();

  let allFindings = [];

  if (scan_type === 'full') {
    // Run ALL scans
    const scanResults = await Promise.allSettled(
      Object.entries(SCAN_MAP).map(async ([type, fn]) => {
        try { return await fn(tid); } catch (e) {
          return [finding('warning', type, `Scan error: ${e.message}`, 'Check data availability for this module.', { error: e.message })];
        }
      })
    );
    for (const result of scanResults) {
      if (result.status === 'fulfilled') allFindings.push(...result.value);
    }
  } else {
    const scanFn = SCAN_MAP[scan_type];
    if (!scanFn) {
      throw new Error(`Unknown scan_type: ${scan_type}. Valid types: ${Object.keys(SCAN_MAP).join(', ')}, full`);
    }
    try {
      allFindings = await scanFn(tid);
    } catch (e) {
      allFindings = [finding('warning', scan_type, `Scan error: ${e.message}`, 'Check data availability for this module.', { error: e.message })];
    }
  }

  // Persist each finding to lg_agent_log
  for (const f of allFindings) {
    try {
      await sequelize.query(`
        INSERT INTO lg_agent_log (tenant_id, agent_name, tool_name, input, output, duration_ms, success, created_at)
        VALUES ($1, 'neural', $2, $3, $4, $5, true, NOW())
      `, { bind: [tid, 'scan_' + (f.category || scan_type), JSON.stringify({ scan_type: f.category || scan_type }), JSON.stringify(f), Date.now() - startTime] });
    } catch (e) {
      // Non-fatal — log persistence failure shouldn't break the scan
      console.error(`[Neural] Failed to persist finding: ${e.message}`);
    }
  }

  return {
    scan_type: scan_type === 'full' ? 'full' : scan_type,
    findings: allFindings,
    finding_count: allFindings.length,
    by_severity: {
      critical: allFindings.filter(f => f.severity === 'critical').length,
      warning: allFindings.filter(f => f.severity === 'warning').length,
      advisory: allFindings.filter(f => f.severity === 'advisory').length,
      info: allFindings.filter(f => f.severity === 'info').length,
    },
    scan_duration_ms: Date.now() - startTime,
  };
}

// (2) get_findings
async function getFindings(input) {
  const { tenant_id, severity, category, limit, offset } = input;
  const tid = tenant_id || 'logistics';
  const lim = limit || 25;
  const off = offset || 0;

  let whereExtra = '';
  const binds = [tid, lim, off];
  let bindIdx = 4;

  if (severity) {
    whereExtra += ` AND output->>'severity' = $${bindIdx}`;
    binds.push(severity);
    bindIdx++;
  }
  if (category) {
    whereExtra += ` AND output->>'category' = $${bindIdx}`;
    binds.push(category);
    bindIdx++;
  }

  const [rows] = await sequelize.query(`
    SELECT id, tool_name, output, created_at
    FROM lg_agent_log
    WHERE tenant_id = $1 AND agent_name = 'neural' AND tool_name LIKE 'scan_%'
      ${whereExtra}
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, { bind: binds });

  const [countResult] = await sequelize.query(`
    SELECT COUNT(*) as total
    FROM lg_agent_log
    WHERE tenant_id = $1 AND agent_name = 'neural' AND tool_name LIKE 'scan_%'
      ${whereExtra}
  `, { bind: [tid, ...(severity ? [severity] : []), ...(category ? [category] : [])] });

  const total = parseInt(countResult[0]?.total) || 0;

  return {
    findings: rows.map(row => {
      const f = typeof row.output === 'string' ? JSON.parse(row.output) : row.output;
      return { ...f, log_id: row.id, logged_at: row.created_at };
    }),
    total,
    limit: lim,
    offset: off,
    has_more: off + lim < total,
  };
}

// (3) get_finding_detail
async function getFindingDetail(input) {
  const { finding_id, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  const [rows] = await sequelize.query(`
    SELECT id, tool_name, input, output, duration_ms, created_at
    FROM lg_agent_log
    WHERE tenant_id = $1 AND agent_name = 'neural' AND tool_name LIKE 'scan_%'
      AND output->>'finding_id' = $2
    ORDER BY created_at DESC LIMIT 1
  `, { bind: [tid, finding_id] });

  if (rows.length === 0) {
    throw new Error(`Finding ${finding_id} not found`);
  }

  const row = rows[0];
  const f = typeof row.output === 'string' ? JSON.parse(row.output) : row.output;

  return {
    ...f,
    log_id: row.id,
    tool_name: row.tool_name,
    scan_duration_ms: row.duration_ms,
    logged_at: row.created_at,
  };
}

// (4) acknowledge_finding
async function acknowledgeFinding(input) {
  const { finding_id, tenant_id, acknowledged_by } = input;
  const tid = tenant_id || 'logistics';

  const [rows] = await sequelize.query(`
    SELECT id, output FROM lg_agent_log
    WHERE tenant_id = $1 AND agent_name = 'neural' AND tool_name LIKE 'scan_%'
      AND output->>'finding_id' = $2
    ORDER BY created_at DESC LIMIT 1
  `, { bind: [tid, finding_id] });

  if (rows.length === 0) {
    throw new Error(`Finding ${finding_id} not found`);
  }

  const row = rows[0];
  const existingOutput = typeof row.output === 'string' ? JSON.parse(row.output) : row.output;
  const updatedOutput = {
    ...existingOutput,
    acknowledged: true,
    acknowledged_by: acknowledged_by || 'user',
    acknowledged_at: new Date().toISOString(),
  };

  await sequelize.query(`
    UPDATE lg_agent_log SET output = $1::jsonb WHERE id = $2
  `, { bind: [JSON.stringify(updatedOutput), row.id] });

  return { acknowledged: true, finding_id, acknowledged_by: acknowledged_by || 'user', acknowledged_at: updatedOutput.acknowledged_at };
}

// (5) get_scan_schedule
async function getScanSchedule(input) {
  return {
    schedules: [
      { scan_type: 'operations', frequency: 'daily', next_run: '6:00 AM' },
      { scan_type: 'financial', frequency: 'daily', next_run: '7:00 AM' },
      { scan_type: 'compliance', frequency: 'daily', next_run: '6:30 AM' },
      { scan_type: 'fleet_health', frequency: 'weekly', next_run: 'Monday 6:00 AM' },
      { scan_type: 'market', frequency: 'daily', next_run: '8:00 AM' },
      { scan_type: 'win_loss', frequency: 'weekly', next_run: 'Monday 7:00 AM' },
      { scan_type: 'shipper_relationship', frequency: 'weekly', next_run: 'Monday 8:00 AM' },
      { scan_type: 'voice', frequency: 'daily', next_run: '9:00 AM' },
      { scan_type: 'full', frequency: 'monthly', next_run: '1st of month 5:00 AM' },
    ],
  };
}

// (6) configure_scan_thresholds
async function configureScanThresholds(input) {
  const { scan_type, thresholds, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!scan_type || !thresholds) {
    throw new Error('scan_type and thresholds object are required');
  }

  // Store as a config entry in lg_agent_log
  await sequelize.query(`
    INSERT INTO lg_agent_log (tenant_id, agent_name, tool_name, input, output, duration_ms, success, created_at)
    VALUES ($1, 'neural', 'config_thresholds', $2, $3, 0, true, NOW())
  `, { bind: [tid, JSON.stringify({ scan_type }), JSON.stringify({ scan_type, thresholds, updated_at: new Date().toISOString() })] });

  return { updated: true, scan_type, thresholds };
}

// (7) get_neural_dashboard
async function getNeuralDashboard(input) {
  const { tenant_id } = input;
  const tid = tenant_id || 'logistics';

  // Findings counts by severity and time window
  const [findingCounts] = await sequelize.query(`
    SELECT
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as findings_24h,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as findings_7d,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as findings_30d,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' AND output->>'severity' = 'critical' THEN 1 END) as critical_7d,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' AND output->>'severity' = 'warning' THEN 1 END) as warning_7d,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' AND output->>'severity' = 'advisory' THEN 1 END) as advisory_7d,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' AND output->>'severity' = 'info' THEN 1 END) as info_7d
    FROM lg_agent_log
    WHERE tenant_id = $1 AND agent_name = 'neural' AND tool_name LIKE 'scan_%'
  `, { bind: [tid] });
  const fc = findingCounts[0] || {};

  // Top 5 critical/warning findings
  const [topFindings] = await sequelize.query(`
    SELECT output, created_at
    FROM lg_agent_log
    WHERE tenant_id = $1 AND agent_name = 'neural' AND tool_name LIKE 'scan_%'
      AND (output->>'severity' = 'critical' OR output->>'severity' = 'warning')
    ORDER BY created_at DESC LIMIT 5
  `, { bind: [tid] });

  // Scan coverage
  const [scanCoverage] = await sequelize.query(`
    SELECT tool_name, MAX(created_at) as last_run
    FROM lg_agent_log
    WHERE tenant_id = $1 AND agent_name = 'neural' AND tool_name LIKE 'scan_%'
    GROUP BY tool_name
    ORDER BY last_run DESC
  `, { bind: [tid] });

  // Key metrics
  const [fleetUtil] = await sequelize.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN status IN ('active', 'dispatched') THEN 1 END) as active
    FROM lg_trucks WHERE tenant_id = $1
  `, { bind: [tid] });
  const fu = fleetUtil[0] || {};
  const utilPct = parseInt(fu.total) > 0 ? (parseInt(fu.active) / parseInt(fu.total)) * 100 : 0;

  const [avgRpm] = await sequelize.query(`
    SELECT AVG(sell_rate / NULLIF(miles, 0)) as avg_rpm
    FROM lg_loads WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
      AND sell_rate IS NOT NULL AND miles > 0
  `, { bind: [tid] });

  const [arTotal] = await sequelize.query(`
    SELECT SUM(CASE WHEN status != 'paid' THEN total_amount ELSE 0 END) as outstanding
    FROM lg_invoices WHERE tenant_id = $1
  `, { bind: [tid] });

  const [compScore] = await sequelize.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN expiry_date > NOW() OR expiry_date IS NULL THEN 1 END) as current_docs
    FROM lg_compliance WHERE tenant_id = $1
  `, { bind: [tid] });
  const cs = compScore[0] || {};
  const compliancePct = parseInt(cs.total) > 0 ? (parseInt(cs.current_docs) / parseInt(cs.total)) * 100 : 100;

  return {
    findings_summary: {
      last_24h: parseInt(fc.findings_24h) || 0,
      last_7d: parseInt(fc.findings_7d) || 0,
      last_30d: parseInt(fc.findings_30d) || 0,
      by_severity_7d: {
        critical: parseInt(fc.critical_7d) || 0,
        warning: parseInt(fc.warning_7d) || 0,
        advisory: parseInt(fc.advisory_7d) || 0,
        info: parseInt(fc.info_7d) || 0,
      },
    },
    top_findings: topFindings.map(row => {
      const f = typeof row.output === 'string' ? JSON.parse(row.output) : row.output;
      return { ...f, logged_at: row.created_at };
    }),
    scan_coverage: scanCoverage.map(row => ({
      scan_type: row.tool_name.replace('scan_', ''),
      last_run: row.last_run,
    })),
    key_metrics: {
      fleet_utilization_pct: r(utilPct),
      avg_rpm_30d: r(avgRpm[0]?.avg_rpm),
      ar_outstanding: r(arTotal[0]?.outstanding),
      compliance_score_pct: r(compliancePct),
    },
    generated_at: new Date().toISOString(),
  };
}

// ── Agent Definition ──────────────────────────────────────────────────────────

const neuralAgent = new FreightMindAgent({
  name: 'neural',
  model: 'claude-sonnet-4-5-20250514',
  systemPrompt: `You are the Neural Intelligence agent for FreightMind. You observe ALL data across ALL tiers, detect patterns, anomalies, and risks, and generate Findings with Diagnostic (what happened) and Prescription (what to do). You do NOT execute fixes — that is the Treatment module. You are the brain that sees everything.

When presenting findings, prioritize by severity (critical > warning > advisory > info). Always explain WHY something matters and WHAT to do about it. Reference specific numbers and thresholds. If data is insufficient for a conclusion, say so rather than guessing.`,
  tools: [
    {
      name: 'run_neural_scan',
      description: 'Run a diagnostic scan across freight operations data. Returns findings with diagnostic + prescription.',
      input_schema: {
        type: 'object',
        properties: {
          scan_type: {
            type: 'string',
            description: 'Type of scan: operations, financial, compliance, fleet_health, market, win_loss, shipper_relationship, voice, or full',
            enum: ['operations', 'financial', 'compliance', 'fleet_health', 'market', 'win_loss', 'shipper_relationship', 'voice', 'full'],
          },
          tenant_id: { type: 'string' },
        },
        required: ['scan_type'],
      },
      handler: runNeuralScan,
    },
    {
      name: 'get_findings',
      description: 'Retrieve past neural scan findings, optionally filtered by severity and category',
      input_schema: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          severity: { type: 'string', description: 'Filter by severity: critical, warning, advisory, info', enum: ['critical', 'warning', 'advisory', 'info'] },
          category: { type: 'string', description: 'Filter by scan category: operations, financial, compliance, fleet_health, market, win_loss, shipper_relationship, voice' },
          limit: { type: 'integer', description: 'Max results (default 25)' },
          offset: { type: 'integer', description: 'Pagination offset (default 0)' },
        },
      },
      handler: getFindings,
    },
    {
      name: 'get_finding_detail',
      description: 'Get full detail for a specific finding by its finding_id',
      input_schema: {
        type: 'object',
        properties: {
          finding_id: { type: 'string', description: 'UUID of the finding' },
          tenant_id: { type: 'string' },
        },
        required: ['finding_id'],
      },
      handler: getFindingDetail,
    },
    {
      name: 'acknowledge_finding',
      description: 'Mark a finding as acknowledged by a user',
      input_schema: {
        type: 'object',
        properties: {
          finding_id: { type: 'string', description: 'UUID of the finding to acknowledge' },
          tenant_id: { type: 'string' },
          acknowledged_by: { type: 'string', description: 'Name or ID of the user acknowledging' },
        },
        required: ['finding_id'],
      },
      handler: acknowledgeFinding,
    },
    {
      name: 'get_scan_schedule',
      description: 'Get the default scan schedule for all neural scan types',
      input_schema: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
        },
      },
      handler: getScanSchedule,
    },
    {
      name: 'configure_scan_thresholds',
      description: 'Configure alert thresholds for a scan type (e.g. deadhead_warning: 15, ar_warning_days: 45)',
      input_schema: {
        type: 'object',
        properties: {
          scan_type: { type: 'string', description: 'Scan type to configure thresholds for' },
          thresholds: {
            type: 'object',
            description: 'Key-value pairs of threshold settings (e.g. { deadhead_warning: 15, deadhead_critical: 20 })',
          },
          tenant_id: { type: 'string' },
        },
        required: ['scan_type', 'thresholds'],
      },
      handler: configureScanThresholds,
    },
    {
      name: 'get_neural_dashboard',
      description: 'Get a full Neural Intelligence dashboard with findings summary, top issues, scan coverage, and key metrics',
      input_schema: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
        },
      },
      handler: getNeuralDashboard,
    },
  ],
});

registerAgent(neuralAgent);

module.exports = neuralAgent;
