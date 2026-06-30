// POST /api/v1/transactions  — create a transaction (JWT + tenant)
// GET  /api/v1/transactions  — list rows for the token's tenant only
const express = require('express');
const router = express.Router();
const store = require('../models/transaction');
const { requireAuth } = require('../middleware/tenant');

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const amount = Number(b.amount_usd);
    if (!b.type || !store.TYPES.includes(String(b.type))) {
      return res.status(422).json({ error: "type must be one of: " + store.TYPES.join(', ') });
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(422).json({ error: 'amount_usd must be a non-negative number' });
    }
    const row = await store.create({
      tenant_id: req.tenantId,
      type: b.type,
      amount_usd: amount,
      counterparty: b.counterparty,
      note: b.note,
      source: 'form'
    });
    // PII discipline: log tenant_id + id + type only — no amounts or names.
    console.log(JSON.stringify({ svc: 'solicitud-por-voz', event: 'tx_create', tenant_id: req.tenantId, id: row.id, type: row.type }));
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'solicitud-por-voz', event: 'tx_create_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const rows = await store.listByTenant(req.tenantId, 200);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'solicitud-por-voz', event: 'tx_list_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
