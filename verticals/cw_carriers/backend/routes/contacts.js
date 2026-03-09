const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const hubspot = require('../services/hubspot.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET / - list contacts
router.get('/', async (req, res) => {
  try {
    const { type, search, limit = 50 } = req.query;
    let where = 'WHERE 1=1';
    const binds = [];

    if (type) {
      binds.push(type);
      where += ` AND contact_type = $${binds.length}`;
    }
    if (search) {
      binds.push(`%${search}%`);
      where += ` AND (company_name ILIKE $${binds.length} OR full_name ILIKE $${binds.length} OR email ILIKE $${binds.length})`;
    }
    binds.push(parseInt(limit));

    const [rows] = await sequelize.query(
      `SELECT * FROM cw_contacts ${where} ORDER BY company_name ASC LIMIT $${binds.length}`,
      { bind: binds }
    );
    res.json({ success: true, data: rows });
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
