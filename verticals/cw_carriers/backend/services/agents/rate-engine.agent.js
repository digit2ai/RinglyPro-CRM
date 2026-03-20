// rate-engine.agent.js
// FreightMind AI — Rate Engine Agent
// Wraps pricing.cw.js + adds win/loss analytics, RFP management, spot market optimization

const { FreightMindAgent, registerAgent } = require('../agent-framework.cw');
const pricing = require('../pricing.cw');
const sequelize = require('../db.cw');

// ── Tool Handlers ───────────────────────────────────────────────────────────

// (a) get_market_rate — wraps existing get_rate_recommendation
async function getMarketRate(input) {
  return await pricing.get_rate_recommendation(input);
}

// (b) calc_lane_rate — wraps get_rate_recommendation with explicit margin calc
async function calcLaneRate(input) {
  const { origin, destination, equipment_type, target_margin_pct, pickup_date, miles, tenant_id } = input;
  const rec = await pricing.get_rate_recommendation({ origin, destination, equipment_type, pickup_date, miles, tenant_id });

  const targetMargin = parseFloat(target_margin_pct) || rec.recommendation.margin_pct;
  const buyRate = rec.recommendation.suggested_buy_rate;
  const sellRate = Math.round(buyRate * (1 + targetMargin / 100) * 100) / 100;
  const margin = Math.round((sellRate - buyRate) * 100) / 100;

  return {
    lane: rec.lane,
    buy_rate: buyRate,
    sell_rate: sellRate,
    margin_dollars: margin,
    margin_pct: targetMargin,
    rate_per_mile: rec.recommendation.rate_per_mile,
    pricing_method: rec.pricing_method,
    confidence: rec.confidence_band.confidence,
    rationale: rec.rationale,
    data_quality: rec.data_quality,
  };
}

// (c) compare_spot_vs_contract — query lg_rate_benchmarks + lg_quotes
async function compareSpotVsContract(input) {
  const { origin_state, destination_state, equipment_type, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const equip = equipment_type || 'dry_van';

  const [benchmarks] = await sequelize.query(`
    SELECT AVG(avg_rate) as contract_avg, AVG(rate_per_mile_avg) as contract_rpm,
           COUNT(*) as benchmark_count
    FROM lg_rate_benchmarks
    WHERE origin_state = $1 AND destination_state = $2 AND equipment_type = $3
  `, { bind: [origin_state, destination_state, equip] });

  const [spotQuotes] = await sequelize.query(`
    SELECT AVG(quoted_rate) as spot_avg, AVG(quoted_rate / NULLIF(miles, 0)) as spot_rpm,
           COUNT(*) as quote_count,
           COUNT(CASE WHEN outcome = 'won' THEN 1 END) as won,
           COUNT(CASE WHEN outcome = 'lost' THEN 1 END) as lost
    FROM lg_quotes
    WHERE tenant_id = $1 AND origin_state = $2 AND destination_state = $3
      AND equipment_type = $4 AND quote_type = 'spot'
      AND created_at > NOW() - INTERVAL '90 days'
  `, { bind: [tid, origin_state, destination_state, equip] });

  const bench = benchmarks[0] || {};
  const spot = spotQuotes[0] || {};
  const contractAvg = parseFloat(bench.contract_avg) || 0;
  const spotAvg = parseFloat(spot.spot_avg) || 0;
  const spread = spotAvg && contractAvg ? Math.round((spotAvg - contractAvg) * 100) / 100 : null;
  const spreadPct = contractAvg ? Math.round((spread / contractAvg) * 10000) / 100 : null;

  return {
    lane: `${origin_state} -> ${destination_state}`,
    equipment_type: equip,
    contract: {
      avg_rate: contractAvg || null,
      rpm: parseFloat(bench.contract_rpm) || null,
      sample_size: parseInt(bench.benchmark_count) || 0,
    },
    spot: {
      avg_rate: spotAvg || null,
      rpm: parseFloat(spot.spot_rpm) || null,
      quote_count: parseInt(spot.quote_count) || 0,
      win_count: parseInt(spot.won) || 0,
      loss_count: parseInt(spot.lost) || 0,
    },
    spread: spread,
    spread_pct: spreadPct,
    recommendation: spread > 0 ? 'Spot market is running above contract — favor contract freight'
      : spread < 0 ? 'Spot market is below contract — opportunity to pick up spot loads'
      : 'Insufficient data to compare',
  };
}

// (d) predict_rate_trend — query last 90 days of lg_loads for a lane, calculate trend
async function predictRateTrend(input) {
  const { origin_state, destination_state, equipment_type, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const equip = equipment_type || 'dry_van';

  const [weekly] = await sequelize.query(`
    SELECT DATE_TRUNC('week', created_at) as week,
           AVG(buy_rate) as avg_rate, AVG(rate_per_mile) as avg_rpm,
           COUNT(*) as load_count
    FROM lg_loads
    WHERE tenant_id = $1 AND origin_state = $2 AND destination_state = $3
      AND equipment_type = $4
      AND status IN ('delivered','invoiced','paid')
      AND created_at > NOW() - INTERVAL '90 days'
    GROUP BY DATE_TRUNC('week', created_at)
    ORDER BY week ASC
  `, { bind: [tid, origin_state, destination_state, equip] });

  if (weekly.length < 2) {
    return { lane: `${origin_state} -> ${destination_state}`, trend: 'insufficient_data', weeks_analyzed: weekly.length, message: 'Need at least 2 weeks of data to determine trend' };
  }

  // Simple linear regression on weekly avg rate
  const rates = weekly.map(w => parseFloat(w.avg_rate));
  const n = rates.length;
  const xMean = (n - 1) / 2;
  const yMean = rates.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (rates[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = den ? num / den : 0;
  const weeklyChangePct = yMean ? (slope / yMean) * 100 : 0;

  let trend;
  if (weeklyChangePct > 2) trend = 'rising_fast';
  else if (weeklyChangePct > 0.5) trend = 'rising';
  else if (weeklyChangePct < -2) trend = 'falling_fast';
  else if (weeklyChangePct < -0.5) trend = 'falling';
  else trend = 'stable';

  const firstWeekRate = rates[0];
  const lastWeekRate = rates[n - 1];
  const totalChange = Math.round((lastWeekRate - firstWeekRate) * 100) / 100;

  return {
    lane: `${origin_state} -> ${destination_state}`,
    equipment_type: equip,
    trend,
    weekly_change_pct: Math.round(weeklyChangePct * 100) / 100,
    total_change_dollars: totalChange,
    first_week_avg: Math.round(firstWeekRate * 100) / 100,
    last_week_avg: Math.round(lastWeekRate * 100) / 100,
    weeks_analyzed: n,
    weekly_data: weekly.map(w => ({
      week: w.week,
      avg_rate: Math.round(parseFloat(w.avg_rate) * 100) / 100,
      avg_rpm: parseFloat(w.avg_rpm) ? Math.round(parseFloat(w.avg_rpm) * 100) / 100 : null,
      load_count: parseInt(w.load_count),
    })),
    recommendation: trend.includes('rising') ? 'Lock in contract rates soon — market trending up'
      : trend.includes('falling') ? 'Consider spot market — rates are declining'
      : 'Market stable — maintain current pricing strategy',
  };
}

// (e) set_min_rate — upsert into lg_rate_benchmarks with type='floor'
async function setMinRate(input) {
  const { origin_state, destination_state, equipment_type, min_rate, min_rpm, reason, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const equip = equipment_type || 'dry_van';

  // Upsert: delete existing floor then insert new one
  await sequelize.query(`
    DELETE FROM lg_rate_benchmarks
    WHERE tenant_id = $1 AND origin_state = $2 AND destination_state = $3
      AND equipment_type = $4 AND benchmark_source = 'floor'
  `, { bind: [tid, origin_state, destination_state, equip] });

  await sequelize.query(`
    INSERT INTO lg_rate_benchmarks (tenant_id, origin_state, destination_state, equipment_type,
      avg_rate, rate_per_mile_avg, benchmark_source, confidence, rate_date, sample_size, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'floor', 'manual', CURRENT_DATE, 0, NOW())
  `, { bind: [tid, origin_state, destination_state, equip, min_rate || 0, min_rpm || 0] });

  return {
    status: 'floor_rate_set',
    lane: `${origin_state} -> ${destination_state}`,
    equipment_type: equip,
    min_rate: min_rate || null,
    min_rpm: min_rpm || null,
    reason: reason || 'Manual floor set',
  };
}

// (f) negotiate_rate — use market data to generate counter-offer
async function negotiateRate(input) {
  const { origin, destination, equipment_type, their_rate, our_target_margin, pickup_date, miles, tenant_id } = input;
  const rec = await pricing.get_rate_recommendation({ origin, destination, equipment_type, pickup_date, miles, tenant_id });

  const marketBuy = rec.recommendation.suggested_buy_rate;
  const theirRate = parseFloat(their_rate);
  const targetMargin = parseFloat(our_target_margin) || rec.recommendation.margin_pct;
  const minAcceptable = marketBuy * (1 + 8 / 100); // min margin 8%
  const idealSell = marketBuy * (1 + targetMargin / 100);

  let counterOffer, strategy;
  if (theirRate >= idealSell) {
    counterOffer = theirRate;
    strategy = 'accept';
  } else if (theirRate >= minAcceptable) {
    counterOffer = Math.round(((theirRate + idealSell) / 2) * 100) / 100;
    strategy = 'negotiate_up';
  } else {
    counterOffer = Math.round(idealSell * 100) / 100;
    strategy = 'counter';
  }

  const counterMargin = Math.round(((counterOffer - marketBuy) / counterOffer) * 10000) / 100;
  const theirMargin = Math.round(((theirRate - marketBuy) / theirRate) * 10000) / 100;

  return {
    their_rate: theirRate,
    counter_offer: counterOffer,
    strategy,
    market_buy_rate: marketBuy,
    their_margin_pct: theirMargin,
    counter_margin_pct: counterMargin,
    min_acceptable: Math.round(minAcceptable * 100) / 100,
    ideal_sell: Math.round(idealSell * 100) / 100,
    confidence: rec.confidence_band.confidence,
    talking_points: strategy === 'accept'
      ? ['Rate is at or above target — accept and book.']
      : strategy === 'negotiate_up'
        ? [
          `Market rate for this lane is $${marketBuy.toFixed(0)}+ carrier cost.`,
          `Counter at $${counterOffer.toFixed(0)} preserves ${counterMargin.toFixed(1)}% margin.`,
          `Their offer yields only ${theirMargin.toFixed(1)}% margin — below target.`,
        ]
        : [
          `Their rate of $${theirRate.toFixed(0)} is below our floor.`,
          `Market carrier cost is ~$${marketBuy.toFixed(0)} for this lane.`,
          `Recommend $${counterOffer.toFixed(0)} to maintain ${counterMargin.toFixed(1)}% margin.`,
          `Reference: ${rec.rationale[0] || 'internal pricing data'}`,
        ],
  };
}

// (g) calc_trip_profitability — sum revenue/costs across multiple loads
async function calcTripProfitability(input) {
  const { load_ids, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!load_ids || !Array.isArray(load_ids) || load_ids.length === 0) {
    throw new Error('load_ids array required');
  }

  const placeholders = load_ids.map((_, i) => `$${i + 2}`).join(',');
  const [loads] = await sequelize.query(`
    SELECT id, load_ref, origin_city, origin_state, destination_city, destination_state,
           buy_rate, sell_rate, margin_pct, miles, equipment_type, status
    FROM lg_loads
    WHERE tenant_id = $1 AND id IN (${placeholders})
  `, { bind: [tid, ...load_ids] });

  if (loads.length === 0) {
    return { error: 'No loads found for provided IDs', load_ids };
  }

  const totalRevenue = loads.reduce((sum, l) => sum + (parseFloat(l.sell_rate) || 0), 0);
  const totalCost = loads.reduce((sum, l) => sum + (parseFloat(l.buy_rate) || 0), 0);
  const totalMiles = loads.reduce((sum, l) => sum + (parseFloat(l.miles) || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const revenuePerMile = totalMiles > 0 ? totalRevenue / totalMiles : 0;

  return {
    load_count: loads.length,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    total_profit: Math.round(totalProfit * 100) / 100,
    avg_margin_pct: Math.round(avgMarginPct * 100) / 100,
    total_miles: Math.round(totalMiles),
    revenue_per_mile: Math.round(revenuePerMile * 100) / 100,
    loads: loads.map(l => ({
      id: l.id,
      load_ref: l.load_ref,
      lane: `${l.origin_city}, ${l.origin_state} -> ${l.destination_city}, ${l.destination_state}`,
      revenue: parseFloat(l.sell_rate) || 0,
      cost: parseFloat(l.buy_rate) || 0,
      profit: (parseFloat(l.sell_rate) || 0) - (parseFloat(l.buy_rate) || 0),
      margin_pct: parseFloat(l.margin_pct) || 0,
      miles: parseFloat(l.miles) || 0,
      status: l.status,
    })),
    profitable: totalProfit > 0,
  };
}

// (h) get_rate_benchmarks — wraps existing get_lane_analysis
async function getRateBenchmarks(input) {
  return await pricing.get_lane_analysis(input);
}

// (i) track_quote_outcome — INSERT into lg_quotes
async function trackQuoteOutcome(input) {
  const { origin_city, origin_state, destination_city, destination_state,
    equipment_type, miles, quoted_rate, quote_type, outcome, customer_name,
    competitor_rate, notes, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  await sequelize.query(`
    INSERT INTO lg_quotes (tenant_id, origin_city, origin_state, destination_city, destination_state,
      equipment_type, miles, quoted_rate, quote_type, outcome, customer_name,
      competitor_rate, notes, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
  `, { bind: [tid, origin_city, origin_state, destination_city, destination_state,
    equipment_type || 'dry_van', miles || null, quoted_rate, quote_type || 'spot',
    outcome || 'pending', customer_name || null, competitor_rate || null, notes || null] });

  return {
    status: 'quote_tracked',
    lane: `${origin_city}, ${origin_state} -> ${destination_city}, ${destination_state}`,
    quoted_rate,
    outcome: outcome || 'pending',
    quote_type: quote_type || 'spot',
  };
}

// (j) analyze_win_loss_by_lane — aggregate query on lg_quotes grouped by lane
async function analyzeWinLossByLane(input) {
  const { equipment_type, days, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const lookback = days || 90;

  const equipFilter = equipment_type ? `AND equipment_type = '${equipment_type}'` : '';

  const [lanes] = await sequelize.query(`
    SELECT origin_state, destination_state, equipment_type,
           COUNT(*) as total_quotes,
           COUNT(CASE WHEN outcome = 'won' THEN 1 END) as won,
           COUNT(CASE WHEN outcome = 'lost' THEN 1 END) as lost,
           COUNT(CASE WHEN outcome = 'pending' THEN 1 END) as pending,
           AVG(quoted_rate) as avg_quoted,
           AVG(CASE WHEN outcome = 'won' THEN quoted_rate END) as avg_won_rate,
           AVG(CASE WHEN outcome = 'lost' THEN quoted_rate END) as avg_lost_rate,
           AVG(competitor_rate) FILTER (WHERE competitor_rate IS NOT NULL) as avg_competitor_rate
    FROM lg_quotes
    WHERE tenant_id = $1
      AND created_at > NOW() - ($2 || ' days')::INTERVAL
      ${equipFilter}
    GROUP BY origin_state, destination_state, equipment_type
    ORDER BY total_quotes DESC
  `, { bind: [tid, lookback.toString()] });

  return {
    period_days: lookback,
    lane_count: lanes.length,
    lanes: lanes.map(l => {
      const won = parseInt(l.won) || 0;
      const lost = parseInt(l.lost) || 0;
      const total = won + lost;
      const winRate = total > 0 ? Math.round((won / total) * 10000) / 100 : null;
      return {
        lane: `${l.origin_state} -> ${l.destination_state}`,
        equipment_type: l.equipment_type,
        total_quotes: parseInt(l.total_quotes),
        won, lost,
        pending: parseInt(l.pending) || 0,
        win_rate_pct: winRate,
        avg_quoted_rate: parseFloat(l.avg_quoted) ? Math.round(parseFloat(l.avg_quoted) * 100) / 100 : null,
        avg_won_rate: parseFloat(l.avg_won_rate) ? Math.round(parseFloat(l.avg_won_rate) * 100) / 100 : null,
        avg_lost_rate: parseFloat(l.avg_lost_rate) ? Math.round(parseFloat(l.avg_lost_rate) * 100) / 100 : null,
        avg_competitor_rate: parseFloat(l.avg_competitor_rate) ? Math.round(parseFloat(l.avg_competitor_rate) * 100) / 100 : null,
        pricing_gap: parseFloat(l.avg_lost_rate) && parseFloat(l.avg_competitor_rate)
          ? Math.round((parseFloat(l.avg_lost_rate) - parseFloat(l.avg_competitor_rate)) * 100) / 100
          : null,
      };
    }),
  };
}

// (k) optimize_spot_pricing — analyze win/loss patterns and recommend adjustments
async function optimizeSpotPricing(input) {
  const { origin_state, destination_state, equipment_type, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const equip = equipment_type || 'dry_van';

  const [stats] = await sequelize.query(`
    SELECT outcome, COUNT(*) as cnt, AVG(quoted_rate) as avg_rate,
           AVG(competitor_rate) FILTER (WHERE competitor_rate IS NOT NULL) as avg_comp,
           AVG(miles) as avg_miles
    FROM lg_quotes
    WHERE tenant_id = $1 AND origin_state = $2 AND destination_state = $3
      AND equipment_type = $4 AND quote_type = 'spot'
      AND created_at > NOW() - INTERVAL '90 days'
    GROUP BY outcome
  `, { bind: [tid, origin_state, destination_state, equip] });

  const wonRow = stats.find(s => s.outcome === 'won') || {};
  const lostRow = stats.find(s => s.outcome === 'lost') || {};
  const wonAvg = parseFloat(wonRow.avg_rate) || 0;
  const lostAvg = parseFloat(lostRow.avg_rate) || 0;
  const wonCount = parseInt(wonRow.cnt) || 0;
  const lostCount = parseInt(lostRow.cnt) || 0;
  const totalDecided = wonCount + lostCount;
  const winRate = totalDecided > 0 ? (wonCount / totalDecided) * 100 : null;
  const compAvg = parseFloat(lostRow.avg_comp) || parseFloat(wonRow.avg_comp) || null;

  let recommendation, adjustmentPct;
  if (winRate === null) {
    recommendation = 'Insufficient data — track more quote outcomes';
    adjustmentPct = 0;
  } else if (winRate > 70) {
    recommendation = 'Win rate is high — consider raising prices 3-5% to improve margin';
    adjustmentPct = 4;
  } else if (winRate > 50) {
    recommendation = 'Win rate is healthy — maintain current pricing';
    adjustmentPct = 0;
  } else if (winRate > 30) {
    recommendation = 'Win rate is below target — consider reducing prices 2-4%';
    adjustmentPct = -3;
  } else {
    recommendation = 'Win rate is critically low — reduce prices 5-8% or review cost structure';
    adjustmentPct = -6;
  }

  const suggestedRate = wonAvg > 0
    ? Math.round(wonAvg * (1 + adjustmentPct / 100) * 100) / 100
    : null;

  return {
    lane: `${origin_state} -> ${destination_state}`,
    equipment_type: equip,
    win_rate_pct: winRate !== null ? Math.round(winRate * 100) / 100 : null,
    won_count: wonCount,
    lost_count: lostCount,
    avg_won_rate: wonAvg ? Math.round(wonAvg * 100) / 100 : null,
    avg_lost_rate: lostAvg ? Math.round(lostAvg * 100) / 100 : null,
    avg_competitor_rate: compAvg ? Math.round(compAvg * 100) / 100 : null,
    suggested_rate: suggestedRate,
    adjustment_pct: adjustmentPct,
    recommendation,
  };
}

// (l) get_spot_market_dashboard — summary across lg_quotes
async function getSpotMarketDashboard(input) {
  const { days, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const lookback = days || 30;

  const [summary] = await sequelize.query(`
    SELECT COUNT(*) as total_quotes,
           COUNT(CASE WHEN outcome = 'won' THEN 1 END) as won,
           COUNT(CASE WHEN outcome = 'lost' THEN 1 END) as lost,
           COUNT(CASE WHEN outcome = 'pending' THEN 1 END) as pending,
           SUM(CASE WHEN outcome = 'won' THEN quoted_rate ELSE 0 END) as won_revenue,
           AVG(CASE WHEN outcome = 'won' THEN quoted_rate END) as avg_won_rate,
           AVG(quoted_rate) as avg_quoted
    FROM lg_quotes
    WHERE tenant_id = $1 AND quote_type = 'spot'
      AND created_at > NOW() - ($2 || ' days')::INTERVAL
  `, { bind: [tid, lookback.toString()] });

  const [topLanes] = await sequelize.query(`
    SELECT origin_state, destination_state,
           COUNT(*) as quotes,
           COUNT(CASE WHEN outcome = 'won' THEN 1 END) as won,
           AVG(quoted_rate) as avg_rate
    FROM lg_quotes
    WHERE tenant_id = $1 AND quote_type = 'spot'
      AND created_at > NOW() - ($2 || ' days')::INTERVAL
    GROUP BY origin_state, destination_state
    ORDER BY quotes DESC LIMIT 10
  `, { bind: [tid, lookback.toString()] });

  const s = summary[0] || {};
  const totalQuotes = parseInt(s.total_quotes) || 0;
  const won = parseInt(s.won) || 0;
  const lost = parseInt(s.lost) || 0;
  const decided = won + lost;

  return {
    period_days: lookback,
    total_quotes: totalQuotes,
    won, lost,
    pending: parseInt(s.pending) || 0,
    win_rate_pct: decided > 0 ? Math.round((won / decided) * 10000) / 100 : null,
    total_won_revenue: parseFloat(s.won_revenue) ? Math.round(parseFloat(s.won_revenue) * 100) / 100 : 0,
    avg_won_rate: parseFloat(s.avg_won_rate) ? Math.round(parseFloat(s.avg_won_rate) * 100) / 100 : null,
    avg_quoted_rate: parseFloat(s.avg_quoted) ? Math.round(parseFloat(s.avg_quoted) * 100) / 100 : null,
    top_lanes: topLanes.map(l => ({
      lane: `${l.origin_state} -> ${l.destination_state}`,
      quotes: parseInt(l.quotes),
      won: parseInt(l.won),
      avg_rate: parseFloat(l.avg_rate) ? Math.round(parseFloat(l.avg_rate) * 100) / 100 : null,
    })),
  };
}

// (m) import_rfp — INSERT into lg_rfps + lg_rfp_lanes
async function importRfp(input) {
  const { rfp_name, customer_name, due_date, lanes, notes, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!lanes || !Array.isArray(lanes) || lanes.length === 0) {
    throw new Error('lanes array required with at least one lane');
  }

  const [rfpResult] = await sequelize.query(`
    INSERT INTO lg_rfps (tenant_id, rfp_name, customer_name, due_date, status, notes, lane_count, created_at)
    VALUES ($1, $2, $3, $4, 'draft', $5, $6, NOW())
    RETURNING id
  `, { bind: [tid, rfp_name, customer_name, due_date || null, notes || null, lanes.length] });

  const rfpId = rfpResult[0].id;

  let imported = 0;
  for (const lane of lanes) {
    await sequelize.query(`
      INSERT INTO lg_rfp_lanes (rfp_id, tenant_id, origin_city, origin_state, destination_city, destination_state,
        equipment_type, volume_per_week, miles, current_rate, notes, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', NOW())
    `, { bind: [rfpId, tid, lane.origin_city, lane.origin_state, lane.destination_city, lane.destination_state,
      lane.equipment_type || 'dry_van', lane.volume_per_week || null, lane.miles || null,
      lane.current_rate || null, lane.notes || null] });
    imported++;
  }

  return {
    status: 'rfp_imported',
    rfp_id: rfpId,
    rfp_name,
    customer_name,
    due_date,
    lanes_imported: imported,
  };
}

// (n) auto_price_rfp — query market rates for all RFP lanes and price them
async function autoPriceRfp(input) {
  const { rfp_id, target_margin_pct, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const targetMargin = parseFloat(target_margin_pct) || 15;

  const [lanes] = await sequelize.query(`
    SELECT id, origin_city, origin_state, destination_city, destination_state,
           equipment_type, miles, current_rate
    FROM lg_rfp_lanes
    WHERE rfp_id = $1 AND tenant_id = $2
  `, { bind: [rfp_id, tid] });

  if (lanes.length === 0) {
    return { error: 'No lanes found for this RFP', rfp_id };
  }

  const pricedLanes = [];
  for (const lane of lanes) {
    const origin = `${lane.origin_city}, ${lane.origin_state}`;
    const dest = `${lane.destination_city}, ${lane.destination_state}`;

    let rec;
    try {
      rec = await pricing.get_rate_recommendation({
        origin, destination: dest,
        equipment_type: lane.equipment_type,
        miles: lane.miles,
        tenant_id: tid,
      });
    } catch (e) {
      pricedLanes.push({ lane_id: lane.id, lane: `${origin} -> ${dest}`, error: e.message });
      continue;
    }

    const buyRate = rec.recommendation.suggested_buy_rate;
    const bidRate = Math.round(buyRate * (1 + targetMargin / 100) * 100) / 100;
    const margin = Math.round((bidRate - buyRate) * 100) / 100;

    // Update the lane with the priced bid
    await sequelize.query(`
      UPDATE lg_rfp_lanes SET bid_rate = $1, estimated_cost = $2, estimated_margin = $3,
        pricing_method = $4, confidence = $5, status = 'priced'
      WHERE id = $6
    `, { bind: [bidRate, buyRate, margin, rec.pricing_method, rec.confidence_band.confidence, lane.id] });

    pricedLanes.push({
      lane_id: lane.id,
      lane: `${origin} -> ${dest}`,
      equipment_type: lane.equipment_type,
      estimated_cost: buyRate,
      bid_rate: bidRate,
      margin: margin,
      margin_pct: targetMargin,
      pricing_method: rec.pricing_method,
      confidence: rec.confidence_band.confidence,
      current_rate: parseFloat(lane.current_rate) || null,
      vs_current: lane.current_rate ? Math.round((bidRate - parseFloat(lane.current_rate)) * 100) / 100 : null,
    });
  }

  // Update RFP status
  await sequelize.query(`UPDATE lg_rfps SET status = 'priced' WHERE id = $1`, { bind: [rfp_id] });

  return {
    rfp_id,
    lanes_priced: pricedLanes.filter(l => !l.error).length,
    lanes_failed: pricedLanes.filter(l => l.error).length,
    total_bid_value: pricedLanes.reduce((s, l) => s + (l.bid_rate || 0), 0),
    total_estimated_margin: pricedLanes.reduce((s, l) => s + (l.margin || 0), 0),
    target_margin_pct: targetMargin,
    lanes: pricedLanes,
  };
}

// (o) analyze_rfp_profitability — flag profitable vs unprofitable lanes
async function analyzeRfpProfitability(input) {
  const { rfp_id, min_margin_pct, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const minMargin = parseFloat(min_margin_pct) || 8;

  const [lanes] = await sequelize.query(`
    SELECT id, origin_city, origin_state, destination_city, destination_state,
           equipment_type, bid_rate, estimated_cost, estimated_margin, confidence,
           pricing_method, volume_per_week, miles, current_rate
    FROM lg_rfp_lanes
    WHERE rfp_id = $1 AND tenant_id = $2
    ORDER BY estimated_margin DESC NULLS LAST
  `, { bind: [rfp_id, tid] });

  const analyzed = lanes.map(l => {
    const bidRate = parseFloat(l.bid_rate) || 0;
    const cost = parseFloat(l.estimated_cost) || 0;
    const margin = parseFloat(l.estimated_margin) || 0;
    const marginPct = bidRate > 0 ? (margin / bidRate) * 100 : 0;
    const weeklyVolume = parseInt(l.volume_per_week) || 0;
    const weeklyMargin = margin * weeklyVolume;

    return {
      lane_id: l.id,
      lane: `${l.origin_city}, ${l.origin_state} -> ${l.destination_city}, ${l.destination_state}`,
      equipment_type: l.equipment_type,
      bid_rate: bidRate,
      estimated_cost: cost,
      margin_dollars: margin,
      margin_pct: Math.round(marginPct * 100) / 100,
      weekly_volume: weeklyVolume,
      weekly_margin: Math.round(weeklyMargin * 100) / 100,
      annual_margin_est: Math.round(weeklyMargin * 52 * 100) / 100,
      confidence: l.confidence,
      profitable: marginPct >= minMargin,
      flag: marginPct < minMargin ? 'UNPROFITABLE' : marginPct < minMargin * 1.5 ? 'MARGINAL' : 'PROFITABLE',
    };
  });

  const profitable = analyzed.filter(l => l.profitable);
  const unprofitable = analyzed.filter(l => !l.profitable);

  return {
    rfp_id,
    min_margin_threshold: minMargin,
    total_lanes: analyzed.length,
    profitable_lanes: profitable.length,
    unprofitable_lanes: unprofitable.length,
    total_weekly_margin: Math.round(analyzed.reduce((s, l) => s + l.weekly_margin, 0) * 100) / 100,
    total_annual_margin_est: Math.round(analyzed.reduce((s, l) => s + l.annual_margin_est, 0) * 100) / 100,
    recommendation: unprofitable.length === 0
      ? 'All lanes meet minimum margin — submit full bid'
      : `${unprofitable.length} lane(s) below ${minMargin}% margin — review before bidding`,
    lanes: analyzed,
  };
}

// (p) generate_bid_response — query lg_rfp_lanes and format response
async function generateBidResponse(input) {
  const { rfp_id, include_unprofitable, company_name, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  const [rfp] = await sequelize.query(`
    SELECT rfp_name, customer_name, due_date, notes FROM lg_rfps WHERE id = $1 AND tenant_id = $2
  `, { bind: [rfp_id, tid] });

  if (!rfp[0]) throw new Error(`RFP ${rfp_id} not found`);

  let laneFilter = `WHERE rfp_id = $1 AND tenant_id = $2 AND bid_rate IS NOT NULL`;
  if (!include_unprofitable) laneFilter += ` AND estimated_margin > 0`;

  const [lanes] = await sequelize.query(`
    SELECT origin_city, origin_state, destination_city, destination_state,
           equipment_type, bid_rate, miles, volume_per_week, confidence
    FROM lg_rfp_lanes ${laneFilter}
    ORDER BY origin_state, destination_state
  `, { bind: [rfp_id, tid] });

  const rfpData = rfp[0];
  const totalBid = lanes.reduce((s, l) => s + (parseFloat(l.bid_rate) || 0), 0);

  return {
    rfp_id,
    rfp_name: rfpData.rfp_name,
    customer: rfpData.customer_name,
    due_date: rfpData.due_date,
    responding_company: company_name || 'FreightMind Logistics',
    lanes_bid: lanes.length,
    total_bid_value: Math.round(totalBid * 100) / 100,
    bid_lanes: lanes.map(l => ({
      origin: `${l.origin_city}, ${l.origin_state}`,
      destination: `${l.destination_city}, ${l.destination_state}`,
      equipment_type: l.equipment_type,
      rate: parseFloat(l.bid_rate),
      miles: parseFloat(l.miles) || null,
      weekly_volume: parseInt(l.volume_per_week) || null,
      confidence: l.confidence,
    })),
    generated_at: new Date().toISOString(),
  };
}

// (q) track_rfp_awards — UPDATE lg_rfp_lanes with award data
async function trackRfpAwards(input) {
  const { rfp_id, awards, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  if (!awards || !Array.isArray(awards)) throw new Error('awards array required');

  let updated = 0;
  for (const award of awards) {
    const [result] = await sequelize.query(`
      UPDATE lg_rfp_lanes SET status = $1, awarded_rate = $2, award_notes = $3
      WHERE id = $4 AND rfp_id = $5 AND tenant_id = $6
    `, { bind: [
      award.awarded ? 'awarded' : 'not_awarded',
      award.awarded_rate || null,
      award.notes || null,
      award.lane_id,
      rfp_id,
      tid
    ] });
    updated++;
  }

  // Update RFP status
  await sequelize.query(`UPDATE lg_rfps SET status = 'awarded' WHERE id = $1`, { bind: [rfp_id] });

  // Get summary
  const [summary] = await sequelize.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN status = 'awarded' THEN 1 END) as awarded,
           COUNT(CASE WHEN status = 'not_awarded' THEN 1 END) as not_awarded,
           SUM(CASE WHEN status = 'awarded' THEN awarded_rate ELSE 0 END) as total_awarded_value
    FROM lg_rfp_lanes WHERE rfp_id = $1 AND tenant_id = $2
  `, { bind: [rfp_id, tid] });

  const s = summary[0] || {};
  return {
    rfp_id,
    updates_processed: updated,
    total_lanes: parseInt(s.total) || 0,
    awarded: parseInt(s.awarded) || 0,
    not_awarded: parseInt(s.not_awarded) || 0,
    award_rate_pct: (parseInt(s.total) || 0) > 0
      ? Math.round((parseInt(s.awarded) / parseInt(s.total)) * 10000) / 100
      : null,
    total_awarded_value: parseFloat(s.total_awarded_value) ? Math.round(parseFloat(s.total_awarded_value) * 100) / 100 : 0,
  };
}

// ── Agent Definition ────────────────────────────────────────────────────────

const rateEngine = new FreightMindAgent({
  name: 'rate_engine',
  model: 'claude-sonnet-4-5-20250514',
  systemPrompt: `You are the Rate Engine agent for FreightMind AI — a freight brokerage pricing intelligence system.
Your job is to provide accurate rate recommendations, analyze win/loss patterns, manage RFP pricing, and optimize spot market strategy.
Always ground your answers in data from the tools. When data is thin, say so and note the confidence level.
When recommending rates, explain your reasoning and cite the pricing method used.
For RFPs, flag unprofitable lanes and suggest alternatives. For negotiations, provide concrete talking points.`,
  tools: [
    {
      name: 'get_market_rate',
      description: 'Get current market rate recommendation for a lane using internal history, benchmarks, and DAT data',
      input_schema: {
        type: 'object',
        properties: {
          origin: { type: 'string', description: 'Origin city, state (e.g. "Dallas, TX")' },
          destination: { type: 'string', description: 'Destination city, state (e.g. "Chicago, IL")' },
          equipment_type: { type: 'string', description: 'Equipment type: dry_van, reefer, flatbed, step_deck, ltl' },
          pickup_date: { type: 'string', description: 'Pickup date (ISO format)' },
          weight_lbs: { type: 'number', description: 'Weight in pounds' },
          miles: { type: 'number', description: 'Lane distance in miles' },
          tenant_id: { type: 'string' }
        },
        required: ['origin', 'destination']
      },
      handler: getMarketRate
    },
    {
      name: 'calc_lane_rate',
      description: 'Calculate lane rate with a specific target margin percentage',
      input_schema: {
        type: 'object',
        properties: {
          origin: { type: 'string', description: 'Origin city, state' },
          destination: { type: 'string', description: 'Destination city, state' },
          equipment_type: { type: 'string' },
          target_margin_pct: { type: 'number', description: 'Target margin percentage' },
          pickup_date: { type: 'string' },
          miles: { type: 'number' },
          tenant_id: { type: 'string' }
        },
        required: ['origin', 'destination']
      },
      handler: calcLaneRate
    },
    {
      name: 'compare_spot_vs_contract',
      description: 'Compare spot market quotes vs contract/benchmark rates for a lane',
      input_schema: {
        type: 'object',
        properties: {
          origin_state: { type: 'string', description: '2-letter state code' },
          destination_state: { type: 'string', description: '2-letter state code' },
          equipment_type: { type: 'string' },
          tenant_id: { type: 'string' }
        },
        required: ['origin_state', 'destination_state']
      },
      handler: compareSpotVsContract
    },
    {
      name: 'predict_rate_trend',
      description: 'Predict rate trend direction for a lane based on last 90 days of load data',
      input_schema: {
        type: 'object',
        properties: {
          origin_state: { type: 'string', description: '2-letter state code' },
          destination_state: { type: 'string', description: '2-letter state code' },
          equipment_type: { type: 'string' },
          tenant_id: { type: 'string' }
        },
        required: ['origin_state', 'destination_state']
      },
      handler: predictRateTrend
    },
    {
      name: 'set_min_rate',
      description: 'Set a floor/minimum rate for a lane (upserts into benchmarks with type=floor)',
      input_schema: {
        type: 'object',
        properties: {
          origin_state: { type: 'string' },
          destination_state: { type: 'string' },
          equipment_type: { type: 'string' },
          min_rate: { type: 'number', description: 'Minimum acceptable total rate' },
          min_rpm: { type: 'number', description: 'Minimum rate per mile' },
          reason: { type: 'string', description: 'Reason for setting this floor' },
          tenant_id: { type: 'string' }
        },
        required: ['origin_state', 'destination_state', 'min_rate']
      },
      handler: setMinRate
    },
    {
      name: 'negotiate_rate',
      description: 'Generate a counter-offer with talking points for rate negotiation',
      input_schema: {
        type: 'object',
        properties: {
          origin: { type: 'string', description: 'Origin city, state' },
          destination: { type: 'string', description: 'Destination city, state' },
          equipment_type: { type: 'string' },
          their_rate: { type: 'number', description: 'The rate they offered/requested' },
          our_target_margin: { type: 'number', description: 'Our target margin %' },
          pickup_date: { type: 'string' },
          miles: { type: 'number' },
          tenant_id: { type: 'string' }
        },
        required: ['origin', 'destination', 'their_rate']
      },
      handler: negotiateRate
    },
    {
      name: 'calc_trip_profitability',
      description: 'Calculate total profitability across multiple loads (e.g. a round trip)',
      input_schema: {
        type: 'object',
        properties: {
          load_ids: { type: 'array', items: { type: 'integer' }, description: 'Array of load IDs' },
          tenant_id: { type: 'string' }
        },
        required: ['load_ids']
      },
      handler: calcTripProfitability
    },
    {
      name: 'get_rate_benchmarks',
      description: 'Get full lane analysis with rate benchmarks, volume, and top carriers',
      input_schema: {
        type: 'object',
        properties: {
          origin_state: { type: 'string', description: '2-letter state code' },
          destination_state: { type: 'string', description: '2-letter state code' },
          equipment_type: { type: 'string' },
          days: { type: 'integer', description: 'Lookback period in days (default 90)' },
          tenant_id: { type: 'string' }
        },
        required: ['origin_state', 'destination_state']
      },
      handler: getRateBenchmarks
    },
    {
      name: 'track_quote_outcome',
      description: 'Record a quote and its outcome (won/lost/pending) for win/loss tracking',
      input_schema: {
        type: 'object',
        properties: {
          origin_city: { type: 'string' },
          origin_state: { type: 'string' },
          destination_city: { type: 'string' },
          destination_state: { type: 'string' },
          equipment_type: { type: 'string' },
          miles: { type: 'number' },
          quoted_rate: { type: 'number', description: 'The rate we quoted' },
          quote_type: { type: 'string', description: 'spot or contract' },
          outcome: { type: 'string', description: 'won, lost, or pending' },
          customer_name: { type: 'string' },
          competitor_rate: { type: 'number', description: 'Competitor rate if known' },
          notes: { type: 'string' },
          tenant_id: { type: 'string' }
        },
        required: ['origin_city', 'origin_state', 'destination_city', 'destination_state', 'quoted_rate']
      },
      handler: trackQuoteOutcome
    },
    {
      name: 'analyze_win_loss_by_lane',
      description: 'Aggregate win/loss statistics by lane from quote history',
      input_schema: {
        type: 'object',
        properties: {
          equipment_type: { type: 'string', description: 'Filter by equipment type (optional)' },
          days: { type: 'integer', description: 'Lookback period in days (default 90)' },
          tenant_id: { type: 'string' }
        }
      },
      handler: analyzeWinLossByLane
    },
    {
      name: 'optimize_spot_pricing',
      description: 'Analyze win/loss patterns on a lane and recommend pricing adjustments',
      input_schema: {
        type: 'object',
        properties: {
          origin_state: { type: 'string' },
          destination_state: { type: 'string' },
          equipment_type: { type: 'string' },
          tenant_id: { type: 'string' }
        },
        required: ['origin_state', 'destination_state']
      },
      handler: optimizeSpotPricing
    },
    {
      name: 'get_spot_market_dashboard',
      description: 'Get a summary dashboard of spot market quoting activity and performance',
      input_schema: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: 'Lookback period in days (default 30)' },
          tenant_id: { type: 'string' }
        }
      },
      handler: getSpotMarketDashboard
    },
    {
      name: 'import_rfp',
      description: 'Import an RFP with its lanes for pricing and bid management',
      input_schema: {
        type: 'object',
        properties: {
          rfp_name: { type: 'string', description: 'Name/identifier for this RFP' },
          customer_name: { type: 'string', description: 'Customer issuing the RFP' },
          due_date: { type: 'string', description: 'Bid due date (ISO format)' },
          lanes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                origin_city: { type: 'string' },
                origin_state: { type: 'string' },
                destination_city: { type: 'string' },
                destination_state: { type: 'string' },
                equipment_type: { type: 'string' },
                volume_per_week: { type: 'integer' },
                miles: { type: 'number' },
                current_rate: { type: 'number' }
              },
              required: ['origin_city', 'origin_state', 'destination_city', 'destination_state']
            },
            description: 'Array of lanes in the RFP'
          },
          notes: { type: 'string' },
          tenant_id: { type: 'string' }
        },
        required: ['rfp_name', 'customer_name', 'lanes']
      },
      handler: importRfp
    },
    {
      name: 'auto_price_rfp',
      description: 'Automatically price all lanes in an RFP using market intelligence',
      input_schema: {
        type: 'object',
        properties: {
          rfp_id: { type: 'integer', description: 'ID of the RFP to price' },
          target_margin_pct: { type: 'number', description: 'Target margin percentage (default 15)' },
          tenant_id: { type: 'string' }
        },
        required: ['rfp_id']
      },
      handler: autoPriceRfp
    },
    {
      name: 'analyze_rfp_profitability',
      description: 'Analyze profitability of an RFP bid — flag profitable vs unprofitable lanes',
      input_schema: {
        type: 'object',
        properties: {
          rfp_id: { type: 'integer', description: 'ID of the RFP to analyze' },
          min_margin_pct: { type: 'number', description: 'Minimum margin threshold (default 8%)' },
          tenant_id: { type: 'string' }
        },
        required: ['rfp_id']
      },
      handler: analyzeRfpProfitability
    },
    {
      name: 'generate_bid_response',
      description: 'Generate a formatted bid response for an RFP',
      input_schema: {
        type: 'object',
        properties: {
          rfp_id: { type: 'integer', description: 'ID of the RFP' },
          include_unprofitable: { type: 'boolean', description: 'Include unprofitable lanes in bid (default false)' },
          company_name: { type: 'string', description: 'Your company name for the response' },
          tenant_id: { type: 'string' }
        },
        required: ['rfp_id']
      },
      handler: generateBidResponse
    },
    {
      name: 'track_rfp_awards',
      description: 'Record which RFP lanes were awarded and at what rates',
      input_schema: {
        type: 'object',
        properties: {
          rfp_id: { type: 'integer', description: 'ID of the RFP' },
          awards: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                lane_id: { type: 'integer', description: 'ID of the RFP lane' },
                awarded: { type: 'boolean', description: 'Whether this lane was awarded' },
                awarded_rate: { type: 'number', description: 'Final awarded rate' },
                notes: { type: 'string' }
              },
              required: ['lane_id', 'awarded']
            },
            description: 'Array of award decisions per lane'
          },
          tenant_id: { type: 'string' }
        },
        required: ['rfp_id', 'awards']
      },
      handler: trackRfpAwards
    }
  ]
});

registerAgent(rateEngine);

module.exports = rateEngine;
