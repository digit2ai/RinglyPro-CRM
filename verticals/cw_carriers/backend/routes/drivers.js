const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');

// GET / — List drivers
router.get('/', async (req, res) => {
  try {
    const { tenant_id = 'logistics', status, carrier_id, limit = 50, offset = 0 } = req.query;
    const binds = [tenant_id];
    let where = 'WHERE tenant_id = $1';

    if (status) {
      binds.push(status);
      where += ` AND status = $${binds.length}`;
    }
    if (carrier_id) {
      binds.push(carrier_id);
      where += ` AND carrier_id = $${binds.length}`;
    }

    const lim = parseInt(limit) || 50;
    const off = parseInt(offset) || 0;
    binds.push(lim, off);

    const [rows] = await sequelize.query(
      `SELECT * FROM lg_drivers ${where} ORDER BY updated_at DESC LIMIT $${binds.length - 1} OFFSET $${binds.length}`,
      { bind: binds }
    );

    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — Add driver
router.post('/', async (req, res) => {
  try {
    const {
      driver_name, phone, email, cdl_number, cdl_state, cdl_expiry,
      carrier_id, truck_id, home_city, home_state, tenant_id = 'logistics'
    } = req.body;

    const [rows] = await sequelize.query(
      `INSERT INTO lg_drivers (driver_name, phone, email, cdl_number, cdl_state, cdl_expiry,
         carrier_id, truck_id, home_city, home_state, tenant_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'available', NOW(), NOW())
       RETURNING *`,
      { bind: [driver_name, phone || null, email || null, cdl_number || null, cdl_state || null, cdl_expiry || null,
               carrier_id || null, truck_id || null, home_city || null, home_state || null, tenant_id] }
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — Driver details + recent dispatches
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [drivers] = await sequelize.query(
      'SELECT * FROM lg_drivers WHERE id = $1',
      { bind: [id] }
    );

    if (!drivers.length) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const [dispatches] = await sequelize.query(
      `SELECT d.*, l.load_ref, l.origin_city, l.destination_city
       FROM lg_dispatches d
       LEFT JOIN lg_loads l ON d.load_id = l.id
       WHERE d.driver_id = $1
       ORDER BY d.created_at DESC LIMIT 5`,
      { bind: [id] }
    );

    res.json({
      success: true,
      data: {
        ...drivers[0],
        recent_dispatches: dispatches
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id/hos — Update HOS
router.patch('/:id/hos', async (req, res) => {
  try {
    const { id } = req.params;
    const { hos_drive_remaining, hos_duty_remaining, hos_cycle_remaining } = req.body;

    const [rows] = await sequelize.query(
      `UPDATE lg_drivers
       SET hos_drive_remaining = $1, hos_duty_remaining = $2, hos_cycle_remaining = $3,
           hos_last_update = NOW(), updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      { bind: [hos_drive_remaining, hos_duty_remaining, hos_cycle_remaining, id] }
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id/position — Update driver position
router.patch('/:id/position', async (req, res) => {
  try {
    const { id } = req.params;
    const { lat, lng, city, state } = req.body;

    const [rows] = await sequelize.query(
      `UPDATE lg_drivers
       SET current_lat = $1, current_lng = $2, current_city = $3, current_state = $4,
           last_position_update = NOW(), updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      { bind: [lat, lng, city || null, state || null, id] }
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — Update driver fields
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      'driver_name', 'phone', 'email', 'cdl_number', 'cdl_state', 'cdl_expiry',
      'carrier_id', 'truck_id', 'home_city', 'home_state', 'status', 'tenant_id'
    ];
    const updates = [];
    const binds = [];

    for (const [key, value] of Object.entries(req.body)) {
      if (allowed.includes(key)) {
        binds.push(value);
        updates.push(`${key} = $${binds.length}`);
      }
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    binds.push(id);
    updates.push('updated_at = NOW()');

    const [rows] = await sequelize.query(
      `UPDATE lg_drivers SET ${updates.join(', ')} WHERE id = $${binds.length} RETURNING *`,
      { bind: binds }
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
