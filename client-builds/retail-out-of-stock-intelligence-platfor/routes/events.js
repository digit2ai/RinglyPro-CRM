// routes/events.js — GET /api/v1/events/:store_id
// Raw classified event list for one store, ranked by dollar impact so the
// worklist is already in the order a manager should walk the aisles.
'use strict';

const express = require('express');
const router = express.Router();

const { attachTenant } = require('../lib/auth');
const store = require('../lib/store');
const { CATEGORY_LIST } = require('../lib/classifier');

// GET /api/v1/events/categories — the seven-category enum (UI filter source)
router.get('/categories', (req, res) => {
  res.json({ categories: CATEGORY_LIST });
});

router.get('/:store_id', attachTenant, async (req, res) => {
  try {
    const storeId = String(req.params.store_id || '').trim();
    if (!storeId) return res.status(400).json({ error: 'store_id required' });

    const events = await store.findEvents({
      tenant_id: req.tenant_id,
      store_id: storeId,
      limit: req.query.limit || 500
    });

    const cause = req.query.root_cause ? String(req.query.root_cause).trim() : null;
    const filtered = cause ? events.filter((e) => e.root_cause === cause) : events;

    res.json({
      tenant_id: req.tenant_id,
      store_id: storeId,
      count: filtered.length,
      events: filtered
    });
  } catch (err) {
    console.error('[retail-oos] events error:', err.message);
    res.status(500).json({ error: 'events_failed', detail: err.message });
  }
});

module.exports = router;
