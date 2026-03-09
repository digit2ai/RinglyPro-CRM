const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.lg');
const sequelize = require('../services/db.lg');

router.get('/loads', auth.carrier, async (req, res) => {
  try {
    const [loads] = await sequelize.query(`SELECT l.id, l.load_ref, l.origin, l.destination, l.freight_type, l.weight_lbs, l.rate_usd, l.pickup_date, l.delivery_date, l.equipment_type, (SELECT COUNT(*) FROM cw_carrier_offers o WHERE o.load_id = l.id) as total_bids FROM cw_loads l WHERE l.status = 'open' ORDER BY l.created_at DESC LIMIT 100`);
    res.json({ success: true, data: loads });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/my-loads', auth.carrier, async (req, res) => {
  try {
    const [loads] = await sequelize.query(`SELECT l.*, o.offered_rate, o.status as offer_status FROM cw_loads l INNER JOIN cw_carrier_offers o ON o.load_id = l.id AND o.status = 'accepted' ORDER BY l.created_at DESC LIMIT 100`);
    res.json({ success: true, data: loads });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bids', auth.carrier, async (req, res) => {
  try {
    const { load_id, rate, notes } = req.body;
    if (!load_id || !rate) return res.status(400).json({ error: 'load_id and rate required' });
    const [[offer]] = await sequelize.query(`INSERT INTO cw_carrier_offers (load_id, carrier_contact_id, offered_rate, notes, status, created_at, updated_at) VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW()) RETURNING *`, { bind: [load_id, req.user?.carrier_id || null, rate, notes || null] });
    res.status(201).json({ success: true, data: offer });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/bids', auth.carrier, async (req, res) => {
  try {
    const [bids] = await sequelize.query(`SELECT o.*, l.load_ref, l.origin, l.destination, l.freight_type FROM cw_carrier_offers o LEFT JOIN cw_loads l ON l.id = o.load_id ORDER BY o.created_at DESC LIMIT 100`);
    res.json({ success: true, data: bids });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/payments', auth.carrier, async (req, res) => {
  try {
    const [invoices] = await sequelize.query(`SELECT i.*, l.load_ref, l.origin, l.destination FROM cw_invoices i LEFT JOIN cw_loads l ON l.id = i.load_id WHERE i.invoice_type = 'carrier_payment' ORDER BY i.created_at DESC LIMIT 100`);
    res.json({ success: true, data: invoices });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/availability', auth.carrier, async (req, res) => {
  try {
    const { equipment_type, available_date, available_city, available_state, max_distance_miles, min_rate_per_mile } = req.body;
    const [[avail]] = await sequelize.query(`INSERT INTO lg_carrier_availability (tenant_id, carrier_contact_id, carrier_user_id, equipment_type, available_date, available_city, available_state, max_distance_miles, min_rate_per_mile, status, created_at, updated_at) VALUES ('logistics', $1, $2, $3, $4, $5, $6, $7, $8, 'available', NOW(), NOW()) RETURNING *`, { bind: [req.user?.carrier_id || null, req.user?.id || null, equipment_type || 'dry_van', available_date || new Date().toISOString().split('T')[0], available_city || null, available_state || null, max_distance_miles || null, min_rate_per_mile || null] });
    res.status(201).json({ success: true, data: avail });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
