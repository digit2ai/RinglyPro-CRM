const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const hubspot = require('../services/hubspot.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET / - list loads
router.get('/', async (req, res) => {
  try {
    const { status, freight_type, origin, destination, limit = 50 } = req.query;
    let where = 'WHERE 1=1';
    const binds = [];

    if (status) { binds.push(status); where += ` AND l.status = $${binds.length}`; }
    if (freight_type) { binds.push(freight_type); where += ` AND l.freight_type = $${binds.length}`; }
    if (origin) { binds.push(`%${origin}%`); where += ` AND l.origin ILIKE $${binds.length}`; }
    if (destination) { binds.push(`%${destination}%`); where += ` AND l.destination ILIKE $${binds.length}`; }
    binds.push(parseInt(limit));

    const [rows] = await sequelize.query(
      `SELECT l.*, sc.company_name as shipper_name, cc.company_name as carrier_name
       FROM cw_loads l
       LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id
       LEFT JOIN cw_contacts cc ON l.carrier_id = cc.id
       ${where} ORDER BY l.created_at DESC LIMIT $${binds.length}`,
      { bind: binds }
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - create load
router.post('/', async (req, res) => {
  try {
    const { load_ref, origin, destination, freight_type, weight_lbs, pickup_date, delivery_date, rate_usd, shipper_id, broker_notes } = req.body;

    const [result] = await sequelize.query(
      `INSERT INTO cw_loads (load_ref, origin, destination, freight_type, weight_lbs, pickup_date, delivery_date, rate_usd, status, shipper_id, broker_notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, NOW(), NOW()) RETURNING *`,
      { bind: [load_ref || `CW-${Date.now()}`, origin, destination, freight_type, weight_lbs || null,
               pickup_date || null, delivery_date || null, rate_usd || null, shipper_id || null, broker_notes || null] }
    );

    const load = result[0];

    // Async create HubSpot deal
    hubspot.createDeal({ load_ref: load.load_ref, origin, destination, freight_type, weight_lbs, rate_usd, delivery_date, status: 'open' }).catch(e =>
      console.error('CW HubSpot deal sync error:', e.message)
    );

    res.status(201).json({ success: true, data: load });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const [[load]] = await sequelize.query(
      `SELECT l.*, sc.company_name as shipper_name, cc.company_name as carrier_name
       FROM cw_loads l
       LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id
       LEFT JOIN cw_contacts cc ON l.carrier_id = cc.id
       WHERE l.id = $1`,
      { bind: [req.params.id] }
    );
    if (!load) return res.status(404).json({ error: 'Load not found' });

    // Get call history for this load
    const [calls] = await sequelize.query(
      `SELECT cl.*, c.company_name, c.full_name as contact_name
       FROM cw_call_logs cl LEFT JOIN cw_contacts c ON cl.contact_id = c.id
       WHERE cl.load_id = $1 ORDER BY cl.created_at DESC`,
      { bind: [req.params.id] }
    );

    res.json({ success: true, data: { ...load, calls } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/status
router.put('/:id/status', async (req, res) => {
  try {
    const { status, carrier_id } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });

    let sql = `UPDATE cw_loads SET status = $1, updated_at = NOW()`;
    const binds = [status];
    if (carrier_id) {
      binds.push(carrier_id);
      sql += `, carrier_id = $${binds.length}`;
    }
    binds.push(req.params.id);
    sql += ` WHERE id = $${binds.length} RETURNING *`;

    const [result] = await sequelize.query(sql, { bind: binds });
    if (!result.length) return res.status(404).json({ error: 'Load not found' });

    const load = result[0];

    // Sync status to HubSpot deal
    if (load.hubspot_deal_id) {
      const stageMap = { open: 'appointmentscheduled', covered: 'qualifiedtobuy', in_transit: 'presentationscheduled', delivered: 'closedwon', cancelled: 'closedlost' };
      hubspot.updateDeal(load.hubspot_deal_id, { dealstage: stageMap[status] || status }).catch(() => {});
    }

    res.json({ success: true, data: load });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
