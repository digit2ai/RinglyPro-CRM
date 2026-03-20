const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');

// GET / — List trucks
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
      `SELECT * FROM lg_trucks ${where} ORDER BY updated_at DESC LIMIT $${binds.length - 1} OFFSET $${binds.length}`,
      { bind: binds }
    );

    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — Register truck
router.post('/', async (req, res) => {
  try {
    const { truck_number, carrier_id, vin, make, model, year, equipment_type, tenant_id = 'logistics' } = req.body;

    const [rows] = await sequelize.query(
      `INSERT INTO lg_trucks (truck_number, carrier_id, vin, make, model, year, equipment_type, tenant_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'available', NOW(), NOW())
       RETURNING *`,
      { bind: [truck_number, carrier_id, vin || null, make || null, model || null, year || null, equipment_type || null, tenant_id] }
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — Truck details + maintenance + last position
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [trucks] = await sequelize.query(
      'SELECT * FROM lg_trucks WHERE id = $1',
      { bind: [id] }
    );

    if (!trucks.length) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    const [maintenance] = await sequelize.query(
      'SELECT * FROM lg_maintenance WHERE truck_id = $1 ORDER BY created_at DESC LIMIT 5',
      { bind: [id] }
    );

    const [tracking] = await sequelize.query(
      'SELECT * FROM lg_tracking_events WHERE truck_id = $1 ORDER BY created_at DESC LIMIT 1',
      { bind: [id] }
    );

    res.json({
      success: true,
      data: {
        ...trucks[0],
        recent_maintenance: maintenance,
        last_position: tracking[0] || null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id/position — Update GPS position
router.patch('/:id/position', async (req, res) => {
  try {
    const { id } = req.params;
    const { lat, lng, city, state } = req.body;

    const [rows] = await sequelize.query(
      `UPDATE lg_trucks
       SET current_lat = $1, current_lng = $2, current_city = $3, current_state = $4,
           last_position_update = NOW(), updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      { bind: [lat, lng, city || null, state || null, id] }
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — Update truck fields
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['truck_number', 'carrier_id', 'vin', 'make', 'model', 'year', 'equipment_type', 'status', 'tenant_id'];
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
      `UPDATE lg_trucks SET ${updates.join(', ')} WHERE id = $${binds.length} RETURNING *`,
      { bind: binds }
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
