// GET /api/v1/summary — live P&L + net USD position for the token's tenant.
const express = require('express');
const router = express.Router();
const store = require('../models/transaction');
const { requireAuth } = require('../middleware/tenant');

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const s = await store.summaryByTenant(req.tenantId);
    return res.json({ success: true, ...s });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'solicitud-por-voz', event: 'summary_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
