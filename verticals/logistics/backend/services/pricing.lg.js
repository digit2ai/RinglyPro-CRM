// RinglyPro Logistics — Rate Intelligence & Pricing Engine
// Combines historical rates, market data, lane logic, and margin rules
// Returns recommendation + confidence band + rationale

const sequelize = require('./db.lg');

// Configurable margin rules
const MARGIN_RULES = {
  default_margin_pct: 15,
  min_margin_pct: 8,
  max_margin_pct: 35,
  hot_lane_premium: 5,     // % added for high-demand lanes
  cold_lane_discount: 3,   // % removed for low-demand lanes
  urgent_premium: 10,      // % added for urgent/same-day
  hazmat_premium: 15,      // % added for hazmat
  reefer_premium: 8,       // % added for temperature-controlled
};

async function get_rate_recommendation(input) {
  const { origin, destination, equipment_type, pickup_date, weight_lbs, miles, tenant_id } = input;
  if (!origin || !destination) throw new Error('origin and destination required');
  const tid = tenant_id || 'logistics';

  const originCity = origin.split(',')[0].trim();
  const destCity = destination.split(',')[0].trim();
  const originState = origin.includes(',') ? origin.split(',').pop().trim().substring(0, 2).toUpperCase() : '';
  const destState = destination.includes(',') ? destination.split(',').pop().trim().substring(0, 2).toUpperCase() : '';
  const equip = equipment_type || 'dry_van';

  // 1. Internal historical rates from lg_loads
  const [internalHistory] = await sequelize.query(`
    SELECT COUNT(*) as sample_size,
           AVG(buy_rate) as avg_buy, AVG(sell_rate) as avg_sell, AVG(margin_pct) as avg_margin,
           AVG(rate_per_mile) as avg_rpm, MIN(buy_rate) as min_buy, MAX(buy_rate) as max_buy,
           AVG(miles) as avg_miles,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY rate_per_mile) as rpm_p25,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY rate_per_mile) as rpm_p75
    FROM lg_loads
    WHERE tenant_id = $1
      AND LOWER(origin_city) LIKE LOWER($2) AND LOWER(destination_city) LIKE LOWER($3)
      AND equipment_type = $4
      AND status IN ('delivered','invoiced','paid')
      AND created_at > NOW() - INTERVAL '90 days'
  `, { bind: [tid, `%${originCity}%`, `%${destCity}%`, equip] });

  // 2. Also check broader state-to-state if city-level is thin
  const [stateHistory] = await sequelize.query(`
    SELECT COUNT(*) as sample_size,
           AVG(buy_rate) as avg_buy, AVG(sell_rate) as avg_sell, AVG(rate_per_mile) as avg_rpm,
           AVG(miles) as avg_miles
    FROM lg_loads
    WHERE tenant_id = $1 AND origin_state = $2 AND destination_state = $3 AND equipment_type = $4
      AND status IN ('delivered','invoiced','paid') AND created_at > NOW() - INTERVAL '90 days'
  `, { bind: [tid, originState, destState, equip] });

  // 3. Check cw_loads as fallback (legacy data)
  const [cwHistory] = await sequelize.query(`
    SELECT COUNT(*) as sample_size, AVG(shipper_rate) as avg_rate, AVG(rate_usd) as avg_buy
    FROM cw_loads
    WHERE LOWER(origin) LIKE LOWER($1) AND LOWER(destination) LIKE LOWER($2)
      AND status IN ('delivered','covered','in_transit')
  `, { bind: [`%${originCity}%`, `%${destCity}%`] });

  // 4. Check rate benchmarks
  const [benchmarks] = await sequelize.query(`
    SELECT avg_rate, rate_per_mile_avg, rate_per_mile_p25, rate_per_mile_p75, sample_size, benchmark_source, confidence
    FROM lg_rate_benchmarks
    WHERE origin_state = $1 AND destination_state = $2 AND equipment_type = $3
    ORDER BY rate_date DESC LIMIT 5
  `, { bind: [originState, destState, equip] });

  // Determine data quality and pricing method
  const internal = internalHistory[0] || {};
  const state = stateHistory[0] || {};
  const cw = cwHistory[0] || {};
  const bench = benchmarks[0] || {};
  const internalSample = parseInt(internal.sample_size) || 0;
  const stateSample = parseInt(state.sample_size) || 0;
  const cwSample = parseInt(cw.sample_size) || 0;

  let estimatedMiles = parseFloat(miles) || parseFloat(internal.avg_miles) || parseFloat(state.avg_miles) || 800;
  let baseBuyRate, baseSellRate, pricingMethod, confidence, rationale = [];

  if (internalSample >= 5) {
    // High-confidence: strong internal lane data
    baseBuyRate = parseFloat(internal.avg_buy);
    baseSellRate = parseFloat(internal.avg_sell) || baseBuyRate * (1 + MARGIN_RULES.default_margin_pct / 100);
    pricingMethod = 'ai_internal';
    confidence = 'high';
    rationale.push(`Based on ${internalSample} completed loads on this exact lane in the last 90 days`);
    rationale.push(`Historical buy rate range: $${parseFloat(internal.min_buy).toFixed(0)} - $${parseFloat(internal.max_buy).toFixed(0)}`);
  } else if (stateSample >= 3) {
    // Medium-confidence: state-level data
    baseBuyRate = parseFloat(state.avg_buy);
    baseSellRate = parseFloat(state.avg_sell) || baseBuyRate * (1 + MARGIN_RULES.default_margin_pct / 100);
    pricingMethod = 'ai_regional';
    confidence = 'medium';
    rationale.push(`Based on ${stateSample} loads in ${originState}→${destState} corridor (last 90 days)`);
    if (internalSample > 0) rationale.push(`Plus ${internalSample} exact lane matches`);
  } else if (bench.avg_rate) {
    // Benchmark-informed
    baseBuyRate = parseFloat(bench.avg_rate);
    baseSellRate = baseBuyRate * (1 + MARGIN_RULES.default_margin_pct / 100);
    pricingMethod = 'benchmark';
    confidence = bench.confidence || 'medium';
    rationale.push(`Based on ${bench.benchmark_source} benchmark data`);
  } else if (cwSample > 0) {
    // Legacy CW data
    baseBuyRate = parseFloat(cw.avg_buy) || parseFloat(cw.avg_rate) * 0.85;
    baseSellRate = parseFloat(cw.avg_rate) || baseBuyRate * (1 + MARGIN_RULES.default_margin_pct / 100);
    pricingMethod = 'legacy_data';
    confidence = cwSample >= 5 ? 'medium' : 'low';
    rationale.push(`Based on ${cwSample} legacy loads (CW system)`);
  } else {
    // Market estimate based on miles and equipment
    const rpmTable = { dry_van: 2.65, reefer: 3.10, flatbed: 3.30, step_deck: 3.45, ltl: 2.20, power_only: 2.40 };
    const baseRpm = rpmTable[equip] || 2.65;
    baseBuyRate = estimatedMiles * baseRpm;
    baseSellRate = baseBuyRate * (1 + MARGIN_RULES.default_margin_pct / 100);
    pricingMethod = 'market_estimate';
    confidence = 'low';
    rationale.push(`Market estimate at $${baseRpm.toFixed(2)}/mile for ${equip}`);
    rationale.push('No historical data available — recommend validating with DAT or carrier quotes');
  }

  // Apply premium/discount adjustments
  let adjustmentPct = 0;
  const adjustments = [];

  if (pickup_date) {
    const daysUntilPickup = Math.floor((new Date(pickup_date) - new Date()) / 86400000);
    if (daysUntilPickup <= 1) {
      adjustmentPct += MARGIN_RULES.urgent_premium;
      adjustments.push({ type: 'urgent', pct: MARGIN_RULES.urgent_premium, reason: 'Same/next-day pickup' });
    }
  }
  if (equip === 'reefer') {
    adjustmentPct += MARGIN_RULES.reefer_premium;
    adjustments.push({ type: 'reefer', pct: MARGIN_RULES.reefer_premium, reason: 'Temperature-controlled equipment' });
  }
  if (input.hazmat) {
    adjustmentPct += MARGIN_RULES.hazmat_premium;
    adjustments.push({ type: 'hazmat', pct: MARGIN_RULES.hazmat_premium, reason: 'Hazmat freight' });
  }

  // Calculate final rates
  const adjustedBuy = baseBuyRate * (1 + adjustmentPct / 100);
  const targetMarginPct = Math.max(MARGIN_RULES.min_margin_pct, Math.min(MARGIN_RULES.max_margin_pct, MARGIN_RULES.default_margin_pct + adjustmentPct));
  const suggestedSell = adjustedBuy * (1 + targetMarginPct / 100);
  const margin = suggestedSell - adjustedBuy;
  const rpm = estimatedMiles > 0 ? adjustedBuy / estimatedMiles : 0;

  // Confidence band
  const bandWidth = confidence === 'high' ? 0.08 : confidence === 'medium' ? 0.15 : 0.25;
  const buyLow = adjustedBuy * (1 - bandWidth);
  const buyHigh = adjustedBuy * (1 + bandWidth);

  return {
    recommendation: {
      suggested_buy_rate: Math.round(adjustedBuy * 100) / 100,
      suggested_sell_rate: Math.round(suggestedSell * 100) / 100,
      estimated_margin: Math.round(margin * 100) / 100,
      margin_pct: Math.round(targetMarginPct * 100) / 100,
      rate_per_mile: Math.round(rpm * 100) / 100,
    },
    confidence_band: {
      confidence,
      buy_rate_low: Math.round(buyLow * 100) / 100,
      buy_rate_high: Math.round(buyHigh * 100) / 100,
      sell_rate_low: Math.round(buyLow * (1 + targetMarginPct / 100) * 100) / 100,
      sell_rate_high: Math.round(buyHigh * (1 + targetMarginPct / 100) * 100) / 100,
    },
    lane: { origin, destination, equipment_type: equip, estimated_miles: Math.round(estimatedMiles), pickup_date },
    pricing_method: pricingMethod,
    adjustments,
    rationale,
    data_quality: {
      internal_lane_samples: internalSample,
      state_corridor_samples: stateSample,
      legacy_samples: cwSample,
      benchmark_available: !!bench.avg_rate,
    },
  };
}

async function import_rate_benchmarks(input) {
  const { benchmarks, source, tenant_id } = input;
  if (!benchmarks || !Array.isArray(benchmarks)) throw new Error('benchmarks array required');
  const tid = tenant_id || 'logistics';
  let imported = 0;

  for (const b of benchmarks) {
    await sequelize.query(`
      INSERT INTO lg_rate_benchmarks (tenant_id, origin_state, origin_city, destination_state, destination_city,
        equipment_type, avg_rate, min_rate, max_rate, rate_per_mile_avg, rate_per_mile_p25, rate_per_mile_p75,
        sample_size, benchmark_source, rate_date, confidence, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
    `, { bind: [tid, b.origin_state, b.origin_city, b.destination_state, b.destination_city,
      b.equipment_type || 'dry_van', b.avg_rate, b.min_rate, b.max_rate, b.rate_per_mile_avg,
      b.rate_per_mile_p25, b.rate_per_mile_p75, b.sample_size || 0, source || 'manual',
      b.rate_date || new Date().toISOString().split('T')[0], b.confidence || 'medium'] });
    imported++;
  }

  return { imported, total_submitted: benchmarks.length, source: source || 'manual' };
}

async function get_lane_analysis(input) {
  const { origin_state, destination_state, equipment_type, days, tenant_id } = input;
  if (!origin_state || !destination_state) throw new Error('origin_state and destination_state required');
  const tid = tenant_id || 'logistics';
  const lookback = days || 90;

  const [laneData] = await sequelize.query(`
    SELECT COUNT(*) as total_loads,
           AVG(buy_rate) as avg_buy, AVG(sell_rate) as avg_sell, AVG(margin_pct) as avg_margin,
           AVG(rate_per_mile) as avg_rpm, AVG(miles) as avg_miles,
           MIN(buy_rate) as min_buy, MAX(buy_rate) as max_buy,
           COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
           COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
    FROM lg_loads
    WHERE tenant_id = $1 AND origin_state = $2 AND destination_state = $3
      AND ($4 = 'all' OR equipment_type = $4)
      AND created_at > NOW() - ($5 || ' days')::INTERVAL
  `, { bind: [tid, origin_state, destination_state, equipment_type || 'all', lookback.toString()] });

  const [topCarriers] = await sequelize.query(`
    SELECT c.carrier_name, c.mc_number, COUNT(l.id) as loads_on_lane, AVG(l.buy_rate) as avg_rate
    FROM lg_loads l
    JOIN lg_carriers c ON c.id = l.assigned_carrier_id
    WHERE l.tenant_id = $1 AND l.origin_state = $2 AND l.destination_state = $3
      AND l.created_at > NOW() - ($4 || ' days')::INTERVAL
    GROUP BY c.id, c.carrier_name, c.mc_number
    ORDER BY loads_on_lane DESC LIMIT 10
  `, { bind: [tid, origin_state, destination_state, lookback.toString()] });

  const lane = laneData[0] || {};
  return {
    lane: `${origin_state} → ${destination_state}`,
    period_days: lookback,
    equipment_type: equipment_type || 'all',
    volume: { total_loads: parseInt(lane.total_loads) || 0, delivered: parseInt(lane.delivered) || 0, cancelled: parseInt(lane.cancelled) || 0 },
    rates: {
      avg_buy_rate: lane.avg_buy ? parseFloat(lane.avg_buy).toFixed(2) : null,
      avg_sell_rate: lane.avg_sell ? parseFloat(lane.avg_sell).toFixed(2) : null,
      avg_margin_pct: lane.avg_margin ? parseFloat(lane.avg_margin).toFixed(1) : null,
      avg_rpm: lane.avg_rpm ? parseFloat(lane.avg_rpm).toFixed(2) : null,
      rate_range: lane.min_buy ? `$${parseFloat(lane.min_buy).toFixed(0)} - $${parseFloat(lane.max_buy).toFixed(0)}` : null,
    },
    avg_miles: lane.avg_miles ? Math.round(parseFloat(lane.avg_miles)) : null,
    top_carriers: topCarriers,
  };
}

module.exports = { get_rate_recommendation, import_rate_benchmarks, get_lane_analysis };
