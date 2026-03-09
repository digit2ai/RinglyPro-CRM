const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const rachel = require('../services/rachel.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET / - call log history
router.get('/', async (req, res) => {
  try {
    const { direction, call_type, outcome, limit = 50 } = req.query;
    let where = 'WHERE 1=1';
    const binds = [];

    if (direction) { binds.push(direction); where += ` AND cl.direction = $${binds.length}`; }
    if (call_type) { binds.push(call_type); where += ` AND cl.call_type = $${binds.length}`; }
    if (outcome) { binds.push(outcome); where += ` AND cl.outcome = $${binds.length}`; }
    binds.push(parseInt(limit));

    const [rows] = await sequelize.query(
      `SELECT cl.*, c.company_name, c.full_name as contact_name, l.load_ref
       FROM cw_call_logs cl
       LEFT JOIN cw_contacts c ON cl.contact_id = c.id
       LEFT JOIN cw_loads l ON cl.load_id = l.id
       ${where} ORDER BY cl.created_at DESC LIMIT $${binds.length}`,
      { bind: binds }
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /outbound - trigger Rachel outbound call
router.post('/outbound', async (req, res) => {
  try {
    const { contact_id, call_type, script_data } = req.body;
    if (!contact_id) return res.status(400).json({ error: 'contact_id required' });

    const [[contact]] = await sequelize.query(
      `SELECT * FROM cw_contacts WHERE id = $1`, { bind: [contact_id] }
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (!contact.phone) return res.status(400).json({ error: 'Contact has no phone number' });

    const result = await rachel.makeOutboundCall(contact.phone, call_type || 'lead_qualification', script_data || {});

    if (result.success) {
      await rachel.logCall({
        call_sid: result.callSid,
        direction: 'outbound',
        call_type: call_type || 'lead_qualification',
        contact_id,
        from_number: process.env.TWILIO_PHONE_NUMBER,
        to_number: contact.phone,
        outcome: 'pending',
        hubspot_contact_id: contact.hubspot_id
      });
    }

    res.json({ success: result.success, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /carrier-coverage - launch carrier coverage campaign
router.post('/carrier-coverage', async (req, res) => {
  try {
    const { load_id, carrier_ids } = req.body;
    if (!load_id) return res.status(400).json({ error: 'load_id required' });

    let ids = carrier_ids;
    if (!ids || !ids.length) {
      // Auto-find carriers
      const [carriers] = await sequelize.query(
        `SELECT id FROM cw_contacts WHERE contact_type = 'carrier' AND phone IS NOT NULL LIMIT 10`
      );
      ids = carriers.map(c => c.id);
    }

    if (!ids.length) return res.status(400).json({ error: 'No carriers available' });

    // Run asynchronously
    rachel.runCarrierCoverage(load_id, ids).catch(e =>
      console.error('CW carrier coverage error:', e.message)
    );

    res.json({ success: true, message: `Carrier coverage campaign launched for load #${load_id} with ${ids.length} carriers` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /status-update - trigger proactive status call
router.post('/status-update', async (req, res) => {
  try {
    const { contact_id, load_id } = req.body;
    if (!contact_id || !load_id) return res.status(400).json({ error: 'contact_id and load_id required' });

    const [[contact]] = await sequelize.query(`SELECT * FROM cw_contacts WHERE id = $1`, { bind: [contact_id] });
    const [[load]] = await sequelize.query(`SELECT * FROM cw_loads WHERE id = $1`, { bind: [load_id] });

    if (!contact || !load) return res.status(404).json({ error: 'Contact or load not found' });
    if (!contact.phone) return res.status(400).json({ error: 'Contact has no phone number' });

    const result = await rachel.makeOutboundCall(contact.phone, 'status_update', {
      load_ref: load.load_ref,
      status: load.status,
      delivery_date: load.delivery_date
    });

    res.json({ success: result.success, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats - call volume and outcome breakdown
router.get('/stats', async (req, res) => {
  try {
    const [[total]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_call_logs`);
    const [[today]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_call_logs WHERE created_at::date = CURRENT_DATE`);
    const [outcomes] = await sequelize.query(`SELECT outcome, COUNT(*) as count FROM cw_call_logs GROUP BY outcome`);
    const [byType] = await sequelize.query(`SELECT call_type, COUNT(*) as count FROM cw_call_logs GROUP BY call_type`);

    res.json({
      success: true,
      data: {
        total: parseInt(total.count),
        today: parseInt(today.count),
        outcomes,
        byType
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
