const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const hubspot = require('../services/hubspot.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET / - list contacts (queries both cw_contacts and lg_carriers/lg_customers)
router.get('/', async (req, res) => {
  try {
    const { type, search, limit = 50 } = req.query;
    const lim = parseInt(limit) || 50;

    // CW contacts
    let cwWhere = 'WHERE 1=1';
    const cwBinds = [];
    if (type) { cwBinds.push(type); cwWhere += ` AND contact_type = $${cwBinds.length}`; }
    if (search) { cwBinds.push(`%${search}%`); cwWhere += ` AND (company_name ILIKE $${cwBinds.length} OR full_name ILIKE $${cwBinds.length} OR email ILIKE $${cwBinds.length})`; }

    const [cwRows] = await sequelize.query(
      `SELECT id, contact_type, company_name, full_name, email, phone, mc_number, dot_number,
              freight_types, lanes, hubspot_id, created_at, 'cw' as source
       FROM cw_contacts ${cwWhere} ORDER BY company_name ASC LIMIT ${lim}`,
      { bind: cwBinds }
    );

    // LG carriers (if not filtering by shipper type)
    let lgCarriers = [];
    if (!type || type === 'carrier') {
      let lgWhere = 'WHERE 1=1';
      const lgBinds = [];
      if (search) { lgBinds.push(`%${search}%`); lgWhere += ` AND (carrier_name ILIKE $${lgBinds.length} OR contact_name ILIKE $${lgBinds.length} OR email ILIKE $${lgBinds.length})`; }
      [lgCarriers] = await sequelize.query(
        `SELECT id, 'carrier' as contact_type, carrier_name as company_name, contact_name as full_name,
                email, phone, mc_number, dot_number, equipment_types as freight_types, NULL as lanes,
                NULL as hubspot_id, created_at, 'lg' as source
         FROM lg_carriers ${lgWhere} ORDER BY carrier_name ASC LIMIT ${lim}`,
        { bind: lgBinds }
      );
    }

    // LG customers (if not filtering by carrier type)
    let lgCustomers = [];
    if (!type || type === 'shipper') {
      let lgWhere = 'WHERE 1=1';
      const lgBinds = [];
      if (search) { lgBinds.push(`%${search}%`); lgWhere += ` AND (customer_name ILIKE $${lgBinds.length} OR contact_name ILIKE $${lgBinds.length} OR email ILIKE $${lgBinds.length})`; }
      [lgCustomers] = await sequelize.query(
        `SELECT id, 'shipper' as contact_type, customer_name as company_name, contact_name as full_name,
                email, phone, NULL as mc_number, NULL as dot_number, NULL as freight_types, NULL as lanes,
                NULL as hubspot_id, created_at, 'lg' as source
         FROM lg_customers ${lgWhere} ORDER BY customer_name ASC LIMIT ${lim}`,
        { bind: lgBinds }
      );
    }

    // Merge, deduplicate by company_name, sort
    const seen = new Set();
    const merged = [...cwRows, ...lgCarriers, ...lgCustomers]
      .sort((a, b) => (a.company_name || '').localeCompare(b.company_name || ''))
      .filter(r => {
        const key = (r.company_name || '').toLowerCase().trim();
        if (key && seen.has(key)) return false;
        if (key) seen.add(key);
        return true;
      })
      .slice(0, lim);

    res.json({ success: true, data: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - create contact
router.post('/', async (req, res) => {
  try {
    const { contact_type, company_name, full_name, email, phone, freight_types, lanes, volume_estimate } = req.body;
    if (!contact_type) return res.status(400).json({ error: 'contact_type required' });

    const [result] = await sequelize.query(
      `INSERT INTO cw_contacts (contact_type, company_name, full_name, email, phone, freight_types, lanes, volume_estimate, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING *`,
      { bind: [contact_type, company_name || null, full_name || null, email || null, phone || null,
               freight_types || null, lanes || null, volume_estimate || null] }
    );

    const contact = result[0];

    // Async sync to HubSpot
    hubspot.createContact({ email, full_name, company_name, phone, contact_type }).catch(e =>
      console.error('CW HubSpot contact sync error:', e.message)
    );

    // Bridge sync: create/link lg_carrier or lg_customer (non-blocking)
    try {
      const bridge = require('../services/bridge.cw');
      bridge.syncContactToLG(contact.id).catch(e =>
        console.error('[Bridge] contact sync error:', e.message)
      );
    } catch (e) { /* bridge not critical */ }

    // Fire treatment triggers (non-blocking)
    try {
      const TreatmentExecutor = require('../../../../src/services/treatmentExecutor');
      const mainDb = require('../../../../src/config/database');
      const executor = new TreatmentExecutor(mainDb);
      const triggerEvent = contact_type === 'carrier' ? 'carrier.created' : 'cw_contact.created';
      executor.trigger(0, triggerEvent, {
        phone: phone || null,
        customer_name: full_name || company_name || 'New Contact',
        contact_id: contact.id,
        contact_type,
        source: 'cw_manual'
      }).catch(e => console.error('[Treatment] CW contact trigger error:', e.message));
    } catch (e) { /* treatment system not critical */ }

    res.status(201).json({ success: true, data: contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const [[contact]] = await sequelize.query(
      `SELECT * FROM cw_contacts WHERE id = $1`, { bind: [req.params.id] }
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ success: true, data: contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id
router.put('/:id', async (req, res) => {
  try {
    const { company_name, full_name, email, phone, contact_type, freight_types, lanes, volume_estimate } = req.body;
    const [result] = await sequelize.query(
      `UPDATE cw_contacts SET
        company_name = COALESCE($1, company_name),
        full_name = COALESCE($2, full_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        contact_type = COALESCE($5, contact_type),
        freight_types = COALESCE($6, freight_types),
        lanes = COALESCE($7, lanes),
        volume_estimate = COALESCE($8, volume_estimate),
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      { bind: [company_name, full_name, email, phone, contact_type, freight_types, lanes, volume_estimate, req.params.id] }
    );
    if (!result.length) return res.status(404).json({ error: 'Contact not found' });

    // Sync to HubSpot if has hubspot_id
    const contact = result[0];
    if (contact.hubspot_id) {
      hubspot.updateContact(contact.hubspot_id, { email, firstname: full_name?.split(' ')[0], company: company_name }).catch(() => {});
    }

    res.json({ success: true, data: contact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await sequelize.query(`DELETE FROM cw_contacts WHERE id = $1`, { bind: [req.params.id] });
    res.json({ success: true, message: 'Contact deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
