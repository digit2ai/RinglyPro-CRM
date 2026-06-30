// =====================================================
// Session — GET /api/v1/session/demo
//
// Mints a short-lived demo JWT (scoped to the demo tenant) SERVER-SIDE so the
// browser never needs a raw token to drive the live POC. The JWT_SECRET stays
// on the server; the page just calls this endpoint and uses the returned token
// for write operations. Real multi-tenant callers still paste their own
// RinglyPro token (the "Modo avanzado" field), which overrides the demo one.
//
// This keeps writes JWT-gated (acceptance #2/#4) while removing the confusing
// "paste a JWT" step for trainers/judges at the exposition. The demo token is
// always the demo tenant — it can never touch another tenant's rows.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../lib/auth');
const { DEFAULT_TENANT } = require('../lib/tenant');

router.get('/demo', (req, res) => {
  const expiresInSec = 2 * 60 * 60; // 2h
  const token = jwt.sign(
    { tenant_id: DEFAULT_TENANT, demo: true, email: 'demo@digit2ai.com' },
    JWT_SECRET,
    { expiresIn: expiresInSec }
  );
  res.json({ token, tenant_id: DEFAULT_TENANT, expires_in: expiresInSec });
});

module.exports = router;
