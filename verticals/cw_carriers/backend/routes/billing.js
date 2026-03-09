/**
 * Billing & Invoicing Routes
 * Step 6: Dual-sided billing — invoice shipper for the load, pay carrier for the haul
 */
const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET / - list invoices (filter by type, status)
router.get('/', async (req, res) => {
  try {
    const { invoice_type, status, load_id, limit = 50 } = req.query;
    let where = 'WHERE 1=1';
    const binds = [];

    if (invoice_type) { binds.push(invoice_type); where += ` AND i.invoice_type = $${binds.length}`; }
    if (status) { binds.push(status); where += ` AND i.status = $${binds.length}`; }
    if (load_id) { binds.push(load_id); where += ` AND i.load_id = $${binds.length}`; }
    binds.push(parseInt(limit));

    const [rows] = await sequelize.query(
      `SELECT i.*, l.load_ref, l.origin, l.destination,
              c.company_name as contact_company, c.full_name as contact_name
       FROM cw_invoices i
       LEFT JOIN cw_loads l ON i.load_id = l.id
       LEFT JOIN cw_contacts c ON i.contact_id = c.id
       ${where} ORDER BY i.created_at DESC LIMIT $${binds.length}`,
      { bind: binds }
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - create invoice
router.post('/', async (req, res) => {
  try {
    const { load_id, invoice_type, amount, contact_id, due_date, notes, pod_received } = req.body;
    if (!invoice_type || !amount) return res.status(400).json({ error: 'invoice_type and amount required' });

    // Auto-generate invoice number
    const prefix = invoice_type === 'shipper' ? 'INV' : 'PAY';
    const invoiceNumber = `${prefix}-${Date.now().toString(36).toUpperCase()}`;

    const [[invoice]] = await sequelize.query(
      `INSERT INTO cw_invoices (load_id, invoice_type, invoice_number, contact_id, amount, status, due_date, pod_received, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, NOW(), NOW()) RETURNING *`,
      { bind: [load_id || null, invoice_type, invoiceNumber, contact_id || null, amount, due_date || null, pod_received || false, notes || null] }
    );

    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auto-generate/:loadId - auto-create both shipper invoice + carrier payment for a delivered load
router.post('/auto-generate/:loadId', async (req, res) => {
  try {
    const loadId = req.params.loadId;
    const [[load]] = await sequelize.query(
      `SELECT l.*, l.shipper_rate, l.rate_usd FROM cw_loads l WHERE l.id = $1`,
      { bind: [loadId] }
    );
    if (!load) return res.status(404).json({ error: 'Load not found' });

    const results = [];

    // Shipper invoice (what they pay us)
    const shipperAmount = load.shipper_rate || load.rate_usd;
    if (shipperAmount && load.shipper_id) {
      const shipperInvNum = `INV-${load.load_ref || load.id}-S`;
      const [[existing]] = await sequelize.query(
        `SELECT id FROM cw_invoices WHERE load_id = $1 AND invoice_type = 'shipper'`, { bind: [loadId] }
      );
      if (!existing) {
        const [[inv]] = await sequelize.query(
          `INSERT INTO cw_invoices (load_id, invoice_type, invoice_number, contact_id, amount, status, due_date, created_at, updated_at)
           VALUES ($1, 'shipper', $2, $3, $4, 'draft', (CURRENT_DATE + INTERVAL '30 days')::date, NOW(), NOW()) RETURNING *`,
          { bind: [loadId, shipperInvNum, load.shipper_id, shipperAmount] }
        );
        results.push({ type: 'shipper', invoice: inv });
      } else {
        results.push({ type: 'shipper', status: 'already_exists' });
      }
    }

    // Carrier payment (what we pay them)
    const carrierAmount = load.rate_usd;
    if (carrierAmount && load.carrier_id) {
      const carrierInvNum = `PAY-${load.load_ref || load.id}-C`;
      const [[existing]] = await sequelize.query(
        `SELECT id FROM cw_invoices WHERE load_id = $1 AND invoice_type = 'carrier'`, { bind: [loadId] }
      );
      if (!existing) {
        const [[inv]] = await sequelize.query(
          `INSERT INTO cw_invoices (load_id, invoice_type, invoice_number, contact_id, amount, status, due_date, created_at, updated_at)
           VALUES ($1, 'carrier', $2, $3, $4, 'draft', (CURRENT_DATE + INTERVAL '30 days')::date, NOW(), NOW()) RETURNING *`,
          { bind: [loadId, carrierInvNum, load.carrier_id, carrierAmount] }
        );
        results.push({ type: 'carrier', invoice: inv });
      } else {
        results.push({ type: 'carrier', status: 'already_exists' });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/status - update invoice status
router.put('/:id/status', async (req, res) => {
  try {
    const { status, paid_date, payment_method, pod_received } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });

    let updates = 'status = $1, updated_at = NOW()';
    const binds = [status];
    if (paid_date) { binds.push(paid_date); updates += `, paid_date = $${binds.length}`; }
    if (payment_method) { binds.push(payment_method); updates += `, payment_method = $${binds.length}`; }
    if (pod_received !== undefined) { binds.push(pod_received); updates += `, pod_received = $${binds.length}`; }
    binds.push(req.params.id);

    const [result] = await sequelize.query(
      `UPDATE cw_invoices SET ${updates} WHERE id = $${binds.length} RETURNING *`,
      { bind: binds }
    );
    if (!result.length) return res.status(404).json({ error: 'Invoice not found' });

    res.json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /summary - billing summary (AR/AP totals)
router.get('/summary', async (req, res) => {
  try {
    // Accounts Receivable (shipper invoices)
    const [[ar]] = await sequelize.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as paid,
        COALESCE(SUM(amount) FILTER (WHERE status IN ('sent','draft')), 0) as outstanding,
        COALESCE(SUM(amount) FILTER (WHERE status = 'overdue'), 0) as overdue
       FROM cw_invoices WHERE invoice_type = 'shipper'`
    );

    // Accounts Payable (carrier invoices)
    const [[ap]] = await sequelize.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as paid,
        COALESCE(SUM(amount) FILTER (WHERE status IN ('sent','draft')), 0) as outstanding,
        COALESCE(SUM(amount) FILTER (WHERE status = 'overdue'), 0) as overdue
       FROM cw_invoices WHERE invoice_type = 'carrier'`
    );

    // Profit margin (total shipper invoiced - total carrier paid)
    const [[margin]] = await sequelize.query(
      `SELECT
        COALESCE(SUM(CASE WHEN invoice_type = 'shipper' THEN amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN invoice_type = 'carrier' THEN amount ELSE 0 END), 0) as total_cost
       FROM cw_invoices WHERE status != 'void'`
    );

    res.json({
      success: true,
      data: {
        accounts_receivable: { ...ar, total: parseFloat(ar.total), paid: parseFloat(ar.paid), outstanding: parseFloat(ar.outstanding), overdue: parseFloat(ar.overdue) },
        accounts_payable: { ...ap, total: parseFloat(ap.total), paid: parseFloat(ap.paid), outstanding: parseFloat(ap.outstanding), overdue: parseFloat(ap.overdue) },
        gross_revenue: parseFloat(margin.total_revenue),
        total_cost: parseFloat(margin.total_cost),
        gross_profit: parseFloat(margin.total_revenue) - parseFloat(margin.total_cost)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /load/:loadId - get invoices for a specific load
router.get('/load/:loadId', async (req, res) => {
  try {
    const [invoices] = await sequelize.query(
      `SELECT i.*, c.company_name as contact_company FROM cw_invoices i
       LEFT JOIN cw_contacts c ON i.contact_id = c.id
       WHERE i.load_id = $1 ORDER BY i.invoice_type`,
      { bind: [req.params.loadId] }
    );
    res.json({ success: true, data: invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
