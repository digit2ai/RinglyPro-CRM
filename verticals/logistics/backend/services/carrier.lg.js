const sequelize = require('./db.lg');

async function get_available_loads(input) {
  const [loads] = await sequelize.query(
    `SELECT l.id, l.load_ref, l.origin, l.destination, l.freight_type, l.weight_lbs, l.rate_usd, l.shipper_rate, l.pickup_date, l.delivery_date, l.equipment_type, (SELECT COUNT(*) FROM cw_carrier_offers o WHERE o.load_id = l.id) as total_offers FROM cw_loads l WHERE l.status = 'open' ORDER BY l.created_at DESC LIMIT $1`,
    { bind: [input.max_results || 50] }
  );
  return { available_loads: loads.length, loads: loads.map(l => ({ load_id: l.id, load_ref: l.load_ref, origin: l.origin, destination: l.destination, freight_type: l.freight_type, weight_lbs: l.weight_lbs, posted_rate: l.rate_usd, pickup_date: l.pickup_date, total_offers: parseInt(l.total_offers) || 0 })) };
}

async function submit_bid(input, user) {
  const { load_id, rate, notes } = input;
  if (!load_id || !rate) throw new Error('load_id and rate required');
  const [[offer]] = await sequelize.query(
    `INSERT INTO cw_carrier_offers (load_id, carrier_contact_id, offered_rate, notes, status, created_at, updated_at) VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW()) RETURNING *`,
    { bind: [load_id, input.carrier_id || user?.carrier_id || null, rate, notes || null] }
  );
  return { offer_id: offer.id, load_id: offer.load_id, offered_rate: offer.offered_rate, status: 'pending' };
}

async function get_payment_status() {
  const [invoices] = await sequelize.query(
    `SELECT i.id, i.load_id, i.amount, i.status, i.due_date, i.paid_date, l.load_ref, l.origin, l.destination FROM cw_invoices i LEFT JOIN cw_loads l ON l.id = i.load_id WHERE i.invoice_type = 'carrier_payment' ORDER BY i.created_at DESC LIMIT 50`
  );
  let pending = 0, paid = 0, overdue = 0;
  invoices.forEach(i => { const a = parseFloat(i.amount) || 0; if (i.status === 'paid') paid += a; else if (i.due_date && new Date(i.due_date) < new Date()) overdue += a; else pending += a; });
  return { summary: { pending_amount: pending.toFixed(2), paid_amount: paid.toFixed(2), overdue_amount: overdue.toFixed(2) }, payments: invoices.map(i => ({ invoice_id: i.id, load_ref: i.load_ref, lane: `${i.origin} → ${i.destination}`, amount: i.amount, status: i.status, due_date: i.due_date })) };
}

async function update_availability(input, user) {
  const cid = input.carrier_id || user?.carrier_id;
  if (!cid) throw new Error('carrier_id required');
  const [[avail]] = await sequelize.query(
    `INSERT INTO lg_carrier_availability (tenant_id, carrier_contact_id, carrier_user_id, equipment_type, available_date, available_city, available_state, max_distance_miles, min_rate_per_mile, preferred_lanes, status, created_at, updated_at) VALUES ('logistics', $1, $2, $3, $4, $5, $6, $7, $8, $9, 'available', NOW(), NOW()) RETURNING *`,
    { bind: [cid, user?.id || null, input.equipment_type || 'dry_van', input.available_date || new Date().toISOString().split('T')[0], input.available_city || null, input.available_state || null, input.max_distance_miles || null, input.min_rate_per_mile || null, input.preferred_lanes ? JSON.stringify(input.preferred_lanes) : null] }
  );
  return { availability_id: avail.id, carrier_id: cid, status: 'available' };
}

module.exports = { get_available_loads, submit_bid, get_payment_status, update_availability };
