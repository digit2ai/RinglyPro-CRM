const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');

// GET / — List dispatches with load and driver info
router.get('/', async (req, res) => {
  try {
    const { tenant_id = 'logistics', status, driver_id, load_id, limit = 50, offset = 0 } = req.query;
    const binds = [tenant_id];
    let where = 'WHERE d.tenant_id = $1';

    if (status) {
      binds.push(status);
      where += ` AND d.status = $${binds.length}`;
    }
    if (driver_id) {
      binds.push(driver_id);
      where += ` AND d.driver_id = $${binds.length}`;
    }
    if (load_id) {
      binds.push(load_id);
      where += ` AND d.load_id = $${binds.length}`;
    }

    const lim = parseInt(limit) || 50;
    const off = parseInt(offset) || 0;
    binds.push(lim, off);

    const [rows] = await sequelize.query(
      `SELECT d.*, l.load_ref, l.origin_city, l.destination_city, dr.driver_name
       FROM lg_dispatches d
       LEFT JOIN lg_loads l ON d.load_id = l.id
       LEFT JOIN lg_drivers dr ON d.driver_id = dr.id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT $${binds.length - 1} OFFSET $${binds.length}`,
      { bind: binds }
    );

    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — Create dispatch (+ update load, driver, truck statuses)
router.post('/', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { load_id, driver_id, truck_id, pickup_eta, delivery_eta, tenant_id = 'logistics' } = req.body;

    // Create the dispatch
    const [dispatches] = await sequelize.query(
      `INSERT INTO lg_dispatches (load_id, driver_id, truck_id, pickup_eta, delivery_eta, tenant_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'assigned', NOW(), NOW())
       RETURNING *`,
      { bind: [load_id, driver_id, truck_id || null, pickup_eta || null, delivery_eta || null, tenant_id], transaction: t }
    );

    // Get driver name for load assignment
    const [drivers] = await sequelize.query(
      'SELECT driver_name FROM lg_drivers WHERE id = $1',
      { bind: [driver_id], transaction: t }
    );
    const driverName = drivers.length ? drivers[0].driver_name : null;

    // Update load status
    await sequelize.query(
      `UPDATE lg_loads SET status = 'dispatched', assigned_driver = $1, updated_at = NOW() WHERE id = $2`,
      { bind: [driverName, load_id], transaction: t }
    );

    // Update driver status
    await sequelize.query(
      `UPDATE lg_drivers SET status = 'assigned', updated_at = NOW() WHERE id = $1`,
      { bind: [driver_id], transaction: t }
    );

    // Update truck status if provided
    if (truck_id) {
      await sequelize.query(
        `UPDATE lg_trucks SET status = 'assigned', updated_at = NOW() WHERE id = $1`,
        { bind: [truck_id], transaction: t }
      );
    }

    await t.commit();
    res.status(201).json({ success: true, data: dispatches[0] });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — Dispatch details with load, driver, truck
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await sequelize.query(
      `SELECT d.*,
              l.load_ref, l.origin_city, l.origin_state, l.destination_city, l.destination_state,
              l.equipment_type, l.weight, l.rate_usd, l.pickup_date::TEXT as pickup_date, l.delivery_date::TEXT as delivery_date,
              dr.driver_name, dr.phone as driver_phone, dr.cdl_number, dr.hos_drive_remaining, dr.hos_duty_remaining,
              t.truck_number, t.make as truck_make, t.model as truck_model, t.equipment_type as truck_equipment_type
       FROM lg_dispatches d
       LEFT JOIN lg_loads l ON d.load_id = l.id
       LEFT JOIN lg_drivers dr ON d.driver_id = dr.id
       LEFT JOIN lg_trucks t ON d.truck_id = t.id
       WHERE d.id = $1`,
      { bind: [id] }
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id/status — Update dispatch status (with cascading updates on delivery)
router.patch('/:id/status', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    // Build update query
    const binds = [status];
    let setClauses = 'status = $1, updated_at = NOW()';
    if (notes) {
      binds.push(notes);
      setClauses += `, notes = $${binds.length}`;
    }
    binds.push(id);

    const [rows] = await sequelize.query(
      `UPDATE lg_dispatches SET ${setClauses} WHERE id = $${binds.length} RETURNING *`,
      { bind: binds, transaction: t }
    );

    if (!rows.length) {
      await t.rollback();
      return res.status(404).json({ error: 'Dispatch not found' });
    }

    const dispatch = rows[0];

    // Cascade status changes on delivery
    if (status === 'delivered') {
      if (dispatch.load_id) {
        await sequelize.query(
          `UPDATE lg_loads SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
          { bind: [dispatch.load_id], transaction: t }
        );
      }
      if (dispatch.driver_id) {
        await sequelize.query(
          `UPDATE lg_drivers SET status = 'available', updated_at = NOW() WHERE id = $1`,
          { bind: [dispatch.driver_id], transaction: t }
        );
      }
      if (dispatch.truck_id) {
        await sequelize.query(
          `UPDATE lg_trucks SET status = 'available', updated_at = NOW() WHERE id = $1`,
          { bind: [dispatch.truck_id], transaction: t }
        );
      }
    }

    await t.commit();
    res.json({ success: true, data: dispatch });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
