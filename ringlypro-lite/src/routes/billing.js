'use strict';

/**
 * Stripe subscription billing. Single flat plan per country; the price is
 * config-driven (env), never hardcoded. 7-day trial. On failed payment the
 * webhook suspends answering (fallback voicemail) but the DID is retained.
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { Tenant } = require('../models');

function stripe() {
  const key = process.env.LITE_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('LITE_STRIPE_SECRET_KEY not set');
  return require('stripe')(key);
}

const TRIAL_DAYS = parseInt(process.env.LITE_TRIAL_DAYS || '7', 10);

// Per-country plan config (price in cents, currency) — override via env.
function plan(country) {
  if (country === 'CO') {
    return {
      priceId: process.env.LITE_STRIPE_PRICE_CO || null,
      amount: parseInt(process.env.LITE_PRICE_CO_CENTS || '9900', 10), // fallback inline price
      currency: (process.env.LITE_PRICE_CO_CURRENCY || 'usd').toLowerCase(),
      name: 'RinglyPro Lite (Colombia)'
    };
  }
  return {
    priceId: process.env.LITE_STRIPE_PRICE_US || null,
    amount: parseInt(process.env.LITE_PRICE_US_CENTS || '4900', 10),
    currency: (process.env.LITE_PRICE_US_CURRENCY || 'usd').toLowerCase(),
    name: 'RinglyPro Lite (US)'
  };
}

router.get('/status', requireAuth, async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenantId);
  res.json({
    subscription_status: tenant.subscription_status,
    trial_ends_at: tenant.trial_ends_at,
    suspended: !!tenant.suspended_at,
    country: tenant.country
  });
});

// Create a Stripe Checkout session for the flat subscription.
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const s = stripe();
    const tenant = await Tenant.findByPk(req.tenantId);
    const p = plan(tenant.country);
    const base = (process.env.LITE_WEBHOOK_BASE_URL || 'https://localhost').replace(/\/$/, '');

    const lineItem = p.priceId
      ? { price: p.priceId, quantity: 1 }
      : {
          price_data: {
            currency: p.currency,
            product_data: { name: p.name },
            unit_amount: p.amount,
            recurring: { interval: 'month' }
          },
          quantity: 1
        };

    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer_email: tenant.owner_email || undefined,
      line_items: [lineItem],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { tenant_id: String(tenant.id), country: tenant.country }
      },
      success_url: `${base}/dashboard?billing=success`,
      cancel_url: `${base}/dashboard?billing=cancel`,
      metadata: { tenant_id: String(tenant.id) }
    });
    res.json({ success: true, url: session.url });
  } catch (e) {
    console.error('[lite:billing] checkout error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Cancel at period end.
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.tenantId);
    if (!tenant.stripe_subscription_id) return res.status(400).json({ error: 'no_subscription' });
    await stripe().subscriptions.update(tenant.stripe_subscription_id, { cancel_at_period_end: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
