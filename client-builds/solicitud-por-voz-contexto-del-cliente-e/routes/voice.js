// POST /api/v1/voice — accept a transcript, parse it (mock NLP), create a tx.
// Body: { transcript: 'vendí 5000 dólares de palma a Acme' }
const express = require('express');
const router = express.Router();
const store = require('../models/transaction');
const { parseTranscript } = require('../lib/parseTranscript');
const { requireAuth } = require('../middleware/tenant');

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const transcript = (req.body && req.body.transcript) ? String(req.body.transcript).trim() : '';
    if (!transcript) return res.status(422).json({ error: 'transcript is required' });

    const parsed = parseTranscript(transcript);
    const row = await store.create({
      tenant_id: req.tenantId,
      type: parsed.type,
      amount_usd: parsed.amount_usd,
      counterparty: parsed.counterparty,
      note: parsed.note,
      source: 'voice'
    });
    console.log(JSON.stringify({ svc: 'solicitud-por-voz', event: 'voice_create', tenant_id: req.tenantId, id: row.id, type: row.type }));
    return res.status(201).json({ success: true, data: row, parsed: { type: parsed.type, amount_usd: parsed.amount_usd, counterparty: parsed.counterparty } });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'solicitud-por-voz', event: 'voice_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
