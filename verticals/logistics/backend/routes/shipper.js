const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.lg');
const sequelize = require('../services/db.lg');

router.get('/quotes', auth.shipper, async (req, res) => {
  try {
    const [quotes] = await sequelize.query(`SELECT q.*, l.load_ref, l.status as load_status FROM lg_shipper_quotes q LEFT JOIN cw_loads l ON l.id = q.load_id ORDER BY q.created_at DESC LIMIT 100`);
    res.json({ success: true, data: quotes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/shipments', auth.shipper, async (req, res) => {
  try {
    const [loads] = await sequelize.query(
      `SELECT l.*, (SELECT cc.location FROM cw_check_calls cc WHERE cc.load_id = l.id ORDER BY cc.created_at DESC LIMIT 1) as last_location, (SELECT cc.eta FROM cw_check_calls cc WHERE cc.load_id = l.id ORDER BY cc.created_at DESC LIMIT 1) as last_eta, (SELECT COUNT(*) FROM lg_documents d WHERE d.load_id = l.id AND d.doc_type = 'pod') as has_pod FROM cw_loads l WHERE l.status IN ('open','covered','in_transit','delivered') ORDER BY l.created_at DESC LIMIT 100`
    );
    res.json({ success: true, data: loads });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/shipments/:id', auth.shipper, async (req, res) => {
  try {
    const [[load]] = await sequelize.query(`SELECT * FROM cw_loads WHERE id = $1`, { bind: [req.params.id] });
    if (!load) return res.status(404).json({ error: 'Shipment not found' });
    const [checkCalls] = await sequelize.query(`SELECT * FROM cw_check_calls WHERE load_id = $1 ORDER BY created_at DESC`, { bind: [req.params.id] });
    const [docs] = await sequelize.query(`SELECT id, doc_type, original_name, created_at FROM lg_documents WHERE load_id = $1 AND status = 'active'`, { bind: [req.params.id] });
    res.json({ success: true, data: { ...load, tracking: checkCalls, documents: docs } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/claims', auth.shipper, async (req, res) => {
  try {
    const { load_id, claim_type, description, amount_claimed } = req.body;
    if (!load_id || !claim_type) return res.status(400).json({ error: 'load_id and claim_type required' });
    const [[claim]] = await sequelize.query(
      `INSERT INTO lg_claims (tenant_id, load_id, claim_type, description, amount_claimed, status, filed_by, created_at, updated_at) VALUES ('logistics', $1, $2, $3, $4, 'open', $5, NOW(), NOW()) RETURNING *`,
      { bind: [load_id, claim_type, description || null, amount_claimed || null, req.user?.id || null] }
    );
    res.status(201).json({ success: true, data: claim });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/claims', auth.shipper, async (req, res) => {
  try {
    const [claims] = await sequelize.query(`SELECT cl.*, l.load_ref, l.origin, l.destination FROM lg_claims cl LEFT JOIN cw_loads l ON l.id = cl.load_id ORDER BY cl.created_at DESC LIMIT 100`);
    res.json({ success: true, data: claims });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
