'use strict';

/**
 * Stripe webhook (raw body required for signature verification).
 * Mounted with express.raw in app.js BEFORE the JSON body parser.
 * Payment-state → tenant.subscription_status; failed payment suspends answering
 * (fallback voicemail) but never releases the DID.
 */
const express = require('express');
const router = express.Router();
const { Tenant, Recharge } = require('../models');
const minutesSvc = require('../services/minutes');

function stripe() {
  const key = process.env.LITE_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  return require('stripe')(key);
}

async function tenantFromEvent(obj) {
  const tid = obj.metadata && obj.metadata.tenant_id;
  if (tid) return Tenant.findByPk(Number(tid));
  if (obj.customer) return Tenant.findOne({ where: { stripe_customer_id: obj.customer } });
  return null;
}

router.post('/stripe', async (req, res) => {
  const secret = process.env.LITE_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (secret) {
      const sig = req.headers['stripe-signature'];
      event = stripe().webhooks.constructEvent(req.body, sig, secret);
    } else {
      event = JSON.parse(req.body.toString('utf8'));  // dev only
    }
  } catch (e) {
    console.error('[lite:webhook] signature error:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  try {
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed': {
        const tenant = await tenantFromEvent(obj);
        if (!tenant) break;
        // Recharge (one-time minutes top-up) — credit prepaid minutes once.
        if (obj.metadata && obj.metadata.kind === 'recharge') {
          tenant.stripe_customer_id = obj.customer || tenant.stripe_customer_id;
          const rid = Number(obj.metadata.recharge_id);
          const rec = rid ? await Recharge.findByPk(rid) : null;
          if (rec && rec.status !== 'succeeded') {
            rec.status = 'succeeded';
            rec.stripe_payment_intent = obj.payment_intent || rec.stripe_payment_intent;
            await rec.save();
            await minutesSvc.creditMinutes(tenant, Number(rec.minutes) || 0);
          } else if (!rec) {
            await minutesSvc.creditMinutes(tenant, Number(obj.metadata.minutes) || 0);
            await tenant.save();
          }
          break;
        }
        // Subscription checkout.
        tenant.stripe_customer_id = obj.customer || tenant.stripe_customer_id;
        tenant.stripe_subscription_id = obj.subscription || tenant.stripe_subscription_id;
        tenant.subscription_status = 'active';
        tenant.suspended_at = null;
        await tenant.save();
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const tenant = await tenantFromEvent(obj);
        if (tenant) {
          tenant.subscription_status = obj.status;  // trialing|active|past_due|canceled|unpaid
          if (obj.status === 'active' || obj.status === 'trialing') tenant.suspended_at = null;
          await tenant.save();
        }
        break;
      }
      case 'invoice.payment_failed': {
        const tenant = await tenantFromEvent(obj);
        if (tenant) {
          tenant.subscription_status = 'past_due';
          tenant.suspended_at = new Date();  // suspend answering; keep DID
          await tenant.save();
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const tenant = await tenantFromEvent(obj);
        if (tenant) {
          tenant.subscription_status = 'canceled';
          tenant.suspended_at = new Date();
          // DID retained for 30 days per policy — a scheduled job (not v1) releases it.
          await tenant.save();
        }
        break;
      }
      default: break;
    }
  } catch (e) {
    console.error('[lite:webhook] handler error:', e.message);
  }
  res.json({ received: true });
});

module.exports = router;
