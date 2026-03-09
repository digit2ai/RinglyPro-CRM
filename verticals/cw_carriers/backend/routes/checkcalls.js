/**
 * Check Calls / Transit Tracking Routes
 * Step 4: Dispatch & Transit — call driver for ETA, log status, push updates to shipper
 */
const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const rachel = require('../services/rachel.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET / - list check calls (optionally filter by load_id)
router.get('/', async (req, res) => {
  try {
    const { load_id, call_type, limit = 50 } = req.query;
    let where = 'WHERE 1=1';
    const binds = [];

    if (load_id) { binds.push(load_id); where += ` AND cc.load_id = $${binds.length}`; }
    if (call_type) { binds.push(call_type); where += ` AND cc.call_type = $${binds.length}`; }
    binds.push(parseInt(limit));

    const [rows] = await sequelize.query(
      `SELECT cc.*, l.load_ref, l.origin, l.destination, l.status as load_status,
              c.company_name, c.full_name as contact_name, c.phone as contact_phone
       FROM cw_check_calls cc
       LEFT JOIN cw_loads l ON cc.load_id = l.id
       LEFT JOIN cw_contacts c ON cc.contact_id = c.id
       ${where} ORDER BY cc.created_at DESC LIMIT $${binds.length}`,
      { bind: binds }
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /load/:loadId - get all check calls for a specific load (timeline)
router.get('/load/:loadId', async (req, res) => {
  try {
    const [checkCalls] = await sequelize.query(
      `SELECT cc.*, c.company_name, c.full_name as contact_name
       FROM cw_check_calls cc
       LEFT JOIN cw_contacts c ON cc.contact_id = c.id
       WHERE cc.load_id = $1 ORDER BY cc.created_at ASC`,
      { bind: [req.params.loadId] }
    );

    const [[load]] = await sequelize.query(
      `SELECT l.*, sc.company_name as shipper_name, sc.phone as shipper_phone,
              cc2.company_name as carrier_name, cc2.phone as carrier_phone
       FROM cw_loads l
       LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id
       LEFT JOIN cw_contacts cc2 ON l.carrier_id = cc2.id
       WHERE l.id = $1`,
      { bind: [req.params.loadId] }
    );

    res.json({ success: true, data: { load, checkCalls } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - log a manual check call
router.post('/', async (req, res) => {
  try {
    const { load_id, contact_id, call_type, location, eta, status_reported, notes } = req.body;
    if (!load_id) return res.status(400).json({ error: 'load_id required' });

    const [[checkCall]] = await sequelize.query(
      `INSERT INTO cw_check_calls (load_id, contact_id, call_type, location, eta, status_reported, notes, called_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', NOW()) RETURNING *`,
      { bind: [load_id, contact_id || null, call_type || 'check_call', location || null, eta || null, status_reported || null, notes || null] }
    );

    // Update load delivery_date if ETA provided
    if (eta) {
      await sequelize.query(`UPDATE cw_loads SET delivery_date = $1::date, updated_at = NOW() WHERE id = $2`, { bind: [eta, load_id] });
    }

    res.status(201).json({ success: true, data: checkCall });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auto-call - Rachel auto-calls driver for check-in
router.post('/auto-call', async (req, res) => {
  try {
    const { load_id } = req.body;
    if (!load_id) return res.status(400).json({ error: 'load_id required' });

    // Get load with carrier/driver info
    const [[load]] = await sequelize.query(
      `SELECT l.*, cc.company_name as carrier_name, cc.phone as carrier_phone, cc.id as carrier_contact_id
       FROM cw_loads l
       LEFT JOIN cw_contacts cc ON l.carrier_id = cc.id
       WHERE l.id = $1`,
      { bind: [load_id] }
    );

    if (!load) return res.status(404).json({ error: 'Load not found' });
    if (!load.carrier_phone) return res.status(400).json({ error: 'No carrier phone number on file' });

    // Rachel calls the driver/dispatcher
    const script = `Hi, this is Rachel from CW Carriers. I'm checking in on load ${load.load_ref || '#' + load.id}, ${load.origin} to ${load.destination}. Can you give me a quick update on your location and estimated time of arrival?`;

    const callResult = await rachel.makeOutboundCall(load.carrier_phone, 'check_call', {
      load_ref: load.load_ref || `#${load.id}`,
      origin: load.origin,
      destination: load.destination
    });

    if (callResult.success) {
      // Log the check call
      await sequelize.query(
        `INSERT INTO cw_check_calls (load_id, contact_id, call_type, notes, called_by, call_sid, created_at)
         VALUES ($1, $2, 'check_call', 'Rachel AI check-in call initiated', 'rachel_ai', $3, NOW())`,
        { bind: [load_id, load.carrier_contact_id, callResult.callSid] }
      );

      // Log to call logs too
      await rachel.logCall({
        call_sid: callResult.callSid,
        direction: 'outbound',
        call_type: 'check_call',
        contact_id: load.carrier_contact_id,
        load_id,
        from_number: process.env.TWILIO_PHONE_NUMBER,
        to_number: load.carrier_phone,
        outcome: 'pending'
      });
    }

    res.json({ success: callResult.success, data: callResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /notify-shipper - Rachel calls shipper with status update
router.post('/notify-shipper', async (req, res) => {
  try {
    const { load_id, message } = req.body;
    if (!load_id) return res.status(400).json({ error: 'load_id required' });

    const [[load]] = await sequelize.query(
      `SELECT l.*, sc.phone as shipper_phone, sc.id as shipper_contact_id, sc.company_name as shipper_name
       FROM cw_loads l
       LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id
       WHERE l.id = $1`,
      { bind: [load_id] }
    );

    if (!load) return res.status(404).json({ error: 'Load not found' });
    if (!load.shipper_phone) return res.status(400).json({ error: 'No shipper phone on file' });

    const callResult = await rachel.makeOutboundCall(load.shipper_phone, 'status_update', {
      load_ref: load.load_ref || `#${load.id}`,
      status: load.status,
      delivery_date: load.delivery_date || 'TBD'
    });

    if (callResult.success) {
      await sequelize.query(
        `INSERT INTO cw_check_calls (load_id, contact_id, call_type, notes, called_by, call_sid, created_at)
         VALUES ($1, $2, 'eta_update', $3, 'rachel_ai', $4, NOW())`,
        { bind: [load_id, load.shipper_contact_id, message || 'Status update call to shipper', callResult.callSid] }
      );
    }

    res.json({ success: callResult.success, data: callResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /due - loads that need check calls (in_transit with no recent check call)
router.get('/due', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT l.*, cc.company_name as carrier_name, cc.phone as carrier_phone,
              sc.company_name as shipper_name,
              (SELECT MAX(created_at) FROM cw_check_calls WHERE load_id = l.id) as last_check_call
       FROM cw_loads l
       LEFT JOIN cw_contacts cc ON l.carrier_id = cc.id
       LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id
       WHERE l.status IN ('covered', 'in_transit')
       ORDER BY (SELECT MAX(created_at) FROM cw_check_calls WHERE load_id = l.id) ASC NULLS FIRST, l.pickup_date ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
