const sequelize = require('./db.lg');

async function get_shipment_status(input) {
  const { load_id } = input;
  if (!load_id) throw new Error('load_id required');
  const [[load]] = await sequelize.query(
    `SELECT l.*, (SELECT json_agg(json_build_object('id', cc.id, 'status', cc.status, 'location', cc.location, 'eta', cc.eta, 'notes', cc.notes, 'created_at', cc.created_at) ORDER BY cc.created_at DESC) FROM cw_check_calls cc WHERE cc.load_id = l.id) as check_calls FROM cw_loads l WHERE l.id = $1`,
    { bind: [load_id] }
  );
  if (!load) throw new Error('Load not found');
  return { load_id: load.id, load_ref: load.load_ref, status: load.status, origin: load.origin, destination: load.destination, freight_type: load.freight_type, pickup_date: load.pickup_date, delivery_date: load.delivery_date, shipper_rate: load.shipper_rate, current_location: load.check_calls?.[0]?.location || 'N/A', current_eta: load.check_calls?.[0]?.eta || 'N/A', tracking_history: load.check_calls || [] };
}

async function request_quote(input, user) {
  const { origin, destination, freight_type, weight_lbs, pickup_date, equipment_type } = input;
  if (!origin || !destination) throw new Error('origin and destination required');
  const [laneHistory] = await sequelize.query(
    `SELECT AVG(shipper_rate) as avg_rate, COUNT(*) as total_loads FROM cw_loads WHERE LOWER(origin) LIKE LOWER($1) AND LOWER(destination) LIKE LOWER($2) AND status IN ('delivered','covered','in_transit')`,
    { bind: [`%${origin.split(',')[0]}%`, `%${destination.split(',')[0]}%`] }
  );
  const history = laneHistory[0] || {};
  const estimatedMiles = Math.max(200, Math.floor(Math.random() * 1800 + 300));
  const baseRate = history.avg_rate ? parseFloat(history.avg_rate) : estimatedMiles * 2.85;
  const quotedRate = Math.round(baseRate * (1 + (Math.random() * 0.1 - 0.05)) * 100) / 100;
  const ratePerMile = Math.round((quotedRate / estimatedMiles) * 100) / 100;
  const [[quote]] = await sequelize.query(
    `INSERT INTO lg_shipper_quotes (tenant_id, shipper_user_id, origin, destination, freight_type, equipment_type, weight_lbs, pickup_date, quoted_rate, rate_per_mile, estimated_miles, pricing_method, status, valid_until, created_at, updated_at) VALUES ('logistics', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'quoted', NOW() + INTERVAL '48 hours', NOW(), NOW()) RETURNING *`,
    { bind: [user?.id || null, origin, destination, freight_type || 'General', equipment_type || 'dry_van', weight_lbs || null, pickup_date || null, quotedRate, ratePerMile, estimatedMiles, parseInt(history.total_loads) > 3 ? 'ai' : 'market'] }
  );
  return { quote_id: quote.id, origin, destination, quoted_rate: quotedRate, rate_per_mile: ratePerMile, estimated_miles: estimatedMiles, pricing_method: quote.pricing_method, lane_history: { total_historical_loads: parseInt(history.total_loads) || 0, avg_historical_rate: history.avg_rate ? parseFloat(history.avg_rate).toFixed(2) : null }, valid_until: quote.valid_until, status: 'quoted' };
}

async function submit_booking(input) {
  const { quote_id } = input;
  if (!quote_id) throw new Error('quote_id required');
  const [[quote]] = await sequelize.query(`SELECT * FROM lg_shipper_quotes WHERE id = $1 AND status = 'quoted'`, { bind: [quote_id] });
  if (!quote) throw new Error('Quote not found or not in quoted status');
  if (new Date(quote.valid_until) < new Date()) throw new Error('Quote has expired');
  const loadRef = `LG-${Date.now().toString(36).toUpperCase()}`;
  const [[load]] = await sequelize.query(
    `INSERT INTO cw_loads (load_ref, origin, destination, freight_type, weight_lbs, shipper_rate, pickup_date, delivery_date, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW(), NOW()) RETURNING *`,
    { bind: [loadRef, quote.origin, quote.destination, quote.freight_type, quote.weight_lbs, quote.quoted_rate, quote.pickup_date, quote.delivery_date] }
  );
  await sequelize.query(`UPDATE lg_shipper_quotes SET status = 'booked', load_id = $1, updated_at = NOW() WHERE id = $2`, { bind: [load.id, quote_id] });
  return { booking_confirmed: true, load_id: load.id, load_ref: load.load_ref, quote_id: quote.id, rate: quote.quoted_rate, status: 'open' };
}

async function get_shipper_history(input) {
  const [loads] = await sequelize.query(`SELECT * FROM cw_loads ORDER BY created_at DESC LIMIT $1`, { bind: [input.limit || 50] });
  return { total: loads.length, loads: loads.map(l => ({ load_id: l.id, load_ref: l.load_ref, origin: l.origin, destination: l.destination, status: l.status, rate: l.shipper_rate, pickup_date: l.pickup_date })) };
}

module.exports = { get_shipment_status, request_quote, submit_booking, get_shipper_history };
