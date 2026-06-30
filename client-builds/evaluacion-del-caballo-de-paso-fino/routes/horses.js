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

const { requireAuth, getToken, extractTenantId } = require('../lib/auth');
const { resolveTenant } = require('../lib/tenant');
const horse = require('../models/horse');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../lib/auth');

// POST — create a horse. Write endpoint => JWT required.
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, breed } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const row = await horse.create({ tenant_id: req.tenantId, name: String(name).trim(), breed });
    res.status(201).json(row);
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'horse_create_error', error: e.message }));
    res.status(500).json({ error: 'failed to create horse' });
  }
});

// GET — list horses for the tenant. Public read; if a valid JWT is present we
// prefer its tenant, otherwise fall back to ?tenant_id / default 1.
router.get('/', (req, res, next) => {
  const token = getToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const t = extractTenantId(decoded);
      req.tenantId = t != null ? t : 1;
      return next();
    } catch (e) { /* fall through to public resolver */ }
  }
  resolveTenant(req, res, next);
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
