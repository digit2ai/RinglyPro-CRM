/**
 * Carrier Offers / Bids Routes
 * Step 3: Sourcing & Booking — carriers call in, reference load #, make rate offers
 * Broker logs: name, MC number, phone, $$ offer
 */
const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET / - list all offers (optionally filter by load_id or status)
router.get('/', async (req, res) => {
  try {
    const { load_id, status, limit = 50 } = req.query;
    let where = 'WHERE 1=1';
    const binds = [];

    if (load_id) { binds.push(load_id); where += ` AND o.load_id = $${binds.length}`; }
    if (status) { binds.push(status); where += ` AND o.status = $${binds.length}`; }
    binds.push(parseInt(limit));

    const [rows] = await sequelize.query(
      `SELECT o.*, l.load_ref, l.origin, l.destination, l.rate_usd as target_rate, l.shipper_rate,
              c.company_name as carrier_company
       FROM cw_carrier_offers o
       LEFT JOIN cw_loads l ON o.load_id = l.id
       LEFT JOIN cw_contacts c ON o.carrier_id = c.id
       ${where} ORDER BY o.created_at DESC LIMIT $${binds.length}`,
      { bind: binds }
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /load/:loadId - get all offers for a specific load
router.get('/load/:loadId', async (req, res) => {
  try {
    const [offers] = await sequelize.query(
      `SELECT o.*, c.company_name as carrier_company, c.safety_rating, c.insurance_expiry
       FROM cw_carrier_offers o
       LEFT JOIN cw_contacts c ON o.carrier_id = c.id
       WHERE o.load_id = $1 ORDER BY o.rate_offered ASC`,
      { bind: [req.params.loadId] }
    );

    // Get load details too
    const [[load]] = await sequelize.query(
      `SELECT l.*, sc.company_name as shipper_name FROM cw_loads l
       LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id WHERE l.id = $1`,
      { bind: [req.params.loadId] }
    );

    res.json({ success: true, data: { load, offers } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - log a new carrier offer (carrier calls in with load # and rate)
router.post('/', async (req, res) => {
  try {
    const { load_id, carrier_name, mc_number, phone, rate_offered, notes, carrier_id } = req.body;
    if (!load_id) return res.status(400).json({ error: 'load_id required' });
    if (!rate_offered) return res.status(400).json({ error: 'rate_offered required' });

    // Verify load exists
    const [[load]] = await sequelize.query(`SELECT id, status FROM cw_loads WHERE id = $1`, { bind: [load_id] });
    if (!load) return res.status(404).json({ error: 'Load not found' });

    // Try to find existing carrier by MC number or phone
    let resolvedCarrierId = carrier_id || null;
    if (!resolvedCarrierId && mc_number) {
      const [[existing]] = await sequelize.query(
        `SELECT id FROM cw_contacts WHERE mc_number = $1 AND contact_type = 'carrier' LIMIT 1`,
        { bind: [mc_number] }
      );
      resolvedCarrierId = existing?.id || null;
    }
    if (!resolvedCarrierId && phone) {
      const [[existing]] = await sequelize.query(
        `SELECT id FROM cw_contacts WHERE phone = $1 AND contact_type = 'carrier' LIMIT 1`,
        { bind: [phone] }
      );
      resolvedCarrierId = existing?.id || null;
    }

    // Auto-create carrier contact if not found
    if (!resolvedCarrierId && (carrier_name || mc_number)) {
      const [[newContact]] = await sequelize.query(
        `INSERT INTO cw_contacts (contact_type, company_name, mc_number, phone, created_at, updated_at)
         VALUES ('carrier', $1, $2, $3, NOW(), NOW()) RETURNING id`,
        { bind: [carrier_name || `Carrier MC#${mc_number}`, mc_number || null, phone || null] }
      );
      resolvedCarrierId = newContact.id;
    }

    const [[offer]] = await sequelize.query(
      `INSERT INTO cw_carrier_offers (load_id, carrier_id, carrier_name, mc_number, phone, rate_offered, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
      { bind: [load_id, resolvedCarrierId, carrier_name || null, mc_number || null, phone || null, rate_offered, notes || null] }
    );

    res.status(201).json({ success: true, data: offer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/accept - accept an offer (books the carrier on the load)
router.put('/:id/accept', async (req, res) => {
  try {
    const [[offer]] = await sequelize.query(`SELECT * FROM cw_carrier_offers WHERE id = $1`, { bind: [req.params.id] });
    if (!offer) return res.status(404).json({ error: 'Offer not found' });

    // Update offer status
    await sequelize.query(
      `UPDATE cw_carrier_offers SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
      { bind: [offer.id] }
    );

    // Decline all other pending offers for this load
    await sequelize.query(
      `UPDATE cw_carrier_offers SET status = 'declined', responded_at = NOW() WHERE load_id = $1 AND id != $2 AND status = 'pending'`,
      { bind: [offer.load_id, offer.id] }
    );

    // Update load: assign carrier and set status to covered
    await sequelize.query(
      `UPDATE cw_loads SET carrier_id = $1, rate_usd = $2, status = 'covered', updated_at = NOW() WHERE id = $3`,
      { bind: [offer.carrier_id, offer.rate_offered, offer.load_id] }
    );

    res.json({ success: true, message: `Offer accepted. Carrier booked on load.`, data: offer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/decline - decline an offer
router.put('/:id/decline', async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE cw_carrier_offers SET status = 'declined', responded_at = NOW() WHERE id = $1`,
      { bind: [req.params.id] }
    );
    res.json({ success: true, message: 'Offer declined' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/counter - counter-offer
router.put('/:id/counter', async (req, res) => {
  try {
    const { counter_rate, notes } = req.body;
    await sequelize.query(
      `UPDATE cw_carrier_offers SET status = 'counter', notes = COALESCE(notes, '') || $1, responded_at = NOW() WHERE id = $2`,
      { bind: [`\nCounter: $${counter_rate}${notes ? ' - ' + notes : ''}`, req.params.id] }
    );
    res.json({ success: true, message: `Counter-offer at $${counter_rate}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats - offer statistics
router.get('/stats', async (req, res) => {
  try {
    const [[total]] = await sequelize.query(`SELECT COUNT(*) as count FROM cw_carrier_offers`);
    const [byStatus] = await sequelize.query(`SELECT status, COUNT(*) as count FROM cw_carrier_offers GROUP BY status`);
    const [[avgRate]] = await sequelize.query(`SELECT AVG(rate_offered) as avg_rate FROM cw_carrier_offers WHERE status = 'accepted'`);
    res.json({ success: true, data: { total: parseInt(total.count), byStatus, avg_accepted_rate: parseFloat(avgRate?.avg_rate || 0) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
