// =====================================================
// Horses — CRUD for the horse registry.
//   POST /api/v1/horses   -> JWT required (acceptance #2). 201 with the new row.
//   GET  /api/v1/horses   -> tenant-scoped list (acceptance #3). Public read OK
//                            for the demo dashboard; tenant derived from ?tenant_id
//                            (or JWT if present), default 1.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();

const horse = require('../models/horse');
const { requireAccount, optionalAccount } = require('./account');

// POST — create a horse. Account required (no credit charged).
router.post('/', requireAccount, async (req, res) => {
  try {
    const { name, breed } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const row = await horse.create({ tenant_id: req.accountId, name: String(name).trim(), breed });
    res.status(201).json(row);
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'horse_create_error', error: e.message }));
    res.status(500).json({ error: 'failed to create horse' });
  }
});

// GET — list horses for the logged-in account (own horses only).
router.get('/', optionalAccount, (req, res, next) => {
  req.tenantId = req.accountId != null ? req.accountId : 0;
  next();
}, async (req, res) => {
  try {
    const rows = await horse.listByTenant(req.tenantId);
    res.json(rows);
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'horse_list_error', error: e.message }));
    res.status(500).json({ error: 'failed to list horses' });
  }
});

module.exports = router;
