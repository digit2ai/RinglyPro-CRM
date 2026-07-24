'use strict';

/**
 * Lawn Co-Pilot — tenant billing (the owner subscribes their own company).
 * Owner-only. Money is charged on the Digit2AI platform Stripe account.
 */

const express = require('express');
const router = express.Router();
const billing = require('../services/billing');
const { Tenant } = require('../models');

function requireOwner(req, res, next) {
  if (!req.staff) return res.status(401).json({ success: false, error: 'Not signed in' });
  if (req.staff.role !== 'owner' && req.staff.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Only the owner can manage billing.' });
  }
  next();
}

router.get('/status', requireOwner, async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenant_id);
  res.json(await billing.status(tenant));
});

// Start (or change to) a paid subscription — returns the Stripe Checkout URL.
router.post('/checkout', requireOwner, async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenant_id);
  const r = await billing.createCheckout(tenant, (req.body || {}).plan);
  res.status(r.success ? 200 : 400).json(r);
});

// Manage card / cancel via the Stripe billing portal.
router.post('/portal', requireOwner, async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenant_id);
  const r = await billing.createPortal(tenant);
  res.status(r.success ? 200 : 400).json(r);
});

module.exports = router;
