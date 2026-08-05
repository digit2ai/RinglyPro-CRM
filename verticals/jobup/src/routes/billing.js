'use strict';

const express = require('express');
const { models } = require('../models');
const billing = require('../services/billing');

const router = express.Router();

router.get('/status', (req, res) => res.json(billing.status()));

// Create checkout from a completed teaser.
router.post('/checkout', async (req, res) => {
  try {
    const { email, name, teaser_token } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });

    let sub = await models.subscribers.findOne({ where: { email } });
    if (!sub) sub = await models.subscribers.create({ email, name, status: 'pending' });

    const base = process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev';
    const r = await billing.createCheckout({
      subscriberId: sub.id, email,
      successUrl: `${base}/welcome?s=${sub.id}`,
      cancelUrl: teaser_token ? `${base}/teaser/${teaser_token}` : `${base}/`,
    });
    // Honest when unconfigured — never a fake URL.
    res.status(r.ok ? 200 : 503).json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stripe webhook. Signature verification is required in production.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    if (process.env.STRIPE_WEBHOOK_SECRET && billing.enabled()) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } else if (process.env.NODE_ENV === 'production') {
      // REFUSE rather than trust an unverified body. An unauthenticated webhook
      // that flips subscribers to active is a free-subscription vulnerability.
      return res.status(503).json({
        error: 'webhook signature verification is not configured',
        note: 'Set STRIPE_WEBHOOK_SECRET. Unverified webhooks are refused in production.',
      });
    } else {
      event = JSON.parse(raw.toString('utf8'));
    }
  } catch (e) {
    return res.status(400).json({ error: 'signature verification failed: ' + e.message });
  }
  try {
    const r = await billing.applyEvent(event.type, event.data && event.data.object ? event.data.object : {});
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/renewal-notices', async (req, res) => {
  res.json({ due: await billing.renewalNoticesDue() });
});

module.exports = router;
