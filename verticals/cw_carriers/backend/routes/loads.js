const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const hubspot = require('../services/hubspot.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET / - list loads (queries both cw_loads and lg_loads)
router.get('/', async (req, res) => {
  try {
    const { status, freight_type, origin, destination, limit = 50 } = req.query;
    let cwWhere = 'WHERE 1=1';
    let lgWhere = 'WHERE 1=1';
    const cwBinds = [];
    const lgBinds = [];

    if (status) {
      cwBinds.push(status); cwWhere += ` AND l.status = $${cwBinds.length}`;
      lgBinds.push(status); lgWhere += ` AND l.status = $${lgBinds.length}`;
    }
    if (freight_type) {
      cwBinds.push(freight_type); cwWhere += ` AND l.freight_type = $${cwBinds.length}`;
      lgBinds.push(freight_type); lgWhere += ` AND l.equipment_type = $${lgBinds.length}`;
    }
    if (origin) {
      cwBinds.push(`%${origin}%`); cwWhere += ` AND l.origin ILIKE $${cwBinds.length}`;
      lgBinds.push(`%${origin}%`); lgWhere += ` AND (l.origin_city ILIKE $${lgBinds.length} OR l.origin_state ILIKE $${lgBinds.length})`;
    }
    if (destination) {
      cwBinds.push(`%${destination}%`); cwWhere += ` AND l.destination ILIKE $${cwBinds.length}`;
      lgBinds.push(`%${destination}%`); lgWhere += ` AND (l.destination_city ILIKE $${lgBinds.length} OR l.destination_state ILIKE $${lgBinds.length})`;
    }

    const lim = parseInt(limit) || 50;

    // Query both tables
    const [cwRows] = await sequelize.query(
      `SELECT l.id, l.load_ref, l.origin, l.destination, l.freight_type, l.rate_usd,
              l.shipper_rate, l.pickup_date::TEXT as pickup_date, l.status, l.equipment_type, l.commodity,
              l.created_at, l.updated_at, 'cw' as source,
              sc.company_name as shipper_name, cc.company_name as carrier_name
       FROM cw_loads l
       LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id
       LEFT JOIN cw_contacts cc ON l.carrier_id = cc.id
       ${cwWhere} ORDER BY l.created_at DESC LIMIT ${lim}`,
      { bind: cwBinds }
    );

    const [lgRows] = await sequelize.query(
      `SELECT l.id, l.load_ref,
              COALESCE(l.origin_city || ', ' || l.origin_state, l.origin_full) as origin,
              COALESCE(l.destination_city || ', ' || l.destination_state, l.destination_full) as destination,
              l.equipment_type as freight_type, l.buy_rate as rate_usd,
              l.sell_rate as shipper_rate, l.pickup_date::TEXT as pickup_date, l.status,
              l.equipment_type, l.commodity,
              l.created_at, l.updated_at, 'lg' as source,
              l.shipper_name, NULL as carrier_name
       FROM lg_loads l
       ${lgWhere} ORDER BY l.created_at DESC LIMIT ${lim}`,
      { bind: lgBinds }
    );

    // Merge and sort by created_at desc, deduplicate by load_ref
    const seen = new Set();
    const merged = [...cwRows, ...lgRows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .filter(r => { if (r.load_ref && seen.has(r.load_ref)) return false; if (r.load_ref) seen.add(r.load_ref); return true; })
      .slice(0, lim);

    res.json({ success: true, data: merged });
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

// GET /:id — search both cw_loads and lg_loads by ID or load_ref
router.get('/:id', async (req, res) => {
  try {
    const idOrRef = req.params.id;
    // Try cw_loads first
    let load;
    const [[cwById]] = await sequelize.query(
      `SELECT l.*, sc.company_name as shipper_name, cc.company_name as carrier_name, 'cw' as source
       FROM cw_loads l
       LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id
       LEFT JOIN cw_contacts cc ON l.carrier_id = cc.id
       WHERE l.id = $1`, { bind: [idOrRef] });
    if (cwById) { load = cwById; }
    else {
      // Try cw_loads by load_ref
      const [[cwByRef]] = await sequelize.query(
        `SELECT l.*, sc.company_name as shipper_name, cc.company_name as carrier_name, 'cw' as source
         FROM cw_loads l LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id LEFT JOIN cw_contacts cc ON l.carrier_id = cc.id
         WHERE l.load_ref = $1`, { bind: [String(idOrRef)] });
      if (cwByRef) { load = cwByRef; }
      else {
        // Try lg_loads by id
        const [[lgById]] = await sequelize.query(
          `SELECT l.*, l.shipper_name, NULL as carrier_name,
                  COALESCE(l.origin_city || ', ' || l.origin_state, l.origin_full) as origin,
                  COALESCE(l.destination_city || ', ' || l.destination_state, l.destination_full) as destination,
                  l.equipment_type as freight_type, l.buy_rate as rate_usd, l.sell_rate as shipper_rate, 'lg' as source
           FROM lg_loads l WHERE l.id = $1`, { bind: [idOrRef] });
        if (lgById) { load = lgById; }
        else {
          // Try lg_loads by load_ref
          const [[lgByRef]] = await sequelize.query(
            `SELECT l.*, l.shipper_name, NULL as carrier_name,
                    COALESCE(l.origin_city || ', ' || l.origin_state, l.origin_full) as origin,
                    COALESCE(l.destination_city || ', ' || l.destination_state, l.destination_full) as destination,
                    l.equipment_type as freight_type, l.buy_rate as rate_usd, l.sell_rate as shipper_rate, 'lg' as source
             FROM lg_loads l WHERE l.load_ref = $1`, { bind: [String(idOrRef)] });
          load = lgByRef;
        }
      }
    }
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
